import type { ResolvedBookingPolicy } from '@amragrir/shared';
import {
  addLocalDays,
  bookingWindowFor,
  instantOf,
  localDateOf,
  localMinutesOf,
  serviceDateOf,
  windowContains,
  type DatedClosure,
} from '../reservations/slots';

/**
 * Which bookings a proposed change would leave the branch unable to honour.
 *
 * The gate every narrowing edit passes before it is saved — removing a table,
 * shrinking one, moving the booking hours, marking a day shut. Behind each of
 * those bookings is a guest with plans and a deposit that has already been
 * taken, so the panel shows what would break and asks; nothing here cancels
 * anything, and nothing here refuses a change outright. That is the whole
 * contract: this function reports, a person decides.
 *
 * **A conflict is "we could not seat them", not "we would not sell that now".**
 * The distinction matters more than it looks, because getting it wrong in the
 * generous direction produces a warning on every save, and a warning that is
 * always there is a warning nobody reads. So:
 *
 * - A table that has gone, or shrunk below the party — **a conflict.** There is
 *   no longer anywhere to put these people.
 * - A day that has become shut, or hours that no longer cover the sitting — **a
 *   conflict.** The door will be locked.
 * - A booking that no longer lands on the slot grid, sits past the new booking
 *   horizon, or exceeds a lowered party cap — **not a conflict.** Every one of
 *   those is a rule about what the branch will *offer next*, and the table is
 *   still there, still big enough, on a day the branch is still open. Warning
 *   about them would mean a manager who narrows the grid from ten minutes to
 *   thirty is told that two hundred perfectly good bookings are "in conflict".
 * - Money is not here either: `deposit_amd` and `free_cancel_hours` are
 *   snapshotted onto the booking, so a policy change cannot reach back and
 *   alter what somebody already agreed to. There is nothing to warn about
 *   because there is nothing to break.
 *
 * Pure, and free of Prisma types, so the rules can be read and tested without a
 * database — and so the same predicate answers for a change that has not been
 * saved yet, which is the only moment it is useful.
 */

/** Why one booking would no longer work. */
export const ConflictReason = {
  /** Its table has been removed or switched off. */
  TableGone: 'table_gone',
  /** Its table would no longer seat the party. */
  TableTooSmall: 'table_too_small',
  /** The branch would be shut that day. */
  DayClosed: 'day_closed',
  /** The branch would be open, but not at that hour. */
  OutsideHours: 'outside_hours',
} as const;
export type ConflictReason = (typeof ConflictReason)[keyof typeof ConflictReason];

/** One booking that the proposed setup could not honour, in the words a panel
 *  needs to say so — a time and a table, never an id. */
export interface BookingConflict {
  reservationId: string;
  reservedFor: string;
  localDate: string;
  localTime: string;
  guests: number;
  tableNo: string | null;
  customerName: string | null;
  reason: ConflictReason;
}

/** A branch as a booking would meet it — the shape being *proposed*, not the
 *  one stored. */
export interface BookingSetup {
  openHours: unknown;
  bookingHours: unknown;
  policy: ResolvedBookingPolicy;
  tables: readonly { id: string; tableNo: string; seats: number; isActive: boolean }[];
  /** The dated exception for a local date under the proposal, if any. A
   *  function rather than a list so the caller decides how to fold a closure it
   *  is in the middle of adding into the ones already stored. */
  closureFor: (date: string) => DatedClosure | null;
}

/** A live booking, as this check needs it. */
export interface BookingUnderReview {
  id: string;
  reservedFor: Date;
  guests: number;
  tableId: string | null;
  tableNo: string | null;
  customerName: string | null;
}

/**
 * The bookings `setup` could not honour.
 *
 * Ordered by when they happen, because that is the order somebody would work
 * through them — the one on Friday is the one to ring first.
 */
export function bookingConflicts(
  setup: BookingSetup,
  bookings: readonly BookingUnderReview[],
): BookingConflict[] {
  const conflicts: BookingConflict[] = [];

  for (const booking of [...bookings].sort(
    (a, b) => a.reservedFor.getTime() - b.reservedFor.getTime(),
  )) {
    const reason = reasonFor(setup, booking);
    if (reason !== null) {
      conflicts.push({
        reservationId: booking.id,
        reservedFor: booking.reservedFor.toISOString(),
        localDate: localDateOf(booking.reservedFor),
        localTime: `${String(Math.floor(localMinutesOf(booking.reservedFor) / 60)).padStart(2, '0')}:${String(localMinutesOf(booking.reservedFor) % 60).padStart(2, '0')}`,
        guests: booking.guests,
        tableNo: booking.tableNo,
        customerName: booking.customerName,
        reason,
      });
    }
  }

  return conflicts;
}

function reasonFor(setup: BookingSetup, booking: BookingUnderReview): ConflictReason | null {
  const table = setup.tables.find((candidate) => candidate.id === booking.tableId);
  if (!table || !table.isActive) {
    return ConflictReason.TableGone;
  }
  if (table.seats < booking.guests) {
    return ConflictReason.TableTooSmall;
  }

  // The same day-resolution the booking path uses, so "would this still be
  // inside the hours" is answered by the code that decides it for real.
  const own = localDateOf(booking.reservedFor);
  const serviceDate = serviceDateOf(setup, booking.reservedFor, setup.closureFor(addLocalDays(own, -1)));
  const window = bookingWindowFor(
    setup,
    instantOf(serviceDate, 12 * 60),
    setup.closureFor(serviceDate),
  );

  if (window === null) {
    return ConflictReason.DayClosed;
  }

  // `windowContains` tries the minute on both sides of midnight itself, which is
  // what lets a 01:00 sitting be found inside the window its evening opened —
  // so the raw minute-of-day is the right thing to hand it.
  return windowContains(window, localMinutesOf(booking.reservedFor))
    ? null
    : ConflictReason.OutsideHours;
}
