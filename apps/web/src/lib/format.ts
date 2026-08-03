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
 * A dialable `tel:` URI for a number stored for reading.
 *
 * Branches store `+374 10 555 001`, which is how it should appear on the page
 * — but a `tel:` URI is not free text. RFC 3966 allows visual separators only
 * from a small set, and a space is not one of them; browsers mostly cope,
 * dialers and messaging apps less reliably. Keep the digits and the leading
 * `+`, and let the label carry the formatting.
 */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
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
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: YEREVAN,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
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
