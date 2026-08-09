import { describe, expect, it } from 'vitest';
import { AuditAction, Language, OrderEventType, OrderStatus, StaffRole } from '@amragrir/shared';
import { createTranslator } from './language';
import {
  NO_ACTIVITY_LINKS,
  headline,
  placeHref,
  subjectHref,
  subjectName,
  type ActivityLinks,
} from './activity';
import type { ActivityEntry } from './api';

/**
 * The sentence the activity panel builds out of one entry.
 *
 * Tested away from the panel because this is where the feed decides what an
 * entry *means* — that a price change is worth spelling out and a rename is
 * not, that flipping a dish sold out is a different act from editing it. The
 * panel around it is a list and a fetch.
 *
 * Every branch here is a row somebody will one day read in a dispute about who
 * changed what, so a wrong sentence is worse than a missing one.
 */
const t = createTranslator(Language.En);

const audit = (over: Partial<Extract<ActivityEntry, { kind: 'audit' }>> = {}): ActivityEntry => ({
  kind: 'audit',
  id: 'audit-1',
  action: AuditAction.MenuItemUpdate,
  entity: 'menu_item',
  entityId: 'item-1',
  before: null,
  after: null,
  where: {
    restaurantId: 'rest-1',
    restaurantName: 'Sunny Table',
    branchId: 'branch-1',
    branchName: 'Northern Ave',
  },
  impersonatedBy: null,
  at: '2026-08-01T10:00:00.000Z',
  ...over,
});

const order = (over: Partial<Extract<ActivityEntry, { kind: 'order' }>> = {}): ActivityEntry => ({
  kind: 'order',
  id: 'event-1',
  type: OrderEventType.StatusChanged,
  fromStatus: OrderStatus.Preparing,
  toStatus: OrderStatus.Ready,
  orderId: 'order-1',
  orderCode: 'A41',
  where: {
    restaurantId: 'rest-1',
    restaurantName: 'Sunny Table',
    branchId: 'branch-1',
    branchName: 'Northern Ave',
  },
  impersonatedBy: null,
  at: '2026-08-01T10:00:00.000Z',
  ...over,
});

const BURGER = { hy: 'Բուրգեր', en: 'Burger' };

describe('menu entries', () => {
  it('spells out a price change in full', () => {
    // The number is what this feed gets opened for. "Edited Burger" hides
    // exactly what somebody came to check.
    const line = headline(
      t,
      audit({
        before: { nameI18n: BURGER, priceAmd: 2400 },
        after: { priceAmd: 2600 },
      }),
      Language.En,
    );

    expect(line).toBe('Changed the price of Burger from 2 400 ֏ to 2 600 ֏');
  });

  it('falls back to a plain edit when the price did not move', () => {
    const line = headline(
      t,
      audit({ before: { nameI18n: BURGER }, after: { prepMin: 15 } }),
      Language.En,
    );

    expect(line).toBe('Edited Burger');
  });

  it('names the dish as it was called at the time', () => {
    // From `before`, not a lookup: the row may be gone, and on a rename the old
    // name is the one that makes the entry make sense.
    const line = headline(
      t,
      audit({
        action: AuditAction.MenuItemDelete,
        before: { nameI18n: { hy: 'Բուրգեր', en: 'Old Burger' } },
      }),
      Language.En,
    );

    expect(line).toBe('Took Old Burger off the menu');
  });

  it('reads a creation out of after, since there was no before', () => {
    const line = headline(
      t,
      audit({ action: AuditAction.MenuItemCreate, after: { nameI18n: BURGER } }),
      Language.En,
    );

    expect(line).toBe('Added Burger to the menu');
  });

  it('tells sold out from back on sale', () => {
    const off = headline(
      t,
      audit({
        action: AuditAction.MenuItemAvailability,
        before: { nameI18n: BURGER, isAvailable: true },
        after: { isAvailable: false },
      }),
      Language.En,
    );
    const on = headline(
      t,
      audit({
        action: AuditAction.MenuItemAvailability,
        before: { nameI18n: BURGER, isAvailable: false },
        after: { isAvailable: true },
      }),
      Language.En,
    );

    expect(off).toBe('Marked Burger sold out');
    expect(on).toBe('Put Burger back on sale');
  });

  it('still says something when the name was never recorded', () => {
    // An entry with no name is worth showing; an entry rendered as "Edited "
    // is not.
    expect(headline(t, audit({ before: {} }), Language.En)).toBe('Edited a dish');
  });

  it('follows the reader language', () => {
    const line = headline(t, audit({ before: { nameI18n: BURGER } }), Language.Hy);
    expect(line).toBe('Edited Բուրգեր');
  });
});

