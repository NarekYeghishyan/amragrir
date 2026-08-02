// Staff-side roles and what each of them may do — see docs/ROLES_AND_PERMISSIONS.md.
//
// This map lives in `shared` rather than in the database on purpose. A
// permission only means something next to an endpoint that checks it, so adding
// one is a code change whichever way it is stored; keeping it here also lets the
// back office render its screens from the same table the API enforces, so a
// button never offers what the API is about to refuse.
//
// What *is* in the database is the assignment — which person holds which role
// over which restaurant or branch (`staff_assignments`). That changes daily and
// belongs in a table; this does not.

import { StaffRole } from './enums';

/**
 * The vocabulary of things a staff account can be allowed to do.
 *
 * Named `resource:verb` so a guard reads as a sentence and an unknown string
 * fails to typecheck rather than silently granting nothing.
 */
export const Permission = {
  /** Read the order queue for the branches in scope. */
  OrdersRead: 'orders:read',
  /** Move an order along the state machine. */
  OrdersAdvance: 'orders:advance',
  /** Read the reservation book. */
  ReservationsRead: 'reservations:read',
  /** Seat, complete or no-show a reservation. */
  ReservationsAdvance: 'reservations:advance',
  /** See the menu with its raw translations. */
  MenuRead: 'menu:read',
  /** Create, edit and delete dishes, including prices. */
  MenuWrite: 'menu:write',
  /** Flip a dish sold-out and back, without touching its price or text. */
  MenuAvailability: 'menu:availability',
  /** See the branch list. */
  BranchRead: 'branch:read',
  /** Open and close a branch, and adjust its prep estimate — the shift's own switch. */
  BranchHours: 'branch:hours',
  /** Edit a branch's address, phone and other standing details. */
  BranchWrite: 'branch:write',
  /** Add a branch to a restaurant. */
  BranchCreate: 'branch:create',
  /** Manage tables, capacity and zones. */
  TablesWrite: 'tables:write',
  /** Edit the restaurant itself (name, services, reservations on/off). */
  RestaurantWrite: 'restaurant:write',
  /** Revenue and order analytics for the restaurants in scope. */
  AnalyticsRead: 'analytics:read',
  /** See who works here. */
  StaffRead: 'staff:read',
  /** Invite someone and give them a role. */
  StaffInvite: 'staff:invite',
  /** Take a role away, or deactivate an account. */
  StaffRevoke: 'staff:revoke',
  /**
   * Read what a staff member has done — their menu edits, the orders they moved,
   * the people they invited.
   *
   * Separate from `staff:read` because the two are different powers. Knowing who
   * works here is a directory; knowing everything they did is a record of a
   * person's working day, and there is a plausible future where a manager needs
   * the first and should not have the second. Granting them together today is a
   * decision this split leaves reversible.
   */
  StaffActivity: 'staff:activity',
  /** Create a restaurant on the platform. */
  RestaurantCreate: 'restaurant:create',
  /** Platform-wide metrics and reconciliation. */
  PlatformMetrics: 'platform:metrics',
  /** The customer list. */
  PlatformUsers: 'platform:users',
  /** Issue promo coupons. */
  PromoIssue: 'promo:issue',
  /** Manage platform-level staff — the roles that answer to nobody. */
  PlatformStaff: 'platform:staff',
  /** Sign in as another staff account, to see the panel the way they see it. */
  StaffImpersonate: 'staff:impersonate',
  /** Platform settings: fees, deposits, rates. */
  SettingsWrite: 'settings:write',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

/**
 * Which scope an assignment of this role must carry.
 *
 * `platform` roles hold neither a restaurant nor a branch; `restaurant` roles
 * hold a restaurant; `branch` roles hold a single branch (one row per branch, so
 * a manager over two branches has two assignments). The database enforces the
 * same shape with a CHECK constraint — this is the copy the API validates
 * against before it ever gets there.
 */
export const ROLE_SCOPE: Readonly<Record<StaffRole, 'platform' | 'restaurant' | 'branch'>> = {
  [StaffRole.SuperAdmin]: 'platform',
  [StaffRole.PlatformAdmin]: 'platform',
  [StaffRole.RestaurantAdmin]: 'restaurant',
  [StaffRole.RestaurantManager]: 'branch',
  [StaffRole.BranchStaff]: 'branch',
} as const;

/**
 * What a shift can do: work the queue, seat guests, flip a dish sold out, and
 * stop the queue when the kitchen has to. Nothing that outlives the shift —
 * prices, staff and money are somebody else's decision.
 */
const BRANCH_STAFF: readonly Permission[] = [
  Permission.OrdersRead,
  Permission.OrdersAdvance,
  Permission.ReservationsRead,
  Permission.ReservationsAdvance,
  Permission.MenuRead,
  Permission.MenuAvailability,
  Permission.BranchRead,
  Permission.BranchHours,
];

/**
 * A manager runs a branch: everything a shift does, plus the room itself.
 *
 * Deliberately **without** `menu:write`, `staff:*` and `analytics:read` — prices,
 * hiring and revenue belong to whoever owns the business, not to whoever is
 * running the floor tonight. Widening this is one line here if that turns out
 * to be the wrong split for a real restaurant.
 */
const RESTAURANT_MANAGER: readonly Permission[] = [
  ...BRANCH_STAFF,
  Permission.BranchWrite,
  Permission.TablesWrite,
];

/** The business: the manager's reach over every branch, plus what a manager
 *  deliberately cannot touch. */
const RESTAURANT_ADMIN: readonly Permission[] = [
  ...RESTAURANT_MANAGER,
  Permission.MenuWrite,
  Permission.BranchCreate,
  Permission.RestaurantWrite,
  Permission.AnalyticsRead,
  Permission.StaffRead,
  Permission.StaffInvite,
  Permission.StaffRevoke,
  Permission.StaffActivity,
];

/**
 * The platform. Everything a restaurant admin can do, but unscoped — this is
 * the support seat, and support that cannot see the restaurant it is being
 * asked about is not support.
 *
 * Excludes `platform:staff` and `settings:write`: an account that can appoint
 * platform staff can appoint itself anything, and pricing is not a support
 * decision.
 */
const PLATFORM_ADMIN: readonly Permission[] = [
  ...RESTAURANT_ADMIN,
  Permission.RestaurantCreate,
  Permission.PlatformMetrics,
  Permission.PlatformUsers,
  Permission.PromoIssue,
];

/**
 * The seat that answers to nobody.
 *
 * `staff:impersonate` is here and nowhere else, for the same reason
 * `platform:staff` is: signing in as somebody is a way to *use* every permission
 * they hold, so granting it to a role narrower than this one would hand that
 * role everything its own people can do. It is not an escalation for a super
 * admin — they already hold every permission over every scope, so acting as a
 * restaurant admin narrows their reach rather than widening it.
 */
const SUPER_ADMIN: readonly Permission[] = [
  ...PLATFORM_ADMIN,
  Permission.PlatformStaff,
  Permission.StaffImpersonate,
  Permission.SettingsWrite,
];

export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, readonly Permission[]>> = {
  [StaffRole.SuperAdmin]: SUPER_ADMIN,
  [StaffRole.PlatformAdmin]: PLATFORM_ADMIN,
  [StaffRole.RestaurantAdmin]: RESTAURANT_ADMIN,
  [StaffRole.RestaurantManager]: RESTAURANT_MANAGER,
  [StaffRole.BranchStaff]: BRANCH_STAFF,
} as const;

/**
 * One role a staff account holds, and where it applies.
 *
 * The same shape travels in the access token and comes back out of
 * `staff_assignments`, so the API and the panel agree on what "scope" means
 * without either of them reshaping it.
 */
export interface StaffScope {
  role: StaffRole;
  /** Set for `restaurant`-scoped roles, null otherwise. */
  restaurantId: string | null;
  /** Set for `branch`-scoped roles, null otherwise. */
  branchId: string | null;
}

export function permissionsFor(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** True if any role the account holds grants the permission — anywhere. Use
 *  this to decide whether an endpoint is reachable at all; use the scope of the
 *  matching roles to decide *which rows* it may touch. */
export function hasPermission(scopes: readonly StaffScope[], permission: Permission): boolean {
  return scopes.some((scope) => ROLE_PERMISSIONS[scope.role].includes(permission));
}

/** The roles that grant a permission, so a caller can turn them into a scope
 *  filter without re-deriving the map. */
export function scopesGranting(
  scopes: readonly StaffScope[],
  permission: Permission,
): readonly StaffScope[] {
  return scopes.filter((scope) => ROLE_PERMISSIONS[scope.role].includes(permission));
}

/** True when a role's scope columns are shaped the way ROLE_SCOPE demands. The
 *  database enforces this too; failing here first turns a constraint violation
 *  into a validation error with a sentence in it. */
export function isValidScope(scope: StaffScope): boolean {
  switch (ROLE_SCOPE[scope.role]) {
    case 'platform':
      return scope.restaurantId === null && scope.branchId === null;
    case 'restaurant':
      return scope.restaurantId !== null && scope.branchId === null;
    case 'branch':
      return scope.branchId !== null && scope.restaurantId === null;
  }
}
