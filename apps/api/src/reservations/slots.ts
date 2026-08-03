import {
  DEPOSIT_PER_GUEST_AMD,
  RESERVATION_SEATING_MINUTES,
  RESERVATION_SLOT_MINUTES,
} from '@amragrir/shared';
import { instantOf, localDateOf, type OpenWindow } from '../common/open-hours';

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
 */

export {
  instantOf,
  localDateOf,
  localMinutesOf,
  localTimeLabel,
  openWindowFor,
  isWithinOpenHours,
  type OpenWindow,
} from '../common/open-hours';

/**
 * Bookable start times for a local date.
 *
 * The last slot is one whole seating before closing: offering 22:30 when the
 * kitchen shuts at 23:00 sells a table the guest cannot use.
 */
export function slotsFor(date: string, window: OpenWindow): Date[] {
  const lastStart = window.closesMinutes - RESERVATION_SEATING_MINUTES;
  const slots: Date[] = [];

  for (
    let minutes = window.opensMinutes;
    minutes <= lastStart;
    minutes += RESERVATION_SLOT_MINUTES
  ) {
    slots.push(instantOf(date, minutes));
  }
  return slots;
}

/** Whether an instant is exactly on a bookable slot boundary for its date. */
export function isSlotBoundary(instant: Date, window: OpenWindow): boolean {
  return slotsFor(localDateOf(instant), window).some(
    (slot) => slot.getTime() === instant.getTime(),
  );
}

/** Two seatings on one table clash when their intervals overlap at all. */
export function seatingsOverlap(a: Date, b: Date): boolean {
  const gap = Math.abs(a.getTime() - b.getTime());
  return gap < RESERVATION_SEATING_MINUTES * 60_000;
}

/** The window a booking at `start` occupies, for querying existing bookings. */
export function seatingRange(start: Date): { from: Date; to: Date } {
  const seating = RESERVATION_SEATING_MINUTES * 60_000;
  return { from: new Date(start.getTime() - seating), to: new Date(start.getTime() + seating) };
}

/**
 * Deposit for a party — see BUSINESS_LOGIC.md §3.
 *
 * Credited against the final bill, never an extra charge. It scales with the
 * party because the cost of an empty table does.
 */
export function depositFor(guests: number): number {
  return guests * DEPOSIT_PER_GUEST_AMD;
}
