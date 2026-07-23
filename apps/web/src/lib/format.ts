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
