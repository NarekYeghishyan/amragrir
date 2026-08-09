import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Screens no crawler should fetch, named once per screen.
 *
 * `/search` is per-query and near-infinite; crawling it spends budget on pages
 * that duplicate the listings a crawler already has. The pages worth ranking
 * are the restaurants.
 *
 * The order flow is here for a different reason. Those pages already carry
 * `noindex`, but `noindex` is only read *after* a fetch, and these are pages a
 * crawler should not fetch at all: they do real work per request — pricing a
 * basket, reading an order — for a client that keeps no cookies and can never
 * have either.
 */
const PRIVATE = [
  'search',
  'cart',
  'preorder',
  'checkout',
  'orders',
  // A visitor's own bookings, for the same reason as the order flow: read per
  // request for a client that can never have one. Booking itself needs no entry
  // — it happens on `/checkout`, already listed above.
  'reservations',
  'profile',
  'favorites',
  'signin',
  'session',
  // Not a screen — the JSON the restaurant page's order panel reads. It prices
  // a basket per request, which is exactly what the paragraph above is about.
  'basket',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Two rules per screen, because a screen has two URL shapes: Armenian is
      // the unprefixed default (`/cart`) and the other languages are prefixed
      // (`/ru/cart`). Listing only one shape would leave the other crawlable.
      disallow: PRIVATE.flatMap((screen) => [`/${screen}`, `/*/${screen}`]),
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
