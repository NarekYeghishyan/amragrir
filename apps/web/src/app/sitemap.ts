import type { MetadataRoute } from 'next';
import { Language } from '@amragrir/shared';
import { api } from '@/lib/api';
import { LANGUAGES } from '@/lib/language';
import { SITE_URL, homePath, hreflangFor, restaurantPath } from '@/lib/site';

/**
 * Every restaurant page, generated from the API.
 *
 * A hand-maintained list would go stale the first time a restaurant is added,
 * which is the failure nobody notices — the page simply never gets crawled.
 *
 * `limit` is capped at 50 server-side, so this pages through rather than
 * assuming one request returns everything.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = LANGUAGES.map((language) => ({
    url: `${SITE_URL}${homePath(language)}`,
    changeFrequency: 'daily' as const,
    priority: 1,
    alternates: { languages: hreflangFor(LANGUAGES, homePath) },
  }));

  const slugs = new Set<string>();
  for (let page = 1; ; page += 1) {
    const { items, total } = await api.restaurants(Language.Hy, { page, limit: 50 });

    for (const item of items) {
      // A restaurant with several branches appears once per branch in the
      // list; the page is per restaurant, so the URL must not repeat.
      slugs.add(item.slug);
    }

    if (items.length === 0 || page * 50 >= total) {
      break;
    }
  }

  for (const slug of slugs) {
    const path = (language: string) => restaurantPath(language, slug);
    for (const language of LANGUAGES) {
      entries.push({
        url: `${SITE_URL}${path(language)}`,
        changeFrequency: 'weekly',
        priority: 0.8,
        // Declaring the alternates here too tells a crawler these three are
        // one page in three languages, not three competing duplicates.
        alternates: { languages: hreflangFor(LANGUAGES, path) },
      });
    }
  }

  return entries;
}

/** Rebuilt hourly: new restaurants should appear without a deploy, but a
 *  crawler does not need the sitemap regenerated per request. */
export const revalidate = 3600;
