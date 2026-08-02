import { CustomerOrderFilter, QueueFilter } from '@amragrir/shared';
import type {
  AuditAction,
  MenuTab,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Permission,
  ServiceMode,
  StaffRole,
} from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import { currentLanguage, type Translate, type TranslateParams } from './language';

const BASE = __API_URL__;

const ACCESS_KEY = 'amragrir.admin.access';
const REFRESH_KEY = 'amragrir.admin.refresh';

/** Where a super admin's own session waits while they are acting as somebody
 *  else. See `acting` below. */
const OWN_ACCESS_KEY = 'amragrir.admin.own.access';
const OWN_REFRESH_KEY = 'amragrir.admin.own.refresh';
const ACTING_KEY = 'amragrir.admin.acting';

/**
 * Tokens are kept in `localStorage`.
 *
 * The honest trade-off: this is reachable by any script that ends up on the
 * page, where an httpOnly cookie would not be. It is accepted here because
 * this is an internal tool with no third-party embeds, and because the
 * alternative needs cookie auth on the API. **Revisit before this is exposed
 * beyond the restaurant's own network** — noted in the README too.
 *
 * Persisting at all is not optional: access tokens last 15 minutes and a
 * kitchen panel stays open all shift, so a panel that forgot its session on
 * every refresh would be unusable.
 */
export const tokens = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    // Including the stashed session behind an impersonation. Leaving those
    // would let the next person to sign in on this machine inherit a banner —
    // and a "return to my account" button pointing at somebody else's tokens.
    localStorage.removeItem(OWN_ACCESS_KEY);
    localStorage.removeItem(OWN_REFRESH_KEY);
    localStorage.removeItem(ACTING_KEY);
  },
};

/** Who a super admin is currently acting as. */
export interface ActingAs {
  id: string;
  name: string;
  email: string;
}

/**
 * Being somebody else, and getting back.
 *
 * The super admin's own pair is stashed rather than discarded, which is what
 * makes returning free: their refresh token was never revoked, so putting it
 * back is a `localStorage` write and not a second sign-in. There is no "stop
 * impersonating" endpoint for the same reason.
 *
 * The impersonation itself is stored as an access token **with no refresh
 * token** — the API issues none (see `ImpersonationService`), so the session
 * cannot be extended and expires by itself after one access TTL.
 */
