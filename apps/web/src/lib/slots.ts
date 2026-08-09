import type { Slot } from './api';

/**
 * Which of a day's table times are still worth showing.
 *
 * Kept out of the component and free of `Date.now()` so it is testable without
 * freezing a clock, the way `booking-calendar` is.
 *
 * This module briefly also grouped the times by part of day, for a grid that
 * sat under the calendar. The picker puts them in a column beside it now, where
 * a heading every few rows is noise rather than structure, so the grouping went
 * with the layout that needed it.
 */

/**
 * Drops the times that have gone.
 *
 * **A time in the past is not a taken table.** The API reports both as
 * `available: false`, because from where it stands they are the same refusal —
 * but they are not the same thing to look at. A struck-through 20:00 says
 * somebody has that table, which is worth knowing when picking 20:30; a
 * struck-through 10:00 on a day already half gone says nothing at all, and
 * today's list opened with nine of them stacked before the first time anybody
 * could choose. So the past is removed and only genuinely taken tables are
 * struck through.
 *
 * @param slots What `GET /availability` answered for the day.
 * @param nowIso The instant to read "past" against — passed in, never read
 *   here, so a test can name it and the caller can keep one clock.
 */
export function upcomingSlots(slots: Slot[], nowIso: string): Slot[] {
  const now = Date.parse(nowIso);

  return slots.filter((slot) => {
    const at = Date.parse(slot.at);
    // An unparseable instant is dropped rather than shown: a row that cannot be
    // turned into a booking is worse than one fewer row.
    if (Number.isNaN(at)) {
      return false;
    }
    // An unreadable clock empties nothing — better a stale list than no list.
    return Number.isNaN(now) || at > now;
  });
}

/** True when a day still has something to offer. The picker draws "no free
 *  times" otherwise, which the list alone cannot say: a day of struck-through
 *  tables still has rows. */
export function hasFreeSlot(slots: Slot[]): boolean {
  return slots.some((slot) => slot.available);
}
