import { DEFAULT_LANGUAGE, LANGUAGES } from './language';

/**
 * Public origin of this site.
 *
 * Needed for canonical URLs, Open Graph and the sitemap, none of which may be
 * relative. Overridable so a preview deployment does not advertise production
 * URLs to a crawler.
 */
export const SITE_URL = process.env.SITE_URL ?? 'https://amragrir.am';

/**
 * The path prefix for a language — empty for the default one.
 *
 * Armenian is the market's language and the overwhelming majority of traffic,
 * so it is served at the bare domain (`/`, `/r/sunny-table`) and only the other
 * two are prefixed (`/ru`, `/en/r/sunny-table`). Every URL in the app is built
 * from here, so no page can accidentally publish a `/hy/…` address: that is not
 * a second home for Armenian, it is a duplicate that would compete with the
 * real one in an index, and `middleware.ts` redirects it away.
 */
function prefix(language: string): string {
  return language === DEFAULT_LANGUAGE ? '' : `/${language}`;
}

/** Canonical path for a restaurant. One place, because the sitemap, the cards
 *  and the canonical tag must agree — a mismatch splits a page's ranking. */
export function restaurantPath(language: string, slug: string): string {
  return `${prefix(language)}/r/${slug}`;
}

export function homePath(language: string): string {
  // The one path where the empty prefix is not already a URL.
  return prefix(language) || '/';
}

export function searchPath(language: string, query?: string): string {
  const path = `${prefix(language)}/search`;
  return query ? `${path}?q=${encodeURIComponent(query)}` : path;
}

// ── the order flow ──────────────────────────────────────────────────────────

/**
 * What every page in the order flow declares.
 *
 * These pages have no shared content — one visitor's basket is not another's —
 * so indexing them would spend a crawler's budget on pages that can never be a
 * useful result, and could surface a stale total in search. `follow` keeps the
 * restaurant links on them discoverable, exactly as `/search` already does.
 *
 * One exported constant rather than a line per page, so a new screen cannot
 * quietly ship without it.
 */
export const ORDER_ROBOTS = { index: false, follow: true } as const;

export function cartPath(language: string): string {
  return `${prefix(language)}/cart`;
}

export function preorderPath(language: string): string {
  return `${prefix(language)}/preorder`;
}

export function checkoutPath(language: string): string {
  return `${prefix(language)}/checkout`;
}

export function ordersPath(language: string): string {
  return `${prefix(language)}/orders`;
}

export function orderPath(language: string, id: string): string {
  return `${prefix(language)}/orders/${id}`;
}

export function signinPath(language: string, next?: string): string {
  const path = `${prefix(language)}/signin`;
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/**
 * The route that mints or refreshes a session and bounces back.
 *
 * Pages cannot do it themselves: Next forbids writing a cookie during a render,
 * so a page that finds itself without a usable token redirects here, and this
 * route — a Route Handler, where cookies *are* writable — sorts it out and
 * sends the visitor back to where they were going.
 */
export function sessionPath(language: string, next: string): string {
  return `${prefix(language)}/session?next=${encodeURIComponent(next)}`;
}

/**
 * `hreflang` alternates for a page.
 *
 * Without these the three language versions look like duplicates competing
 * with each other; with them a search engine knows they are the same page and
 * serves the right one. `x-default` points at Armenian, the product default.
 */
export function hreflangFor(
  languages: readonly string[],
  path: (language: string) => string,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const language of languages) {
    map[language] = `${SITE_URL}${path(language)}`;
  }
  map['x-default'] = `${SITE_URL}${path(DEFAULT_LANGUAGE)}`;
  return map;
}

// ── mapping published URLs onto the [lang] tree ─────────────────────────────

/** What the middleware should do with an incoming path. */
export type LanguageRoute =
  | { action: 'pass' }
  | { action: 'redirect'; pathname: string }
  | { action: 'rewrite'; pathname: string };

/** `/ru` and `/en` are real URL segments; the default language has none. */
const PREFIXED = LANGUAGES.filter((language) => language !== DEFAULT_LANGUAGE);

function isUnder(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.startsWith(`${segment}/`);
}

/**
 * Decides, for one incoming path, which language renders it and at which
 * address.
 *
 * Pure, and here rather than inline in `middleware.ts`, so the rule can be
 * tested without standing up an Edge request — it governs every URL on the
 * site, and getting it wrong is the kind of thing that fails silently.
 */
export function resolveLanguageRoute(pathname: string): LanguageRoute {
  const defaultPrefix = `/${DEFAULT_LANGUAGE}`;

  // `/hy/…` is not an address this site publishes; it is the same page as the
  // unprefixed one. Send it there permanently rather than serve both — two
  // URLs for one page split its ranking, and old links still have to work.
  if (isUnder(pathname, defaultPrefix)) {
    return { action: 'redirect', pathname: pathname.slice(defaultPrefix.length) || '/' };
  }

  if (PREFIXED.some((language) => isUnder(pathname, `/${language}`))) {
    return { action: 'pass' };
  }

  // Everything else is Armenian at its published address. A rewrite, not a
  // redirect: the visitor keeps the unprefixed URL while the `[lang]` tree
  // still receives the language segment it is built around.
  return { action: 'rewrite', pathname: `${defaultPrefix}${pathname === '/' ? '' : pathname}` };
}

/**
 * A published path as the `[lang]` tree sees it — always language-prefixed.
 *
 * `revalidatePath` and friends key on the route that actually rendered, and
 * that is always `/[lang]/…`. The unprefixed Armenian URL is a middleware
 * rewrite, not a route of its own, so revalidating `/cart` would match nothing
 * and quietly do nothing — leaving a customer who just added a dish looking at
 * a basket that does not have it. Anything naming a *route* goes through here;
 * anything naming a *link* uses the path helpers above.
 */
export function routePath(pathname: string): string {
  // A cache entry is per route, never per query string.
  const path = pathname.split('?')[0] ?? pathname;
  const route = resolveLanguageRoute(path);
  return route.action === 'rewrite' ? route.pathname : path;
}