export const acting = {
  current(): ActingAs | null {
    const raw = localStorage.getItem(ACTING_KEY);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as ActingAs;
    } catch {
      // Somebody edited it, or a previous version wrote a different shape.
      // Being unable to name who you are acting as is reason enough not to be.
      localStorage.removeItem(ACTING_KEY);
      return null;
    }
  },

  begin(accessToken: string, who: ActingAs): void {
    localStorage.setItem(OWN_ACCESS_KEY, tokens.access ?? '');
    localStorage.setItem(OWN_REFRESH_KEY, tokens.refresh ?? '');
    localStorage.setItem(ACCESS_KEY, accessToken);
    // Not merely unused — absent. `refreshSession` reads this to tell an
    // impersonated session from an ordinary one.
    localStorage.removeItem(REFRESH_KEY);
    localStorage.setItem(ACTING_KEY, JSON.stringify(who));
  },

  end(): void {
    const access = localStorage.getItem(OWN_ACCESS_KEY);
    const refresh = localStorage.getItem(OWN_REFRESH_KEY);
    localStorage.removeItem(OWN_ACCESS_KEY);
    localStorage.removeItem(OWN_REFRESH_KEY);
    localStorage.removeItem(ACTING_KEY);

    if (access && refresh) {
      tokens.set(access, refresh);
      return;
    }
    // Nothing to go back to. Signing out is the honest answer — the alternative
    // is a panel holding an impersonation token it can no longer explain.
    tokens.clear();
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /**
     * Set only when the panel invented this failure rather than reading it off
     * a response — a dead network, or a body with no error envelope. Those two
     * are the panel's own words and so are the panel's to translate; anything
     * the API said arrives already in the language `Accept-Language` asked for,
     * and is shown as sent.
     */
    readonly messageKey?: AdminTranslationKey,
    readonly messageParams?: TranslateParams,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * What to show when a call fails: the API's own message, the panel's word for
 * the failures it invents, or the caller's fallback for anything else.
 */
export function errorText(
  t: Translate,
  error: unknown,
  fallback: AdminTranslationKey,
): string {
  if (error instanceof ApiError) {
    return error.messageKey === undefined
      ? error.message
      : t(error.messageKey, error.messageParams);
  }
  return t(fallback);
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * A file sent as the raw request body, under its own type — what the upload
   * endpoints take instead of JSON.
   *
   * Not multipart: one request carries exactly one image, so the envelope would
   * be packaging with nothing to package. Wins the `Content-Type` from `body`
   * when both are somehow set, because bytes cannot be JSON-encoded.
   */
  file?: Blob;
  query?: Record<string, string | undefined>;
  authenticated?: boolean;
}

/**
 * One refresh at a time.
 *
 * Refresh tokens are single-use and rotated (API_DOCUMENTATION.md), so two
 * requests expiring together would each try to spend the same token and the
 * loser would be logged out. Everyone waits on the same promise instead.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // An impersonated session has no refresh token by design: it lasts one access
  // TTL and is then over. Put the super admin's own session back rather than
  // signing anyone out — and reload, because every screen on the page was
  // rendered against somebody else's permissions and is now holding rows this
  // account may have no business seeing.
  if (acting.current() !== null) {
    acting.end();
    window.location.reload();
    // Never settles, and deliberately. `reload()` does not stop this script —
    // resolving either way would let the caller's own 401 handling run first,
    // and `Panel.load` reads a 401 as "sign out", which would clear the very
    // session just put back. The page is being replaced; nothing downstream of
    // here should run again.
    return new Promise<boolean>(() => {});
  }

  refreshing ??= (async () => {
    const token = tokens.refresh;
    if (!token) {
      return false;
    }
    try {
      const res = await fetch(`${BASE}/auth/staff/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) {
        tokens.clear();
        return false;
      }
      const pair = (await res.json()) as { accessToken: string; refreshToken: string };
      tokens.set(pair.accessToken, pair.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

async function send<T>(path: string, options: Options, retry: boolean): Promise<T> {
  const { method = 'GET', body, file, query, authenticated = true } = options;

  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  // The API resolves error messages and `*_i18n` columns from this header
  // (apps/api/src/common/i18n.ts). Those strings are shown to staff verbatim,
  // so a panel set to Russian has to ask for Russian.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': currentLanguage(),
  };
  if (file !== undefined) {
    // What the file says it is. The API sniffs the bytes anyway and stores by
    // what it finds, so this is a hint rather than a claim it acts on.
    headers['Content-Type'] = file.type;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (authenticated && tokens.access) {
    headers.Authorization = `Bearer ${tokens.access}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      // A Blob survives the retry after a token refresh — it is a handle on
      // bytes the page still holds, not a stream that has been spent.
      body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API', undefined, 'errorNetwork');
  }

  // An expired access token is the normal state of a panel left open, not an
  // error worth showing anyone — refresh once and repeat the request.
  if (response.status === 401 && retry && authenticated) {
    if (await refreshSession()) {
      return send<T>(path, options, false);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = payload as { error?: { code: string; message: string; details?: unknown } };
    const said = envelope?.error?.message;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      said ?? `Request failed with ${response.status}`,
      envelope?.error?.details,
      said === undefined ? 'errorRequestFailed' : undefined,
      said === undefined ? { status: response.status } : undefined,
    );
  }

  return payload as T;
}

export function request<T>(path: string, options: Options = {}): Promise<T> {
  return send<T>(path, options, true);
}

export function streamUrl(): string {
  return `${BASE.replace(/^http/, 'ws')}/orders/stream`;
}

// ── shapes ──────────────────────────────────────────────────────────────────

export interface StaffScope {
  role: StaffRole;
  restaurantId: string | null;
  branchId: string | null;
}

export interface StaffProfile {
  id: string;
  email: string;
  name: string;
  scopes: StaffScope[];
  /** Flattened from the roles held. Screens render from this rather than from
   *  the role, so the panel and the API agree by construction. */
  permissions: Permission[];
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  staff: StaffProfile;
}

/**
 * A session as somebody else.
 *
 * No `refreshToken`, and that is the shape of the thing rather than an omission:
 * the API issues none, so the session cannot outlive `expiresIn` seconds.
 */
export interface ImpersonationResult {
  accessToken: string;
  expiresIn: number;
  staff: StaffProfile;
}

/**
 * What the order board is currently showing.
 *
 * One object rather than four arguments so a screen holds one piece of state,
 * and so "did anything change" is a single comparison. Every field is applied
 * by the API — the panel does not filter rows it already has, because it only
 * ever has one page of them.
 */
export interface OrderFilters {
  stage: QueueFilter;
  /** Order code, pickup code, or customer name. */
  q: string;
  restaurantId: string;
  branchId: string;
}

