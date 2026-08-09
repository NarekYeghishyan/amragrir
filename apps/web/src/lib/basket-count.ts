import { COUNT_COOKIE } from './cart';

/**
 * How many dishes are in the basket, watched from the browser.
 *
 * Two controls are drawn outside the page that owns the basket — the header's
 * button and the restaurant page's order panel — and both have to notice when
 * the basket changes. This is the signal they share: `amr_n`, the small
 * readable cookie `cart-store.ts` rewrites on **every** basket write, count and
 * nothing else. See that file for why the basket itself stays httpOnly.
 *
 * **Why it is polled.** A basket write is a Server Action that answers with
 * `redirect()`, and Next resolves that as a client-side re-render rather than a
 * document load. So none of the events that would be the obvious thing to
 * listen to ever fire: not `pageshow`, not `focus`, not `storage` — the page
 * never went away and the value is not in storage. Both controls used to listen
 * for exactly those and were therefore never told anything: pressing `−` on the
 * basket removed the line from the list and left the header still advertising
 * the old count and the old total, and emptying the basket left a badge on a
 * button that opened an empty screen.
 *
 * There is no event for "a cookie changed" that every browser has — the
 * CookieStore API is Chromium's alone. A quarter-second read of one short
 * string is cheaper than the alternatives (making the layout dynamic, which
 * costs the catalogue its pre-rendering) by a wide margin, and it is the only
 * version that works the same in every browser.
 */

/** Long enough not to be busywork, short enough that nobody sees the old
 *  number: a Server Action's round trip is longer than this. */
const POLL_MS = 250;

export function readBasketCount(): number {
  if (typeof document === 'undefined') {
    return 0;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${COUNT_COOKIE}=(\\d+)`));
  return match ? Number(match[1]) : 0;
}

/**
 * The count before the browser has looked.
 *
 * Zero, and deliberately: the server renders one page for everybody, so any
 * other starting value would be wrong for somebody and would hydrate into a
 * mismatch. This is `useSyncExternalStore`'s server snapshot, which React also
 * uses for the first client render — so the button hydrates from the HTML it
 * was sent and fills in immediately afterwards.
 */
export function noBasketCount(): number {
  return 0;
}

/**
 * Everything currently watching, so a write that happened *on this page* need
 * not wait for the next tick to be noticed.
 *
 * The poll is for changes this tab did not make — another tab, a restored
 * session. When a control on this page writes the basket itself, it knows the
 * moment the write lands, and `notifyBasketChanged` turns that into the same
 * signal immediately. Nothing is assumed about the new value: every watcher
 * re-reads the cookie, so the notification cannot make the number wrong, only
 * early.
 */
const watchers = new Set<() => void>();

/** Called by whatever just wrote the basket, once the server has answered. */
export function notifyBasketChanged(): void {
  watchers.forEach((check) => check());
}

/** Calls back only when the number has actually moved, so a quiet page wakes
 *  React four times a second and no more. */
export function subscribeToBasketCount(onChange: () => void): () => void {
  let last = readBasketCount();

  const check = () => {
    const next = readBasketCount();
    if (next !== last) {
      last = next;
      onChange();
    }
  };

  watchers.add(check);
  const timer = window.setInterval(check, POLL_MS);
  // Kept alongside the poll rather than replaced by it: a tab restored from the
  // back/forward cache, or one returned to after the basket was changed in
  // another tab, should be right on the first frame instead of a tick later.
  window.addEventListener('pageshow', check);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);

  return () => {
    watchers.delete(check);
    window.clearInterval(timer);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}
