import { describe, expect, it } from 'vitest';
import { Language } from '@amragrir/shared';
import {
  FILTER_CHIPS,
  categoryHref,
  chipHref,
  chipsFor,
  clearHref,
  forOrigin,
  hasAnyFilter,
  isActive,
  parseFilters,
  toApiQuery,
  type FilterChip,
} from './filters';

const chip = (id: string): FilterChip => {
  const found = FILTER_CHIPS.find((c) => c.id === id);
  if (!found) throw new Error(`no chip ${id}`);
  return found;
};

describe('parseFilters', () => {
  it('reads openNow from 1 or true, and is off otherwise', () => {
    expect(parseFilters({ openNow: '1' }).openNow).toBe(true);
    expect(parseFilters({ openNow: 'true' }).openNow).toBe(true);
    expect(parseFilters({ openNow: '0' }).openNow).toBe(false);
    expect(parseFilters({}).openNow).toBe(false);
  });

  it('accepts only the sorts the chips expose', () => {
    expect(parseFilters({ sort: 'top_rated' }).sort).toBe('top_rated');
    expect(parseFilters({ sort: 'fastest' }).sort).toBe('fastest');
    expect(parseFilters({ sort: 'nearest' }).sort).toBe('nearest');
    expect(parseFilters({ sort: 'bogus' }).sort).toBeUndefined();
  });

  it('keeps only known services, de-duplicated and in chip order', () => {
    // Given out of order and with an unknown value, comes back canonical.
    expect(parseFilters({ service: 'reserve,delivery,pickup,pickup' }).services).toEqual([
      'pickup',
      'reserve',
    ]);
  });

  it('takes the first value when a param is repeated', () => {
    expect(parseFilters({ sort: ['fastest', 'top_rated'] }).sort).toBe('fastest');
  });
});

describe('hasAnyFilter', () => {
  it('is false only for the empty state', () => {
    expect(hasAnyFilter(parseFilters({}))).toBe(false);
    expect(hasAnyFilter(parseFilters({ openNow: '1' }))).toBe(true);
    expect(hasAnyFilter(parseFilters({ sort: 'fastest' }))).toBe(true);
    expect(hasAnyFilter(parseFilters({ service: 'pickup' }))).toBe(true);
  });
});

describe('isActive', () => {
  it('reflects the current state per chip kind', () => {
    const state = parseFilters({ openNow: '1', sort: 'top_rated', service: 'pickup' });
    expect(isActive(state, chip('openNow'))).toBe(true);
    expect(isActive(state, chip('topRated'))).toBe(true);
    expect(isActive(state, chip('fastest'))).toBe(false);
    expect(isActive(state, chip('pickup'))).toBe(true);
    expect(isActive(state, chip('reserve'))).toBe(false);
  });
});

describe('chipHref', () => {
  it('turns a filter on from the empty state', () => {
    const state = parseFilters({});
    expect(chipHref(state, chip('openNow'), Language.Ru)).toBe('/ru?openNow=1');
    expect(chipHref(state, chip('pickup'), Language.Ru)).toBe('/ru?service=pickup');
  });

  it('turns an active filter back off, returning to the bare home path', () => {
    const state = parseFilters({ openNow: '1' });
    expect(chipHref(state, chip('openNow'), Language.Ru)).toBe('/ru');
  });

  it('keeps the leading slash in Armenian, which has no language prefix', () => {
    // The default language's prefix is empty, so a chip href is built on `/`
    // rather than on `/hy` — `?openNow=1` alone would resolve against whatever
    // path the visitor happened to be on.
    const state = parseFilters({});
    expect(chipHref(state, chip('openNow'), Language.Hy)).toBe('/?openNow=1');
    expect(clearHref(Language.Hy)).toBe('/');
  });

  it('makes the two sort chips mutually exclusive', () => {
    const state = parseFilters({ sort: 'top_rated' });
    // Clicking the other sort replaces it, never stacks two sorts.
    expect(chipHref(state, chip('fastest'), Language.Ru)).toBe('/ru?sort=fastest');
  });

  it('adds and removes services while keeping the URL canonical', () => {
    const withReserve = parseFilters({ service: 'reserve' });
    // Adding pickup lists it first (chip order), not append order.
    expect(chipHref(withReserve, chip('pickup'), Language.Ru)).toBe('/ru?service=pickup%2Creserve');

    const withBoth = parseFilters({ service: 'pickup,reserve' });
    expect(chipHref(withBoth, chip('pickup'), Language.Ru)).toBe('/ru?service=reserve');
  });

  it('preserves the other filters when toggling one', () => {
    const state = parseFilters({ openNow: '1', service: 'pickup' });
    expect(chipHref(state, chip('topRated'), Language.Ru)).toBe(
      '/ru?openNow=1&sort=top_rated&service=pickup',
    );
  });
});

