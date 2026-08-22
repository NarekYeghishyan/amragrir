import type Redis from 'ioredis';
import { RedisEventBus } from './redis-event-bus';

/**
 * The bus that lets a second API instance exist — see BUSINESS_LOGIC.md §4 and
 * the file itself for the reasoning.
 *
 * What is being pinned down here is the one thing a reader cannot check by
 * looking: that an event is delivered **exactly once** to a listener. The
 * publisher serves its own listeners directly *and* hands the event to Redis,
 * and Redis echoes a published message back to the sender — so the echo has to
 * be recognised and dropped, or every customer on the publishing instance would
 * see each order status twice.
 */

const CHANNEL = 'amragrir:test.channel';

function build() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};

  const subscriber = {
    on(event: string, fn: (...args: unknown[]) => void) {
      handlers[event] = fn;
      return this;
    },
    subscribe: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  };

  const client = {
    publish: jest.fn().mockResolvedValue(1),
    duplicate: jest.fn(() => subscriber),
  };

  const bus = new RedisEventBus(client as unknown as Redis);

  /** Feeds a raw frame in as though Redis had delivered it. */
  const arrive = (payload: string, channel = CHANNEL): void => {
    handlers.message?.(channel, payload);
  };

  /** The frame this bus last put on the wire. */
  const lastPublished = (): string => client.publish.mock.calls.at(-1)?.[1] as string;

  return { bus, client, subscriber, arrive, lastPublished };
}

describe('carrying an event between instances', () => {
  it('puts the event on the channel', () => {
    const { bus, client } = build();

    bus.publish(CHANNEL, { orderId: 'order-1', status: 'ready' });

    expect(client.publish).toHaveBeenCalledTimes(1);
    const [channel, payload] = client.publish.mock.calls[0] as [string, string];
    expect(channel).toBe(CHANNEL);
    expect(JSON.parse(payload)).toEqual({
      origin: expect.any(String),
      event: { orderId: 'order-1', status: 'ready' },
    });
  });

  it('delivers an event published by another instance', () => {
    const { bus, arrive } = build();
    const heard: unknown[] = [];
    bus.subscribe(CHANNEL, (event) => heard.push(event));

    arrive(JSON.stringify({ origin: 'another-instance', event: { orderId: 'order-2' } }));

    expect(heard).toEqual([{ orderId: 'order-2' }]);
  });

  it('drops its own echo, so a publisher does not hear itself twice', () => {
    // The publisher already served its local listeners directly. Redis sends
    // the message back to every subscriber including the sender, and without
    // the origin marker this frame would be a second delivery of one event.
    const { bus, arrive, lastPublished } = build();
    const heard: unknown[] = [];
    bus.subscribe(CHANNEL, (event) => heard.push(event));

    bus.publish(CHANNEL, { orderId: 'order-3' });
    arrive(lastPublished());

    expect(heard).toEqual([]);
  });

  it('ignores a frame it cannot read', () => {
    // Something else publishing on our channel must not take the process down.
    const { bus, arrive } = build();
    const heard: unknown[] = [];
    bus.subscribe(CHANNEL, (event) => heard.push(event));

    expect(() => arrive('not json at all')).not.toThrow();
    expect(heard).toEqual([]);
  });
});

describe('the subscriber connection', () => {
  it('is a connection of its own, not the shared client', () => {
    // Redis refuses ordinary commands on a connection in subscriber mode, and
    // the shared client is busy serving OTP claims and rate-limit counters.
    const { bus, client } = build();

    bus.subscribe(CHANNEL, () => {});

    expect(client.duplicate).toHaveBeenCalledTimes(1);
  });

  it('subscribes once however many listeners a channel has', () => {
    const { bus, subscriber } = build();

    bus.subscribe(CHANNEL, () => {});
    bus.subscribe(CHANNEL, () => {});
    bus.subscribe(CHANNEL, () => {});

    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith(CHANNEL);
  });

  it('stops delivering to a listener that unsubscribed', () => {
    // A disconnected socket that kept its listener is the leak this return
    // value exists to prevent.
    const { bus, arrive } = build();
    const heard: unknown[] = [];
    const stop = bus.subscribe(CHANNEL, (event) => heard.push(event));

    stop();
    arrive(JSON.stringify({ origin: 'another-instance', event: { orderId: 'order-4' } }));

    expect(heard).toEqual([]);
  });
});

describe('when Redis is unwell', () => {
  it('survives a publish that fails', async () => {
    // The local listeners have already been served; a broker that is down must
    // not turn into a rejected promise nobody is holding.
    const { bus, client } = build();
    client.publish.mockRejectedValue(new Error('connection refused'));

    expect(() => bus.publish(CHANNEL, { orderId: 'order-5' })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('survives a subscribe that fails', () => {
    const { bus, subscriber } = build();
    subscriber.subscribe.mockRejectedValue(new Error('connection refused'));

    expect(() => bus.subscribe(CHANNEL, () => {})).not.toThrow();
  });

  it('closes the connection it opened', async () => {
    const { bus, subscriber } = build();
    bus.subscribe(CHANNEL, () => {});

    await bus.onModuleDestroy();

    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });

  it('has nothing to close when it never subscribed', async () => {
    const { bus, subscriber } = build();

    await expect(bus.onModuleDestroy()).resolves.toBeUndefined();
    expect(subscriber.quit).not.toHaveBeenCalled();
  });
});
