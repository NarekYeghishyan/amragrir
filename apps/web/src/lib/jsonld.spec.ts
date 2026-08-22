import { describe, expect, it } from 'vitest';
import { POPULAR_SECTION_ID } from '@amragrir/shared';
import { itemsUnder, menuTabs, restaurantJsonLd, tabOfItem } from './jsonld';
import type { MenuItem, MenuSection, RestaurantDetail } from './api';

const restaurant = (over: Partial<RestaurantDetail> = {}): RestaurantDetail => ({
  id: 'branch-1',
  restaurantId: 'rest-1',
  slug: 'sunny-table',
  name: 'Sunny Table',
  cuisine: 'Mediterranean',
  priceLevel: 2,
  rating: 4.8,
  reviewsCount: 1200,
  services: ['pickup', 'dinein'],
  reservationsEnabled: true,
  coverUrl: null,
  branch: {
    id: 'branch-1',
    name: 'Northern Ave',
    address: 'Northern Ave 5',
    city: 'Yerevan',
    lat: 40.1811,
    lng: 44.5136,
    phone: '+37410000000',
    openHours: null,
    isOpen: true,
    prepMin: 12,
  },
  ...over,
});

const dish = (over: Partial<MenuItem> = {}): MenuItem => ({
  id: 'dish-1',
  name: 'Quinoa Bowl',
  desc: 'With roasted vegetables',
  priceAmd: 4200,
  caloriesKcal: 520,
  prepMin: 12,
  photoUrl: null,
  dietaryTags: ['vegetarian'],
  isAvailable: true,
  sectionId: 'sec-mains',
  isPopular: false,
  categoryId: null,
  ...over,
});

const section = (over: Partial<MenuSection> = {}): MenuSection => ({
  id: 'sec-mains',
  name: 'Основные',
  categoryId: null,
  ...over,
});

const SECTIONS = [section()];

describe('restaurantJsonLd', () => {
  it('describes the restaurant with an absolute, language-specific url', () => {
    const data = restaurantJsonLd(restaurant(), SECTIONS, [dish()], 'ru');

    expect(data['@type']).toBe('Restaurant');
    expect(data.name).toBe('Sunny Table');
    // Relative URLs are invalid in structured data.
    expect(data.url).toBe('https://amragrir.am/ru/r/sunny-table');
  });

  it('carries the rating a search result can display', () => {
    const data = restaurantJsonLd(restaurant(), SECTIONS, [dish()], 'hy');
    expect(data.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 1200,
    });
  });

  it('omits the rating entirely when nobody has reviewed it', () => {
    // A rating with a zero review count is invalid structured data, and a
    // broken block is worse than a missing one.
    const data = restaurantJsonLd(restaurant({ reviewsCount: 0, rating: 0 }), SECTIONS, [dish()], 'hy');
    expect(data).not.toHaveProperty('aggregateRating');
  });

  it('omits geo when the branch has no coordinates', () => {
    const branch = { ...restaurant().branch, lat: null, lng: null };
    const data = restaurantJsonLd(restaurant({ branch }), SECTIONS, [dish()], 'hy');
    expect(data).not.toHaveProperty('geo');
  });

  it('prices every dish in dram', () => {
    const data = restaurantJsonLd(restaurant(), SECTIONS, [dish(), dish({ id: 'd2', priceAmd: 5800 })], 'hy');
    const menu = data.hasMenu as { hasMenuSection: { hasMenuItem: { offers: unknown }[] }[] };

    expect(menu.hasMenuSection[0]?.hasMenuItem[0]?.offers).toEqual({
      '@type': 'Offer',
      price: 4200,
      priceCurrency: 'AMD',
    });
  });

  it('drops empty menu sections rather than emitting hollow ones', () => {
    // The branch's headings under the names it gave them — strictly better
    // structured data than the four fixed English words this used to emit for
    // every restaurant on the platform.
    const data = restaurantJsonLd(
      restaurant(),
      [section(), section({ id: 'sec-drinks', name: 'Напитки' })],
      [dish()],
      'hy',
    );
    const menu = data.hasMenu as { hasMenuSection: { name: string }[] };

    expect(menu.hasMenuSection.map((entry) => entry.name)).toEqual(['Основные']);
  });

  it('is serialisable — it goes into the page as JSON', () => {
    expect(() => JSON.stringify(restaurantJsonLd(restaurant(), SECTIONS, [dish()], 'en'))).not.toThrow();
  });
});

describe('menuTabs', () => {
  const drinks = section({ id: 'sec-drinks', name: 'Напитки' });

  it('draws the branch headings it has, in its own order', () => {
    const tabs = menuTabs(
      [section(), drinks],
      [dish({ id: '1' }), dish({ id: '2', sectionId: 'sec-drinks' })],
    );

    expect(tabs.map((tab) => tab.label)).toEqual(['Основные', 'Напитки']);
  });

  it('leaves out a heading with nothing under it', () => {
    // A pill that empties the page when pressed is worse than a menu with one
    // fewer division. The API still returns the empty section — the panel needs
    // it — so this is a rendering decision, made here.
    const tabs = menuTabs([section(), drinks], [dish()]);

    expect(tabs.map((tab) => tab.id)).toEqual(['sec-mains']);
  });

  it('puts Popular first, and only when something is on it', () => {
    expect(menuTabs([section()], [dish()]).map((tab) => tab.id)).toEqual(['sec-mains']);

    const withHit = menuTabs([section()], [dish({ isPopular: true })]);
    expect(withHit.map((tab) => tab.id)).toEqual([POPULAR_SECTION_ID, 'sec-mains']);
    // Translated by the page, since the platform names this one rather than
    // the restaurant.
    expect(withHit[0]?.translate).toBe(true);
  });
});

describe('itemsUnder', () => {
  it('shows a bestseller under Popular *and* under its own heading', () => {
    // The old four-tab enum made a dish choose: a Margherita in the Popular tab
    // was not in any other, so it vanished from the pizza section of the very
    // restaurant that is known for it.
    const hit = dish({ id: 'hit', isPopular: true });
    const items = [hit, dish({ id: 'plain' })];

    expect(itemsUnder(POPULAR_SECTION_ID, items).map((item) => item.id)).toEqual(['hit']);
    expect(itemsUnder('sec-mains', items).map((item) => item.id)).toEqual(['hit', 'plain']);
  });
});

describe('tabOfItem', () => {
  it('opens a linked dish on its section, never on Popular', () => {
    // A link is to a place on the menu; the showcase is not one, and landing
    // there would leave the dish's real heading unopened underneath.
    const items = [dish({ id: 'hit', isPopular: true, sectionId: 'sec-drinks' })];

    expect(tabOfItem('hit', items)).toBe('sec-drinks');
  });

  it('answers null for a dish this menu does not have', () => {
    expect(tabOfItem('gone', [dish()])).toBeNull();
  });
});
