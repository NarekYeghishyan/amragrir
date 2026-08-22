import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.service';

/**
 * Cross-instance fan-out for the in-process event services.
 *
 * Three services — `OrderEventsService`, `NotificationEventsService`,
 * `CustomerNotificationEventsService` — each held a private `EventEmitter`, and
 * each carried the same note: the emitter is the piece that breaks first when
 * the API runs as more than one process, because a socket connected to
 * instance A never hears an event published on B. This is that note paid off,
 * written once rather than three times: the three differ in *who* they address,
 * not in how a message crosses a process boundary.
 *
 * **Local delivery does not go through Redis.** A publisher emits to its own
 * listeners directly and *also* hands the event to Redis for everybody else. The
 * alternative — publish to Redis and let the echo feed even the local
 * listeners — is one code path instead of two, but it makes every socket on a
 * single-instance deployment depend on a broker being up to hear anything at
 * all. Here a Redis outage costs exactly what it should: the other instances go
 * quiet, and each instance still serves the sockets it is holding.
 *
 * That choice is what `origin` is for. Redis delivers a published message to
 * every subscriber including the one that sent it, so without a marker the
 * publishing instance would deliver each event twice — once locally, once off
 * its own echo. Each process stamps its messages and drops the ones it recognises.
 */
interface Envelope {
  /** Which process published this. Its own echo is dropped on arrival. */
  origin: string;
  event: unknown;
}

@Injectable()
export class RedisEventBus implements OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);

  /** Local fan-out, keyed by channel. Feeds only listeners registered *here*,
   *  from messages that arrived from *elsewhere*. */
  private readonly emitter = new EventEmitter();

  /** This process's identity, for the length of this process. Nothing outside
   *  compares it, so a fresh id per boot is exactly right — two instances must
   *  differ, and the same instance across a restart has no echo left to drop. */
  private readonly origin = randomUUID();

  /**
   * A connection of its own, created on first use.
   *
   * Redis puts a connection into subscriber mode and refuses ordinary commands
   * on it from then on, so this cannot be the shared client — that one is
   * serving OTP claims and rate-limit counters. `duplicate()` carries the same
   * URL and options across without re-reading configuration.
   */
  private subscriber?: Redis;

  private readonly channels = new Set<string>();

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    // One listener per event service per channel, but the services are free to
    // grow; a cap of 10 would eventually print a leak warning at a healthy app.
    this.emitter.setMaxListeners(0);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriber) {
      return;
    }
    try {
      await this.subscriber.quit();
    } catch {
      // Shutting down over a connection that is already gone is not a failure
      // worth reporting — there is nothing left to close.
    }
  }

  /**
   * Hands an event to the other instances.
   *
   * Fire-and-forget by signature, because every caller is a `publish` that
   * returns void and is itself called from inside a committed transaction's
   * aftermath — an event that cannot be broadcast must not turn into a failed
   * order. A rejection is logged and swallowed for that reason: the local
   * listeners have already been served by the caller.
   */
  publish(channel: string, event: unknown): void {
    const envelope: Envelope = { origin: this.origin, event };

    this.client.publish(channel, JSON.stringify(envelope)).catch((error: unknown) => {
      this.logger.error(`Could not publish on ${channel}: ${String(error)}`);
    });
  }

  /**
   * Registers a listener for events published by *other* instances, and returns
   * the function that removes it — the same contract the event services already
   * hand their own callers, so unsubscribing stays one call at every level.
   */
  subscribe(channel: string, listener: (event: unknown) => void): () => void {
    this.emitter.on(channel, listener);
    this.ensureSubscribed(channel);

    return () => this.emitter.off(channel, listener);
  }

  /**
   * Subscribes the connection to a channel once.
   *
   * The channels are a fixed, tiny set decided at wiring time, so there is no
   * unsubscribe path: a channel this process has ever cared about is one it
   * cares about until it exits. Reference-counting three names would be
   * bookkeeping for a saving nobody can measure.
   */
  private ensureSubscribed(channel: string): void {
    if (this.channels.has(channel)) {
      return;
    }
    this.channels.add(channel);

    this.connection()
      .subscribe(channel)
      .catch((error: unknown) => {
        // A subscription ioredis accepted is restored on reconnect by ioredis
        // itself; one that failed outright was never registered, so it would
        // not come back. Forget it here rather than leave a name in the set
        // that nothing is listening to — then a later `subscribe` retries.
        this.channels.delete(channel);
        this.logger.error(`Could not subscribe to ${channel}: ${String(error)}`);
      });
  }

  private connection(): Redis {
    if (this.subscriber) {
      return this.subscriber;
    }

    // **The shared client's fail-fast options are wrong for this connection.**
    // It carries `enableOfflineQueue: false` so that an OTP request errors
    // rather than hangs when Redis is down — right for a command with somebody
    // waiting on the answer, and wrong for a subscription, which is a standing
    // intent with no deadline. `duplicate()` copies those options across, and
    // with them the very first SUBSCRIBE is refused ("Stream isn't writeable")
    // because it is issued at boot, before the socket has finished connecting.
    // Queue it instead, and let ioredis keep retrying: the subscription simply
    // takes effect once the connection is up.
    const subscriber = this.client.duplicate({
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    });

    subscriber.on('message', (channel: string, payload: string) => {
      this.dispatch(channel, payload);
    });

    // Without a handler an emitted 'error' is thrown, and a broker blip would
    // take the API down over a fan-out it is designed to survive.
    subscriber.on('error', (error: Error) => {
      this.logger.warn(`Subscriber connection: ${error.message}`);
    });

    this.subscriber = subscriber;
    return subscriber;
  }

  private dispatch(channel: string, payload: string): void {
    let envelope: Envelope;

    try {
      envelope = JSON.parse(payload) as Envelope;
    } catch {
      // Something else is publishing on our channel. Dropping it is right —
      // there is no partial reading of a frame we do not understand.
      this.logger.warn(`Ignored an unreadable message on ${channel}`);
      return;
    }

    if (envelope.origin === this.origin) {
      // Our own echo. The listeners here were served the moment it was published.
      return;
    }

    this.emitter.emit(channel, envelope.event);
  }
}
