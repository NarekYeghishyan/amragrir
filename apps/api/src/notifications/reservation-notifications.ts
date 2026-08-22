import { ReservationStatus } from '@amragrir/shared';

/**
 * Which booking statuses are worth telling the guest about, and which are not.
 *
 * The same rule as `order-notifications.ts` and for the same reason: a
 * notification interrupts somebody, so it has to earn the interruption by
 * telling them something they did not already know.
 *
 * - **`pending` is silent.** It is the guest's own act, and they are looking at
 *   the screen that says the restaurant is reading it.
 * - **`seated` and `completed` are silent.** Both happen with the guest in the
 *   room. Buzzing a pocket to report that its owner is sitting at their table
 *   is the clearest case of a notification nobody needs.
 * - **`confirmed`, `cancelled` and `no_show` speak**, because each is a
 *   decision somebody else made about this person's evening — and, for the
 *   last two, about their deposit.
 *
 * `no_show` is the uncomfortable one, and it is here deliberately. It is the
 * status that can keep a guest's money (`depositOutcomeFor`), and a restaurant
 * that records it has said something about them; finding that out silently,
 * weeks later, on a card statement, is worse than being told.
 *
 * **Who moved it matters more than where it moved to**, which is why this set
 * is not the whole story: the producer sits on the *staff* path only. A guest
 * who cancels their own booking passes through `cancelled` too, and telling
 * them what they just did is the same mistake as announcing `created` on an
 * order.
 */
export const NOTIFIED_RESERVATION_STATUSES: ReadonlySet<ReservationStatus> = new Set([
  ReservationStatus.Confirmed,
  ReservationStatus.Cancelled,
  ReservationStatus.NoShow,
]);

export function shouldNotifyReservation(status: ReservationStatus): boolean {
  return NOTIFIED_RESERVATION_STATUSES.has(status);
}

/**
 * What a client needs to draw the line in the bell, and nothing more.
 *
 * No sentence, for the reason the order payload carries none: the API compiles
 * to CommonJS and cannot reach `@amragrir/i18n`, and a stored sentence would be
 * frozen in whatever language the reader preferred that day. Both clients draw
 * these from `RESERVATION_NOTIFICATION_COPY`, which they already ship.
 */
export interface ReservationNotificationPayload {
  reservationId: string;
  status: ReservationStatus;
  /** When the table is for, so the bell can say which booking without a second
   *  request — the guest may well have two. */
  reservedFor: string;
}
