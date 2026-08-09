import {
  BOOKING_POLICY_LIMITS,
  depositForGuests,
  type ResolvedBookingPolicy,
} from '@amragrir/shared';
import { instantOf, type OpenWindow } from '../common/open-hours';

/**
 * Slot arithmetic for table booking.
 *
 * What a local time *means* — and when a branch is open — moved to
 * `common/open-hours.ts` once pre-orders needed the same answers; a booking and
 * a collection both have to fall inside the service window, and two copies of
 * that rule would eventually disagree. They are re-exported here so the five
 * callers of this module keep importing one thing.
 *
 * What stays is what is genuinely about *seating*: slot spacing, how long a
 * table is held, and when two bookings collide.
 *
 * **Every function here takes its numbers as an argument rather than reading a
 * constant.** They used to read `RESERVATION_SLOT_MINUTES` and its neighbours
 * directly, which was right while there was one answer for the whole platform
 * and is exactly wrong now that a branch may have its own. The parameters are
 * required, deliberately: an optional one defaulting to the platform's value
 * would compile at every call site that forgot to pass a branch's policy, and
 * the symptom — a calendar offering times the endpoint then refuses — is the
 * one thing this module exists to prevent.
 */

export {
  instantOf,
  localDateOf,
  localMinutesOf,
  localTimeLabel,
  addLocalDays,
  openWindowFor,
  bookingWindowFor,
  serviceDateOf,
  windowContains,
  isWithinOpenHours,
  MINUTES_PER_DAY,
  type DatedClosure,
  type OpenWindow,
} from '../common/open-hours';

/**
 * Bookable start times for a local date.
 *
 * The last slot is one whole seating before closing: offering 22:30 when the
 * kitchen shuts at 23:00 sells a table the guest cannot use.
 *
 * A window that runs past midnight closes past 1440, so the loop simply keeps
 * counting and `instantOf` carries the overflow into the next calendar day —
 * the 01:00 slot of a night that began on the 3rd is generated from the 3rd,
 * which is also the day it belongs to.
 */
export function slotsFor(date: string, window: OpenWindow, policy: ResolvedBookingPolicy): Date[] {
  const lastStart = window.closesMinutes - policy.seatingMinutes;
  const slots: Date[] = [];

  for (let minutes = window.opensMinutes; minutes <= lastStart; minutes += policy.slotMinutes) {
    slots.push(instantOf(date, minutes));
  }
  return slots;
}

/**
 * Whether an instant is exactly on a bookable slot boundary for its service day.
 *
 * The day is passed in rather than derived here, because for a night that runs
 * past midnight the two differ: 01:00 on Tuesday is a slot of *Monday's*
 * evening, and regenerating Tuesday's would not contain it. `serviceDateOf`
 * answers that question, and the caller has already asked it in order to pick
 * the window being passed alongside.
 *
 * Still generated rather than tested arithmetically — the offer and the gate
 * come out of one function, which is why changing the spacing has never needed
 * a matching change here.
 */
export function isSlotBoundary(
  instant: Date,
  window: OpenWindow,
  policy: ResolvedBookingPolicy,
  serviceDate: string,
): boolean {
  return slotsFor(serviceDate, window, policy).some(
    (slot) => slot.getTime() === instant.getTime(),
  );
}

/**
 * Two seatings on one table clash when their intervals overlap at all.
 *
 * Each side brings its own length, because each booking snapshotted the seating
 * it was made under (`reservations.seating_minutes`). A branch that lengthened
 * its seating last week has bookings of both lengths on the books, and
 * measuring them against one number would either free a table that is still
 * occupied or hold one that is not.
 */
export function seatingsOverlap(
  aStart: Date,
  bStart: Date,
  aMinutes: number,
  bMinutes: number,
): boolean {
  const a = aStart.getTime();
  const b = bStart.getTime();
  return a < b + bMinutes * 60_000 && b < a + aMinutes * 60_000;
}

/**
 * The window a booking at `start` occupies, for querying existing bookings.
 *
 * Widened by the **longest seating the platform permits**, not by this branch's
 * current one. The query has to find every booking that might still be sitting,
 * and a branch that has since shortened its seating still has older bookings on
 * the books holding their tables for the old, longer stretch — a range built
 * from today's number would not fetch them, and the overlap check would never
 * get the chance to say so. Narrowing it is a false economy: it is one indexed
 * range over a single branch's day.
 */
export function seatingRange(start: Date): { from: Date; to: Date } {
  const widest = BOOKING_POLICY_LIMITS.seatingMinutes.max * 60_000;
  return { from: new Date(start.getTime() - widest), to: new Date(start.getTime() + widest) };
}

/**
 * Deposit for a party — see BUSINESS_LOGIC.md §3.
 *
 * Credited against the final bill, never an extra charge. It scales with the
 * party because the cost of an empty table does.
 */
export function depositFor(guests: number, policy: ResolvedBookingPolicy): number {
  return depositForGuests(guests, policy);
}
