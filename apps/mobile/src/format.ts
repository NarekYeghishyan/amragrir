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
