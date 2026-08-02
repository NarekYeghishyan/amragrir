import { StaffRole as PrismaStaffRole } from '@prisma/client';
import {
  Permission,
  ROLE_PERMISSIONS,
  ROLE_SCOPE,
  StaffRole,
  type StaffScope,
  hasPermission,
  isValidScope,
  permissionsFor,
  scopesGranting,
} from '@amragrir/shared';

const scope = (role: StaffRole, over: Partial<StaffScope> = {}): StaffScope => ({
  role,
  restaurantId: null,
  branchId: null,
  ...over,
});

describe('staff roles', () => {
  it('matches the Prisma enum byte for byte', () => {
    // A drift here means a role the API grants cannot be written to the column.
    expect(Object.values(StaffRole).sort()).toEqual(Object.values(PrismaStaffRole).sort());
  });

  it('gives every role a scope', () => {
    for (const role of Object.values(StaffRole)) {
      expect(ROLE_SCOPE[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe('the permission ladder', () => {
  it('widens at every step', () => {
    // Each role is a superset of the narrower one. This is the property the
    // map is built on; a hole in it would mean a manager who cannot do
    // something their own staff can.
    const ladder = [
      StaffRole.BranchStaff,
      StaffRole.RestaurantManager,
      StaffRole.RestaurantAdmin,
      StaffRole.PlatformAdmin,
      StaffRole.SuperAdmin,
    ];

    for (let i = 1; i < ladder.length; i += 1) {
      const narrower = permissionsFor(ladder[i - 1]);
      const wider = permissionsFor(ladder[i]);
      expect(wider).toEqual(expect.arrayContaining([...narrower]));
      expect(wider.length).toBeGreaterThan(narrower.length);
    }
  });

  it('keeps prices, hiring and revenue away from a shift', () => {
    // ROLES_AND_PERMISSIONS.md §3: a shift may flip a dish sold out but not
    // edit the menu, and never sees money.
    const staff = permissionsFor(StaffRole.BranchStaff);
    expect(staff).toContain(Permission.MenuAvailability);
    expect(staff).not.toContain(Permission.MenuWrite);
    expect(staff).not.toContain(Permission.StaffInvite);
    expect(staff).not.toContain(Permission.AnalyticsRead);
  });

  it('stops a manager short of the business', () => {
    const manager = permissionsFor(StaffRole.RestaurantManager);
    expect(manager).toContain(Permission.TablesWrite);
    expect(manager).not.toContain(Permission.MenuWrite);
    expect(manager).not.toContain(Permission.StaffInvite);
    expect(manager).not.toContain(Permission.BranchCreate);
  });

  it('lets only a super admin appoint platform staff or move pricing', () => {
    // An account that can appoint platform staff can appoint itself anything.
    expect(permissionsFor(StaffRole.PlatformAdmin)).not.toContain(Permission.PlatformStaff);
    expect(permissionsFor(StaffRole.PlatformAdmin)).not.toContain(Permission.SettingsWrite);
    expect(permissionsFor(StaffRole.SuperAdmin)).toContain(Permission.PlatformStaff);
    expect(permissionsFor(StaffRole.SuperAdmin)).toContain(Permission.SettingsWrite);
  });

  it('keeps restaurant roles off the platform', () => {
    const admin = permissionsFor(StaffRole.RestaurantAdmin);
    expect(admin).not.toContain(Permission.RestaurantCreate);
    expect(admin).not.toContain(Permission.PlatformUsers);
    expect(admin).not.toContain(Permission.PromoIssue);
  });
});

describe('hasPermission', () => {
  it('is true when any held role grants it', () => {
    const scopes = [
      scope(StaffRole.BranchStaff, { branchId: 'branch-1' }),
      scope(StaffRole.RestaurantAdmin, { restaurantId: 'rest-1' }),
    ];
    expect(hasPermission(scopes, Permission.MenuWrite)).toBe(true);
  });

  it('is false for an account holding nothing', () => {
    expect(hasPermission([], Permission.OrdersRead)).toBe(false);
  });

  it('returns only the roles that grant it, so a caller can scope from them', () => {
    // The branch_staff row grants orders:read but not menu:write — building a
    // filter from every held role would widen a manager into an admin.
    const scopes = [
      scope(StaffRole.BranchStaff, { branchId: 'branch-1' }),
      scope(StaffRole.RestaurantAdmin, { restaurantId: 'rest-1' }),
    ];
    expect(scopesGranting(scopes, Permission.MenuWrite)).toEqual([scopes[1]]);
    expect(scopesGranting(scopes, Permission.OrdersRead)).toHaveLength(2);
  });
});

describe('isValidScope', () => {
  it('accepts the shape each role requires', () => {
    expect(isValidScope(scope(StaffRole.SuperAdmin))).toBe(true);
    expect(isValidScope(scope(StaffRole.RestaurantAdmin, { restaurantId: 'r' }))).toBe(true);
    expect(isValidScope(scope(StaffRole.BranchStaff, { branchId: 'b' }))).toBe(true);
  });

  it('refuses a role scoped to nothing', () => {
    // Mirrors staff_assignments_scope_check: a branch role with no branch would
    // be scoped to nothing, and the filter reading it would have to guess.
    expect(isValidScope(scope(StaffRole.BranchStaff))).toBe(false);
    expect(isValidScope(scope(StaffRole.RestaurantAdmin))).toBe(false);
  });

  it('refuses a platform role carrying a scope', () => {
    expect(isValidScope(scope(StaffRole.SuperAdmin, { restaurantId: 'r' }))).toBe(false);
  });

  it('refuses a branch role that also names a restaurant', () => {
    // Two columns that can disagree about which restaurant this is.
    expect(isValidScope(scope(StaffRole.BranchStaff, { branchId: 'b', restaurantId: 'r' }))).toBe(
      false,
    );
  });
});