/**
 * Where the board opens, and what "clear the filters" returns it to.
 *
 * `paid` rather than the whole live queue: it is the only stage whose next move
 * belongs to the restaurant, so it is the one a kitchen opens this screen to
 * act on. "Everything at once" was the old default and had no action attached
 * to it.
 */
export const NO_ORDER_FILTERS: OrderFilters = {
  stage: QueueFilter.Paid,
  q: '',
  restaurantId: '',
  branchId: '',
};

/** Whether anything beyond the stage is narrowing the board — what decides
 *  if a "clear" control is worth showing. */
export function hasOrderFilters(filters: OrderFilters): boolean {
  return filters.q !== '' || filters.restaurantId !== '' || filters.branchId !== '';
}

/**
 * How long to wait after the last keystroke before searching.
 *
 * Long enough not to fire per character, short enough to feel like the box is
 * doing it. Here rather than in each screen that debounces, because two boxes
 * that settle at visibly different speeds read as one of them being slow.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Orders per page on the board.
 *
 * The API caps `limit` at 50 and defaults to 20 — which the panel was silently
 * taking, so the board stopped at the twentieth order with nothing to say so.
 * The full 50: this is a queue somebody scrolls, not a table they read.
 */
export const ORDERS_PAGE_SIZE = 50;

export interface StaffOrder {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: string;
  branch: { id: string; name: string | null };
  customerName: string | null;
  itemsCount: number;
  totalAmd: number;
  paymentStatus: PaymentStatus | null;
  readyAt: string | null;
  secondsLeft: number | null;
  createdAt: string;
  /** The lines of the order. `name` is the snapshot taken when it was placed —
   *  what the diner bought, whatever the dish has been renamed to since — and
   *  `menuItemId` is the dish itself, which is what makes a line a link to its
   *  row on the Menu screen. `lineTotalAmd` is the line rather than the unit
   *  price: two of something costs twice as much, and a board that showed the
   *  unit price beside a quantity would be asking a kitchen to multiply. */
  items: { menuItemId: string; name: string; qty: number; lineTotalAmd: number }[];
  notes: string | null;
}

/**
 * One thing that happened to an order.
 *
 * The panel renders these rather than deriving a story from `orders.status`,
 * which cannot tell one: a status column is overwritten by every change, so
 * "who confirmed this, and when" only has an answer because the API wrote it
 * down as it happened.
 */
export interface OrderHistoryEntry {
  id: string;
  type: OrderEventType;
  /** Null on `created` and on `payment` — an attempt that moved nothing. */
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actor: {
    type: OrderActorType;
    /** Null for `system`, for a diner who never gave a name, and for an account
     *  since deleted — the entry outlives the actor. */
    name: string | null;
    /** Staff only. */
    email: string | null;
    /** The real person behind an impersonated session. */
    impersonatedBy: string | null;
    /** Which person that is — a customer id or a staff id, following `type`.
     *  What turns the name into a link to the screen they are on. Null wherever
     *  `name` is. */
    id: string | null;
    /** The impersonator's staff id, paired with `impersonatedBy`. */
    impersonatedById: string | null;
  };
  detail: {
    serviceMode?: string;
    itemsCount?: number;
    totalAmd?: number;
    readyAt?: string | null;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    amountAmd?: number;
    /** Written by the migration for orders that predate the history table:
     *  their creation time is real and the rest was never recorded. */
    backfilled?: boolean;
    /** Inferred from the order row rather than witnessed: the status and the
     *  time are real, the actor was never recorded. */
    reconstructed?: boolean;
  } | null;
  at: string;
}

export interface StaffBranch {
  id: string;
  restaurantId: string;
  restaurantName: string;
  name: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  isOpen: boolean;
  avgPrepMin: number | null;
  menuItemCount: number;
}

/** What the restaurants list is narrowed to. Same shape of idea as
 *  `OrderFilters`, minus the stage — a restaurant has no stages. */
export interface RestaurantFilters {
  /** Restaurant name or slug, or the name/address of one of its branches. */
  q: string;
  restaurantId: string;
  branchId: string;
}

export const NO_RESTAURANT_FILTERS: RestaurantFilters = { q: '', restaurantId: '', branchId: '' };

export function hasRestaurantFilters(filters: RestaurantFilters): boolean {
  return filters.q !== '' || filters.restaurantId !== '' || filters.branchId !== '';
}

/**
 * Restaurants per page.
 *
 * Ten, not the fifty the order board uses: a card here carries every branch
 * under it, so ten rows of a ten-branch chain is already a hundred lines.
 */
