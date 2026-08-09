/**
 * Display helpers. Money is formatted here and computed nowhere on this
 * client — the server owns every total (DEVELOPMENT_GUIDE.md).
 */

const DRAM = '֏';

/**
 * `5 800 ֏` — space-grouped thousands, matching the design.
 *
 * Grouped by hand rather than through `toLocaleString`, whose separator
 * depends on the runtime's ICU data: Node 24 returns a narrow no-break space
 * (U+202F), so a `.replace(/,/g, ' ')` quietly does nothing and the string
 * differs between machines. This is a plain space everywhere.
 */
export function formatAmd(amount: number): string {
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${digits} ${DRAM}`;
}

/** `1.2 km` / `400 m` — metres below a kilometre reads better than "0.4 km". */
export function formatDistance(km: number | null): string | null {
  if (km === null) {
    return null;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** One decimal, always — "4.8" not "4.80" and not "5". */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/** Repeated dram signs from the 1–3 price level. Null stays null rather than
 *  rendering an empty string that shifts the layout. */
export function formatPriceLevel(level: number | null): string | null {
  return level && level > 0 ? DRAM.repeat(Math.min(level, 4)) : null;
}

/**
 * The restaurant's clock, not the visitor's.
 *
 * Every time in this flow is a time somebody has to physically be somewhere —
 * a table at 19:30, food ready at 12:45 — so it is shown in Yerevan time
 * whether the page is being read from Yerevan or not. Rendering in the
 * browser's zone would tell someone abroad to collect their food at 08:45.
 */
const YEREVAN = 'Asia/Yerevan';

export function formatTime(iso: string): string {
  return yerevanTime(new Date(iso));
}

/** `HH:mm` in Yerevan — the value an `<input type="time">` takes. */
function yerevanTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: YEREVAN,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** `Tue 5 Aug` — enough to tell two days apart without a full date. */
export function formatDay(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: YEREVAN,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** `mm:ss`, for the countdown on an order that is being cooked. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
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
 * The two directions the checkout's clock fields need.
 *
 * `<input type="datetime-local">` and `<input type="time">` speak wall-clock
 * readings with no zone on them, and everything either side of them — the
 * quote's `earliestReadyAt`, `POST /reservations`, `POST /orders` — speaks
 * instants. The conversion is Yerevan's, for the reason `formatTime` is: the
 * time in the field is the time somebody has to be at the restaurant, so it
 * must read the same whether the page is opened from Yerevan or from London.
 */

/** `YYYY-MM-DDTHH:mm` — the value a `datetime-local` field takes. */
export function yerevanDateTime(iso: string): string {
  const date = new Date(iso);
  return `${yerevanDate(date)}T${yerevanTime(date)}`;
}

/** The instant a Yerevan reading names: `2026-08-07T19:30` → `…T15:30:00.000Z`.
 *  Null for anything that is not one, so a hand-edited form fails a check here
 *  rather than sending `Invalid Date` to the API. */
export function instantOfYerevan(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) {
    return null;
  }
  const asUtc = Date.parse(`${match[1]}T${match[2]}:${match[3]}:00.000Z`);
  if (Number.isNaN(asUtc)) {
    return null;
  }
  return new Date(asUtc - yerevanOffsetMs(new Date(asUtc))).toISOString();
}

/** The instant an `HH:mm` names on the Yerevan day that `onIso` falls in. */
export function instantOfYerevanTime(time: string, onIso: string): string | null {
  const match = /^(\d{2}):(\d{2})/.exec(time.trim());
  const day = new Date(onIso);
  if (!match || Number.isNaN(day.getTime())) {
    return null;
  }
  return instantOfYerevan(`${yerevanDate(day)}T${match[1]}:${match[2]}`);
}

/**
 * The next `stepMinutes` boundary of the Yerevan clock at or after `iso`.
 *
 * `min` and `step` on a native field are read together — the browser counts
 * steps *from* `min` — so a `min` of 14:07 offers 14:07 / 14:37 and a field
 * drawn with a 30-minute step reads like a bug. Rounding the floor onto the
 * clock is what makes the offered times the clean ones the design draws.
 */
export function yerevanStepUp(iso: string, stepMinutes: number): string {
  const date = new Date(iso);
  const [hours, minutes] = yerevanTime(date).split(':').map(Number);
  const sinceMidnight = hours * 60 + minutes;
  const rounded = Math.ceil(sinceMidnight / stepMinutes) * stepMinutes;
  // Through the instant rather than the string, so rounding 23:50 up lands on
  // the next day instead of on a "24:00" no field would accept.
  return new Date(date.getTime() + (rounded - sinceMidnight) * 60_000).toISOString();
}

/**
 * Yerevan's offset from UTC, in milliseconds.
 *
 * Armenia has had no daylight saving since 2012, so this is +04:00 in practice
 * — but it is asked rather than hardcoded, because a hardcoded offset is the
 * kind of thing that stays right until a government changes it and then fails
 * silently by exactly one hour.
 */
function yerevanOffsetMs(at: Date): number {
  const name = new Intl.DateTimeFormat('en-GB', {
    timeZone: YEREVAN,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '');
  if (!match) {
    return 4 * 3_600_000;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60_000;
}
