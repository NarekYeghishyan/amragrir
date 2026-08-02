import { ForbiddenException } from '@nestjs/common';
import { Permission, StaffRole, type StaffScope } from '@amragrir/shared';
import { branchScope, menuScope, orderScope, reachFor, restaurantScope } from './scope';

const platform: StaffScope = {
  role: StaffRole.PlatformAdmin,
  restaurantId: null,
  branchId: null,
};
const restaurantAdmin = (id: string): StaffScope => ({
  role: StaffRole.RestaurantAdmin,
  restaurantId: id,
  branchId: null,
});
const manager = (branchId: string): StaffScope => ({
  role: StaffRole.RestaurantManager,
  restaurantId: null,
  branchId,
});
const shift = (branchId: string): StaffScope => ({
  role: StaffRole.BranchStaff,
  restaurantId: null,
  branchId,
});

describe('reachFor', () => {
  it('gives a platform role everything', () => {
    expect(reachFor([platform], Permission.OrdersRead)).toEqual({
      all: true,
      restaurantIds: [],
      branchIds: [],
    });
  });

  it('collects every restaurant and branch a role grants', () => {
    const reach = reachFor(
      [restaurantAdmin('rest-1'), restaurantAdmin('rest-2'), manager('branch-9')],
      Permission.OrdersRead,
    );
    expect(reach.all).toBe(false);
    expect(reach.restaurantIds.sort()).toEqual(['rest-1', 'rest-2']);
    expect(reach.branchIds).toEqual(['branch-9']);
  });

  it('counts only the roles that grant the permission', () => {
    // The heart of it: this account runs one restaurant and works a shift in
    // somebody else's. Editing the menu must reach the first and not the
    // second — a filter built from every role held would hand them both.
    const scopes = [restaurantAdmin('rest-1'), shift('branch-elsewhere')];

    const menu = reachFor(scopes, Permission.MenuWrite);
    expect(menu.restaurantIds).toEqual(['rest-1']);
    expect(menu.branchIds).toEqual([]);

    // Reading the queue is granted by both, so both count.
    const orders = reachFor(scopes, Permission.OrdersRead);
    expect(orders.restaurantIds).toEqual(['rest-1']);
    expect(orders.branchIds).toEqual(['branch-elsewhere']);
  });

  it('refuses when no role grants it', () => {
    // The guard refuses first; this is the backstop for an endpoint that asked
    // for a filter without checking the permission.
    expect(() => reachFor([shift('branch-1')], Permission.MenuWrite)).toThrow(ForbiddenException);
    expect(() => reachFor([], Permission.OrdersRead)).toThrow(ForbiddenException);
  });

  it('does not let a platform role held for one thing widen another', () => {
    // platform_admin grants menu:write but not platform:staff. Asking for the
    // reach of platform:staff must refuse rather than return "everything".
    expect(() => reachFor([platform], Permission.PlatformStaff)).toThrow(ForbiddenException);
  });
});

describe('filters', () => {
  it('is an empty filter for a platform role — no WHERE at all', () => {
    expect(branchScope([platform], Permission.BranchRead)).toEqual({});
    expect(orderScope([platform], Permission.OrdersRead)).toEqual({});
    expect(menuScope([platform], Permission.MenuWrite)).toEqual({});
  });

  it('matches a restaurant admin by restaurant, and a manager by branch', () => {
    expect(branchScope([restaurantAdmin('rest-1'), manager('branch-9')], Permission.BranchRead))
      .toEqual({
        OR: [{ restaurantId: { in: ['rest-1'] } }, { id: { in: ['branch-9'] } }],
      });
  });

  it('reaches children of a branch through either half', () => {
    expect(orderScope([restaurantAdmin('rest-1'), shift('branch-9')], Permission.OrdersRead)).toEqual(
      {
        OR: [
          { branch: { restaurantId: { in: ['rest-1'] } } },
          { branchId: { in: ['branch-9'] } },
        ],
      },
    );
  });

  it('matches nothing on the unused half rather than everything', () => {
    // An empty `in` list is the point: an account with only branch roles must
    // not accidentally match every restaurant.
    const filter = orderScope([shift('branch-9')], Permission.OrdersRead) as {
      OR: Array<Record<string, unknown>>;
    };
    expect(filter.OR[0]).toEqual({ branch: { restaurantId: { in: [] } } });
    expect(filter.OR[1]).toEqual({ branchId: { in: ['branch-9'] } });
  });

  it('reaches a restaurant through a branch role only via that branch', () => {
    // A manager of one branch does not thereby manage the restaurant.
    expect(restaurantScope([manager('branch-9')], Permission.BranchRead)).toEqual({
      OR: [{ id: { in: [] } }, { branches: { some: { id: { in: ['branch-9'] } } } }],
    });
  });
});
