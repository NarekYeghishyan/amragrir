/**
 * The arithmetic and the rules behind the top-of-page navigation bar.
 *
 * Kept out of the component because none of it needs a browser: whether a
 * click is going to load a page, and how far along to draw the bar, are both
 * decidable from values — and both are easy to get subtly wrong, which is what
 * `navigation-progress.spec.ts` is for.
 */

/**
 * How long a navigation may run before anything is drawn.
 *
 * Most moves on this site are already in the router's cache and land within a
 * frame or two; a bar that flashes on every one of them is noise, and noise is
 * what makes people stop reading a progress indicator. Only the navigations
 * that actually make somebody wait get one.
 */
export const GRACE_MS = 140;

/** How often the bar advances while a navigation is still in flight. */
export const TICK_MS = 180;

/** Where the bar starts once the grace period has passed. */
export const START_PROGRESS = 0.08;

/**
 * The bar never reaches the end on its own.
 *
 * There is no way to know how much of a server render is done, so the bar
 * approaches 90% and stops. Arriving at 100% and then sitting there is a lie
 * the next second exposes; stalling just short of the end is honest and is
 * what every bar of this kind does.
 */
export const CEILING = 0.9;

/** The fraction of the remaining gap each tick closes. */
export const APPROACH = 0.14;

/** How long the finished bar stays on screen, fading, before it is removed. */
export const SETTLE_MS = 340;

/**
 * When to stop waiting.
 *
 * A navigation can end in ways nothing tells this component about — a request
 * that never answers, a tab left in the background. Well past any render this
 * site does, and by then the route's own skeleton is carrying the message
 * anyway, so nothing is left saying nothing.
 */
export const GIVE_UP_MS = 12000;

/**
 * The next position of the bar, decelerating.
 *
 * Each tick closes the same fraction of what is left to `CEILING`, so the bar
 * moves quickly at first and then slows — which reads as "working" for as long
 * as it takes, without ever arriving.
 */
export function nextProgress(current: number): number {
  return current + (CEILING - current) * APPROACH;
}

/** What a click on a link amounts to, with nothing of the DOM in it. */
export interface ClickIntent {
  /** The link's `href` exactly as authored, or `null` when it has none. */
  href: string | null;
  /** Its `target`, or `null`. */
  target: string | null;
  /** Whether it carries a `download` attribute. */
  download: boolean;
  /**
   * Whether the press was one that opens the link somewhere else — a middle
   * click, or one with ⌘/Ctrl/Shift/Alt held. This page is not going anywhere.
   */
  modified: boolean;
}

/**
 * Whether pressing this link is about to replace the page under it.
 *
 * Everything answered `false` here leaves the current page where it is: a new
 * tab, a download, `mailto:`, another site, or an anchor into the page you are
 * already reading. Drawing a progress bar for any of them would be a bar that
 * never finishes.
 */
export function startsNavigation(intent: ClickIntent, currentHref: string): boolean {
  if (intent.download || intent.modified) {
    return false;
  }
  // `_self` is the default spelled out; anything else is another tab or frame.
  if (intent.target !== null && intent.target !== '' && intent.target !== '_self') {
    return false;
  }

  const next = sameSiteUrl(intent.href, currentHref);
  if (next === null) {
    return false;
  }

  // Same page, different hash: the browser scrolls and nothing is fetched.
  const current = new URL(currentHref);
  return next.pathname !== current.pathname || next.search !== current.search;
}

/**
 * The address submitting a form would load, or `null` when it loads nothing.
 *
 * The site has one such form — the header's search box, a real GET form so
 * that it still works with JavaScript off. Its fields have to be resolved into
 * the address, not guessed at: a bar is raised only for a *different* page, and
 * `/search` submitted from `/search` is the same page until the query says
 * otherwise.
 *
 * Only GET. Every other form here posts a Server Action, which mutates and
 * stays put; those give their own feedback in place and must not raise a bar
 * with no page load to wait for.
 */
export function formTarget(
  method: string,
  action: string | null,
  fields: Iterable<readonly [string, string]>,
  currentHref: string,
): string | null {
  if (method.toLowerCase() !== 'get') {
    return null;
  }
  // An absent `action` means "this address". A DOM form's *property* has
  // already filled that in; the attribute read off it has not.
  const target = sameSiteUrl(action ?? currentHref, currentHref);
  if (target === null) {
    return null;
  }
  // A GET submit replaces the query string outright rather than merging into
  // it, and drops the fragment.
  const query = new URLSearchParams();
  for (const [name, value] of fields) {
    query.append(name, value);
  }
  target.search = query.toString();
  target.hash = '';
  return target.href;
}

/**
 * The absolute URL a link or form target resolves to, or `null` when it is not
 * a page on this site — another origin, or one of the `mailto:` / `tel:` /
 * `blob:` schemes the browser hands to the operating system instead of loading.
 */
function sameSiteUrl(target: string | null, currentHref: string): URL | null {
  if (target === null || target === '') {
    return null;
  }
  let resolved: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    resolved = new URL(target, currentHref);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }
  return resolved.origin === current.origin ? resolved : null;
}
