import {
  Language,
  type MenuTab,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceMode,
} from '@amragrir/shared';

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

/**
 * Fetches from the API **as somebody**, for the order flow.
 *
 * Separate from `get` above because these calls differ in every way that
 * matters: they carry a bearer token, they are never cached (a basket total or
 * an order status has no shared value to reuse), and the ones that move money
 * carry an `Idempotency-Key` so a double-submitted form cannot charge twice.
 *
 * The token is passed in rather than read here, so this module stays free of
 * `next/headers` and remains testable without a request context.
 */
async function authed<T>(
  path: string,
  token: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    language?: Language;
    query?: Record<string, string | number | undefined>;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const url = new URL(base() + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Accept-Language': options.language ?? Language.Hy,
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.idempotencyKey === undefined
        ? {}
        : { 'Idempotency-Key': options.idempotencyKey }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(response.status, await messageFrom(response, path));
  }

  // 204, and the API's logout in particular, answer with no body at all.
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/**
 * The API's own explanation of a refusal, when it gave one.
 *
 * Worth the trouble here and not for `get`: these failures are things a person
 * did — a wrong OTP, a slot taken while they were deciding, a basket that went
 * stale — and the screen has to say which. The message is still filtered
 * through an i18n key before it is shown; this is what picks the key.
 */
async function messageFrom(response: Response, path: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    if (message) {
      return message;
    }
  } catch {
    // Not JSON, or no body. Fall through to the generic form.
  }
  return `${path} responded ${response.status}`;
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

// ── order flow (mirrors orders.service.ts / reservations.service.ts) ────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: { id: string; phone: string | null; isGuest: boolean; phoneVerified: boolean };
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
  photoUrl?: string | null;
}

export interface Quote {
  branchId: string;
  restaurantName: string;
  serviceMode: ServiceMode;
  items: QuoteLine[];
  /** Lines the kitchen cannot serve. Reported rather than thrown, so the basket
   *  can mark the offending row instead of showing an error page. */
  unavailable: { menuItemId: string; reason: 'not_on_menu' | 'sold_out' }[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  discountAmd: number;
  totalAmd: number;
  coupon: { code: string; applied: boolean; discountAmd: number } | null;
  dueNowAmd: number;
  tableNo: string | null;
  prepMin: number;
  earliestReadyAt: string;
  branchIsOpen: boolean;
  canOrder: boolean;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  qty: number;
  unitPriceAmd: number;
  lineTotalAmd: number;
}

export interface Order {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  restaurantName: string;
  branch: { id: string; name: string | null; address: string | null };
  items: OrderItem[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  discountAmd: number;
  totalAmd: number;
  readyAt: string | null;
  secondsLeft: number | null;
  scheduled: boolean;
  tableNo: string | null;
  reservationId: string | null;
  notes: string | null;
  payment: { method: string; status: PaymentStatus } | null;
  createdAt: string;
}

export interface Slot {
  time: string;
  at: string;
  available: boolean;
}

export interface Availability {
  branchId: string;
  date: string;
  guests: number;
  slots: Slot[];
  depositAmd: number;
  maxSeats: number;
  reservationsEnabled: boolean;
}

export interface Reservation {
  id: string;
  status: string;
  branch: { id: string; name: string | null; address: string | null };
  reservedFor: string;
  guests: number;
  depositAmd: number;
  tableNo: string | null;
}

export interface BasketInput {
  branchId: string;
  serviceMode: ServiceMode;
  items: { menuItemId: string; qty: number }[];
  reservationId?: string;
  couponCode?: string;
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

  /** Table times. Public, so a visitor may look before signing in. */
  availability: (branchId: string, date: string, guests: number) =>
    get<Availability>(`/restaurants/${encodeURIComponent(branchId)}/availability`, {
      query: { date, guests },
      revalidate: false,
    }),

  paymentMethods: () => get<{ methods: PaymentMethod[]; default: PaymentMethod }>(
    '/payment-methods',
    { revalidate: 3600 },
  ),

  // ── as somebody ───────────────────────────────────────────────────────────

  guest: () => post<TokenPair>('/auth/guest'),

  refresh: (refreshToken: string) => post<TokenPair>('/auth/refresh', { refreshToken }),

  sendCode: (phone: string, language: Language) =>
    post<{ sent: true; expiresIn: number }>('/auth/send-code', { phone }, language),

  /** The caller's guest token goes along so the account they already have is
   *  upgraded — without it, everything collected while browsing is orphaned. */
  verifyCode: (phone: string, code: string, token: string, language: Language) =>
    authed<AuthResult>('/auth/verify-code', token, {
      method: 'POST',
      body: { phone, code },
      language,
    }),

  quote: (basket: BasketInput, token: string, language: Language) =>
    authed<Quote>('/cart/quote', token, { method: 'POST', body: basket, language }),

  createOrder: (
    body: BasketInput & { readyAt?: string; notes?: string },
    token: string,
    language: Language,
    idempotencyKey: string,
  ) => authed<Order>('/orders', token, { method: 'POST', body, language, idempotencyKey }),

  pay: (
    orderId: string,
    method: PaymentMethod,
    token: string,
    language: Language,
    idempotencyKey: string,
  ) =>
    authed<{ status: PaymentStatus }>('/payments', token, {
      method: 'POST',
      body: { orderId, method },
      language,
      idempotencyKey,
    }),

  order: (id: string, token: string, language: Language) =>
    authed<Order>(`/orders/${encodeURIComponent(id)}`, token, { language }),

  orders: (status: 'active' | 'past', token: string, language: Language) =>
    authed<{ items: Order[]; total: number }>('/orders', token, {
      query: { status },
      language,
    }),

  cancelOrder: (id: string, token: string, language: Language) =>
    authed<Order>(`/orders/${encodeURIComponent(id)}/cancel`, token, {
      method: 'POST',
      language,
    }),

  createReservation: (
    body: { branchId: string; reservedFor: string; guests: number },
    token: string,
    language: Language,
    idempotencyKey: string,
  ) => authed<Reservation>('/reservations', token, {
    method: 'POST',
    body,
    language,
    idempotencyKey,
  }),
};

/** The two auth calls that carry no bearer at all. */
async function post<T>(path: string, body?: unknown, language?: Language): Promise<T> {
  const response = await fetch(new URL(base() + path), {
    method: 'POST',
    headers: {
      'Accept-Language': language ?? Language.Hy,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new ApiError(response.status, await messageFrom(response, path));
  }
  return (await response.json()) as T;
}
