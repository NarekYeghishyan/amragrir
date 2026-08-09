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

/**
 * The page currently being read, in another language.
 *
 * What the header's switch links. It used to link `homePath(code)`, which threw
 * the page away: choosing Russian while reading a restaurant's menu landed on
 * the Russian home page, with nothing but the back button to get back. A
 * language is a way of reading this page, not a reason to leave it.
 *
 * It accepts a path in either form the app can hand it — the published one
 * (`/cart`, `/ru/cart`) and the internal `[lang]` one the middleware rewrites to
 * (`/hy/cart`), which is what a server render of the Armenian tree sees — so the
 * link comes out the same whether it is built during that render or in the
 * browser afterwards. A query string is not its business: the caller keeps it.
 */
export function translatedPath(pathname: string, language: string): string {
  return `${prefix(language)}${withoutLanguage(pathname)}` || '/';
}

/** The path minus its language segment, if it has one. `/rubicon` has not. */
function withoutLanguage(pathname: string): string {
  const language = LANGUAGES.find((code) => isUnder(pathname, `/${code}`));
  const rest = language === undefined ? pathname : pathname.slice(language.length + 1);
  // `/ru/` and `/ru` name the same page; the trailing slash must not survive
  // into `/en/`, which is a URL this site does not publish.
  return rest === '/' ? '' : rest;
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

/**
 * The route handler the restaurant page's order panel reads.
 *
 * A route rather than a page because it answers JSON, and language-prefixed
 * like everything else so the strings it formats come back in the language the
 * visitor is reading. Built here rather than in the component: the component
 * runs in the browser, where the prefix rule does not live.
 */
export function basketApiPath(language: string): string {
  return `${prefix(language) || ''}/basket`;
}

/**
 * The route a pre-rendered restaurant page reads its heart's state from.
 *
 * Same reasoning as `basketApiPath` above, and built here for the same reason —
 * the component that calls it runs in the browser, where the prefix rule does
 * not live. See `app/[lang]/saved/route.ts` for why a static page cannot answer
 * this itself.
 */
export function savedApiPath(language: string, restaurantId: string): string {
  return `${prefix(language) || ''}/saved?restaurant=${encodeURIComponent(restaurantId)}`;
}

/**
 * The route the checkout's booking calendar reads a day's table times from.
 *
 * A route rather than a Server Action, for the reason the handler gives: paging
 * to Thursday changes nothing else on the checkout, and revalidating would
 * re-price the basket to fill in a grid of times. Built here, like the panel's
 * above, because the prefix rule does not live in the browser.
 */
export function availabilityApiPath(language: string): string {
  return `${prefix(language) || ''}/availability`;
}

/**
 * The route the location picker searches addresses through.
 *
 * A route rather than a call to Yandex from the page, for the reason `api.ts`
 * gives: the geocoder's key is not domain-restricted, so it stays on the server
 * and the browser asks this instead. Language-prefixed so an address comes back
 * written in the language being read.
 */
export function geocodeApiPath(language: string): string {
  return `${prefix(language) || ''}/geocode`;
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

/**
 * The route handler the tracking page watches an order's progress through.
 *
 * Built here like the panel's and the calendar's above, for the same reason:
 * the component that asks runs in the browser, and the language-prefix rule
 * lives on the server.
 */
export function orderStatusApiPath(language: string, id: string): string {
  return `${prefix(language)}/orders/${id}/status`;
}

/**
 * The bell's route handler, same reasoning as `orderStatusApiPath` above: the
 * session is an httpOnly cookie, so the browser asks this app rather than the
 * API. Language-prefixed like every other path in the tree, which is also what
 * keeps `middleware.ts` from treating it as a page to redirect.
 */
export function notificationsApiPath(language: string): string {
  return `${prefix(language)}/notifications`;
}

/**
 * The same bell, pushed. A child of the path above rather than a sibling,
 * because it is the same resource in a different shape — and it keeps the two
 * from drifting apart when the language rule changes.
 */
export function notificationsStreamPath(language: string): string {
  return `${prefix(language)}/notifications/stream`;
}

export function reservationsPath(language: string): string {
  return `${prefix(language)}/reservations`;
}

export function reservationPath(language: string, id: string): string {
  return `${prefix(language)}/reservations/${id}`;
}

export function profilePath(language: string): string {
  return `${prefix(language)}/profile`;
}

export function favoritesPath(language: string): string {
  return `${prefix(language)}/favorites`;
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
