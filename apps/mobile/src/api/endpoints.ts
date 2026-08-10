import type {
  DietaryTag,
  PaymentMethod,
  PickupOption,
  RestaurantService,
  RestaurantSort,
  ServiceMode,
} from '@amragrir/shared';
import { request } from './client';
import type {
  AuthResult,
  MeProfile,
  Availability,
  Category,
  FavoriteItem,
  GuestResult,
  MenuItem,
  NotificationList,
  Order,
  OrderListItem,
  Paged,
  PaymentResult,
  Quote,
  Reservation,
  RestaurantDetail,
  RestaurantListItem,
  SendCodeResult,
} from './types';

/** Typed calls, one per endpoint. Screens never build URLs themselves. */

export const auth = {
  sendCode: (phone: string) =>
    request<SendCodeResult>('/auth/send-code', {
      method: 'POST',
      body: { phone },
      authenticated: false,
    }),

  /** Sends the current bearer when there is one, so a guest is upgraded in
   *  place rather than getting a second account (API_DOCUMENTATION.md). */
  verifyCode: (phone: string, code: string, name?: string) =>
    request<AuthResult>('/auth/verify-code', {
      method: 'POST',
      body: { phone, code, ...(name ? { name } : {}) },
    }),

  guest: () => request<GuestResult>('/auth/guest', { method: 'POST', authenticated: false }),
};

/**
 * The signed-in account, as the server holds it.
 *
 * Read rather than taken from the session: `AuthUser` is what a token resolves
 * to and is fixed for that token's life, while the counters below move with
 * every order somebody places. The profile screen showed none of them for a
 * year on the grounds that "no endpoint reports them" — this endpoint has
 * reported all three since the profile screen was written, and the web has been
 * drawing them the whole time.
 */
export const me = {
  get: () => request<MeProfile>('/me'),

  /** Settings that belong to the account rather than to the device. The dark
   *  theme is both — see `useTheme`, which keeps a local copy so the first
   *  frame is not the wrong colour while this is in flight. */
  settings: (settings: { notifPush?: boolean; notifPromo?: boolean; darkMode?: boolean }) =>
    request<MeProfile>('/me/settings', { method: 'PATCH', body: settings }),
};

/**
 * Mirrors `ListRestaurantsDto` (apps/api/src/catalog/dto.ts).
 *
 * Every filter the design's sheet draws is here because the API already
 * implements all of them — this type had fallen behind it, not the other way
 * round, and a filter missing here is one the sheet cannot honestly offer.
 */
