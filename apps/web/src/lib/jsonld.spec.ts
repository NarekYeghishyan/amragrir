import { describe, expect, it } from 'vitest';
import { MenuTab } from '@amragrir/shared';
import { groupByTab, restaurantJsonLd } from './jsonld';
import type { MenuItem, RestaurantDetail } from './api';

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
  menuTab: MenuTab.Mains,
  categoryId: null,
  ...over,
});

describe('restaurantJsonLd', () => {
  it('describes the restaurant with an absolute, language-specific url', () => {
    const data = restaurantJsonLd(restaurant(), [dish()], 'ru');

    expect(data['@type']).toBe('Restaurant');
    expect(data.name).toBe('Sunny Table');
    // Relative URLs are invalid in structured data.
    expect(data.url).toBe('https://amragrir.am/ru/r/sunny-table');
  });

  it('carries the rating a search result can display', () => {
    const data = restaurantJsonLd(restaurant(), [dish()], 'hy');
    expect(data.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 1200,
    });
  });

  it('omits the rating entirely when nobody has reviewed it', () => {
    // A rating with a zero review count is invalid structured data, and a
    // broken block is worse than a missing one.
    const data = restaurantJsonLd(restaurant({ reviewsCount: 0, rating: 0 }), [dish()], 'hy');
    expect(data).not.toHaveProperty('aggregateRating');
  });

  it('omits geo when the branch has no coordinates', () => {
    const branch = { ...restaurant().branch, lat: null, lng: null };
    const data = restaurantJsonLd(restaurant({ branch }), [dish()], 'hy');
    expect(data).not.toHaveProperty('geo');
  });

  it('prices every dish in dram', () => {
    const data = restaurantJsonLd(restaurant(), [dish(), dish({ id: 'd2', priceAmd: 5800 })], 'hy');
    const menu = data.hasMenu as { hasMenuSection: { hasMenuItem: { offers: unknown }[] }[] };

    expect(menu.hasMenuSection[0]?.hasMenuItem[0]?.offers).toEqual({
      '@type': 'Offer',
      price: 4200,
      priceCurrency: 'AMD',
    });
  });

  it('drops empty menu sections rather than emitting hollow ones', () => {
    const data = restaurantJsonLd(restaurant(), [dish({ menuTab: MenuTab.Mains })], 'hy');
    const menu = data.hasMenu as { hasMenuSection: { name: string }[] };

    expect(menu.hasMenuSection.map((section) => section.name)).toEqual([MenuTab.Mains]);
  });

  it('is serialisable — it goes into the page as JSON', () => {
    expect(() => JSON.stringify(restaurantJsonLd(restaurant(), [dish()], 'en'))).not.toThrow();
  });
});

describe('groupByTab', () => {
  it('keeps dishes in the tab they belong to', () => {
    const grouped = groupByTab([
      dish({ id: '1', menuTab: MenuTab.Mains }),
      dish({ id: '2', menuTab: MenuTab.Drinks }),
      dish({ id: '3', menuTab: MenuTab.Mains }),
    ]);

    expect(grouped[MenuTab.Mains]).toHaveLength(2);
    expect(grouped[MenuTab.Drinks]).toHaveLength(1);
    expect(grouped[MenuTab.Sides]).toBeUndefined();
  });
});
