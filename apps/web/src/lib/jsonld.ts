import { MenuTab } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import type { MenuItem, RestaurantDetail } from './api';
import { SITE_URL, restaurantPath } from './site';

/** Menu sections, in the order the design's tabs use. */
export const TAB_ORDER = [MenuTab.Popular, MenuTab.Mains, MenuTab.Sides, MenuTab.Drinks] as const;

/**
 * The heading each section is drawn under.
 *
 * `MenuTab` is a wire value, not a word: printing it put "mains" and "drinks"
 * on an Armenian page. Typed as `TranslationKey` so a section added without a
 * translation is a compile error rather than an English heading in production.
 */
export const MENU_TAB_LABEL: Record<(typeof TAB_ORDER)[number], TranslationKey> = {
  [MenuTab.Popular]: 'menuTabPopular',
  [MenuTab.Mains]: 'menuTabMains',
  [MenuTab.Sides]: 'menuTabSides',
  [MenuTab.Drinks]: 'menuTabDrinks',
};

/**
 * schema.org `Restaurant` with its menu.
 *
 * This is the concrete payoff of server rendering: a search engine can show
 * the rating, address and price range straight in its results instead of a
 * bare link.
 *
 * Optional fields are omitted rather than emitted empty — `aggregateRating`
 * with a zero review count is invalid structured data, and a broken block
 * costs more than a missing one.
 */
export function restaurantJsonLd(
  restaurant: RestaurantDetail,
  menu: MenuItem[],
  language: string,
): Record<string, unknown> {
  const { branch } = restaurant;

  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    url: `${SITE_URL}${restaurantPath(language, restaurant.slug)}`,
    ...(restaurant.coverUrl ? { image: restaurant.coverUrl } : {}),
    ...(restaurant.cuisine ? { servesCuisine: restaurant.cuisine } : {}),
    ...(branch.phone ? { telephone: branch.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(branch.address ? { streetAddress: branch.address } : {}),
      addressLocality: branch.city,
      addressCountry: 'AM',
    },
    ...(branch.lat !== null && branch.lng !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude: branch.lat, longitude: branch.lng } }
      : {}),
    ...(restaurant.reviewsCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: restaurant.rating,
            reviewCount: restaurant.reviewsCount,
          },
        }
      : {}),
    acceptsReservations: restaurant.reservationsEnabled,
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: TAB_ORDER.map((tab) => ({
        '@type': 'MenuSection',
        name: tab,
        hasMenuItem: menu
          .filter((item) => item.menuTab === tab)
          .map((item) => ({
            '@type': 'MenuItem',
            name: item.name,
            ...(item.desc ? { description: item.desc } : {}),
            offers: { '@type': 'Offer', price: item.priceAmd, priceCurrency: 'AMD' },
          })),
      })).filter((section) => section.hasMenuItem.length > 0),
    },
  };
}

export function groupByTab(items: MenuItem[]): Partial<Record<MenuTab, MenuItem[]>> {
  const grouped: Partial<Record<MenuTab, MenuItem[]>> = {};
  for (const item of items) {
    (grouped[item.menuTab] ??= []).push(item);
  }
  return grouped;
}
