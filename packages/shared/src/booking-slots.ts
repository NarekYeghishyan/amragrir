/**
 * Which of a day's bookable times are worth putting in front of somebody, and
 * how a long list of them is broken up.
 *
 * `GET /restaurants/:id/availability` answers with every start the branch could
 * seat — at `RESERVATION_SLOT_MINUTES` grain that is around seventy for a
 * twelve-hour day, and product chose that grain deliberately so a guest who
 * wants 19:20 can ask for it. What it did not choose was for a picker to draw
 * all seventy at once, and the constant's own note says as much: the answer got
 * longer *and the pickers scroll*.
 *
 * These are the rules that make seventy readable. They live here rather than in
 * one app because both clients draw the same list from the same answer, the way
 * `monthGrid` and `readyTimeOptions` already do — two copies of "is this time
 * still worth offering" is two chances for the phone and the browser to disagree
 * about one booking.
 *
 * Free of `Date.now()` on purpose: every rule takes the instant it judges
 * against, so a test can name it and a screen can keep one clock.
 */

/**
 * The shape both clients' `Slot` types already have.
 *
 * Structural rather than imported: the API response type is declared once per
 * app (`apps/web/src/lib/api.ts`, `apps/mobile/src/api/types.ts`) and every
 * function here is generic in it, so a slot goes through these rules and comes
 * out still carrying whatever else its own app hangs on it.
 */
export interface BookableSlot {
  /** ISO instant the table would be taken — the value `POST /reservations` takes. */
  at: string;
  /** `HH:mm` on the *restaurant's* clock; the API formats it in Yerevan. */
  time: string;
  /**
   * False for a table already taken **and** for a start too soon to give the
   * kitchen its lead time. Both are refusals, so both are drawn the same way.
   */
  available: boolean;
}

/**
 * Drops the times that have gone.
 *
 * **A time in the past is not a taken table.** The API reports both as
 * `available: false`, because from where it stands they are the same refusal —
 * but they are not the same thing to look at. A struck-through 20:00 says
 * somebody has that table, which is worth knowing when picking 20:30; a
 * struck-through 10:00 on a day already half gone says nothing at all, and
 * today's list opened with fifty of them stacked before the first time anybody
 * could choose.  So the past is removed and only genuinely taken tables are
 * struck through.
 *
 * @param slots What `GET /availability` answered for the day.
 * @param nowIso The instant to read "past" against — passed in, never read
 *   here, so a test can name it and the caller can keep one clock.
 */
export function upcomingSlots<T extends BookableSlot>(slots: T[], nowIso: string): T[] {
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
export function hasFreeSlot(slots: BookableSlot[]): boolean {
  return slots.some((slot) => slot.available);
}

/** The three stretches a service day is read in. */
export const PARTS_OF_DAY = ['morning', 'afternoon', 'evening'] as const;

export type PartOfDay = (typeof PARTS_OF_DAY)[number];

/**
 * Which stretch of the day an `HH:mm` falls in.
 *
 * **Everything before 05:00 is evening**, not morning. A branch open till 02:00
 * has its last starts labelled 00:30 and 01:00, and those belong to the night
 * that began at 19:00 — filing them under "morning" would send somebody looking
 * for a nightcap to the wrong tab. Five is where a night stops being one.
 */
export function partOfDay(time: string): PartOfDay {
  const hour = Number(time.slice(0, 2));

  if (Number.isNaN(hour) || hour >= 17 || hour < 5) {
    return 'evening';
  }
  return hour < 12 ? 'morning' : 'afternoon';
}

export interface SlotGroup<T extends BookableSlot> {
  part: PartOfDay;
  slots: T[];
}

/**
 * The day's times split into stretches, so a picker can show one at a time.
 *
 * **The groups come back in the order the day meets them**, not in
 * `PARTS_OF_DAY` order — the slots arrive chronologically and the grouping keeps
 * that, so a branch whose evening runs past midnight lists its evening first and
 * does not jump backwards over the 00:30 it also offers. Empty stretches are
 * absent rather than present and empty: a tab nobody can press is worse than no
 * tab.
 *
 * This is the shape the *phone* needs. The browser puts the same times in a
 * scrolling column beside the calendar, where a heading every few rows is noise
 * rather than structure; under a calendar, on a screen that cannot afford a
 * second scroller, the stretch is what keeps the grid to a few rows.
 */
export function slotsByPartOfDay<T extends BookableSlot>(slots: T[]): SlotGroup<T>[] {
  const groups: SlotGroup<T>[] = [];

  for (const slot of slots) {
    const part = partOfDay(slot.time);
    const open = groups.find((group) => group.part === part);

    if (open) {
      open.slots.push(slot);
    } else {
      groups.push({ part, slots: [slot] });
    }
  }

  return groups;
}
