import { Language } from '@amragrir/shared';

/**
 * Money arrives as an integer in dram and is only ever formatted here.
 *
 * Grouped by hand rather than through `toLocaleString`, whose separator
 * depends on the runtime's ICU data — the same call returns `5,800` in one
 * process and `5 800` in another, so a `.replace(/,/g, ' ')` silently does
 * nothing on the second. This is a plain space everywhere.
 */
export function formatAmd(amount: number): string {
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${digits} ֏`;
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** `mm:ss`, or null when there is nothing left to count. */
export function formatCountdown(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** How long an order has been waiting — the number a kitchen actually needs. */
export function formatWaiting(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

/**
 * Picks a label out of a raw `*_i18n` object for the panel's own lists.
 *
 * The owner endpoints return every language on purpose (they are editable), so
 * the panel has to choose one to *display*. Same fallback order as the API's
 * `localize()`: requested, then `hy`, then anything populated.
 */
export function pickLabel(
  field: Record<string, string> | null,
  language: Language = Language.Hy,
): string {
  if (!field) {
    return '';
  }
  return field[language] || field[Language.Hy] || Object.values(field).find(Boolean) || '';
}
