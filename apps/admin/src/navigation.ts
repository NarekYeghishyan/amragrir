import { Permission } from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import type { IconName } from './ui/icons';

/**
 * Which tab needs which permission, and how it presents itself.
 *
 * Driven by permissions rather than by a role, so a branch manager and a
 * platform admin each see exactly the screens their account can actually use.
 * The API enforces the same map independently — this only avoids offering dead
 * ends, and is never what decides access.
 *
 * Pure data in its own module, with no UI imports: the shell reads it to build
 * the sidebar, and the tests reason about permissions without mounting a panel.
 *
 * `name` is an identity, not a label — it is what the shell switches on and
 * what the tests assert, so it stays English however the panel is set. The
 * three visible strings are dictionary keys, and `title`/`description` name the
 * same entries the screens themselves render, so a heading cannot drift from
 * the sidebar that leads to it.
 *
 * `path` is the screen's address. It lives here, beside the permission that
 * opens the screen, so that "which URL" and "who may see it" cannot be answered
 * from two different lists — the sidebar, the router and the fallback for a
 * revoked role all read this one table.
 */
export const TABS = [
  {
    name: 'Orders',
    path: '/orders',
    needs: Permission.OrdersRead,
    group: 'restaurant',
    icon: 'orders',
    label: 'navOrders',
    title: 'ordersTitle',
    description: 'ordersDesc',
  },
  {
    name: 'Menu',
    path: '/menu',
    needs: Permission.MenuRead,
    group: 'restaurant',
    icon: 'menu',
    label: 'navMenu',
    title: 'menuTitle',
    description: 'menuDesc',
  },
  {
    name: 'Restaurants',
    path: '/restaurants',
    needs: Permission.BranchRead,
    group: 'restaurant',
    icon: 'restaurants',
    label: 'navRestaurants',
    title: 'restaurantsTitle',
    description: 'restaurantsDesc',
  },
  {
    name: 'People',
    path: '/people',
    needs: Permission.StaffRead,
    group: 'restaurant',
    icon: 'people',
    label: 'navPeople',
    title: 'peopleTitle',
    description: 'peopleDesc',
  },
  {
    name: 'Dashboard',
    path: '/dashboard',
    needs: Permission.PlatformMetrics,
    group: 'platform',
    icon: 'dashboard',
    label: 'navDashboard',
    title: 'dashboardTitle',
    description: 'dashboardDesc',
  },
  {
    name: 'Customers',
    path: '/customers',
    needs: Permission.PlatformUsers,
    group: 'platform',
    icon: 'customers',
    label: 'navCustomers',
    title: 'customersTitle',
    description: 'customersDesc',
  },
  {
    name: 'Platform',
    path: '/platform',
    needs: Permission.RestaurantCreate,
    group: 'platform',
    icon: 'platform',
    label: 'navPlatform',
    title: 'platformTitle',
    description: 'platformDesc',
  },
] as const satisfies readonly {
  name: string;
  path: `/${string}`;
  needs: Permission;
  group: 'restaurant' | 'platform';
  icon: IconName;
  label: AdminTranslationKey;
  title: AdminTranslationKey;
  description: AdminTranslationKey;
}[];

export type Tab = (typeof TABS)[number]['name'];
export type TabEntry = (typeof TABS)[number];

/** The sidebar's two headings, in the order they appear. */
export const TAB_GROUPS = [
  { key: 'restaurant', label: 'navGroupRestaurant' },
  { key: 'platform', label: 'navGroupPlatform' },
] as const satisfies readonly { key: string; label: AdminTranslationKey }[];

export function visibleTabs(permissions: readonly Permission[]): Tab[] {
  return TABS.filter((entry) => permissions.includes(entry.needs)).map((entry) => entry.name);
}

/** The full record for a tab — what the sidebar and page header render from. */
export function tabEntry(name: Tab): TabEntry {
  // `name` is one of TABS' own names, so this cannot miss.
  return TABS.find((entry) => entry.name === name) as TabEntry;
}

/**
 * Which tab to render.
 *
 * Falls back to the first visible one rather than trusting the stored value: a
 * session whose roles changed can be sitting on a tab the account no longer
 * has, and rendering it would produce a screen where every request 403s.
 */
export function activeTab(current: Tab, visible: readonly Tab[]): Tab | null {
  return visible.includes(current) ? current : (visible[0] ?? null);
}

