import { OrderStatus, TERMINAL_ORDER_STATUSES } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';

/**
 * What each order status is called on screen.
 *
 * Typed as `TranslationKey`, so a status without a translation is a compile
 * error rather than an English enum value appearing on the Armenian page — the
 * same guard `MENU_TAB_LABEL` uses in `jsonld.ts`. `Record<OrderStatus, …>`
 * means adding a status to `packages/shared` breaks this file until it is
 * named here too.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, TranslationKey> = {
  [OrderStatus.Created]: 'statusCreated',
  [OrderStatus.Paid]: 'statusPaid',
  [OrderStatus.Confirmed]: 'statusConfirmed',
  [OrderStatus.Preparing]: 'statusPreparing',
  [OrderStatus.AlmostReady]: 'statusAlmostReady',
  [OrderStatus.Ready]: 'statusReady',
  [OrderStatus.Completed]: 'statusCompleted',
  [OrderStatus.Cancelled]: 'statusCancelled',
};

/**
 * The four steps the tracker draws, in order.
 *
 * Not every status is a step: `created` is the moment before payment and
 * `cancelled` is a different ending altogether, so neither belongs on a
 * progress line that only moves forwards.
 */
export const TRACKER_STEPS = [
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
] as const;

/** How far along the tracker an order is; -1 before it starts. */
export function stepIndex(status: OrderStatus): number {
  // `paid` has been accepted but the kitchen has not acknowledged it, which is
  // the first step already reached as far as the customer is concerned.
  if (status === OrderStatus.Paid) {
    return 0;
  }
  if (status === OrderStatus.Completed) {
    return TRACKER_STEPS.length - 1;
  }
  return TRACKER_STEPS.indexOf(status as (typeof TRACKER_STEPS)[number]);
}

/**
 * Whether this order can still move.
 *
 * The tracking page asks twice and must get the same answer both times: once to
 * decide what to draw, and once — in the browser — to decide whether to keep
 * watching. `ready` counts as moving: the food is on the counter but nobody has
 * collected it, and `completed` is still ahead.
 */
export function isLive(status: OrderStatus): boolean {
  return !TERMINAL_ORDER_STATUSES.includes(status);
}

/** Cancellation is legal only while an order is unpaid (BUSINESS_LOGIC.md §4);
 *  paying commits it for the customer *and* the restaurant. */
export function canCancel(status: OrderStatus): boolean {
  return status === OrderStatus.Created;
}
