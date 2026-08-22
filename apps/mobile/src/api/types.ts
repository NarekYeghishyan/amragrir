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
  Place,
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
  /** The branch — what the row describes, what a basket is opened against, and
   *  what the card's heart saves (DATABASE.md §13). */
  id: string;
  /** The business behind it, which owns the name, cuisine and rating. */
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
  /**
   * The dishes that matched an active category filter.
   *
   * Absent means no filter is on and the card wears its cover. Present means
   * the guest asked for sushi, and a photograph of the dining room does not
   * answer that. Empty means the filter is on and every match is sold out
   * tonight — the card is still true, and goes back to its cover.
   */
  dishes?: CardDish[];
}

/** A dish as a filtered card shows it: the picture, what it is, what it costs,
 *  and enough to open the menu at it. */
export interface CardDish {
  id: string;
  name: string;
  priceAmd: number;
  photoUrl: string | null;
  sectionId: string;
}

/**
 * A saved **branch**. Close to `RestaurantListItem` and for the same reason —
 * a favourite is one address, the same thing a card on the feed is, so the two
 * draw the same card.
 *
 * `branchId` is the key: it is what was hearted and what the row opens.
 * `restaurantId` and `slug` come along because the name, cuisine and rating
 * belong to the business, and `branchName`/`address` because two branches of
 * one chain are otherwise the same row printed twice.
 */
export interface FavoriteItem {
  branchId: string;
  restaurantId: string;
  slug: string;
  name: string;
  branchName: string | null;
  address: string | null;
  city: string;
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

/**
 * A saved **dish**.
 *
 * The other half of the Favourites screen, and a different subject from
 * `FavoriteItem`: hearting a plate saves the plate, not the room it is served
 * in. `menuItemId` is what was saved; `branchId` comes with it because a dish
 * belongs to one kitchen, and it is what the row opens — the menu at this dish
 * (`/restaurant/{branchId}?item={menuItemId}`).
 *
 * The name and price are the menu's, read fresh on every list rather than
 * copied when the heart was pressed, so a repriced dish shows today's price.
 */
export interface FavoriteDish {
  menuItemId: string;
  branchId: string;
  restaurantId: string;
  slug: string;
  name: string;
  desc: string;
  priceAmd: number;
  photoUrl: string | null;
  caloriesKcal: number | null;
  prepMin: number | null;
  isAvailable: boolean;
  sectionId: string;
  /** Whose kitchen, and where — what tells two branches of one chain apart. */
  restaurantName: string;
  branchName: string | null;
  address: string | null;
  city: string;
  isOpen: boolean;
  addedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
}

/**
 * What `GET /geocode` answers — see `apps/api/src/geocode/geocode.service.ts`.
 *
 * `failed` and an empty `items` are different answers: "this search is broken"
 * against "Yerevan has no such street". `available` is a third thing again —
 * a deployment with no geocoder key, where the picker draws no search box at
 * all rather than one that can never answer.
 */
export interface GeocodeAnswer {
  items: Place[];
  failed?: true;
  available: boolean;
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
  /**
   * Whether a table can be booked here right now — `reserve` declared **and**
   * bookings not paused. False makes dine-in a dead end, so the pre-order
   * screen draws no way into it rather than one that lands on "this restaurant
   * does not take bookings".
   *
   * Distinct from `eatInRequiresBooking`, which is the declaration alone and
   * stays true through a pause. It is on the quote — not read off the
   * availability call — because that call is only made for dine-in, and this
   * question has to be answered on a pickup render too.
   */
  reservationsEnabled: boolean;
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

/**
 * `GET /referrals/me`. The code is **created by that read**, so this is the
 * only place a real one comes from — nothing on the client can derive it.
 */
export interface ReferralSummary {
  code: string;
  /** Already assembled by the API, without a scheme. */
  link: string;
  invitedCount: number;
  discountEarnedPct: number;
  maxStackPct: number;
  /** The reward waiting to be used, if any. */
  coupon: { code: string; discountPct: number; validUntil: string | null } | null;
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
  /** Which of the branch's own headings it sits under. */
  sectionId: string;
  /** On the branch's Popular shelf. True *as well as* the section above — a
   *  bestseller does not stop being pizza. */
  isPopular: boolean;
  /** The **effective** category: the dish's own, or its section's, resolved by
   *  the API so no client has to know the inheritance rule. */
  categoryId: string | null;
}

/** One heading of a branch's menu, already in the reader's language. */
export interface MenuSection {
  id: string;
  name: string;
  categoryId: string | null;
}