/**
 * Where a jump to the Restaurants tab lands.
 *
 * The addressable part of that screen, and therefore what its URL is made of:
 * `/restaurants/:restaurantId/branches/:branchId?role=:assignmentId`. Held as
 * an object rather than parsed out of the address bar at every use, so the
 * screens go on reading three named fields and only `parseRoute`/`routePath`
 * below know the shape of the URL.
 */
export interface RestaurantTarget {
  restaurantId: string;
  /** The branch to open with it, or null for a role held over the whole
   *  restaurant — a chain of forty branches otherwise arrives closed, with the
   *  one somebody clicked somewhere in it. */
  branchId: string | null;
  /** The role to mark once it is on screen, or null when the restaurant was
   *  opened from the list and no particular row is the answer. An opened branch
   *  can hold a dozen people, and the one somebody clicked is not the one they
   *  should have to find again by name. */
  assignmentId: string | null;
}

/**
 * Where a role is held, as somewhere to go.
 *
 * Null for a platform role, which is over no restaurant and so has nothing to
 * open — the one case the People screen leaves as text. A branch role brings
 * its branch along, because the branch is what was clicked; a restaurant role
 * has none to bring, and its restaurant opens with every branch closed.
 *
 * The role's own id travels with it. It is the assignment's, and the team lists
 * on the other screen are rows of assignments, so it names the exact row to
 * mark — not the person, who may hold a second role in the same team.
 */
export function targetOf(assignment: {
  id: string;
  restaurantId: string | null;
  branchId: string | null;
}): RestaurantTarget | null {
  const { id, restaurantId, branchId } = assignment;
  return restaurantId === null ? null : { restaurantId, branchId, assignmentId: id };
}

/**
 * Which orders a link to the board is about.
 *
 * The two pickers above the queue, as something that can be sent to somebody:
 * `/orders?restaurant=:restaurantId&branch=:branchId`. They are filters, and
 * filters are otherwise state rather than addresses here — but these two answer
 * "whose queue", which is the question a link is *for*: a branch on the
 * Restaurants screen now has a button that opens its own orders, and a button
 * that leads to a screen showing every branch's queue leads nowhere useful.
 *
 * Both halves are separately optional, because the board allows both states: a
 * restaurant with no branch chosen is a chain's whole queue, and a branch with
 * no restaurant is what the picker leaves behind when somebody widens back out
 * of one.
 *
 * `orderCode` narrows the same board to a single order — `&order=:code` — and
 * is what a line in somebody's activity links to. It is deliberately *not* the
 * search box, which stays state: a typed term is a way of looking for an answer
 * and a reload is allowed to forget it, while a code names one order and is
 * therefore an answer, the same argument that puts `?person=` on the two lists
 * of people. The stage stays out for the older reason — it narrows rather than
 * names — and the board works out which stage holds the order it was sent to.
 */
export interface OrderScope {
  restaurantId: string | null;
  branchId: string | null;
  /** One order's code, or null for the whole queue. The full code rather than
   *  the four-digit pickup code: the pickup code is only unique among a
   *  branch's *active* orders, so a link built from one would eventually mean
   *  two different orders. */
  orderCode: string | null;
}

/**
 * Which menu a link is about, and which dish on it.
 *
 * `/menu?branch=:branchId&dish=:menuItemId`. Every line of an order on the
 * board is a link to the dish it was ordered from — "what is in this, how long
 * does it take, is it still on" is the next question after reading a ticket,
 * and the answer used to be the Menu tab plus the same two pickers again from
 * memory, then the search box, then hoping the dish had not been renamed since
 * the order was placed.
 *
 * The branch is not optional. A menu belongs to a branch — there is no
 * all-branches menu the way there is an all-branches queue — so an address
 * naming a dish and no branch names nothing, and reads back as no target at
 * all. The dish is: a branch's menu is a place worth being on its own, and
 * that is where the picker leaves the address once somebody moves off the dish
 * they arrived at.
 */
export interface MenuTarget {
  branchId: string;
  itemId: string | null;
}

/**
 * Where somebody who is not signed in is sent, and where signing out lands.
 *
 * Deliberately not in `TABS`: it is not a screen anybody navigates to, it has
 * no permission that opens it, and it must never appear in the sidebar. The
 * other two signed-out addresses — `/accept-invite` and `/reset-password` —
 * are not here either, because what they mean is decided by the token they
 * carry rather than by their path (see `modeFromUrl` in `screens/SignIn`).
 */
export const SIGN_IN_PATH = '/sign-in';

/**
 * Where the panel is, as the address bar has it.
 *
 * A screen, plus the one thing that screen has worth addressing: which
 * restaurant is open on Restaurants, whose queue is showing on Orders, whose
 * menu — and which dish on it — is showing on Menu, which person the directory
 * is pointed at on People and Customers. Everything else a screen holds is a
 * search box or a page number, which narrows an answer rather than being one,
 * and stays in React state where a reload is allowed to forget it.
 */
