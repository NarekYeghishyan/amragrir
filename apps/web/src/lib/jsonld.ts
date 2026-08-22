import { POPULAR_SECTION_ID } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import type { MenuItem, MenuSection, RestaurantDetail } from './api';
import { SITE_URL, restaurantPath } from './site';

/**
 * The strip above the menu: the branch's own headings, with its Popular shelf
 * in front of them when it has one.
 *
 * Popular is not a section and never was one — a dish is popular *as well as*
 * being pizza — so it is prepended here rather than stored as a row. It carries
 * a translated label; every real heading carries the name its restaurant gave
 * it, in the reader's language, resolved by the API.
 */
export interface MenuTabEntry {
  id: string;
  /** Already translated for a real section. For the Popular pill, a key the
   *  page resolves — the platform names that one, not the restaurant. */
  label: string | TranslationKey;
  /** True for the Popular pill, so the page knows to translate `label`. */
  translate: boolean;
}

/**
 * Which pills to draw, and in what order.
 *
 * A heading with nothing under it is left out: a pill that empties the page
 * when pressed is worse than a menu with one fewer division. That is a
 * rendering decision and not a data one — `GET /restaurants/:id/menu` returns
 * every section the branch has, because the panel needs the empty ones too.
 */
export function menuTabs(sections: MenuSection[], items: MenuItem[]): MenuTabEntry[] {
  const tabs: MenuTabEntry[] = [];

  if (items.some((item) => item.isPopular)) {
    tabs.push({ id: POPULAR_SECTION_ID, label: 'menuTabPopular', translate: true });
  }

  for (const section of sections) {
    if (items.some((item) => item.sectionId === section.id)) {
      tabs.push({ id: section.id, label: section.name, translate: false });
    }
  }

  return tabs;
}

/** The dishes under one pill. Popular draws from the whole menu, which is what
 *  makes it a showcase rather than a division of it. */
export function itemsUnder(tabId: string, items: MenuItem[]): MenuItem[] {
  return tabId === POPULAR_SECTION_ID
    ? items.filter((item) => item.isPopular)
    : items.filter((item) => item.sectionId === tabId);
}

/** Which pill a dish should open under, for a deep link that names one.
 *  Its section, never Popular: a link is to a place on the menu, and the
 *  showcase is not one. */
export function tabOfItem(itemId: string, items: MenuItem[]): string | null {
  return items.find((item) => item.id === itemId)?.sectionId ?? null;
}

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
  sections: MenuSection[],
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
      // The branch's real headings, under the names it gave them — which is
      // strictly better structured data than the four fixed English words this
      // used to emit for every restaurant on the platform. Popular is left out
      // on purpose: it would repeat dishes that are already in their sections,
      // and a menu listing the same dish twice is a menu a crawler mistrusts.
      hasMenuSection: sections
        .map((section) => ({
          '@type': 'MenuSection',
          name: section.name,
          hasMenuItem: menu
            .filter((item) => item.sectionId === section.id)
            .map((item) => ({
              '@type': 'MenuItem',
              name: item.name,
              ...(item.desc ? { description: item.desc } : {}),
              offers: { '@type': 'Offer', price: item.priceAmd, priceCurrency: 'AMD' },
            })),
        }))
        .filter((section) => section.hasMenuItem.length > 0),
    },
  };
}