describe('branch entries', () => {
  it('reads opening and closing rather than a field change', () => {
    const opened = headline(
      t,
      audit({ action: AuditAction.BranchStatus, after: { isOpen: true } }),
      Language.En,
    );
    const closed = headline(
      t,
      audit({ action: AuditAction.BranchStatus, after: { isOpen: false } }),
      Language.En,
    );

    expect(opened).toBe('Opened the branch');
    expect(closed).toBe('Closed the branch');
  });

  it('reports a prep estimate that moved on its own', () => {
    const line = headline(
      t,
      audit({ action: AuditAction.BranchStatus, after: { avgPrepMin: 25 } }),
      Language.En,
    );

    expect(line).toBe('Changed the prep estimate to 25 min');
  });

  it('lets the open/closed switch win when both moved', () => {
    // Opening the branch is the event; the estimate that came with it is a
    // detail.
    const line = headline(
      t,
      audit({ action: AuditAction.BranchStatus, after: { isOpen: true, avgPrepMin: 25 } }),
      Language.En,
    );

    expect(line).toBe('Opened the branch');
  });
});

describe('restaurant entries', () => {
  it('says what the restaurant was left offering, in the reader language', () => {
    // What it *became*, not what moved: turning table booking off withdraws the
    // dining room with it, and naming only the switch somebody touched would
    // hide the half a guest would notice.
    const line = headline(
      t,
      audit({
        action: AuditAction.RestaurantServices,
        entity: 'restaurant',
        before: { services: ['pickup', 'dinein', 'reserve'] },
        after: { services: ['pickup'] },
      }),
      Language.En,
    );

    expect(line).toBe('Changed what the restaurant offers: Pre-Order');
  });

  it('reads a restaurant left offering nothing', () => {
    const line = headline(
      t,
      audit({ action: AuditAction.RestaurantServices, entity: 'restaurant', after: { services: [] } }),
      Language.En,
    );

    expect(line).toBe('Changed what the restaurant offers: —');
  });
});

describe('staff entries', () => {
  it('tells an invitation from a role granted outright', () => {
    const invited = headline(
      t,
      audit({
        action: AuditAction.StaffInvite,
        after: { email: 'ann@x.am', role: StaffRole.BranchStaff, granted: false },
      }),
      Language.En,
    );
    const granted = headline(
      t,
      audit({
        action: AuditAction.StaffInvite,
        after: { email: 'ann@x.am', role: StaffRole.BranchStaff, granted: true },
      }),
      Language.En,
    );

    expect(invited).toBe('Invited ann@x.am as Branch staff');
    // Different event: this one sent no "set your password" email.
    expect(granted).toBe('Gave ann@x.am the Branch staff role');
  });

  it('names a revoked role out of before, since the row is gone', () => {
    const line = headline(
      t,
      audit({
        action: AuditAction.StaffAssignmentRevoke,
        before: { role: StaffRole.RestaurantManager, name: 'Ann' },
      }),
      Language.En,
    );

    expect(line).toBe('Removed Restaurant manager from Ann');
  });

  it('falls back to the email when the name was not recorded', () => {
    const line = headline(
      t,
      audit({
        action: AuditAction.StaffAssignmentRevoke,
        before: { role: StaffRole.RestaurantManager, email: 'ann@x.am' },
      }),
      Language.En,
    );

    expect(line).toBe('Removed Restaurant manager from ann@x.am');
  });

  it('shows a role this build does not know rather than an empty gap', () => {
    // The value came out of a JSON column, so a row written by an older build
    // can name a role that no longer exists. `t()` on a missing key renders the
    // key; the raw value is uglier and true.
    const line = headline(
      t,
      audit({
        action: AuditAction.StaffAssignmentRevoke,
        before: { role: 'head_chef', name: 'Ann' },
      }),
      Language.En,
    );

    expect(line).toBe('Removed head_chef from Ann');
  });
});

describe('order entries', () => {
  it('reads as the status it reached', () => {
    expect(headline(t, order(), Language.En)).toBe('Order A41 → Ready');
  });

  it('tells a placement and a payment from a status change', () => {
    expect(headline(t, order({ type: OrderEventType.Created }), Language.En)).toBe(
      'Order A41 placed',
    );
    expect(headline(t, order({ type: OrderEventType.Payment }), Language.En)).toBe(
      'Payment on order A41',
    );
  });
});

/**
 * Where an entry leads.
 *
 * Two halves, `subject · place`, and they lead to different screens — the thing
 * that was acted on, and the branch it belongs to. Both are addresses the panel
 * writes and reads back (`navigation.spec.ts` proves the round trip), so what is
 * pinned here is which address an entry picks, and when it picks none.
 *
 * A link that lands next to the answer is worse than text, so every `null` below
 * is a deliberate answer rather than a gap.
 */
