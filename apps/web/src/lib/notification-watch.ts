import { ORDER_STATUS_COPY, type TranslationKey } from '@amragrir/i18n';
import type { OrderStatus } from '@amragrir/shared';
import type { Bell, NotificationItem } from './notifications';

export { ORDER_STATUS_COPY };

/**
 * The browser's half of the bell — the parts worth testing on their own, kept
 * out of the component that runs them.
 *
 * Everything here is about not trusting the answer more than it deserves: it
 * arrives over the network, from a route that can answer "signed out", and a
 * malformed one must leave the last true badge on screen rather than replace it
 * with `undefined`.
 */

/**
 * How often the browser asks.
 *
 * Thirty seconds, where the tracking page polls at five. The two are watching
 * the same events and the difference is what the reader is doing: somebody on
 * the tracking screen is *waiting*, and a stale "preparing" in front of them is
 * the failure that screen exists to prevent. The bell is glanced at, and a
 * notification half a minute old is still news — while a five-second bell would
 * be twelve requests a minute from every open tab on the site, for a badge that
 * changes a handful of times an hour.
 *
 * The tracking page keeps its own faster poll, so nothing gets slower.
 */
export const BELL_POLL_MS = 30_000;

/**
 * The words for one line, or null when this app cannot draw it.
 *
 * Null is a real answer rather than a failure: an `order` row carries a status
 * and no prose, a `promo` row carries prose and no status, and a client that
 * insisted on rendering both from the same branch would have to invent one of
 * them. The caller falls back to `title`/`body` as sent.
 */
export function orderCopy(
  item: NotificationItem,
): { title: TranslationKey; body: TranslationKey } | null {
  const status = item.payload?.status;
  if (item.type !== 'order' || !status) {
    return null;
  }
  // Narrowed by the guard above rather than by the type: `payload.status` holds
  // whichever status the row's kind uses, and an `order` row's is an
  // `OrderStatus`. The lookup still answers `null` for a value this build does
  // not know, which is what a newer API talking to an older page produces.
  return ORDER_STATUS_COPY[status as OrderStatus] ?? null;
}

/**
 * An answer from the bell route, or null if it is not one.
 *
 * Checked rather than cast: a proxy that answers HTML, a deploy mid-request, a
 * route that changed shape — all of them arrive here as "some object", and a
 * badge showing `NaN` because of one is worse than a badge that keeps showing
 * the last number it was sure of.
 */
export function toBell(value: unknown): Bell | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<Bell>;
  if (typeof candidate.unread !== 'number' || !Array.isArray(candidate.items)) {
    return null;
  }
  const items = candidate.items.filter(
    (item): item is NotificationItem =>
      typeof item === 'object' && item !== null && typeof (item as NotificationItem).id === 'string',
  );
  return { items, unread: candidate.unread };
}

/**
 * One pushed notification, or null if it is not one.
 *
 * The stream's frames get the same treatment as the poll's answers, and for a
 * sharper reason: an item that arrives here is *added* to the list rather than
 * replacing it, so a malformed one would sit at the top of the bell until the
 * next reload rather than being corrected by the following poll.
 */
export function toItem(value: unknown): NotificationItem | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<NotificationItem>;
  if (typeof candidate.id !== 'string' || typeof candidate.type !== 'string') {
    return null;
  }
  return candidate as NotificationItem;
}

/**
 * The bell with one line taken out, as the panel shows it before the server has
 * answered.
 *
 * Pure and tested rather than done inline, because the arithmetic is the part
 * that goes wrong: the badge must drop only when the line that went was
 * **unread**, and must never go below zero — which it could, since the count
 * comes from the server and covers everything, while the list is one capped
 * page of it. Removing an unread line that is on screen from a count of one is
 * fine; doing the same twice, or removing a read line, must not push it
 * negative.
 *
 * An unknown id returns the bell unchanged rather than throwing: the cross
 * cannot be pressed for a line that is not drawn, so this only happens when
 * something has already re-listed underneath, and the right answer is to leave
 * that newer state alone.
 */
export function withoutItem(bell: Bell, id: string): Bell {
  const going = bell.items.find((item) => item.id === id);
  if (!going) {
    return bell;
  }
  return {
    items: bell.items.filter((item) => item.id !== id),
    unread: going.isRead ? bell.unread : Math.max(0, bell.unread - 1),
  };
}

/**
 * Whether two readings say the same thing.
 *
 * Compared by the newest id and the count rather than deep-equality: those are
 * the only two things the header draws, and a re-render per poll is what this
 * exists to avoid. A notification being marked read elsewhere changes the
 * count; a new one changes the id.
 */
export function sameBell(a: Bell, b: Bell): boolean {
  return a.unread === b.unread && a.items[0]?.id === b.items[0]?.id;
}

/**
 * Whether an answer means "stop asking" rather than "try again".
 *
 * A 401 is a session that ended — signing out should not leave a tab polling a
 * bell forever. Everything else (an API restarting, a laptop that slept, a 500)
 * is temporary by assumption, and the watcher catches up on the next tick.
 */
export function stopWatchingOn(httpStatus: number): boolean {
  return httpStatus === 401;
}
