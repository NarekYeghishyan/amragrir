import { OrderStatus } from '@amragrir/shared';
import type { RedisEventBus } from '../redis/redis-event-bus';
import { OrderEventsService, type OrderStatusEvent } from './order-events.service';

/**
 * How an order status change reaches a socket, on one instance and on several.
 *
 * The contract worth holding still: a listener on this process is served
 * whether or not a broker exists, and an event raised on another process
 * arrives through the same door as a local one — subscribers cannot tell, and
 * should not have to.
 */

const CHANNEL = 'amragrir:order.changed';

function event(over: Partial<OrderStatusEvent> = {}): OrderStatusEvent {
  return {
    orderId: 'order-1',
    userId: 'user-1',
    branchId: 'branch-1',
    code: 'AMR-12344821',
    status: OrderStatus.Ready,
    readyAt: null,
    secondsLeft: null,
    ...over,
  };
}

function fakeBus() {
  const listeners: Array<(event: unknown) => void> = [];
  const unsubscribe = jest.fn();

  const bus = {
    publish: jest.fn(),
    subscribe: jest.fn((_channel: string, listener: (event: unknown) => void) => {
      listeners.push(listener);
      return unsubscribe;
    }),
  };

  /** Feeds an event in as though another instance had raised it. */
  const fromElsewhere = (payload: OrderStatusEvent): void => {
    listeners.forEach((listener) => listener(payload));
  };

  return { bus, fromElsewhere, unsubscribe };
}

describe('on a single instance', () => {
  it('delivers without a bus at all', () => {
    // `new OrderEventsService()` is a working fan-out: no broker, no wiring.
    // This is also what a Redis outage degrades to.
    const service = new OrderEventsService();
    const heard: OrderStatusEvent[] = [];
    service.subscribe((update) => heard.push(update));

    service.onModuleInit();
    service.publish(event());

    expect(heard).toEqual([event()]);
    service.onModuleDestroy();
  });

  it('stops delivering to a listener that unsubscribed', () => {
    const service = new OrderEventsService();
    const heard: OrderStatusEvent[] = [];
    const stop = service.subscribe((update) => heard.push(update));

    stop();
    service.publish(event());

    expect(heard).toEqual([]);
  });
});

describe('with other instances', () => {
  it('serves its own listeners and hands the event to the bus', () => {
    const { bus } = fakeBus();
    const service = new OrderEventsService(bus as unknown as RedisEventBus);
    const heard: OrderStatusEvent[] = [];
    service.subscribe((update) => heard.push(update));
    service.onModuleInit();

    service.publish(event());

    expect(heard).toEqual([event()]);
    expect(bus.publish).toHaveBeenCalledWith(CHANNEL, event());
    service.onModuleDestroy();
  });

  it('delivers an event raised on another instance', () => {
    // The case the emitter could not serve: a socket held here, a change made
    // there.
    const { bus, fromElsewhere } = fakeBus();
    const service = new OrderEventsService(bus as unknown as RedisEventBus);
    const heard: OrderStatusEvent[] = [];
    service.subscribe((update) => heard.push(update));
    service.onModuleInit();

    fromElsewhere(event({ orderId: 'order-9', status: OrderStatus.Preparing }));

    expect(heard).toEqual([event({ orderId: 'order-9', status: OrderStatus.Preparing })]);
    service.onModuleDestroy();
  });

  it('lets go of the bus on shutdown', () => {
    const { bus, unsubscribe } = fakeBus();
    const service = new OrderEventsService(bus as unknown as RedisEventBus);
    service.onModuleInit();

    service.onModuleDestroy();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
