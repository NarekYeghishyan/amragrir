import {
  Language,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type PickupOption,
  type ReservationStatus,
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
 * The same API, addressed as a WebSocket.
 *
 * Derived from `API_URL` rather than configured separately, because a second
 * variable is a second thing to get wrong — and the one failure it produces is
 * a stream that silently never connects while every REST call keeps working.
 *
 * **Server-side only, like everything else here.** The browser never opens this
 * socket: it has no token to authenticate with (the session is httpOnly), which
 * is the whole reason `notifications/stream` exists to hold it on its behalf.
 */
export function apiWsUrl(path: string): string {
  return base().replace(/^http/, 'ws') + path;
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
    method?: 'GET' | 'POST' | 'DELETE';
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
  /** The business, where `id` is the branch. A heart saves the restaurant. */
  restaurantId: string;
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
    restaurantId: string;
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

/** `GET /me` — the account behind the profile page. */
export interface MeProfile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  language: string;
  isGuest: boolean;
  phoneVerified: boolean;
  rewardPoints: number;
  ordersCount: number;
  couponsCount: number;
}

/** `GET /favorites` — already shaped like a restaurant card. */
export interface FavoriteRestaurant {
  restaurantId: string;
  branchId: string | null;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  coverUrl: string | null;
  prepMin: number | null;
  isOpen: boolean;
  services: string[];
  addedAt: string;
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
  /** Where this pickup basket ends up, resolved by the API — take-away when the
   *  basket said nothing. Null on a dine-in basket. */
  pickupOption: PickupOption | null;
  /** The endings this restaurant offers. Fewer than two is not a choice, so the
   *  pre-order screen draws the buttons only when there are both — or when the
   *  field below says to draw the other one dead. */
  pickupOptions: PickupOption[];
  /** True where eating in exists but is reached by booking a table. The
   *  pre-order screen still draws "eat at the restaurant", dimmed, and pressing
   *  it switches the basket to dine-in rather than choosing an ending. */
  eatInRequiresBooking: boolean;
  /** Whether a table can be booked here right now — `reserve` declared **and**
   *  bookings not paused. False makes dine-in a dead end, so checkout draws no
   *  booking mode at all rather than one leading to "does not take bookings". */
  reservationsEnabled: boolean;
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

/**
 * A row of `GET /orders`, which is **not** an `Order`.
 *
 * The list is a summary: it counts the dishes rather than listing them, and it
 * carries neither the branch nor the payment. This app used to type the list as
 * `Order[]`, which compiled and then handed a page `undefined` the moment it
 * touched `items` — the fields the orders list happened to read were the ones
 * the two shapes share. Mirrors `API_DOCUMENTATION.md` § "List orders".
 */
export interface OrderSummary {
  id: string;
  code: string;
  restaurantName: string;
  coverUrl: string | null;
  /** When it was placed, ISO. The detail shape calls this `createdAt`. */
  date: string;
  /** Dishes, not lines — "3 items" means three things to eat. */
  itemsCount: number;
  totalAmd: number;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
  scheduled: boolean;
}

export interface Order {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  /** How this pickup order ends — null on a dine-in order, and on orders placed
   *  before the choice existed. */
  pickupOption: PickupOption | null;
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
  /** The largest party this branch accepts — its policy, not its furniture. */
  maxGuests: number;
  reservationsEnabled: boolean;
}

export interface Reservation {
  id: string;
  status: string;
  branch: { id: string; name: string | null; address: string | null };
  restaurantName: string;
  reservedFor: string;
  /** Yerevan's clock and calendar, formatted by the API — the restaurant's day,
   *  not the reader's, and the same instant `reservedFor` names. */
  localTime: string;
  localDate: string;
  guests: number;
  tableNo: string | null;
  depositAmd: number;
  depositStatus: string | null;
  /** True once the deposit has come off a bill rather than being held or kept. */
  depositCredited: boolean;
  /** While this is in the future, cancelling returns the deposit in full. */
  freeCancellationUntil: string | null;
  /** The order this table carries, when the booking was made with a basket.
   *  Null for a table booked on its own. */
  orderId: string | null;
  createdAt: string;
}

export interface BasketInput {
  branchId: string;
  serviceMode: ServiceMode;
  items: { menuItemId: string; qty: number }[];
  reservationId?: string;
  couponCode?: string;
}

/**
 * One line in the bell.
 *
 * `title` and `body` are null for everything the app can draw itself, which is
 * every `order` notification: the words come from this app's dictionary, so a
 * visitor reading in Russian sees Russian even for a notification raised while
 * they were reading Armenian. They are populated only where the server wrote
 * the prose — a promo, a system note — and there the API's copy is all there is.
 */
export interface NotificationItem {
  id: string;
  type: 'order' | 'reservation' | 'promo' | 'referral' | 'system';
  title: string | null;
  body: string | null;
  /**
   * What the row is about, structured — shaped by `type`.
   *
   * An `order` row carries `orderId`/`code` and an `OrderStatus`; a
   * `reservation` row carries `reservationId`, `reservedFor` and a
   * `ReservationStatus`. One optional-field shape rather than a discriminated
   * union: the bell reads three fields out of it, and a union would make every
   * read a narrowing exercise for no reader's benefit.
   */
  payload: {
    orderId?: string;
    code?: string;
    reservationId?: string;
    reservedFor?: string;
    /** Marks a booking row as a reminder rather than a move. Read *before*
     *  `status`, which a reminder leaves where it was. */
    reminder?: boolean;
    status?: OrderStatus | ReservationStatus;
  } | null;
  isRead: boolean;
  createdAt: string;
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

  /** Revokes the refresh token server-side. Dropping the cookie alone would
   *  leave a token that still works for anyone who had copied it. */
  logout: (refreshToken: string) => post<void>('/auth/logout', { refreshToken }),

  me: (token: string, language: Language) => authed<MeProfile>('/me', token, { language }),

  favorites: (token: string, language: Language) =>
    authed<{ items: FavoriteRestaurant[] }>('/favorites', token, { language }),

  /** Idempotent server-side, so a double-submitted heart adds one favourite. */
  addFavorite: (restaurantId: string, token: string, language: Language) =>
    authed<{ favorited: true }>('/favorites', token, {
      method: 'POST',
      body: { restaurantId },
      language,
    }),

  /** Also idempotent: removing one that is gone leaves the caller where they
   *  asked to be, and answers 204. */
  removeFavorite: (restaurantId: string, token: string, language: Language) =>
    authed<void>(`/favorites/${encodeURIComponent(restaurantId)}`, token, {
      method: 'DELETE',
      language,
    }),

  sendCode: (phone: string, language: Language) =>
    post<{ sent: true; expiresIn: number }>('/auth/send-code', { phone }, language),

  /** The caller's guest token goes along so the account they already have is
   *  upgraded — without it, everything collected while browsing is orphaned.
   *  `name` comes from the sign-up tab and is only used for an account that
   *  has none yet; see `AuthService.verifyCode`. */
  verifyCode: (phone: string, code: string, token: string, language: Language, name?: string) =>
    authed<AuthResult>('/auth/verify-code', token, {
      method: 'POST',
      body: { phone, code, ...(name ? { name } : {}) },
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
    authed<{ items: OrderSummary[]; total: number }>('/orders', token, {
      query: { status },
      language,
    }),

  cancelOrder: (id: string, token: string, language: Language) =>
    authed<Order>(`/orders/${encodeURIComponent(id)}/cancel`, token, {
      method: 'POST',
      language,
    }),

  /**
   * The bell. No `language` is passed and that is not an omission: an `order`
   * notification carries `{ orderId, code, status }` and no prose, so there is
   * nothing on it for the API to translate — the header renders it from the
   * same dictionary the tracking page uses. See API_DOCUMENTATION.md,
   * "Notifications".
   */
  notifications: (token: string) =>
    authed<{ items: NotificationItem[]; unread: number }>('/notifications', token),

  /** Clears the badge in one call — what opening the panel means. */
  readAllNotifications: (token: string) =>
    authed<{ read: number }>('/notifications/read-all', token, { method: 'POST' }),

  /** The cross on a line. A real delete — see DATABASE.md §12. */
  deleteNotification: (id: string, token: string) =>
    authed<void>(`/notifications/${encodeURIComponent(id)}`, token, { method: 'DELETE' }),

  /** Empties the bell, unread ones included. */
  clearNotifications: (token: string) =>
    authed<{ deleted: number }>('/notifications', token, { method: 'DELETE' }),

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

  /** The visitor's own bookings. `upcoming` is every active status, `past`
   *  every terminal one — the API decides which is which, so the screen cannot
   *  disagree with the panel about whether a booking is over. */
  reservations: (status: 'upcoming' | 'past', token: string, language: Language) =>
    authed<{ items: Reservation[]; total: number; page: number }>('/reservations', token, {
      query: { status },
      language,
    }),

  reservation: (id: string, token: string, language: Language) =>
    authed<Reservation>(`/reservations/${encodeURIComponent(id)}`, token, { language }),

  /** Whether the deposit comes back is the server's decision (`depositOutcomeFor`
   *  in `shared`), not this client's — the reply carries the settled booking. */
  cancelReservation: (id: string, token: string, language: Language) =>
    authed<Reservation>(`/reservations/${encodeURIComponent(id)}/cancel`, token, {
      method: 'POST',
      language,
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
  // `POST /auth/logout` answers 204 with no body at all, like the authed calls
  // above — asking for JSON there would throw on success.
  return (response.status === 204 ? undefined : await response.json()) as T;
}