export const RESTAURANTS_PAGE_SIZE = 10;

export interface StaffRestaurant {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  reservationsEnabled: boolean;
  services: string[];
  /** How many branches the account can reach, whatever a filter left showing.
   *  `branches.length` is the shown ones; this is the truth about the
   *  restaurant, and what the card counts. */
  branchCount: number;
  /** Only the branches the caller may see — a shift sees their own, not its
   *  siblings — and, under a search, only the ones that matched. Empty for a
   *  restaurant that has none yet, which is exactly the one that needs
   *  finding. */
  branches: StaffBranch[];
}

/**
 * One restaurant, opened on its own.
 *
 * Everything the list row carries plus what there is no room for in a row. The
 * shape extends the list's, so the detail page renders the same branch rows
 * without a second type to keep in step.
 */
export interface StaffRestaurantDetail extends StaffRestaurant {
  ratingAvg: number;
  reviewsCount: number;
  coverUrl: string | null;
  createdAt: string;
}

/** One role held over a restaurant or one of its branches, with whoever holds
 *  it. Two of these are the same person when they manage two of its branches. */
export interface RestaurantPerson {
  /** The **assignment's** id, not the person's — this row is a role. */
  id: string;
  role: StaffRole;
  branchId: string | null;
  /** Null for a role held over the whole restaurant rather than one branch. */
  branchName: string | null;
  person: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    lastLoginAt: string | null;
  };
}

/**
 * Roles per team — a restaurant's admins, or one branch's people.
 *
 * The API's cap, taken whole, because neither list is ever near it: a
 * restaurant has a handful of admins and a branch a shift's worth of staff.
 * There is no pager on either, so this doubles as the point at which the panel
 * has to admit it is not showing everything.
 */
export const TEAM_PAGE_SIZE = 50;

export interface StaffMenuItem {
  id: string;
  branchId: string;
  categoryId: string | null;
  menuTab: MenuTab;
  nameI18n: Record<string, string>;
  descI18n: Record<string, string> | null;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
}

/**
 * An edit to a dish — every field optional, and **only the ones that moved**
 * belong in it.
 *
 * The API diffs the body against the row before recording anything, so sending
 * a field that did not change is harmless; the reason to leave it out anyway is
 * that this is also the shape a form submits, and one that submitted all of them
 * would be sending a price nobody touched over a dish somebody else may be
 * editing at the same time.
 *
 * `branchId` is absent because the API has no such field: moving a dish between
 * branches would change who owns it, which is not an edit.
 */
export interface MenuItemPatch {
  menuTab?: MenuTab;
  /** Whole, not merged: what is sent replaces the column, so a language left
   *  out of it is a language removed from the dish. */
  nameI18n?: Record<string, string>;
  priceAmd?: number;
  /** `null` clears the estimate — the one field here where it means something
   *  rather than being a mistake. */
  prepMin?: number | null;
  /** A **different** photo. Never `''` or `null`: the API refuses both, because
   *  a dish is required to have one. */
  photoUrl?: string;
}

/**
 * One thing that happened to one dish.
 *
 * The menu says what a dish costs today. It cannot say what it cost last week or
 * who changed it — a column is overwritten by every edit — so the panel renders
 * these instead, from the `audit_log` rows the API wrote as each change
 * happened.
 *
 * Which of `before`/`after` is set is a function of the action, and the renderer
 * relies on it: a creation has `after` alone (nothing preceded it), a withdrawal
 * has `before` alone (what it was), and an edit has both — with **the keys of
 * `after` as the diff**, since `before` carries the dish's name as a label on
 * every edit whether the name moved or not.
 */
