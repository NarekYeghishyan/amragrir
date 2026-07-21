import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { OrderStatus, TERMINAL_ORDER_STATUSES } from '@amragrir/shared';

const ORDER_CHANGED = 'order.changed';

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
 * In-process fan-out for order status changes.
 *
 * Deliberately not Redis pub/sub yet: with one API instance an EventEmitter is
 * the whole mechanism, and an unused broker is a dependency to keep alive for
 * nothing. **This is the piece that breaks first when the API is scaled to a
 * second instance** — a socket connected to instance A would never hear about
 * a change made on instance B. Swapping the emitter for Redis pub/sub is a
 * change to this file only, which is why it is a file.
 */
@Injectable()
export class OrderEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per connected socket, so the default cap of 10 would print
    // a leak warning at the eleventh customer watching an order.
    this.emitter.setMaxListeners(0);
  }

  publish(event: OrderStatusEvent): void {
    this.emitter.emit(ORDER_CHANGED, event);
  }

  /** Registers a listener and returns the function that removes it. Returning
   *  the unsubscribe is what stops a disconnected socket leaking a listener. */
  subscribe(listener: (event: OrderStatusEvent) => void): () => void {
    this.emitter.on(ORDER_CHANGED, listener);
    return () => this.emitter.off(ORDER_CHANGED, listener);
  }
}
