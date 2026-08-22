import { Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { OrderStatus, TERMINAL_ORDER_STATUSES } from '@amragrir/shared';
import { RedisEventBus } from '../redis/redis-event-bus';

const ORDER_CHANGED = 'order.changed';

/** Namespaced, because a Redis can be shared with another project and a bare
 *  `order.changed` is a name anyone might pick. */
const ORDER_CHANGED_CHANNEL = 'amragrir:order.changed';

/**
 * What a subscriber is told when an order moves.
 *
 * Deliberately built from a plain order row rather than the full `OrderDetail`:
 * payments publishes these too, and needing the detail shape there would make
 * orders and payments import each other. It is also exactly what the tracking
 * screen renders.
 */
export interface OrderStatusEvent {
  orderId: string;
  /** Who may hear it — the gateway authorises at subscribe time, this is the
   *  second check, so a socket cannot be handed another user's updates. */
  userId: string;
  branchId: string;
  code: string;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
}

export function toStatusEvent(order: {
  id: string;
  userId: string;
  branchId: string;
  code: string;
  status: string;
  readyAt: Date | null;
}): OrderStatusEvent {
  const status = order.status as OrderStatus;
  return {
    orderId: order.id,
    userId: order.userId,
    branchId: order.branchId,
    code: order.code,
    status,
    readyAt: order.readyAt?.toISOString() ?? null,
    secondsLeft: countdown(order.readyAt, status),
  };
}

/**
 * Countdown for the tracking screen. Null once the order is finished — a
 * completed order has no time left, and a negative number would render as one.
 */
export function countdown(readyAt: Date | null, status: OrderStatus): number | null {
  if (!readyAt || TERMINAL_ORDER_STATUSES.includes(status) || status === OrderStatus.Ready) {
    return null;
  }
  return Math.max(0, Math.round((readyAt.getTime() - Date.now()) / 1000));
}

/**
 * Fan-out for order status changes.
 *
 * The emitter serves the sockets *this* process is holding. `RedisEventBus`
 * carries the same event to the other instances, so a customer watching an
 * order on instance A now hears a change made on B — the thing this file used
 * to say would break first when the API was scaled.
 *
 * Local delivery deliberately does not travel through Redis; see the bus for
 * why, and for the `origin` marker that stops a publisher hearing its own echo.
 *
 * **The bus is optional.** Nest supplies it from the global `RedisModule`, but
 * `new OrderEventsService()` still builds a working single-process fan-out —
 * which is what the unit tests want, and what a Redis outage degrades to.
 */
@Injectable()
export class OrderEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private unsubscribeBus?: () => void;

  constructor(@Optional() private readonly bus?: RedisEventBus) {
    // One listener per connected socket, so the default cap of 10 would print
    // a leak warning at the eleventh customer watching an order.
    this.emitter.setMaxListeners(0);
  }

  onModuleInit(): void {
    this.unsubscribeBus = this.bus?.subscribe(ORDER_CHANGED_CHANNEL, (event) => {
      this.emitter.emit(ORDER_CHANGED, event as OrderStatusEvent);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeBus?.();
  }

  /**
   * Serves this process's listeners first, then the others.
   *
   * In that order on purpose: the sockets held here are the ones that must not
   * wait on a network hop, and they are served whether or not the broker is up.
   */
  publish(event: OrderStatusEvent): void {
    this.emitter.emit(ORDER_CHANGED, event);
    this.bus?.publish(ORDER_CHANGED_CHANNEL, event);
  }

  /** Registers a listener and returns the function that removes it. Returning
   *  the unsubscribe is what stops a disconnected socket leaking a listener. */
  subscribe(listener: (event: OrderStatusEvent) => void): () => void {
    this.emitter.on(ORDER_CHANGED, listener);
    return () => this.emitter.off(ORDER_CHANGED, listener);
  }
}
