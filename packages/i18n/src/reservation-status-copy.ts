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