export interface Route {
  tab: Tab;
  /** The restaurant this URL has open, or null for the list. Only ever set on
   *  the Restaurants tab; ignored when formatting any other. */
  open: RestaurantTarget | null;
  /** Which branches this URL's order board is showing, or null for all of the
   *  ones the account can reach. Only ever set on the Orders tab; ignored when
   *  formatting any other. */
  scope: OrderScope | null;
  /** Whose menu this URL is showing, and which dish on it is the one somebody
   *  was sent to. Only ever set on the Menu tab; ignored when formatting any
   *  other. Null for the menu the screen would pick for itself — the first
   *  branch the account can reach — which is what the bare `/menu` means. */
  menu: MenuTarget | null;
  /** The one person this URL's list is narrowed to — a staff id on People, a
   *  customer id on Customers — or null for the whole list. Set on those two
   *  tabs only; ignored when formatting any other.
   *
   *  A filter that is an address, for the same reason the order board's two
   *  pickers are: it answers "who", which is what the link naming somebody in
   *  an order's history is *for*. The search box beside it stays out, because
   *  that narrows an answer rather than being one. */
  person: string | null;
}

/**
 * What `routePath` will write an address for.
 *
 * A route with its two detail fields optional, because a screen only ever
 * carries one of them and `{ tab: 'Orders', open: null, scope }` makes every
 * caller state that the *other* screen's detail is absent. `parseRoute` still
 * answers in whole `Route`s — reading an address has to say something about
 * every field, writing one does not.
 */
export type RouteInput = { tab: Tab } & Partial<Route>;

/** The segment under a restaurant that names one of its branches. */
const BRANCHES = 'branches';

/** The query key that marks one role on the screen it lands on. */
const ROLE = 'role';

/** The query keys the order board is scoped by. `branch` does double duty on
 *  the Menu tab, where it names the branch whose menu is on screen — it is the
 *  same word about the same thing, and two keys for it would only mean a link
 *  between the two screens had to translate one into the other. */
const RESTAURANT = 'restaurant';
const BRANCH = 'branch';

/** The query key that narrows the board to one order. */
const ORDER = 'order';

/** The query key that marks one dish on the menu it names. */
const DISH = 'dish';

/** The query key that narrows a list of people to one of them. */
const PERSON = 'person';

/** The two screens that are lists of people, and so can be pointed at one.
 *  Named here rather than tested for inline so the parser and the formatter
 *  cannot come to disagree about which screens have the field. */
const PEOPLE_TABS: readonly Tab[] = ['People', 'Customers'];

/**
 * The address for a route.
 *
 * The inverse of `parseRoute`, and tested as one: a route formatted and parsed
 * back has to be the route it started as, or a link the panel writes is a link
 * the panel cannot read. The one normalisation is a scope with nothing in it,
 * which is written as the bare board and therefore reads back as no scope —
 * "all restaurants, all branches" and "not narrowed" are the same board.
 */
export function routePath(route: RouteInput): string {
  const base = tabEntry(route.tab).path;

  if (route.tab === 'Orders') {
    return base + orderQuery(route.scope ?? null);
  }
  if (route.tab === 'Menu') {
    return base + menuQuery(route.menu ?? null);
  }
  if (PEOPLE_TABS.includes(route.tab)) {
    const person = route.person ?? null;
    return person === null ? base : `${base}?${PERSON}=${encodeURIComponent(person)}`;
  }
  if (route.tab !== 'Restaurants' || route.open === null || route.open === undefined) {
    return base;
  }

  const { restaurantId, branchId, assignmentId } = route.open;
  const path =
    branchId === null
      ? `${base}/${encodeURIComponent(restaurantId)}`
      : `${base}/${encodeURIComponent(restaurantId)}/${BRANCHES}/${encodeURIComponent(branchId)}`;

  // The role is a query rather than a fifth segment: it is not a thing under
  // the branch, it is which row of it this link is about.
  return assignmentId === null
    ? path
    : `${path}?${ROLE}=${encodeURIComponent(assignmentId)}`;
}

/** The order board's scope as a query string, empty when it has none. Built
 *  through `URLSearchParams` rather than by hand so an id needing encoding is
 *  encoded once, by the same code that will decode it. */
