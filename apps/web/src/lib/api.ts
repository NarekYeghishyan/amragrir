import { Language, type MenuTab } from '@amragrir/shared';

/**
 * Where the API lives.
 *
 * Read at call time rather than module load so a server restart picks up a
 * changed value, and defaulted to the local API so `pnpm dev` works with no
 * setup. There is no `NEXT_PUBLIC_` variant on purpose: every fetch in this app
 * happens on the server (see below), so the browser never needs the address.
 */
function base(): string {
  return process.env.API_URL ?? 'http://localhost:3000/v1';
}

/**
 * How long a rendered page may be served before the data behind it is refetched.
 *
 * Short, because `isOpen` is on these pages: a restaurant that stopped taking
 * orders must not keep looking open for long. Everything else here (names,
 * prices, ratings) would tolerate hours.
 */
const REVALIDATE_SECONDS = 60;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Options {
  query?: Record<string, string | number | undefined>;
  language?: Language;
  /** Per-request override; search results are not worth caching. */
  revalidate?: number | false;
}

/**
 * Fetches from the API **on the server**.
 *
 * This is the whole point of using Next.js here: the HTML a crawler receives
 * already contains the restaurant's name, menu and prices. A client-side fetch
 * would ship an empty page and fill it in afterwards, which is exactly the
 * discovery traffic this app exists to serve.
 */
async function get<T>(path: string, options: Options = {}): Promise<T> {
  const url = new URL(base() + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { 'Accept-Language': options.language ?? Language.Hy },
    next:
      options.revalidate === false
        ? undefined
        : { revalidate: options.revalidate ?? REVALIDATE_SECONDS },
    cache: options.revalidate === false ? 'no-store' : undefined,
  });

  if (!response.ok) {
    // The message is for the server log, never for the page: a rendered error
    // must not leak the API's internals to a visitor.
    throw new ApiError(response.status, `${path} responded ${response.status}`);
  }

  return (await response.json()) as T;
}

/** Returns null on a 404 instead of throwing, so a page can render its own
 *  "not found" rather than a 500. */
async function getOrNull<T>(path: string, options: Options = {}): Promise<T | null> {
  try {
    return await get<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// ── shapes (mirror docs/API_DOCUMENTATION.md) ───────────────────────────────

export interface RestaurantListItem {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  distanceKm: number | null;
  prepMin: number | null;
  isOpen: boolean;
  services: string[];
  reservationsEnabled: boolean;
  coverUrl: string | null;
}

export interface RestaurantDetail {
  id: string;
  restaurantId: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  services: string[];
  reservationsEnabled: boolean;
  coverUrl: string | null;
  branch: {
    id: string;
    name: string | null;
    address: string | null;
    city: string;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    openHours: unknown;
    isOpen: boolean;
    prepMin: number | null;
  };
}

export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
  menuTab: MenuTab;
  categoryId: string | null;
}

export interface Category {
  id: string;
  key: string;
  icon: string | null;
  name: string;
}

export interface SearchResults {
  restaurants: {
    id: string;
    slug: string;
    name: string;
    cuisine: string | null;
    rating: number;
    reviewsCount: number;
    priceLevel: number | null;
    coverUrl: string | null;
    prepMin: number | null;
    isOpen: boolean;
    distanceKm: number | null;
  }[];
  dishes: {
    id: string;
    name: string;
    priceAmd: number;
    photoUrl: string | null;
    branchId: string;
    restaurantName: string;
    restaurantSlug: string;
  }[];
  query: string;
}

// ── endpoints ───────────────────────────────────────────────────────────────

export const api = {
  restaurants: (language: Language, query: Record<string, string | number | undefined> = {}) =>
    get<{ items: RestaurantListItem[]; total: number; page: number }>('/restaurants', {
      language,
      query,
    }),

  restaurant: (slugOrId: string, language: Language) =>
    getOrNull<RestaurantDetail>(`/restaurants/${encodeURIComponent(slugOrId)}`, { language }),

  menu: (slugOrId: string, language: Language) =>
    get<{ items: MenuItem[] }>(`/restaurants/${encodeURIComponent(slugOrId)}/menu`, { language }),

  categories: (language: Language) => get<{ items: Category[] }>('/categories', { language }),

  // Not cached: a search result page is per-visitor and stale results help
  // nobody.
  search: (q: string, language: Language) =>
    get<SearchResults>('/search', { language, query: { q }, revalidate: false }),

  popular: () => get<{ tags: string[] }>('/search/popular', { revalidate: 3600 }),
};
