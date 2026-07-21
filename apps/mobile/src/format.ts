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

/** Clock time an order is expected, e.g. "arrives 14:05". */
export function formatTime(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Human label for a status. The status values themselves come from
 *  `@amragrir/shared` — this only decides how they read. */
export function formatOrderStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