function orderQuery(scope: OrderScope | null): string {
  if (scope === null) {
    return '';
  }
  const params = new URLSearchParams();
  if (scope.restaurantId !== null) {
    params.set(RESTAURANT, scope.restaurantId);
  }
  if (scope.branchId !== null) {
    params.set(BRANCH, scope.branchId);
  }
  if (scope.orderCode !== null) {
    params.set(ORDER, scope.orderCode);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** A menu's address as a query string, empty when it names no branch. Built
 *  through `URLSearchParams` for the same reason the board's is: an id needing
 *  encoding is encoded once, by the same code that will decode it. */
function menuQuery(target: MenuTarget | null): string {
  if (target === null || target.branchId === '') {
    return '';
  }
  const params = new URLSearchParams({ [BRANCH]: target.branchId });
  if (target.itemId !== null) {
    params.set(DISH, target.itemId);
  }
  return `?${params.toString()}`;
}

/** Which menu a query names, or null when it names none. A `?dish=` with no
 *  branch beside it is dropped rather than carried: a dish id says nothing
 *  about which branch's menu holds it, and there is no menu to open without
 *  one. */
function menuTarget(search: string): MenuTarget | null {
  const params = new URLSearchParams(search);
  const branchId = params.get(BRANCH) || null;
  return branchId === null ? null : { branchId, itemId: params.get(DISH) || null };
}

/** What a board's query says it is showing, or null when it says nothing.
 *  Empty values are dropped rather than carried: `?branch=` is a key somebody
 *  half-deleted, not a branch whose id is the empty string. */
function orderScope(search: string): OrderScope | null {
  const params = new URLSearchParams(search);
  const restaurantId = params.get(RESTAURANT) || null;
  const branchId = params.get(BRANCH) || null;
  const orderCode = params.get(ORDER) || null;
  return restaurantId === null && branchId === null && orderCode === null
    ? null
    : { restaurantId, branchId, orderCode };
}

/** A tab's own address, with nothing opened inside it — what the sidebar links
 *  to, and where a screen somebody may no longer open falls back to. */
export function tabPath(tab: Tab): string {
  return tabEntry(tab).path;
}

/**
 * What a URL means, or null when it means nothing here.
 *
 * Null rather than a guess: `/` on a first arrival and `/restarants` typed by
 * hand are both addresses this panel cannot render, and both want the same
 * answer — the first screen this account can actually open. Which screen that
 * is depends on permissions the router does not have, so it says "not a route"
 * and lets the shell decide.
 *
 * Permissions are not checked here at all. A URL is a request, and whether the
 * account may have it is the shell's question and the API's answer; a parser
 * that also enforced access would be a second copy of the permission table.
 */
export function parseRoute(pathname: string, search = ''): Route | null {
  let segments: string[];
  try {
    segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    // A stray `%` in a hand-typed URL — `decodeURIComponent` throws on it, and
    // an address that cannot be read is an address that means nothing.
    return null;
  }

  const entry = TABS.find((tab) => tab.path === `/${segments[0]}`);
  if (entry === undefined) {
    return null;
  }
  const tab = entry.name;

  if (tab !== 'Restaurants') {
    // No screen but Restaurants has anything under it, so trailing segments are
    // not a deeper page — they are a mistake, and one worth falling back from
    // rather than rendering the tab as though they were not there.
    if (segments.length !== 1) {
      return null;
    }
    // The board, the menu and the two lists of people are the screens with a
    // query of their own. A stray `?restaurant=` on any other tab is ignored
    // rather than refused: an unknown query is not a mistyped address, it is a
    // tracking parameter or a leftover from wherever the link was pasted.
    return {
      tab,
      open: null,
      scope: tab === 'Orders' ? orderScope(search) : null,
      menu: tab === 'Menu' ? menuTarget(search) : null,
      person: PEOPLE_TABS.includes(tab) ? new URLSearchParams(search).get(PERSON) || null : null,
    };
  }

  const assignmentId = new URLSearchParams(search).get(ROLE) || null;
  const [, restaurantId, branches, branchId] = segments;

  if (segments.length === 1) {
    return { tab, open: null, scope: null, menu: null, person: null };
  }
  if (segments.length === 2 && restaurantId !== undefined) {
    return {
      tab,
      open: { restaurantId, branchId: null, assignmentId },
      scope: null,
      menu: null,
      person: null,
    };
  }
  if (
    segments.length === 4 &&
    restaurantId !== undefined &&
    branches === BRANCHES &&
    branchId !== undefined
  ) {
    return {
      tab,
      open: { restaurantId, branchId, assignmentId },
      scope: null,
      menu: null,
      person: null,
    };
  }
  return null;
}
