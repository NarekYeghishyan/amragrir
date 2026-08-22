import { ReservationStatus } from '@amragrir/shared';
import type { TranslationKey } from './index';

/**
 * How a booking is described to the person who made it.
 *
 * Beside the dictionaries rather than in one app, for the reason
 * `order-status-copy.ts` is: the web and the phone both show somebody their own
 * table, and a status word or a deposit line that differed between them would
 * be the two apps disagreeing about what happened to that person's money.
 */

/**
 * What each reservation status is called on screen.
 *
 * Typed as `TranslationKey` for the same reason as `ORDER_STATUS_LABEL`: a
 * status without a translation is a compile error rather than an English enum
 * value appearing on the Armenian page, and adding one to `packages/shared`
 * breaks this file until it is named here too.
 */
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, TranslationKey> = {
  [ReservationStatus.Pending]: 'resStatusPending',
  [ReservationStatus.Confirmed]: 'resStatusConfirmed',
  [ReservationStatus.Seated]: 'resStatusSeated',
  [ReservationStatus.Completed]: 'resStatusCompleted',
  [ReservationStatus.Cancelled]: 'resStatusCancelled',
  [ReservationStatus.NoShow]: 'resStatusNoShow',
};

/**
 * What the deposit line should say, given where a booking ended up.
 *
 * The screen reports rather than decides: `depositCredited` and the status come
 * from the API, which settled the money with `depositOutcomeFor` in `shared`.
 * Working the outcome out here from the status would be a second copy of a rule
 * about money, and the two would eventually disagree about a no-show.
 */
export function depositLabelFor(status: string, depositCredited: boolean): TranslationKey {
  if (depositCredited) {
    return 'depositOnBill';
  }
  if (status === ReservationStatus.Cancelled) {
    return 'depositReturned';
  }
  if (status === ReservationStatus.NoShow) {
    return 'depositKept';
  }
  // Still ahead of the meal: the money is authorised and nothing has been
  // decided about it yet.
  return 'depositHeld';
}

/**
 * What the bell says when a booking moves, or `null` where it says nothing.
 *
 * A total record rather than a lookup that can miss, for the reason
 * `RESERVATION_STATUS_LABEL` above is one: a seventh status has to be *decided*
 * about here, and the decision it needs is exactly this — is this news to the
 * guest, or not.
 *
 * `null` is the interesting half. A notification interrupts somebody, so it has
 * to earn the interruption by telling them something they could not already
 * see (BUSINESS_LOGIC.md §4):
 *
 * - **`pending`** is the guest's own act. They are looking at the screen that
 *   says the restaurant is reading it.
 * - **`seated`** and **`completed`** happen with the guest in the room. Buzzing
 *   somebody's pocket to tell them they are sitting at their table is the
 *   clearest case of a notification nobody needs.
 * - **`confirmed`, `cancelled`, `no_show`** are the three a guest cannot see
 *   from where they are standing, because somebody else decided them. The last
 *   of those is the least comfortable to send and the hardest to justify
 *   withholding: it is the one that can keep their deposit.
 */
export const RESERVATION_NOTIFICATION_COPY: Readonly<
  Record<ReservationStatus, { title: TranslationKey; body: TranslationKey } | null>
> = {
  [ReservationStatus.Pending]: null,
  [ReservationStatus.Confirmed]: { title: 'resNoticeConfirmed', body: 'resNoticeConfirmedDesc' },
  [ReservationStatus.Seated]: null,
  [ReservationStatus.Completed]: null,
  [ReservationStatus.Cancelled]: { title: 'resNoticeCancelled', body: 'resNoticeCancelledDesc' },
  [ReservationStatus.NoShow]: { title: 'resNoticeNoShow', body: 'resNoticeNoShowDesc' },
} as const;

/**
 * What the bell says when a table is coming up.
 *
 * Not keyed by status, because the status has not changed — the booking is
 * `confirmed` before the reminder and `confirmed` after it. A reminder is a
 * different *kind* of thing to be told, which is why the row carries a
 * `reminder` marker in its payload and the clients check that before they look
 * anything up by status. Drawing this one from `RESERVATION_NOTIFICATION_COPY`
 * would say "Your table is booked" to somebody who booked it three weeks ago.
 */
export const RESERVATION_REMINDER_COPY: { title: TranslationKey; body: TranslationKey } = {
  title: 'resNoticeSoon',
  body: 'resNoticeSoonDesc',
};
