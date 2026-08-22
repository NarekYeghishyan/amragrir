/**
 * Display formatting. Money arrives from the API as an integer in dram and is
 * only ever formatted here — never recomputed (DEVELOPMENT_GUIDE.md: all money
 * maths happens on the server).
 */

export function formatAmd(amount: number): string {
  return `${amount.toLocaleString('en-US').replace(/,/g, ' ')} ֏`;
}

export function formatDistance(km: number | null): string | null {
  if (km === null) {
    return null;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
}

export function formatPriceLevel(level: number | null): string | null {
  return level === null ? null : '$'.repeat(Math.max(1, Math.min(4, level)));
}

/** `mm:ss` for the tracking countdown. Null when there is nothing to count. */
export function formatCountdown(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * The restaurant's clock, not the phone's.
 *
 * Every time in this flow is a time somebody has to physically be somewhere —
 * a table at 19:30, food ready at 12:45 — so it is shown in Yerevan whatever
 * the device is set to. Reading the phone's own hours told a traveller (or
 * anyone whose clock had drifted onto another zone) to collect their food four
 * hours early, which is how this used to behave.
 */
const YEREVAN = 'Asia/Yerevan';

/** Clock time an order is expected, e.g. "arrives 14:05". */
export function formatTime(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: YEREVAN,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
}

/** `YYYY-MM-DD` in Yerevan — the form `GET /availability` takes. */
export function yerevanDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: YEREVAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * `Sat, 14 Aug` — the chosen day on the folded "Date & time" row.
 *
 * Built from the `YYYY-MM-DD` the picker works in, read as a plain calendar day
 * in UTC rather than as an instant: the string already *is* Yerevan's day, and
 * putting it through a zone a second time would move it by one either way.
 */
export function formatDayShort(date: string, language: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    return date;
  }
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** `August 2026`, for the heading over the booking calendar. */
export function formatMonth(year: number, month: number, language: string): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month, 1)));
}

/**
 * The seven column headings of the calendar, Monday first — which is the week
 * Armenia reads, not the Sunday-first one `Date.getDay()` counts in.
 *
 * Built from a date that is known to be a Monday (1 Jan 2024) rather than from
 * a hand-written list, so the three languages stay each other's translations
 * without a dictionary entry per day.
 */
export function weekdayHeads(language: string): string[] {
  const format = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'UTC',
    weekday: 'short',
  });
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}

/** Human label for a status. The status values themselves come from
 *  `@amragrir/shared` — this only decides how they read. */
export function formatOrderStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