describe('where an entry leads', () => {
  const ALL: ActivityLinks = { menu: true, orders: true, restaurants: true };

  it('sends a dish to its row on the branch it is on', () => {
    expect(subjectHref(audit(), ALL)).toBe('/menu?branch=branch-1&dish=item-1');
  });

  it('sends an order to the board, narrowed to that one order', () => {
    // The whole reason `?order=` exists: the board was addressable by branch
    // only, so this link used to land on a queue with the order somewhere in it.
    expect(subjectHref(order(), ALL)).toBe('/orders?restaurant=rest-1&branch=branch-1&order=A41');
  });

  it('sends the place to the branch, and a restaurant-wide entry to the restaurant', () => {
    expect(placeHref(audit(), ALL)).toBe('/restaurants/rest-1/branches/branch-1');
    expect(
      placeHref(
        audit({
          where: {
            restaurantId: 'rest-1',
            restaurantName: 'Sunny Table',
            branchId: null,
            branchName: null,
          },
        }),
        ALL,
      ),
    ).toBe('/restaurants/rest-1');
  });

  it('leads nowhere from a platform action, which is over no restaurant', () => {
    const platform = audit({
      action: AuditAction.StaffImpersonate,
      entity: 'staff_user',
      where: { restaurantId: null, restaurantName: null, branchId: null, branchName: null },
    });

    expect(placeHref(platform, ALL)).toBeNull();
    expect(subjectHref(platform, ALL)).toBeNull();
  });

  it('leaves the dish that was taken off the menu as text', () => {
    // Soft-deleted, so it is filtered out of every menu read: the link would
    // open the right menu with nothing marked on it, which reads as broken
    // rather than as an answer. The place beside it still goes somewhere.
    const removed = audit({ action: AuditAction.MenuItemDelete });

    expect(subjectHref(removed, ALL)).toBeNull();
    expect(placeHref(removed, ALL)).toBe('/restaurants/rest-1/branches/branch-1');
  });

  it('leads nowhere without a branch to find the dish on', () => {
    // A dish id says nothing about which menu holds it.
    expect(
      subjectHref(
        audit({
          where: {
            restaurantId: 'rest-1',
            restaurantName: 'Sunny Table',
            branchId: null,
            branchName: null,
          },
        }),
        ALL,
      ),
    ).toBeNull();
  });

  it('offers nothing an account cannot open', () => {
    // The default for a caller that says nothing, and what a narrower role would
    // get: every entry reads as the text it was before there were any links.
    expect(subjectHref(audit(), NO_ACTIVITY_LINKS)).toBeNull();
    expect(subjectHref(order(), NO_ACTIVITY_LINKS)).toBeNull();
    expect(placeHref(audit(), NO_ACTIVITY_LINKS)).toBeNull();

    // And one at a time, because they are three separate permissions.
    expect(subjectHref(audit(), { ...ALL, menu: false })).toBeNull();
    expect(subjectHref(order(), { ...ALL, orders: false })).toBeNull();
    expect(placeHref(audit(), { ...ALL, restaurants: false })).toBeNull();
  });
});

describe('what an entry is about, as a word', () => {
  it('is the dish, named as it was at the time', () => {
    expect(subjectName(t, audit({ before: { nameI18n: BURGER } }), Language.En)).toBe('Burger');
    // A creation has no `before` to read it from.
    expect(
      subjectName(
        t,
        audit({ action: AuditAction.MenuItemCreate, after: { nameI18n: BURGER } }),
        Language.En,
      ),
    ).toBe('Burger');
  });

  it('is the order code', () => {
    expect(subjectName(t, order(), Language.En)).toBe('A41');
  });

  it('is nothing for an entry about the place itself', () => {
    // A branch entry's subject *is* the branch the place names, and printing it
    // on both sides of the dot would be the same word twice. The staff and
    // booking entries have no screen of their own to name.
    expect(subjectName(t, audit({ entity: 'branch', action: AuditAction.BranchStatus }), Language.En)).toBeNull();
    expect(
      subjectName(t, audit({ entity: 'staff_invite', action: AuditAction.StaffInvite }), Language.En),
    ).toBeNull();
  });
});

describe('an action this build has no sentence for', () => {
  it('shows the raw verb rather than disappearing', () => {
    // A panel deployed behind the API. An entry that silently vanishes from an
    // audit trail is worse than an ugly one.
    const line = headline(
      t,
      audit({ action: 'coupon.issue' as AuditAction }),
      Language.En,
    );

    expect(line).toBe('coupon.issue');
  });
});
