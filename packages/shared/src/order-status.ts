// The order state machine — see docs/BUSINESS_LOGIC.md §4.
//
// It lives in `shared` rather than in the API because more than one place has
// to agree on it: the API rejects an illegal move, and the owner panel decides
// which buttons to render from the same table. Two copies would drift.

import { OrderStatus } from './enums';

/** Every status an order may move to from a given status. */
export const ORDER_STATUS_FLOW: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.Created]: [OrderStatus.Paid, OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Confirmed, OrderStatus.Cancelled],
  [OrderStatus.Confirmed]: [OrderStatus.Preparing, OrderStatus.Cancelled],
  // Cancellation stops here: once the kitchen has started, the food is spent.
  [OrderStatus.Preparing]: [OrderStatus.AlmostReady],
  [OrderStatus.AlmostReady]: [OrderStatus.Ready],
  [OrderStatus.Ready]: [OrderStatus.Completed],
  [OrderStatus.Completed]: [],
  [OrderStatus.Cancelled]: [],
} as const;

/** Statuses a customer may still cancel from (before `preparing`). */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Created,
  OrderStatus.Paid,
  OrderStatus.Confirmed,
];

/** Statuses that count as "in progress" for the orders list and tracking. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Created,
  OrderStatus.Paid,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
];

/** Statuses an order can no longer move out of. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Completed,
  OrderStatus.Cancelled,
];

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from].includes(to);
}

export function isOrderCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_ORDER_STATUSES.includes(status);
}
