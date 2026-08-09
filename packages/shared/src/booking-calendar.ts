/**
 * The month grid behind the booking calendar.
 *
 * Kept apart from the screen and free of `Date.now()` so the rules — which days
 * can be booked, where the month starts, how far ahead the horizon runs — are
 * testable without freezing a clock.
 *
 * Everything here deals in `YYYY-MM-DD` **Yerevan** dates, the form
 * `GET /restaurants/:id/availability` takes. They compare correctly as plain
 * strings, which is why no `Date` survives past the arithmetic.
 *
 * **Shared because both clients draw this calendar.** It lived in
 * `apps/mobile/src` while the app was the only one with a month view; the web
 * checkout grew the same one on 2026-08-08, and two copies of "which day of the
 * week does this month start on" is two chances to disagree about a booking.
 * `readyTimeOptions` moved here for the same reason and by the same route.
 */

export interface CalendarCell {
  /** `null` on the blanks that pad the first and last weeks. */
  day: number | null;
  /** `YYYY-MM-DD`, or `null` on a blank. */
  date: string | null;
  /**
   * False for a day that cannot be booked — one already past, or one beyond the
   * booking horizon. Such days are still drawn, greyed: a calendar that hid
   * them would leave a hole where the reader expects the 1st.
   */
  bookable: boolean;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` for a date-only value, with no zone involved. */
function isoDate(utc: Date): string {
  return utc.toISOString().slice(0, 10);
}

/** Reads `YYYY-MM-DD` as a UTC instant. Date-only maths, so noon is irrelevant. */
function parse(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `date` moved by whole days, still `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  return isoDate(new Date(parse(date).getTime() + days * DAY_MS));
}

/**
 * The cells of one month, Monday first and padded to whole weeks.
 *
 * @param year  Full year of the month being drawn.
 * @param month Zero-based, as `Date` counts them.
 * @param today Yerevan's date, so "past" means past where the restaurant is.
 * @param maxLeadDays How far ahead bookings are taken (`RESERVATION_MAX_LEAD_DAYS`).
 */
export function monthGrid(
  year: number,
  month: number,
  today: string,
  maxLeadDays: number,
): CalendarCell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const horizon = addDays(today, maxLeadDays);

  // `getUTCDay()` counts from Sunday; Armenia reads a week that starts on
  // Monday, so the offset is shifted rather than used raw.
  const leading = (first.getUTCDay() + 6) % 7;

  const cells: CalendarCell[] = Array.from({ length: leading }, () => ({
    day: null,
    date: null,
    bookable: false,
  }));

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = isoDate(new Date(Date.UTC(year, month, day)));
    cells.push({ day, date, bookable: date >= today && date <= horizon });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, date: null, bookable: false });
  }

  return cells;
}

/** True when any day of this month can still be booked. Drives the arrows: an
 *  arrow onto a month with nothing bookable is an arrow to a dead end. */
export function monthHasBookableDay(
  year: number,
  month: number,
  today: string,
  maxLeadDays: number,
): boolean {
  return monthGrid(year, month, today, maxLeadDays).some((cell) => cell.bookable);
}
