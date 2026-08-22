/**
 * Response shapes from the API. Statuses, roles and business constants come
 * from `@amragrir/shared`; these interfaces describe only the transport shape
 * of each endpoint (API_DOCUMENTATION.md).
 */
import type {
  Language,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PickupOption,
  ReservationStatus,
  Role,
  ServiceMode,
} from '@amragrir/shared';

export interface AuthUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  language: Language;
  role: Role;
  isGuest: boolean;
  phoneVerified: boolean;
}

/**
 * `GET /me` — the account, plus the three counters the profile screen shows and
 * the three settings it toggles.
 *
 * Separate from `AuthUser`, which is what a token resolves to: those fields
 * arrive with a sign-in and are held in the session, while these are read from
 * the server when a screen wants them. A counter cached in a token would be
 * wrong by the next order.
 */
export interface MeProfile extends AuthUser {
  rewardPoints: number;
  ordersCount: number;
  couponsCount: number;
  darkMode: boolean;
  notifPush: boolean;
  notifPromo: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user: AuthUser;
}

export interface GuestResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface SendCodeResult {
  sent: true;
  expiresIn: number;
}

export interface Category {
  id: string;
  key: string;
  icon: string | null;
  name: string;
}

export interface RestaurantListItem {
  /** The branch — what the row describes, and what a basket is opened against. */
  id: string;
  /** The business behind it. A favourite is stored against the restaurant, so
   *  this is what the card's heart sends to `POST /favorites`. */
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

/**
 * A saved restaurant. Close to `RestaurantListItem` but not the same shape —
 * a favourite is stored against the *restaurant*, so the branch fields are
 * whichever branch answers for it and `branchId` can be null when a restaurant
 * has none yet.
 */
export interface FavoriteItem {
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

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
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
    isOpen: boolean;
    prepMin: number | null;
  };
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
}

/** Every total on this object was computed by the server — the client only
 *  formats them (DEVELOPMENT_GUIDE.md: never trust the client with money). */
export interface Quote {
  branchId: string;
  restaurantName: string;
  /** Pickup or dine-in, as the basket asked for it. */
  serviceMode: ServiceMode;
  /** Where this basket ends up, as the server resolved it — take-away when
   *  nothing was chosen. Null for dine-in, which has a table instead. */
  pickupOption: PickupOption | null;
  /** The endings this restaurant offers. Fewer than two is not a choice, so the
   *  pre-order screen draws the buttons only when there are both — or when the
   *  field below says to draw the other one dead. */
  pickupOptions: PickupOption[];
  /** True where eating in exists but is reached by booking a table. The
   *  pre-order screen still draws "eat at the restaurant", dimmed, and tapping
   *  it switches the basket to dine-in rather than choosing an ending. */
  eatInRequiresBooking: boolean;
  items: QuoteLine[];
  unavailable: { menuItemId: string; reason: 'not_on_menu' | 'sold_out' }[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  discountAmd: number;
  coupon: { code: string; applied: boolean; discountAmd: number } | null;
  totalAmd: number;
  /**
   * What is left to pay once a table deposit is credited; equal to `totalAmd`
   * for a pickup basket.
   *
   * This is the figure on the checkout button. Showing `totalAmd` there would
   * charge a diner for a deposit they have already paid.
   */
  dueNowAmd: number;
  /** The booked table, on a dine-in basket. */
  tableNo: string | null;
  prepMin: number;
  earliestReadyAt: string;
  branchIsOpen: boolean;
  canOrder: boolean;
}

/** One offered booking time. `available` is false for a table already taken
 *  and for a slot that has simply passed. */
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
  /** Held now and credited against the bill; the server sizes it by party. */
  depositAmd: number;
  /** Largest party any single table at this branch seats — the guest picker
   *  stops here rather than offering a size no table can take. */
  maxSeats: number;
  /** The largest party this branch accepts. Separate from `maxSeats`, which is
   *  what the furniture allows: a branch may cap parties below what it could
   *  physically seat, and the two want different words in front of a guest. */
  maxGuests: number;
  reservationsEnabled: boolean;
}

export interface Reservation {
  id: string;
  status: ReservationStatus;
  branch: { id: string; name: string | null; address: string | null };
  restaurantName: string;
  reservedFor: string;
  localTime: string;
  localDate: string;
  guests: number;
  tableNo: string | null;
  depositAmd: number;
  depositStatus: PaymentStatus | null;
  depositCredited: boolean;
  /** Set while cancelling still returns the deposit. */
  freeCancellationUntil: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
}

export interface Order {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  /** How this pickup order ends — null on a dine-in order. */
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
  /** True when the customer chose a time rather than taking the earliest — the
   *  tracking screen counts down to a promise instead of showing a timer that
   *  has not started. */
  scheduled: boolean;
  /** When the kitchen starts. Shown to staff, not to the diner. */
  prepStartAt: string | null;
  tableNo: string | null;
  reservationId: string | null;
  notes: string | null;
  payment: { method: string; status: string } | null;
  createdAt: string;
}

export interface OrderListItem {
  id: string;
  code: string;
  restaurantName: string;
  coverUrl: string | null;
  date: string;
  itemsCount: number;
  totalAmd: number;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
  /** So the list can read "for Tue 13:00" instead of a countdown that would
   *  otherwise say "ready in 4,320 minutes". */
  scheduled: boolean;
}

export interface PaymentResult {
  id: string;
  status: string;
  amountAmd: number;
  method: PaymentMethod;
  orderStatus: OrderStatus;
}

/** What the order stream pushes (API_DOCUMENTATION.md "Realtime status"). */
export interface OrderStatusUpdate {
  orderId: string;
  code: string;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
}

/**
 * One line in the bell.
 *
 * `title` and `body` are null for everything the app can draw itself, which is
 * every `order` notification: the words come from this app's dictionary, so a
 * reader who switches language in Settings sees the whole bell change with it.
 * They are populated only where the server wrote the prose — a promo, a system
 * note — and there the API's copy is all there is.
 */
export interface NotificationItem {
  id: string;
  type: 'order' | 'reservation' | 'promo' | 'referral' | 'system';
  title: string | null;
  body: string | null;
  /**
   * What the row is about, shaped by `type`. An `order` row carries
   * `orderId`/`code` and an `OrderStatus`; a `reservation` row carries
   * `reservationId`, `reservedFor` and a `ReservationStatus`.
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

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
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
  menuTab: string;
  categoryId: string | null;
}
