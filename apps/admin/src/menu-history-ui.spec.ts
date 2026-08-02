import { describe, expect, it } from 'vitest';
import { AuditAction, Language } from '@amragrir/shared';
import { createTranslator } from './language';
import { actorHref, changesOf, formatValue, headline, impersonatorHref } from './menu-history';
import type { MenuHistoryEntry } from './api';

/**
 * What a dish's history dialog makes of one recorded entry.
 *
 * Tested away from the dialog because this is where the panel decides what an
 * entry *means*: which of `before`/`after` is the diff, that a price change is
 * worth naming and a rename is not, that a uuid is not something to show a
 * person. The dialog around it is a list and a fetch.
 *
 * Every case here is a line somebody will one day read in an argument about who
 * changed a price, so a wrong one is worse than a missing one.
 */
const t = createTranslator(Language.En);

const BURGER = { hy: 'Բուրգեր', en: 'Burger' };

function entry(over: Partial<MenuHistoryEntry> = {}): MenuHistoryEntry {
  return {
    id: 'audit-1',
    action: AuditAction.MenuItemUpdate,
    actor: { id: 'staff-9', name: 'Ani Vardanyan', impersonatedBy: null, impersonatedById: null },
    before: null,
    after: null,
    at: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

describe('headline', () => {
  it('names a price change rather than calling it an edit', () => {
    // What the dialog gets opened for. "Edited" hides exactly the thing
    // somebody came to check.
    const line = headline(
      t,
      entry({ before: { priceAmd: 2400, nameI18n: BURGER }, after: { priceAmd: 2900 } }),
    );

    expect(line).toBe('Price changed');
  });

  it('calls an edit that left the price alone an edit', () => {
    const line = headline(
      t,
      entry({ before: { prepMin: 10, nameI18n: BURGER }, after: { prepMin: 14 } }),
    );

    expect(line).toBe('Edited');
  });

  it('tells the two directions of a sold-out flip apart', () => {
    const off = entry({
      action: AuditAction.MenuItemAvailability,
      before: { isAvailable: true, nameI18n: BURGER },
      after: { isAvailable: false },
    });
    const on = entry({
      action: AuditAction.MenuItemAvailability,
      before: { isAvailable: false, nameI18n: BURGER },
      after: { isAvailable: true },
    });

    expect(headline(t, off)).toBe('Marked sold out');
    expect(headline(t, on)).toBe('Put back on sale');
  });

  it('names the two ends of a dish’s life', () => {
    const created = entry({ action: AuditAction.MenuItemCreate, after: { priceAmd: 2400 } });
    const deleted = entry({ action: AuditAction.MenuItemDelete, before: { priceAmd: 2900 } });

    expect(headline(t, created)).toBe('Added to the menu');
    expect(headline(t, deleted)).toBe('Taken off the menu');
  });

  it('shows the raw verb for an action this build has no sentence for', () => {
    // A panel deployed behind the API. Ugly and honest beats an entry that
    // disappears out of an audit trail.
    const line = headline(t, entry({ action: 'menu_item.reheated' as AuditAction }));

    expect(line).toBe('menu_item.reheated');
  });
});

describe('changesOf', () => {
  it('diffs the keys of `after`, not of `before`', () => {
    // The API puts the dish's name in `before` as a label on every edit,
    // changed or not. Iterating `before` would render "Name: Burger → not set"
    // on every price change in the timeline.
    const changes = changesOf(
      t,
      entry({ before: { priceAmd: 2400, nameI18n: BURGER }, after: { priceAmd: 2900 } }),
      Language.En,
    );

    expect(changes).toEqual([{ label: 'Price', from: '2 400 ֏', to: '2 900 ֏' }]);
  });

  it('shows a rename with both names, when the name is what moved', () => {
    const changes = changesOf(
      t,
      entry({
        before: { nameI18n: BURGER },
        after: { nameI18n: { hy: 'Չիզբուրգեր', en: 'Cheeseburger' } },
      }),
      Language.En,
    );

    expect(changes).toEqual([{ label: 'Name', from: 'Burger', to: 'Cheeseburger' }]);
  });

  it('lists what a dish went on the menu at, with nothing on the left', () => {
    // A creation has no previous version, and inventing an empty one would
    // read as "the price changed from nothing", which is not what happened.
    const changes = changesOf(
      t,
      entry({
        action: AuditAction.MenuItemCreate,
        after: { nameI18n: BURGER, priceAmd: 2400, menuTab: 'mains' },
      }),
      Language.En,
    );

    expect(changes).toEqual([
      { label: 'Name', from: null, to: 'Burger' },
      { label: 'Price', from: null, to: '2 400 ֏' },
      { label: 'Tab', from: null, to: 'Mains' },
    ]);
  });

  it('lists what a withdrawn dish was, with nothing on the right', () => {
    const changes = changesOf(
      t,
      entry({ action: AuditAction.MenuItemDelete, before: { nameI18n: BURGER, priceAmd: 2900 } }),
      Language.En,
    );

    expect(changes).toEqual([
      { label: 'Name', from: 'Burger', to: null },
      { label: 'Price', from: '2 900 ֏', to: null },
    ]);
  });

  it('renders an entry that recorded nothing as no lines at all', () => {
    expect(changesOf(t, entry(), Language.En)).toEqual([]);
  });

  it('falls back to the raw field name for a field this build has no label for', () => {
    const changes = changesOf(t, entry({ before: {}, after: { spiceLevel: 3 } }), Language.En);

    expect(changes).toEqual([{ label: 'spiceLevel', from: 'not set', to: '3' }]);
  });
});

describe('formatValue', () => {
  it('formats money in dram and availability in words', () => {
    expect(formatValue(t, 'priceAmd', 5800, Language.En)).toBe('5 800 ֏');
    expect(formatValue(t, 'isAvailable', true, Language.En)).toBe('Yes');
    expect(formatValue(t, 'isAvailable', false, Language.En)).toBe('Sold out');
  });

  it('resolves an i18n object into the panel’s language', () => {
    expect(formatValue(t, 'nameI18n', BURGER, Language.En)).toBe('Burger');
    // The `hy` fallback, the same one `pickLabel` applies everywhere else.
    expect(formatValue(t, 'nameI18n', { hy: 'Բուրգեր' }, Language.En)).toBe('Բուրգեր');
  });

  it('says a uuid and a photo were set rather than showing them', () => {
    // "The category changed from 8f3c… to b210…" answers nothing anybody asked.
    expect(formatValue(t, 'categoryId', '8f3c1e22-0000-4000-8000-000000000000', Language.En)).toBe(
      'set',
    );
    expect(formatValue(t, 'photoUrl', 'https://cdn/x.jpg', Language.En)).toBe('set');
    expect(formatValue(t, 'photoUrl', null, Language.En)).toBe('not set');
  });

  it('says "not set" for a value that was cleared, and for an empty list', () => {
    expect(formatValue(t, 'prepMin', null, Language.En)).toBe('not set');
    expect(formatValue(t, 'dietaryTags', [], Language.En)).toBe('not set');
    expect(formatValue(t, 'dietaryTags', ['vegan', 'gluten-free'], Language.En)).toBe(
      'vegan, gluten-free',
    );
  });

  it('survives a value whose shape is not what this build expects', () => {
    // The values come out of a JSON column written by whichever build was
    // deployed at the time. A timeline that throws is worse than one that says
    // something odd.
    expect(formatValue(t, 'priceAmd', '2400', Language.En)).toBe('2400');
    expect(formatValue(t, 'nameI18n', 'Burger', Language.En)).toBe('Burger');
  });
});

describe('links to the person', () => {
  const named = entry({
    actor: {
      id: 'staff-9',
      name: 'Ani Vardanyan',
      impersonatedBy: 'Demo Super Admin',
      impersonatedById: 'staff-root',
    },
  });

  it('links a name to the People directory when the account may open it', () => {
    expect(actorHref(named, true)).toBe('/people?person=staff-9');
    expect(impersonatorHref(named, true)).toBe('/people?person=staff-root');
  });

  it('leaves every name as text for an account that cannot open People', () => {
    // A shift holds `menu:read` and not `staff:read`. A link to a tab their
    // sidebar does not show is a dead end.
    expect(actorHref(named, false)).toBeNull();
    expect(impersonatorHref(named, false)).toBeNull();
  });

  it('links nowhere when the account behind the entry is gone', () => {
    const gone = entry({
      actor: { id: null, name: null, impersonatedBy: null, impersonatedById: null },
    });

    expect(actorHref(gone, true)).toBeNull();
    expect(impersonatorHref(gone, true)).toBeNull();
  });
});
