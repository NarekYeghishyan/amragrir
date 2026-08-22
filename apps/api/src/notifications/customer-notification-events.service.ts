import { Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { NotificationType } from '@prisma/client';
import { RedisEventBus } from '../redis/redis-event-bus';

const CUSTOMER_NOTIFIED = 'customer.notified';

/** Namespaced against a Redis shared with another project. */
const CUSTOMER_NOTIFIED_CHANNEL = 'amragrir:customer.notified';

/**
 * What a customer's client is told when something lands in their bell.
 *
 * The same shape `GET /notifications` returns for one item, so a client can
 * unshift the frame straight into the list it is already holding instead of
 * re-fetching. A bell that refetched on every push would turn one order moving
 * through six stages into six list requests.
 */
export interface CustomerNotificationEvent {
  id: string;
  /** Who may hear it. The gateway authorises at `watchMe` time; this is the
   *  second check, so a socket cannot be handed another account's bell. */
  userId: string;
  type: NotificationType;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

/**
 * In-process fan-out for customer notifications.
 *
 * A third emitter beside `OrderEventsService` and `NotificationEventsService`,
 * for the reason the second one exists: the three are addressed differently.
 * An order event goes to whoever is watching *that order*, a staff
 * notification to a *branch*, and this to *one account* — wherever they happen
 * to be in the app, which is the whole point of a bell. Folding them together
 * would make every subscriber filter a union to find its third.
 *
 * A browser connected to instance A now hears a status change made on B,
 * because `RedisEventBus` carries the frame across — see that file for why
 * local delivery does not itself go through Redis, and why the bus is optional.
 */
@Injectable()
export class CustomerNotificationEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private unsubscribeBus?: () => void;

  constructor(@Optional() private readonly bus?: RedisEventBus) {
    // One listener per connected client, so the default cap of 10 would print a
    // leak warning at the eleventh customer with the site open.
    this.emitter.setMaxListeners(0);
  }

  onModuleInit(): void {
    this.unsubscribeBus = this.bus?.subscribe(CUSTOMER_NOTIFIED_CHANNEL, (event) => {
      this.emitter.emit(CUSTOMER_NOTIFIED, event as CustomerNotificationEvent);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeBus?.();
  }

  /** The clients held here first, the other instances after — a broker that is
   *  down must not cost this process its own bells. */
  publish(event: CustomerNotificationEvent): void {
    this.emitter.emit(CUSTOMER_NOTIFIED, event);
    this.bus?.publish(CUSTOMER_NOTIFIED_CHANNEL, event);
  }

  /** Registers a listener and returns the function that removes it. Returning
   *  the unsubscribe is what stops a disconnected socket leaking a listener. */
  subscribe(listener: (event: CustomerNotificationEvent) => void): () => void {
    this.emitter.on(CUSTOMER_NOTIFIED, listener);
    return () => this.emitter.off(CUSTOMER_NOTIFIED, listener);
  }
}
