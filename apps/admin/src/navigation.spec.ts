import { describe, expect, it } from 'vitest';
import { Permission, ROLE_PERMISSIONS, StaffRole } from '@amragrir/shared';
import { TABS, parseRoute, routePath, tabPath, visibleTabs, type Route } from './navigation';

/**
 * What the address bar means.
 *
 * These are the panel's URLs, which are now the thing people bookmark and send
 * each other — so the pair below has to be exact in both directions: a link the
 * panel writes must be a link the panel can read back, and an address nobody
 * planned for has to say so rather than half-render a screen.
 */
describe('every screen has an address', () => {
  it('gives each tab a distinct path', () => {
    const paths = TABS.map((tab) => tab.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('reads a screen back out of its own path', () => {
    for (const tab of TABS) {
      expect(parseRoute(tabPath(tab.name))).toEqual({
        tab: tab.name,
        open: null,
        scope: null,
        menu: null,
        book: null,
        person: null,
      });
    }
  });

  it('is stable through a round trip, with a restaurant open or a queue scoped', () => {
    const routes: Route[] = [
      { tab: 'Orders', open: null, scope: null, menu: null, book: null, person: null },
      {
        tab: 'Orders',
        open: null,
        scope: { restaurantId: 'r1', branchId: 'b2', orderCode: null },
        menu: null,
        book: null,
        person: null,
      },
      {
        tab: 'Orders',
        open: null,
        scope: { restaurantId: 'r1', branchId: null, orderCode: null },
        menu: null,
        book: null,
        person: null,
      },
      // The picker's own leftover: widening back out to "all restaurants" while
      // a branch is still chosen. A real board state, so a real address.
      {
        tab: 'Orders',
        open: null,
        scope: { restaurantId: null, branchId: 'b2', orderCode: null },
        menu: null,
        book: null,
        person: null,
      },
      // One order, which is what a line in somebody's activity links to. Both
      // states are real: with the branch, as the feed writes it, and without,
      // which is what the address means on its own — find this order wherever
      // in reach it is.
      {
        tab: 'Orders',
        open: null,
        scope: { restaurantId: 'r1', branchId: 'b2', orderCode: 'ORD-7QK3' },
        menu: null,
        book: null,
        person: null,
      },
      {
        tab: 'Orders',
        open: null,
        scope: { restaurantId: null, branchId: null, orderCode: 'ORD-7QK3' },
        menu: null,
        book: null,
        person: null,
      },
      { tab: 'Restaurants', open: null, scope: null, menu: null, book: null, person: null },
      // A branch's menu, and one dish on it — what a line of an order on the
      // board links to. Both states are real: the dish is where the link lands,
      // the bare branch is what the picker leaves once somebody moves off it.
      { tab: 'Menu', open: null, scope: null, menu: null, book: null, person: null },
      {
        tab: 'Menu',
        open: null,
        scope: null,
        menu: { branchId: 'b2', itemId: null },
        book: null,
        person: null,
      },
      {
        tab: 'Menu',
        open: null,
        scope: null,
        menu: { branchId: 'b2', itemId: 'dish-1' },
        book: null,
        person: null,
      },
      // The two lists of people, pointed at one of them and not — what a name
      // in an order's history links to.
      { tab: 'People', open: null, scope: null, menu: null, book: null, person: null },
      { tab: 'People', open: null, scope: null, menu: null, book: null, person: 'staff-1' },
      { tab: 'Customers', open: null, scope: null, menu: null, book: null, person: 'user-1' },
      {
        tab: 'Restaurants',
        open: { restaurantId: 'r1', branchId: null, assignmentId: null },
        scope: null,
        menu: null,
        book: null,
        person: null,
      },
      {
        tab: 'Restaurants',
        open: { restaurantId: 'r1', branchId: 'b2', assignmentId: null },
        scope: null,
        menu: null,
        book: null,
        person: null,
      },
      {
        tab: 'Restaurants',
        open: { restaurantId: 'r1', branchId: 'b2', assignmentId: 'a3' },
        scope: null,
        menu: null,
        book: null,
        person: null,
      },
      {
        tab: 'Restaurants',
        open: { restaurantId: 'r1', branchId: null, assignmentId: 'a3' },
        scope: null,
        menu: null,
        book: null,
        person: null,
      },
    ];

    for (const route of routes) {
      const href = routePath(route);
      const cut = href.indexOf('?');
      const parsed =
        cut === -1 ? parseRoute(href) : parseRoute(href.slice(0, cut), href.slice(cut));
      expect(parsed, href).toEqual(route);
    }
  });

  it('writes the addresses that get pasted into messages', () => {
    // Spelled out rather than derived, because these are what people will have
    // in their history and their bookmarks: changing one is a decision, not a
    // refactor, and this is the test that makes it look like one.
    expect(routePath({ tab: 'Orders' })).toBe('/orders');
    expect(
      routePath({ tab: 'Orders', scope: { restaurantId: 'r1', branchId: 'b2', orderCode: null } }),
    ).toBe('/orders?restaurant=r1&branch=b2');
    expect(
      routePath({
        tab: 'Orders',
        scope: { restaurantId: 'r1', branchId: 'b2', orderCode: 'ORD-7QK3' },
      }),
    ).toBe('/orders?restaurant=r1&branch=b2&order=ORD-7QK3');
    expect(
      routePath({
        tab: 'Restaurants',
        open: { restaurantId: 'r1', branchId: 'b2', assignmentId: 'a3' },
      }),
    ).toBe('/restaurants/r1/branches/b2?role=a3');
    expect(routePath({ tab: 'Menu', menu: { branchId: 'b2', itemId: null } })).toBe(
      '/menu?branch=b2',
    );
    expect(routePath({ tab: 'Menu', menu: { branchId: 'b2', itemId: 'dish-1' } })).toBe(
      '/menu?branch=b2&dish=dish-1',
    );
    expect(routePath({ tab: 'People', person: 'staff-1' })).toBe('/people?person=staff-1');
    expect(routePath({ tab: 'Customers', person: 'user-1' })).toBe('/customers?person=user-1');
    // "Look at Saturday at Northern Ave" — a sentence somebody would otherwise
    // have to re-enter by hand at the other end.
    expect(routePath({ tab: 'Bookings', book: { branchId: 'b2', date: '2026-09-05' } })).toBe(
      '/bookings?branch=b2&date=2026-09-05',
    );
    expect(routePath({ tab: 'Bookings', book: { branchId: 'b2', date: null } })).toBe(
      '/bookings?branch=b2',
    );
  });

  it('reads the book back out of its own address', () => {
    const parsed = parseRoute('/bookings', '?branch=b2&date=2026-09-05');
    expect(parsed?.book).toEqual({ branchId: 'b2', date: '2026-09-05' });

    // Neither half named is the bare screen: every branch in reach, today —
    // and that has to keep meaning today tomorrow, so it is not written out.
    expect(parseRoute('/bookings')?.book).toBeNull();

    // A key somebody half-deleted is not a branch whose id is the empty string.
    expect(parseRoute('/bookings', '?branch=')?.book).toBeNull();
  });

  it('ignores a person on a screen that is not a list of people', () => {
    expect(routePath({ tab: 'Orders', person: 'staff-1' })).toBe('/orders');
    expect(routePath({ tab: 'Restaurants', person: 'staff-1' })).toBe('/restaurants');
  });

  it('ignores an open restaurant on a screen that has no restaurants in it', () => {
    expect(
      routePath({
        tab: 'Orders',
        open: { restaurantId: 'r1', branchId: null, assignmentId: null },
      }),
    ).toBe('/orders');
  });

  it('ignores a queue scope on a screen that has no queue in it', () => {
    expect(
      routePath({
        tab: 'Restaurants',
        scope: { restaurantId: 'r1', branchId: 'b2', orderCode: 'ORD-7QK3' },
      }),
    ).toBe('/restaurants');
  });

  it('ignores a dish on a screen that is not a menu', () => {
    expect(routePath({ tab: 'Orders', menu: { branchId: 'b2', itemId: 'dish-1' } })).toBe(
      '/orders',
    );
  });

  it('writes a scope with nothing in it as the plain board', () => {
    // The one place the round trip normalises rather than preserves: "all
    // restaurants, all branches" is not a narrowing, so it is not in the
    // address either, and it reads back as no scope at all.
    expect(
      routePath({ tab: 'Orders', scope: { restaurantId: null, branchId: null, orderCode: null } }),
    ).toBe('/orders');
    expect(parseRoute('/orders')).toEqual({
      tab: 'Orders',
      open: null,
      scope: null,
      menu: null,
      book: null,
      person: null,
    });
  });

  it('drops an `?order=` somebody half-deleted rather than searching for nothing', () => {
    // The same rule the other two halves of the scope follow: an empty value is
    // a key somebody trimmed out of the address, not an order whose code is the
    // empty string — and searching the board for "" would empty it.
    expect(parseRoute('/orders', '?order=')?.scope).toBeNull();
    expect(parseRoute('/orders', '?branch=b2&order=')?.scope).toEqual({
      restaurantId: null,
      branchId: 'b2',
      orderCode: null,
    });
  });

  it('drops a dish that names no menu to find it on', () => {
    // A dish id says nothing about which branch's menu holds it, so `?dish=`
    // alone is not half an address — it is none, and the screen falls back to
    // the menu it would have picked for itself.
    expect(parseRoute('/menu', '?dish=dish-1')?.menu).toBeNull();
    expect(parseRoute('/menu', '?branch=&dish=dish-1')?.menu).toBeNull();
  });

  it('drops a `?person=` somebody half-deleted rather than filtering by nothing', () => {
    expect(parseRoute('/people', '?person=')?.person).toBeNull();
  });

  it('carries an id that needs encoding, both ways', () => {
    const open = { restaurantId: 'a/b', branchId: 'c d', assignmentId: null };
    const href = routePath({ tab: 'Restaurants', open });
    expect(href).toBe('/restaurants/a%2Fb/branches/c%20d');
    expect(parseRoute(href)).toEqual({
      tab: 'Restaurants',
      open,
      scope: null,
      menu: null,
      book: null,
      person: null,
    });

    // The board's scope is a query, so it is encoded as one — `+` for a space
    // is what `URLSearchParams` writes and what it reads back.
    const scope = { restaurantId: 'a/b', branchId: 'c d', orderCode: null };
    const board = routePath({ tab: 'Orders', scope });
    expect(board).toBe('/orders?restaurant=a%2Fb&branch=c+d');
    expect(parseRoute('/orders', board.slice(board.indexOf('?')))).toEqual({
      tab: 'Orders',
      open: null,
      scope,
      menu: null,
      book: null,
      person: null,
    });
  });
});

describe('an address that means nothing', () => {
  // All of these fall back to the first screen the account can open. Saying so
  // here rather than guessing is what keeps a typo from rendering a screen with
  // half its state missing.
  it('is null for the bare root, which is where a fresh arrival lands', () => {
    expect(parseRoute('/')).toBeNull();
    expect(parseRoute('')).toBeNull();
  });

  it('is null for a path no screen claims', () => {
    expect(parseRoute('/restarants')).toBeNull();
    expect(parseRoute('/orders/42')).toBeNull();
  });

  it('is null for a half-written restaurant address', () => {
    expect(parseRoute('/restaurants/r1/branches')).toBeNull();
    expect(parseRoute('/restaurants/r1/staff/b2')).toBeNull();
  });

  it('is null for an address that cannot even be decoded', () => {
    // A stray percent sign, which `decodeURIComponent` throws on. An address
    // that cannot be read is an address that means nothing — not a crash.
    expect(parseRoute('/restaurants/%E0%A4%A')).toBeNull();
  });

  it('survives a trailing slash', () => {
    expect(parseRoute('/orders/')).toEqual({
      tab: 'Orders',
      open: null,
      scope: null,
      menu: null,
      book: null,
      person: null,
    });
    expect(parseRoute('/restaurants/r1/')).toEqual({
      tab: 'Restaurants',
      open: { restaurantId: 'r1', branchId: null, assignmentId: null },
      scope: null,
      menu: null,
      book: null,
      person: null,
    });
  });

  it('drops a role that is not there rather than carrying an empty one', () => {
    expect(parseRoute('/restaurants/r1', '?role=')).toEqual({
      tab: 'Restaurants',
      open: { restaurantId: 'r1', branchId: null, assignmentId: null },
      scope: null,
      menu: null,
      book: null,
      person: null,
    });
  });

  it('drops a half-deleted scope rather than narrowing to an empty id', () => {
    expect(parseRoute('/orders', '?restaurant=&branch=')).toEqual({
      tab: 'Orders',
      open: null,
      scope: null,
      menu: null,
      book: null,
      person: null,
    });
  });

  it('leaves a query alone on a screen that has no query of its own', () => {
    // Not an address anybody mistyped — a tracking parameter, or whatever the
    // link was pasted through. The screen renders; the query means nothing.
    expect(parseRoute('/people', '?restaurant=r1')).toEqual({
      tab: 'People',
      open: null,
      scope: null,
      menu: null,
      book: null,
      person: null,
    });
  });
});

describe('an address this account may not open', () => {
  const permissionsOf = (...roles: StaffRole[]): Permission[] => [
    ...new Set(roles.flatMap((role) => [...ROLE_PERMISSIONS[role]])),
  ];

  it('is a screen a shift account does not have', () => {
    // The shell redirects to the first visible tab; what this pins is the fact
    // the shell reads — that `/platform` parses fine and is simply not theirs,
    // which is why the parser is not where permissions are decided.
    const route = parseRoute('/platform');
    expect(route).not.toBeNull();
    expect(visibleTabs(permissionsOf(StaffRole.BranchStaff))).not.toContain(route?.tab);
  });

  it('lands somewhere real for every role there is', () => {
    // Nobody who can sign in at all should be redirected to nowhere: every role
    // has a first screen, and `tabPath` has to be able to name it.
    for (const role of Object.values(StaffRole)) {
      const first = visibleTabs(permissionsOf(role))[0];
      expect(first, role).toBeDefined();
      expect(parseRoute(tabPath(first as never))).toEqual({
        tab: first,
        open: null,
        scope: null,
        menu: null,
        book: null,
        person: null,
      });
    }
  });
});
