/**
 * Public origin of this site.
 *
 * Needed for canonical URLs, Open Graph and the sitemap, none of which may be
 * relative. Overridable so a preview deployment does not advertise production
 * URLs to a crawler.
 */
export const SITE_URL = process.env.SITE_URL ?? 'https://amragrir.am';

/** Canonical path for a restaurant. One place, because the sitemap, the cards
 *  and the canonical tag must agree — a mismatch splits a page's ranking. */
export function restaurantPath(language: string, slug: string): string {
  return `/${language}/r/${slug}`;
}

export function homePath(language: string): string {
  return `/${language}`;
}

export function searchPath(language: string, query?: string): string {
  return query ? `/${language}/search?q=${encodeURIComponent(query)}` : `/${language}/search`;
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
  map['x-default'] = `${SITE_URL}${path('hy')}`;
  return map;
}