export interface RestaurantQuery {
  lat?: number;
  lng?: number;
  sort?: RestaurantSort;
  distMax?: number;
  minRating?: number;
  /** Only branches serving right now. */
  openNow?: boolean;
  dietary?: DietaryTag[];
  service?: RestaurantService[];
  /** Price per person, AMD. */
  priceMin?: number;
  priceMax?: number;
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export const catalog = {
  categories: (language?: string) =>
    request<{ items: Category[] }>('/categories', { authenticated: false, language }),

  restaurants: (query: RestaurantQuery = {}, language?: string) =>
    request<Paged<RestaurantListItem>>('/restaurants', {
      query: query as Record<string, string | number | boolean | string[] | undefined>,
      authenticated: false,
      language,
    }),

  restaurant: (idOrSlug: string, language?: string) =>
    request<RestaurantDetail>(`/restaurants/${idOrSlug}`, { authenticated: false, language }),

  menu: (idOrSlug: string, menuTab?: string, language?: string) =>
    request<{ items: MenuItem[] }>(`/restaurants/${idOrSlug}/menu`, {
      query: { menuTab },
      authenticated: false,
      language,
    }),
};

export interface BasketPayload {
  branchId: string;
  serviceMode: ServiceMode;
  /** Where the order ends up. Absent means take-away — see `CartState`. Only
   *  meaningful for pickup; the API refuses it on a dine-in basket. */
  pickupOption?: PickupOption;
  items: { menuItemId: string; qty: number }[];
  /** Required for dine-in and refused otherwise: food brought to a table needs
   *  a table, and that means a booking. */
  reservationId?: string;
}

export const cart = {
  /** Prices the basket. The client never adds up a total itself. */
  quote: (basket: BasketPayload, language?: string) =>
    request<Quote>('/cart/quote', { method: 'POST', body: basket, language }),
};

export const orders = {
  /** `idempotencyKey` must be the same across retries of one checkout
   *  attempt, or a dropped connection becomes a second order. */
  create: (
    basket: BasketPayload & { readyAt?: string; notes?: string },
    idempotencyKey: string,
    language?: string,
  ) => request<Order>('/orders', { method: 'POST', body: basket, idempotencyKey, language }),

  list: (status?: 'active' | 'past') =>
    request<Paged<OrderListItem>>('/orders', { query: { status } }),

  get: (id: string) => request<Order>(`/orders/${id}`),

  cancel: (id: string) => request<Order>(`/orders/${id}/cancel`, { method: 'POST' }),
};

export const notifications = {
  /**
   * The bell. No `language` is sent and that is not an omission: an `order`
   * notification carries `{ orderId, code, status }` and no prose, so there is
   * nothing on it for the API to translate — the screen renders it from the
   * same dictionary the tracking screen uses (API_DOCUMENTATION.md,
   * "Notifications").
   */
  list: () => request<NotificationList>('/notifications'),

  /** Clears the badge in one call — what opening the screen means. */
  readAll: () => request<{ read: number }>('/notifications/read-all', { method: 'POST' }),

  /** The cross on a row. A real delete — see DATABASE.md §12. */
  remove: (id: string) => request<void>(`/notifications/${id}`, { method: 'DELETE' }),

  /** Empties the bell, unread ones included. */
  clear: () => request<{ deleted: number }>('/notifications', { method: 'DELETE' }),
};

export const reservations = {
  /**
   * Free times on a date, for a party of this size.
   *
   * Public, like the rest of the catalog — a guest may look at a calendar
   * before deciding to sign in. Availability is answered *per party size*: the
   * guest count is not a filter applied afterwards, it is what makes "19:00 is
   * free" mean anything.
   *
   * Takes a slug, a restaurant id or a branch id, exactly as `/restaurants/:id`
   * does.
   */
  availability: (idOrSlug: string, date: string, guests: number, language?: string) =>
    request<Availability>(`/restaurants/${idOrSlug}/availability`, {
      query: { date, guests },
      authenticated: false,
      language,
    }),

  /**
   * Books a table and holds the deposit.
   *
   * The table is chosen by the server, not named here — assignment is what
   * makes a booking exclusive. `idempotencyKey` must survive a retry of the
   * same tap, or a flaky connection books two tables.
   */
  create: (
    booking: { branchId: string; reservedFor: string; guests: number; notes?: string },
    idempotencyKey: string,
    language?: string,
  ) => request<Reservation>('/reservations', { method: 'POST', body: booking, idempotencyKey, language }),

  list: (status?: 'upcoming' | 'past') =>
    request<Paged<Reservation>>('/reservations', { query: { status } }),

  get: (id: string) => request<Reservation>(`/reservations/${id}`),

  cancel: (id: string) => request<Reservation>(`/reservations/${id}/cancel`, { method: 'POST' }),
};

export const favorites = {
  list: () => request<{ items: FavoriteItem[] }>('/favorites'),

  /** Idempotent server-side — favouriting twice is what a double tap does. */
  add: (restaurantId: string) =>
    request<{ favorited: true }>('/favorites', { method: 'POST', body: { restaurantId } }),

  remove: (restaurantId: string) =>
    request<void>(`/favorites/${restaurantId}`, { method: 'DELETE' }),
};

export const payments = {
  methods: () =>
    request<{ methods: PaymentMethod[]; default: PaymentMethod }>('/payment-methods', {
      authenticated: false,
    }),

  pay: (orderId: string, method: PaymentMethod, idempotencyKey: string, token?: string) =>
    request<PaymentResult>('/payments', {
      method: 'POST',
      body: { orderId, method, ...(token ? { token } : {}) },
      idempotencyKey,
    }),
};
