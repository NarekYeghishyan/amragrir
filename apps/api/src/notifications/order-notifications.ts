import { OrderStatus } from '@amragrir/shared';

/**
 * Which order statuses are worth telling the customer about, and which are not.
 *
 * Not every move is news. The rule is that a notification interrupts somebody,
 * so it has to earn the interruption by telling them something they did not
 * already know:
 *
 * - **`created` is silent.** The customer is the one who just created it; they
 *   are looking at the screen that says so.
 * - **`paid` is silent.** Paying publishes `paid` and `confirmed` back to back
 *   from one transaction (`payments.service.ts` — both moves are published so
 *   the socket sees an edge the state machine has). Notifying on both would
 *   buzz a phone twice for one tap, and `confirmed` is the half that carries
 *   the news: the kitchen has the order.
 * - **Everything after it speaks**, because each one is a fact the customer
 *   cannot see from where they are standing — someone else moved it.
 *
 * A `Set` keyed by status rather than a list of transitions: what matters to a
 * reader is where the order arrived, not the edge it took to get there, and
 * `preparing → ready` skipping `almost_ready` is a legal move
 * (ORDER_STATUS_FLOW) that must still announce `ready`.
 */
export const NOTIFIED_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
]);

export function shouldNotify(status: OrderStatus): boolean {
  return NOTIFIED_ORDER_STATUSES.has(status);
}

/**
 * What a client needs to draw the line in the bell, and nothing more.
 *
 * Deliberately **not** a sentence. The API cannot reach the shared dictionary —
 * `@amragrir/i18n` ships TypeScript that only a bundler compiles, and the API
 * is `tsc` to CommonJS — but that constraint happens to agree with the design
 * `staff_notifications` already settled on (schema.prisma: "the row carries the
 * numbers"): a stored sentence is frozen in whatever language the reader
 * preferred the day it was written, and changing languages in Settings would
 * leave a history half-translated.
 *
 * Both clients already render every one of these statuses on their tracking
 * screens, from `statusReady` / `statusReadyDesc` and their siblings. The bell
 * reuses those keys, so this feature added no copy in any language.
 */
export interface OrderNotificationPayload {
  orderId: string;
  /** The short human code (`A7F`), so the bell can say which order without a
   *  second request. */
  code: string;
  status: OrderStatus;
}
