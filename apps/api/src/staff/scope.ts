import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ROLE_SCOPE, scopesGranting, type Permission, type StaffScope } from '@amragrir/shared';

/**
 * Turns "who is calling" into "which rows may they touch".
 *
 * The one definition of reach for the back office, and the successor to
 * `owner/branch-access.ts`. Two things changed with the staff split:
 *
 * 1. Reach is per **permission**, not per role. A manager may advance orders in
 *    their branch and read nothing at all in the restaurant's other branches;
 *    asking "which branches can this account see" without saying what for would
 *    have no single answer.
 * 2. An account holds several roles at once, so reach is the union of the roles
 *    that grant the permission — and *only* those. Building a filter from every
 *    role held would widen a manager into an admin the moment they were also
 *    given a shift somewhere.
 *
 * Still returned as a Prisma filter rather than a boolean, for the same reason
 * as before: ownership belongs in the query, so there is no code path that
 * loads someone else's row and then decides. A row outside the caller's reach
 * comes back as 404 rather than 403 — a 403 would confirm it exists.
 */
export interface Reach {
  /** True for platform roles: every row, no filter. */
  all: boolean;
  /** Restaurants reachable in full (every branch of them). */
  restaurantIds: string[];
  /** Individual branches reachable. */
  branchIds: string[];
}

export function reachFor(scopes: readonly StaffScope[], permission: Permission): Reach {
  const granting = scopesGranting(scopes, permission);

  if (granting.length === 0) {
    // The guard refuses this first; reaching here means an endpoint asked for a
    // filter it never checked the permission for. Refusing is the safe answer.
    throw new ForbiddenException('Insufficient permissions');
  }

  const restaurantIds = new Set<string>();
  const branchIds = new Set<string>();

  for (const scope of granting) {
    if (ROLE_SCOPE[scope.role] === 'platform') {
      return { all: true, restaurantIds: [], branchIds: [] };
    }
    if (scope.restaurantId) {
      restaurantIds.add(scope.restaurantId);
    }
    if (scope.branchId) {
      branchIds.add(scope.branchId);
    }
  }

  return { all: false, restaurantIds: [...restaurantIds], branchIds: [...branchIds] };
}

/**
 * Branches the caller may act on for this permission.
 *
 * An empty `in` list matches nothing, which is exactly right for an account
 * that holds only restaurant-scoped roles (or only branch-scoped ones) — the
 * unused half of the OR simply never matches.
 */
export function branchScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): Prisma.RestaurantBranchWhereInput {
  const reach = reachFor(scopes, permission);
  if (reach.all) {
    return {};
  }
  return {
    OR: [{ restaurantId: { in: reach.restaurantIds } }, { id: { in: reach.branchIds } }],
  };
}

/** The same reach expressed against anything that hangs off a branch — orders,
 *  reservations, menu items and tables all share this shape. */
export function branchChildScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): { branchId?: { in: string[] }; OR?: unknown[] } & Record<string, unknown> {
  const reach = reachFor(scopes, permission);
  if (reach.all) {
    return {};
  }
  return {
    OR: [
      { branch: { restaurantId: { in: reach.restaurantIds } } },
      { branchId: { in: reach.branchIds } },
    ],
  };
}

export function orderScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): Prisma.OrderWhereInput {
  return branchChildScope(scopes, permission) as Prisma.OrderWhereInput;
}

export function reservationScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): Prisma.ReservationWhereInput {
  return branchChildScope(scopes, permission) as Prisma.ReservationWhereInput;
}

/**
 * Branch notifications the caller may read.
 *
 * Scoped on `orders:read` at the call site rather than on a permission of its
 * own: the only notification that exists is a reminder about an order, and
 * anyone who can watch the board it belongs to can be told about it. A separate
 * permission would be one nobody could hold without also holding this one.
 */
export function notificationScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): Prisma.StaffNotificationWhereInput {
  return branchChildScope(scopes, permission) as Prisma.StaffNotificationWhereInput;
}

export function menuScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): Prisma.MenuItemWhereInput {
  return branchChildScope(scopes, permission) as Prisma.MenuItemWhereInput;
}

/** Restaurants the caller may act on — for restaurant-level settings and for
 *  deciding where a new branch may be created. */
export function restaurantScope(
  scopes: readonly StaffScope[],
  permission: Permission,
): Prisma.RestaurantWhereInput {
  const reach = reachFor(scopes, permission);
  if (reach.all) {
    return {};
  }
  return {
    OR: [
      { id: { in: reach.restaurantIds } },
      // A branch-scoped role reaches its own restaurant only through that
      // branch, never the restaurant as a whole.
      { branches: { some: { id: { in: reach.branchIds } } } },
    ],
  };
}