describe('clearHref', () => {
  it('is the bare home path', () => {
    expect(clearHref(Language.En)).toBe('/en');
  });
});

describe('near me, which needs somewhere to be near', () => {
  it('is offered only once a district is chosen', () => {
    // Without an origin the API answers `sort=nearest` in its default order.
    // A chip that lit up and changed nothing would be a lie about the listing.
    expect(chipsFor(false).map((c) => c.id)).not.toContain('nearest');
    expect(chipsFor(true).map((c) => c.id)).toContain('nearest');
    // Every other chip is offered either way.
    expect(chipsFor(false)).toHaveLength(FILTER_CHIPS.length - 1);
  });

  it('is dropped from a hand-typed URL that has no origin behind it', () => {
    const typed = parseFilters({ sort: 'nearest', openNow: '1' });
    expect(forOrigin(typed, false)).toEqual({ ...typed, sort: undefined });
    expect(forOrigin(typed, true)).toBe(typed);
  });

  it('leaves the other sorts alone with or without one', () => {
    const byRating = parseFilters({ sort: 'top_rated' });
    expect(forOrigin(byRating, false).sort).toBe('top_rated');
  });
});

describe('toApiQuery', () => {
  it('omits everything that is off', () => {
    expect(toApiQuery(parseFilters({}))).toEqual({
      openNow: undefined,
      sort: undefined,
      service: undefined,
      category: undefined,
    });
  });

  it('maps an active state to /restaurants parameters', () => {
    expect(
      toApiQuery(parseFilters({ openNow: '1', sort: 'fastest', service: 'pickup,reserve' })),
    ).toEqual({
      openNow: '1',
      sort: 'fastest',
      service: 'pickup,reserve',
      category: undefined,
    });
  });
});

describe('the category rail', () => {
  it('reads a key off the address and sends it to the API', () => {
    const state = parseFilters({ category: 'sushi' });

    expect(state.category).toBe('sushi');
    expect(toApiQuery(state).category).toBe('sushi');
    expect(hasAnyFilter(state)).toBe(true);
  });

  it('ignores a key that could not be one', () => {
    // Not checked against the live rail — that is a database read on every home
    // render — but a value that cannot be a key at all is dropped rather than
    // forwarded. A key that merely names nothing matches no dish, which is the
    // same empty listing by a shorter route.
    expect(parseFilters({ category: 'Sushi; DROP' }).category).toBeUndefined();
  });

  it('keeps the other filters when a category is picked', () => {
    // The rail sits above the chips, and pressing it must not quietly undo
    // them: somebody who narrowed to "open now" and then tapped Sushi asked for
    // both.
    const state = parseFilters({ openNow: '1' });

    expect(categoryHref(state, 'sushi', Language.Ru)).toBe('/ru?openNow=1&category=sushi');
  });

  it('clears the category when the lit one is pressed again', () => {
    const state = parseFilters({ category: 'sushi', openNow: '1' });

    expect(categoryHref(state, 'sushi', Language.Ru)).toBe('/ru?openNow=1');
  });
});
