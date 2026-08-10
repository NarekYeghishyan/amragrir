import {
  DietaryTag,
  RestaurantService,
  RestaurantSort,
  SPEND_FILTER_MAX_AMD,
  SPEND_FILTER_MIN_AMD,
} from '@amragrir/shared';

/**
 * What the filter sheet holds, and how it becomes a query.
 *
 * Pure, and in its own module for the reason the cart's arithmetic is: the
 * decisions here — which of these count as "set", what gets sent, what the
 * badge says — are wrong in ways a type check never catches, and testing them
 * through a bottom sheet would mean mounting one.
 *
 * **Every bound comes from `@amragrir/shared`.** The first version of this
 * screen was never built because the design drew a price slider from 4 000 to
 * 24 000 while the API measured something that never left the 1 000s; the two
 * ends and the model between them now live in one place that the server reads
 * too.
 */

export interface Filters {
  sort: RestaurantSort;
  /** Most a guest wants to spend per head, or null for "no limit". */
  spendMaxAmd: number | null;
  /** Kilometres, or null for "anywhere". */
  distMaxKm: number | null;
  minRating: number | null;
  dietary: DietaryTag[];
  /** What the restaurant offers — pre-order, eating in, a booked table. */
  service: RestaurantService[];
}

/**
 * Nothing narrowed.
 *
 * `Recommended` rather than `Nearest`: the home feed asks for nearest because
 * it is a feed of what is close, but the sheet's *unset* state has to be the
 * API's own default or "reset" would silently apply a sort.
 */
export const NO_FILTERS: Filters = {
  sort: RestaurantSort.Recommended,
  spendMaxAmd: null,
  distMaxKm: null,
  minRating: null,
  dietary: [],
  service: [],
};

/** The rating chips the sheet offers. Whole and half stars from 3 up — below
 *  that a rating filter stops narrowing anything. */
export const RATING_CHOICES = [3, 3.5, 4, 4.5] as const;

/** The distance chips, in km. */
export const DISTANCE_CHOICES = [1, 2, 3, 5] as const;

/**
 * How many filters are on, for the badge on the button.
 *
 * The sort is deliberately **not** counted. Every list is sorted somehow, so a
 * badge that read "1" on a screen nobody had narrowed would be the control
 * lying about itself — and the number is there to answer "why am I seeing so
 * few restaurants".
 */
export function activeFilterCount(filters: Filters): number {
  return (
    (filters.spendMaxAmd === null ? 0 : 1) +
    (filters.distMaxKm === null ? 0 : 1) +
    (filters.minRating === null ? 0 : 1) +
    filters.dietary.length +
    filters.service.length
  );
}

/** Whether anything at all has been narrowed — including the sort, which the
 *  badge leaves out but "reset" must put back. */
export function hasFilters(filters: Filters): boolean {
  return activeFilterCount(filters) > 0 || filters.sort !== NO_FILTERS.sort;
}

/** Adds a tag, or takes it away. Chips are a set, and pressing one twice is how
 *  somebody unpicks it. */
export function toggleDietary(filters: Filters, tag: DietaryTag): Filters {
  return {
    ...filters,
    dietary: filters.dietary.includes(tag)
      ? filters.dietary.filter((held) => held !== tag)
      : [...filters.dietary, tag],
  };
}

/** The same, for what a restaurant offers. */
export function toggleService(filters: Filters, service: RestaurantService): Filters {
  return {
    ...filters,
    service: filters.service.includes(service)
      ? filters.service.filter((held) => held !== service)
      : [...filters.service, service],
  };
}

/**
 * The slider's value as a filter.
 *
 * At its top the slider means **no limit**, not "up to twenty thousand": a
 * guest who drags it all the way right is saying "anywhere", and sending the
 * cap would quietly exclude a restaurant priced above it — which is exactly the
 * failure this whole filter was rebuilt to stop.
 */
export function spendFromSlider(value: number): number | null {
  return value >= SPEND_FILTER_MAX_AMD ? null : value;
}

/** And back, so the slider has somewhere to sit when nothing is capped. */
export function sliderFromSpend(spendMaxAmd: number | null): number {
  return spendMaxAmd ?? SPEND_FILTER_MAX_AMD;
}

/** What the slider's label says — the number, or that there is no cap. */
export function isUncapped(value: number): boolean {
  return value >= SPEND_FILTER_MAX_AMD;
}

export { SPEND_FILTER_MIN_AMD, SPEND_FILTER_MAX_AMD };

/**
 * The query these filters make.
 *
 * Only what is set. An `undefined` is dropped by the client rather than sent as
 * an empty value, because `dietary=` and `minRating=` are not the same request
 * as leaving them out — the DTO validates what arrives, and an empty array
 * would fail `@IsIn` on every element it does not have.
 *
 * `distMax` is dropped when there are no coordinates: the API ignores it
 * without a `lat`/`lng` pair, and sending a distance that cannot be measured
 * would make the sheet claim to narrow something it does not.
 */
export function filterQuery(
  filters: Filters,
  hasOrigin: boolean,
): {
  sort: RestaurantSort;
  priceMax?: number;
  distMax?: number;
  minRating?: number;
  dietary?: DietaryTag[];
  service?: RestaurantService[];
} {
  return {
    sort: filters.sort,
    ...(filters.spendMaxAmd === null ? {} : { priceMax: filters.spendMaxAmd }),
    ...(filters.distMaxKm === null || !hasOrigin ? {} : { distMax: filters.distMaxKm }),
    ...(filters.minRating === null ? {} : { minRating: filters.minRating }),
    ...(filters.dietary.length === 0 ? {} : { dietary: filters.dietary }),
    ...(filters.service.length === 0 ? {} : { service: filters.service }),
  };
}