export interface MenuHistoryEntry {
  id: string;
  action: AuditAction;
  actor: {
    /** Which staff row, so a name can be a link to the person. Null for an
     *  account since deleted — the entry outlives the actor. */
    id: string | null;
    name: string | null;
    /** The real person behind an impersonated session. */
    impersonatedBy: string | null;
    impersonatedById: string | null;
  };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

export interface Metrics {
  from: string;
  to: string;
  orders: { total: number; earning: number; cancelled: number; abandonedPct: number };
  revenue: {
    grossAmd: number;
    serviceFeeAmd: number;
    discountAmd: number;
    averageOrderAmd: number;
  };
  /** A group-by over `orders.status`, so every value is one of the eight —
   *  named as such because the dashboard translates each one by key. */
  byStatus: { status: OrderStatus; count: number }[];
  topRestaurants: { name: string; orders: number; revenueAmd: number }[];
  users: { total: number; verified: number; newInPeriod: number };
  reservations: { total: number; seated: number; noShow: number };
}

/**
 * One page of a list endpoint — the shape every one of them returns
 * (DEVELOPMENT_GUIDE.md, "API conventions").
 *
 * `total` is the count matching the query, not the length of `items`, which is
 * what lets a screen say how much it is *not* showing.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
}

/**
 * Rows per page on the customer list.
 *
 * The API caps `limit` at 50. Half that, because the pager has to be reachable:
 * fifty dense rows is a long scroll to reach the control that leaves them, and
 * the whole point of paging is to not scroll.
 */
export const USERS_PAGE_SIZE = 25;

/** A **customer**. Staff are a different table and a different screen. */
export interface AdminUser {
  id: string;
  /** Masked by the API. The full number is a separate request per account —
   *  `api.userPhone` — which the API records; see the Customers screen. */
  phone: string | null;
  name: string | null;
  email: string | null;
  role: string;
  isGuest: boolean;
  phoneVerified: boolean;
  ordersCount: number;
  rewardPoints: number;
  createdAt: string;
}

/**
 * Orders per page inside one customer's dialog.
 *
 * Ten, matching the API's own default, and fewer than the twenty-five rows of
 * the table behind it: these rows open, so ten of them expanded is already
 * longer than the dialog. The pager is inside the dialog for the same reason it
 * is under the table — "312 orders" is the answer to a question somebody has,
 * and the twenty-fifth page of them is not.
 */
export const CUSTOMER_ORDERS_PAGE_SIZE = 10;

/**
 * What one customer's order list is narrowed to.
 *
 * The same shape of idea as `OrderFilters`, minus the two pickers: the customer
 * is fixed by the dialog, and *which restaurant* is something the search box
 * already answers by name. Both fields are applied by the API — the dialog holds
 * one page of rows and cannot filter what it does not have.
 */
export interface CustomerOrderFilters {
  /** Order code, a dish on the order, or where it was bought. */
  q: string;
  status: CustomerOrderFilter;
}

export const NO_CUSTOMER_ORDER_FILTERS: CustomerOrderFilters = {
  q: '',
  status: CustomerOrderFilter.All,
};

/** Whether anything beyond the whole history is on — what decides if a "clear"
 *  control is worth showing, and which empty state the list gets. */
export function hasCustomerOrderFilters(filters: CustomerOrderFilters): boolean {
  return filters.q !== '' || filters.status !== CustomerOrderFilter.All;
}

/** One line of an order, as it was bought. `name` is the snapshot taken at
 *  purchase — what the diner ordered, whatever the dish is called now. */
export interface AdminCustomerOrderItem {
  menuItemId: string;
  name: string;
  qty: number;
  unitPriceAmd: number;
  lineTotalAmd: number;
}

/**
 * One of a customer's orders, whole.
 *
 * Every field the row shows *and* every field opening it shows, in one shape:
 * the API sends a page of these joined, so expanding a row costs no request.
 *
 * `restaurantId` and `branchId` are not rendered. They are what the order board
 * is addressable by, alongside the code — the three together are what make a row
 * here a link to the same order on the Orders screen.
 */
export interface AdminCustomerOrder {
  id: string;
  code: string;
  /** The four digits a counter says out loud. */
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  restaurantId: string;
  restaurantName: string;
  branchId: string;
  branchName: string | null;
  /** Dishes, not lines: two of something counts twice. */
  itemsCount: number;
  items: AdminCustomerOrderItem[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  /** Taken at booking and credited to the bill, never added to the total. */
  depositAmd: number;
  discountAmd: number;
  totalAmd: number;
  /** Null for an order nobody ever paid for — a basket abandoned at checkout. */
  payment: { method: PaymentMethod; status: PaymentStatus } | null;
  tableNo: string | null;
  notes: string | null;
  readyAt: string | null;
  createdAt: string;
}

/** One role somebody holds, and where. */
export interface StaffAssignment {
  id: string;
  role: StaffRole;
  /** The restaurant the role reaches — the one it is over, or the one the
   *  branch belongs to. Null only for a platform role, which is over none.
   *  `branchId` is what says which of the two this is. */
  restaurantId: string | null;
  restaurantName: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface StaffListEntry {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  assignments: StaffAssignment[];
}

/**
 * What the people list is narrowed to.
 *
 * The search runs over a person's name and email **and** the restaurant or
 * branch they are assigned to, because those are the three things on the card
 * and whoever is typing knows which of them they remember.
 */
export interface PeopleFilters {
  q: string;
  /** Empty means every role — see `ANY` in the screen for why it is not a
   *  sentinel string here. */
  role: StaffRole | '';
  /**
   * One person, by id, or empty for the whole directory.
   *
   * The only filter here that is not typed into the toolbar: it arrives in the
   * address, from a link that already knows who it means — a name in an order's
   * history. It sits with the other two so that "is this list narrowed" and
   * "clear it" stay one question with one answer.
   */
  personId: string;
}

export const NO_PEOPLE_FILTERS: PeopleFilters = { q: '', role: '', personId: '' };

export function hasPeopleFilters(filters: PeopleFilters): boolean {
  return filters.q !== '' || filters.role !== '' || filters.personId !== '';
}

/** People per page. A card is a person plus a line per role they hold, so it
 *  sits between the customer table's 25 and the restaurants' 10. */
export const PEOPLE_PAGE_SIZE = 20;

/**
 * Open invitations per page.
 *
 * Fewer, because this list sits **above** the directory: twenty pending
 * invitations would push the people everyone came for off the screen. Normally
 * there are none and the section is not rendered at all.
 */
export const INVITES_PAGE_SIZE = 10;

export interface StaffInvite {
  id: string;
  email: string;
  role: StaffRole;
  restaurantId: string | null;
  branchId: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Where an entry happened. Null throughout for a platform action, which
 *  happened over no restaurant at all. */
export interface ActivityWhere {
  restaurantId: string | null;
  restaurantName: string | null;
  branchId: string | null;
  branchName: string | null;
}

export interface ActivityPerson {
  id: string | null;
  name: string | null;
}

/**
 * One thing somebody did.
 *
 * A union on `kind`, mirroring the API: the feed merges `audit_log` and
 * `order_events`, which answer different questions and are not worth flattening
 * into one shape full of nulls. `audit` carries an action and a before/after
 * pair; `order` carries two statuses and the code a counter says out loud.
 */
export type ActivityEntry =
  | {
      kind: 'audit';
      id: string;
      action: AuditAction;
      entity: string;
      entityId: string | null;
      /** Only the fields that moved — plus, on the menu actions, the dish's name,
       *  so an entry can say *which* price changed without a second request. */
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      where: ActivityWhere;
      impersonatedBy: ActivityPerson | null;
      at: string;
    }
  | {
      kind: 'order';
      id: string;
      type: OrderEventType;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus | null;
      orderId: string;
      orderCode: string;
      where: ActivityWhere;
      impersonatedBy: ActivityPerson | null;
      at: string;
    };

/**
 * Entries per page.
 *
 * Twenty, and the API caps the page number at 25: the feed merges two tables by
 * offset, so paging deep costs the whole prefix of both. Nobody scrolls five
 * hundred entries into somebody's week, and the honest fix if they ever need to
 * is a date filter rather than a bigger number here.
 */
export const ACTIVITY_PAGE_SIZE = 20;

// ── endpoints ───────────────────────────────────────────────────────────────

export const api = {
  // ── staff auth ────────────────────────────────────────────────────────────

  login: (email: string, password: string) =>
    request<AuthResult>('/auth/staff/login', {
      method: 'POST',
      body: { email, password },
      authenticated: false,
    }),

  acceptInvite: (token: string, password: string, name?: string) =>
    request<AuthResult>('/auth/staff/accept-invite', {
      method: 'POST',
      body: { token, password, name },
      authenticated: false,
    }),

  forgotPassword: (email: string) =>
    request<{ sent: true }>('/auth/staff/forgot-password', {
      method: 'POST',
      body: { email },
      authenticated: false,
    }),

  resetPassword: (token: string, password: string) =>
    request<void>('/auth/staff/reset-password', {
      method: 'POST',
      body: { token, password },
      authenticated: false,
    }),

  logout: (refreshToken: string) =>
    request<void>('/auth/staff/logout', {
      method: 'POST',
      body: { refreshToken },
      authenticated: false,
    }),

  me: () => request<StaffProfile>('/auth/staff/me'),

  // ── restaurant ────────────────────────────────────────────────────────────

  orders: (filters: OrderFilters, page = 1) =>
    request<Page<StaffOrder> & { counts: Record<QueueFilter, number> }>('/restaurant/orders', {
      query: {
        status: filters.stage,
        q: filters.q || undefined,
        restaurantId: filters.restaurantId || undefined,
        branchId: filters.branchId || undefined,
        page: String(page),
        limit: String(ORDERS_PAGE_SIZE),
      },
    }),

  setOrderStatus: (id: string, status: OrderStatus) =>
    request<unknown>(`/restaurant/orders/${id}/status`, { method: 'PATCH', body: { status } }),

  /**
   * One order's trail. Fetched when the History dialog opens rather than with
   * the board: fifty cards would be fifty timelines nobody asked to see, and
   * the board is already polling every twenty seconds.
   */
  orderHistory: (id: string) =>
    request<{ items: OrderHistoryEntry[] }>(`/restaurant/orders/${id}/history`),

  restaurants: (filters: RestaurantFilters, page = 1) =>
    request<Page<StaffRestaurant>>('/restaurant/restaurants', {
      query: {
        q: filters.q || undefined,
        restaurantId: filters.restaurantId || undefined,
        branchId: filters.branchId || undefined,
        page: String(page),
        limit: String(RESTAURANTS_PAGE_SIZE),
      },
    }),

  restaurant: (id: string) => request<StaffRestaurantDetail>(`/restaurant/restaurants/${id}`),

  /**
   * The restaurant's own admins — the roles held over all of it.
   *
   * A separate request from the restaurant itself, because it needs a separate
   * permission: `branch:read` opens the restaurant, `staff:read` says who runs
   * it, and a shift account holds the first without the second.
   */
  restaurantPeople: (id: string) =>
    request<Page<RestaurantPerson>>(`/restaurant/restaurants/${id}/people`, {
      query: { limit: String(TEAM_PAGE_SIZE) },
    }),

  /** One branch's people, asked for when that branch is opened rather than with
   *  the restaurant — a chain of forty branches is thirty-nine teams nobody
   *  looked at. */
  branchPeople: (id: string) =>
    request<Page<RestaurantPerson>>(`/restaurant/branches/${id}/people`, {
      query: { limit: String(TEAM_PAGE_SIZE) },
    }),

  branches: () => request<{ items: StaffBranch[] }>('/restaurant/branches'),

  createBranch: (data: {
    restaurantId: string;
    name?: string;
    address?: string;
    city?: string;
    phone?: string;
    avgPrepMin?: number;
  }) => request<StaffBranch>('/restaurant/branches', { method: 'POST', body: data }),

  /** The shift switch — a narrower permission than editing the branch. */
  setBranchStatus: (id: string, patch: { isOpen?: boolean; avgPrepMin?: number }) =>
    request<StaffBranch>(`/restaurant/branches/${id}/status`, { method: 'PATCH', body: patch }),

  updateBranch: (id: string, patch: { name?: string; address?: string; phone?: string }) =>
    request<StaffBranch>(`/restaurant/branches/${id}`, { method: 'PATCH', body: patch }),

  menu: (branchId: string) =>
    request<{ items: StaffMenuItem[] }>('/restaurant/menu-items', { query: { branchId } }),

  /**
   * Stores a dish photo and answers with the URL to save on the dish.
   *
   * Two steps rather than one form submission: the image goes up while somebody
   * is still typing the price, so the picture is already there — and already
   * shown back to them — by the time they add the dish. A form that abandoned
   * afterwards leaves the file behind; that is the known cost of the split.
   */
  uploadMenuPhoto: (file: File) =>
    request<{ url: string }>('/uploads/menu-photo', { method: 'POST', file }),

  createMenuItem: (item: {
    branchId: string;
    menuTab: MenuTab;
    nameI18n: Record<string, string>;
    priceAmd: number;
    /** Required by the API, so required here — a dish goes on the menu with a
     *  picture or it does not go on it. An absolute `http(s)` URL. */
    photoUrl: string;
    prepMin?: number;
  }) => request<StaffMenuItem>('/restaurant/menu-items', { method: 'POST', body: item }),

  updateMenuItem: (id: string, patch: MenuItemPatch) =>
    request<StaffMenuItem>(`/restaurant/menu-items/${id}`, { method: 'PATCH', body: patch }),

  /** Sold out and back — the one menu change a shift may make. */
  setAvailability: (id: string, isAvailable: boolean) =>
    request<StaffMenuItem>(`/restaurant/menu-items/${id}/availability`, {
      method: 'PATCH',
      body: { isAvailable },
    }),

  deleteMenuItem: (id: string) =>
    request<void>(`/restaurant/menu-items/${id}`, { method: 'DELETE' }),

  /** Everything recorded about one dish, oldest first. `menu:read`, like the
   *  menu itself — whoever may read a price may read how it got there. */
  menuHistory: (id: string) =>
    request<{ items: MenuHistoryEntry[] }>(`/restaurant/menu-items/${id}/history`),

  // ── people ────────────────────────────────────────────────────────────────

  staff: (filters: PeopleFilters, page = 1) =>
    request<Page<StaffListEntry>>('/staff', {
      query: {
        q: filters.q || undefined,
        role: filters.role || undefined,
        id: filters.personId || undefined,
        page: String(page),
        limit: String(PEOPLE_PAGE_SIZE),
      },
    }),

  /** The same filters as the directory: an invitation is a person you are
   *  looking for who has not accepted yet. Its own page number, though — two
   *  lists on one screen do not walk together.
   *
   *  All but `personId`, which is deliberately not sent: an invitation has no
   *  staff account to be the id of, so the whole list would fall away rather
   *  than narrow. The screen hides the section instead — see People.tsx. */
  invites: (filters: PeopleFilters, page = 1) =>
    request<Page<StaffInvite>>('/staff/invites', {
      query: {
        q: filters.q || undefined,
        role: filters.role || undefined,
        page: String(page),
        limit: String(INVITES_PAGE_SIZE),
      },
    }),

  invite: (data: {
    email: string;
    role: StaffRole;
    restaurantId?: string;
    branchId?: string;
  }) =>
    request<{ granted: boolean; email: string; expiresAt: string | null }>('/staff/invites', {
      method: 'POST',
      body: data,
    }),

  revokeInvite: (id: string) => request<void>(`/staff/invites/${id}`, { method: 'DELETE' }),

  revokeAssignment: (id: string) =>
    request<void>(`/staff/assignments/${id}`, { method: 'DELETE' }),

  /** What one person has done, newest first — `staff:activity`.
   *
   *  Scoped twice by the API: to a person the caller can already see, and then
   *  to the entries inside their own reach, so somebody working for two
   *  restaurants shows each admin only their own half. */
  activity: (personId: string, page = 1) =>
    request<Page<ActivityEntry>>(`/staff/${personId}/activity`, {
      query: { page: String(page), limit: String(ACTIVITY_PAGE_SIZE) },
    }),

  /** Signs the caller in as this person — `staff:impersonate`, which only a
   *  super admin holds. There is no matching "stop": ending it is `acting.end`
   *  putting the caller's own tokens back. */
  impersonate: (id: string) =>
    request<ImpersonationResult>(`/staff/${id}/impersonate`, { method: 'POST' }),

  // ── platform ──────────────────────────────────────────────────────────────

  metrics: (from?: string, to?: string) =>
    request<Metrics>('/admin/metrics', { query: { from, to } }),

  reconciliation: () =>
    request<{ items: { orderCode: string; issue: string }[] }>('/admin/metrics/reconciliation'),

  /** `id` narrows to one customer exactly — a link from an order's history,
   *  which knows who it means and has no search term that would find only
   *  them. */
  users: (q?: string, role?: string, page = 1, id?: string) =>
    request<Page<AdminUser>>('/admin/users', {
      query: { q, role, id, page: String(page), limit: String(USERS_PAGE_SIZE) },
    }),

  /**
   * One customer's number in full.
   *
   * Asked for per account, when somebody asks — never with the list. The API
   * writes an `audit_log` row for every call, so a panel that fetched these
   * eagerly would record twenty-five reveals for a page nobody read.
   */
  userPhone: (id: string) => request<{ id: string; phone: string }>(`/admin/users/${id}/phone`),

  /** What one customer has ordered, newest first. Fetched when the dialog opens
   *  rather than with the list, for the same reason an order's history is. The
   *  counts arrive with every page, taken under the search but not the status,
   *  so the segments say where a searched-for order actually is. */
  userOrders: (id: string, filters: CustomerOrderFilters, page = 1) =>
    request<Page<AdminCustomerOrder> & { counts: Record<CustomerOrderFilter, number> }>(
      `/admin/users/${id}/orders`,
      {
        query: {
          q: filters.q || undefined,
          status: filters.status,
          page: String(page),
          limit: String(CUSTOMER_ORDERS_PAGE_SIZE),
        },
      },
    ),

  createRestaurant: (data: {
    slug: string;
    name: string;
    adminEmail?: string;
    cuisine?: string;
    priceLevel?: number;
  }) => request<{ id: string; slug: string }>('/admin/restaurants', { method: 'POST', body: data }),

  issuePromo: (data: {
    code: string;
    discountPct?: number;
    discountAmd?: number;
    validUntil?: string;
  }) => request<{ code: string; issued: number }>('/admin/promos', { method: 'POST', body: data }),
};
