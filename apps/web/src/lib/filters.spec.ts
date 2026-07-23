import { describe, expect, it } from 'vitest';
import { Language } from '@amragrir/shared';
import {
  FILTER_CHIPS,
  chipHref,
  clearHref,
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
    // `nearest` is a real API sort but not a chip, and `bogus` is nothing.
    expect(parseFilters({ sort: 'nearest' }).sort).toBeUndefined();
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

describe('toApiQuery', () => {
  it('omits everything that is off', () => {
    expect(toApiQuery(parseFilters({}))).toEqual({
      openNow: undefined,
      sort: undefined,
      service: undefined,
    });
  });

  it('maps an active state to /restaurants parameters', () => {
    expect(toApiQuery(parseFilters({ openNow: '1', sort: 'fastest', service: 'pickup,reserve' }))).toEqual(
      { openNow: '1', sort: 'fastest', service: 'pickup,reserve' },
    );
  });
});
