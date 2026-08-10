import {
  DietaryTag,
  RestaurantService,
  RestaurantSort,
  SPEND_FILTER_MAX_AMD,
} from '@amragrir/shared';
import {
  NO_FILTERS,
  activeFilterCount,
  filterQuery,
  hasFilters,
  isUncapped,
  sliderFromSpend,
  spendFromSlider,
  toggleDietary,
  toggleService,
  type Filters,
} from './filters';

/**
 * The filter sheet's arithmetic.
 *
 * The screen it drives went unbuilt for a year over a units mismatch — the
 * design's slider measured a per-person spend and the API measured one dish's
 * average — so the parts of it that decide what gets *sent* are tested rather
 * than trusted.
 */

const some = (over: Partial<Filters> = {}): Filters => ({ ...NO_FILTERS, ...over });

describe('what counts as narrowed', () => {
  it('counts nothing on a fresh sheet', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it('leaves the sort out of the badge', () => {
    // Every list is sorted somehow. A badge reading "1" over a feed nobody has
    // narrowed would be the control lying about itself.
    const sorted = some({ sort: RestaurantSort.TopRated });
    expect(activeFilterCount(sorted)).toBe(0);
    // But "reset" still has something to put back, which is a different
    // question and gets a different answer.
    expect(hasFilters(sorted)).toBe(true);
  });

  it('counts every tag and every service separately', () => {
    expect(
      activeFilterCount(
        some({
          spendMaxAmd: 6000,
          minRating: 4,
          dietary: [DietaryTag.Vegan, DietaryTag.Halal],
          service: [RestaurantService.Reserve],
        }),
      ),
    ).toBe(5);
  });
});

describe('the chips', () => {
  it('adds a tag and takes it away again', () => {
    const on = toggleDietary(NO_FILTERS, DietaryTag.Vegan);
    expect(on.dietary).toEqual([DietaryTag.Vegan]);
    expect(toggleDietary(on, DietaryTag.Vegan).dietary).toEqual([]);
  });

  it('does the same for what a restaurant offers', () => {
    const on = toggleService(NO_FILTERS, RestaurantService.Reserve);
    expect(on.service).toEqual([RestaurantService.Reserve]);
    expect(toggleService(on, RestaurantService.Reserve).service).toEqual([]);
  });

  it('never mutates what it was given', () => {
    const before = some({ dietary: [DietaryTag.Vegan] });
    toggleDietary(before, DietaryTag.Halal);
    expect(before.dietary).toEqual([DietaryTag.Vegan]);
  });
});

describe('the spend cap', () => {
  it('reads the top of the range as "no limit", not as a cap', () => {
    // A guest who drags it all the way right is saying "anywhere". Sending the
    // number would quietly exclude anything priced above it — the exact failure
    // this filter was rebuilt to stop.
    expect(spendFromSlider(SPEND_FILTER_MAX_AMD)).toBeNull();
    expect(isUncapped(SPEND_FILTER_MAX_AMD)).toBe(true);
  });

  it('keeps a real cap', () => {
    expect(spendFromSlider(6000)).toBe(6000);
    expect(isUncapped(6000)).toBe(false);
  });

  it('round-trips, so the sheet reopens where it was left', () => {
    expect(sliderFromSpend(spendFromSlider(6000))).toBe(6000);
    expect(sliderFromSpend(spendFromSlider(SPEND_FILTER_MAX_AMD))).toBe(SPEND_FILTER_MAX_AMD);
  });
});

describe('the query it makes', () => {
  it('sends only what is set', () => {
    expect(filterQuery(NO_FILTERS, true)).toEqual({ sort: RestaurantSort.Recommended });
  });

  it('omits an empty list rather than sending an empty value', () => {
    // `dietary=` is not the same request as leaving it out: the DTO validates
    // every element against `@IsIn`, and there is nothing there to pass it.
    const query = filterQuery(some({ dietary: [] }), true);
    expect('dietary' in query).toBe(false);
  });

  it('drops the distance when there is nowhere to measure from', () => {
    // The API ignores `distMax` without coordinates, so sending one would make
    // the sheet claim to narrow something it does not.
    expect(filterQuery(some({ distMaxKm: 3 }), false).distMax).toBeUndefined();
    expect(filterQuery(some({ distMaxKm: 3 }), true).distMax).toBe(3);
  });

  it('carries the cap as priceMax, which is what the API calls it', () => {
    expect(filterQuery(some({ spendMaxAmd: 8000 }), true).priceMax).toBe(8000);
    expect(filterQuery(some({ spendMaxAmd: null }), true).priceMax).toBeUndefined();
  });

  it('passes the tags and services straight through', () => {
    const query = filterQuery(
      some({ dietary: [DietaryTag.Vegan], service: [RestaurantService.Reserve], minRating: 4.5 }),
      true,
    );
    expect(query).toEqual({
      sort: RestaurantSort.Recommended,
      minRating: 4.5,
      dietary: [DietaryTag.Vegan],
      service: [RestaurantService.Reserve],
    });
  });
});
