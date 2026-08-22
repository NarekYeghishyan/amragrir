import { describe, expect, it } from 'vitest';
import { Permission, ROLE_PERMISSIONS, StaffRole } from '@amragrir/shared';
import { activeTab, targetOf, visibleTabs } from './navigation';
import { modeFromUrl } from './screens/SignIn';
import { mayActAs } from './acting';

const permissionsOf = (...roles: StaffRole[]): Permission[] => [
  ...new Set(roles.flatMap((role) => [...ROLE_PERMISSIONS[role]])),
];

describe('which tabs an account sees', () => {
  it('gives a shift the queue, the book and the menu, and nothing about people or money', () => {
    // The book is a shift's screen: `reservations:read` is what opens it, and
    // seating people is the job somebody on the floor does all evening.
    const tabs = visibleTabs(permissionsOf(StaffRole.BranchStaff));
    expect(tabs).toEqual(['Orders', 'Bookings', 'Menu', 'Restaurants']);
  });

  it('adds People for a restaurant admin', () => {
    const tabs = visibleTabs(permissionsOf(StaffRole.RestaurantAdmin));
    expect(tabs).toContain('People');
    expect(tabs).not.toContain('Dashboard');
    expect(tabs).not.toContain('Platform');
  });

  it('gives a super admin everything', () => {
    expect(visibleTabs(permissionsOf(StaffRole.SuperAdmin))).toEqual([
      'Orders',
      'Bookings',
      'Menu',
      'Restaurants',
      'People',
      'Dashboard',
      'Customers',
      // `categories:write` is held by this role and no other, so this is the
      // one tab that separates a super admin from a platform admin in the
      // sidebar rather than only inside a screen.
      'Categories',
      'Platform',
    ]);
  });

  it('hides Categories from a platform admin', () => {
    // Support work, which this role is for, does not include changing what the
    // whole catalogue is indexed by. Absent rather than present-and-refusing.
    const tabs = visibleTabs(permissionsOf(StaffRole.PlatformAdmin));
    expect(tabs).toContain('Customers');
    expect(tabs).not.toContain('Categories');
  });

  it('shows nothing to an account holding no roles', () => {
    expect(visibleTabs([])).toEqual([]);
  });
});

describe('the active tab', () => {
  it('keeps the chosen tab while it is still visible', () => {
    expect(activeTab('Menu', ['Orders', 'Menu'])).toBe('Menu');
  });

  it('falls back when the roles changed under a stored tab', () => {
    // A revoked role would otherwise leave the panel on a screen where every
    // request 403s.
    expect(activeTab('Platform', ['Orders', 'Menu'])).toBe('Orders');
  });

  it('is null when nothing is visible', () => {
    expect(activeTab('Orders', [])).toBeNull();
  });
});

describe('who a super admin is offered a way into', () => {
  const person = (over: Partial<{ id: string; isActive: boolean; holdsARole: boolean }> = {}) => ({
    id: 'staff-2',
    isActive: true,
    holdsARole: true,
    ...over,
  });
  // The same shape both screens pass: the directory counts a person's roles,
  // a team row is one and so answers `holdsARole` by construction.
  const asSuperAdmin = { selfId: 'super-1', begin: () => undefined };

  it('offers the door to somebody else who works here', () => {
    expect(mayActAs(person(), asSuperAdmin)).toBe(true);
  });

  it('withholds it from anyone without staff:impersonate', () => {
    // Null is that case — every role but super_admin, and a super admin already
    // acting as somebody, because impersonation does not chain.
    expect(mayActAs(person(), null)).toBe(false);
  });

  it('withholds it from your own card', () => {
    expect(mayActAs(person({ id: 'super-1' }), asSuperAdmin)).toBe(false);
  });

  it('withholds it from a deactivated account', () => {
    // The same refusal their own password would get.
    expect(mayActAs(person({ isActive: false }), asSuperAdmin)).toBe(false);
  });

  it('withholds it from an account holding no roles', () => {
    // A token over no roles is a panel where every screen 403s.
    expect(mayActAs(person({ holdsARole: false }), asSuperAdmin)).toBe(false);
  });
});

describe('going from a role to the place it is held', () => {
  it('opens a branch role on its branch', () => {
    // The branch is what was clicked. Landing on the restaurant with every
    // branch closed means finding it again in a chain of forty.
    expect(targetOf({ id: 'a1', restaurantId: 'r1', branchId: 'b1' })).toEqual({
      restaurantId: 'r1',
      branchId: 'b1',
      assignmentId: 'a1',
    });
  });

  it('opens a restaurant role on the restaurant, with nothing disclosed', () => {
    expect(targetOf({ id: 'a1', restaurantId: 'r1', branchId: null })).toEqual({
      restaurantId: 'r1',
      branchId: null,
      assignmentId: 'a1',
    });
  });

  it('carries the role itself, not the person holding it', () => {
    // What gets marked on the other screen is one row of a team, and a team is
    // rows of assignments: somebody managing two branches is in two of them,
    // and only the one that was clicked is the answer.
    const target = targetOf({ id: 'assignment-2', restaurantId: 'r1', branchId: 'b2' });
    expect(target?.assignmentId).toBe('assignment-2');
  });

  it('has nowhere to send a platform role', () => {
    // Over no restaurant, so there is no restaurant page it is about — the
    // People screen leaves that row as text.
    expect(targetOf({ id: 'a1', restaurantId: null, branchId: null })).toBeNull();
  });
});

describe('links from an email', () => {
  it('opens the invite screen with its token', () => {
    expect(modeFromUrl('/accept-invite', '?token=abc123')).toEqual({
      mode: 'accept',
      token: 'abc123',
    });
  });

  it('opens the reset screen with its token', () => {
    expect(modeFromUrl('/reset-password', '?token=xyz')).toEqual({ mode: 'reset', token: 'xyz' });
  });

  it('falls back to sign-in when the token is missing', () => {
    // A "set your password" screen with no token cannot work; the sign-in form
    // is the honest thing to show.
    expect(modeFromUrl('/accept-invite', '')).toEqual({ mode: 'signin', token: '' });
  });

  it('ignores a token on a path that means nothing', () => {
    expect(modeFromUrl('/', '?token=abc')).toEqual({ mode: 'signin', token: '' });
  });
});
