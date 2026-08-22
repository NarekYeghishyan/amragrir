import {
  DietaryTag,
  RestaurantService,
  RestaurantSort,
  SPEND_FILTER_MAX_AMD,
  SPEND_FILTER_MIN_AMD,
} from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';

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
  /**
   * Only branches serving right now.
   *
   * Set by the home screen's chip row, never by the sheet — the sheet leaves it
   * out on purpose (see `FilterSheet`), because "serving right now" on a screen
   * for ordering *ahead* answers a question nobody arrived with. As a chip it is
   * a different offer: one press, next to the others, for the guest who did
   * arrive with it.
   */
  openNow: boolean;
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
  openNow: false,
};

/**
 * Where the home feed starts: nothing narrowed, ordered by distance.
 *
 * The feed is a list of what is *near*, so it opens on `Nearest` — but as real
 * state rather than as a rewrite applied on the way to the API. It used to be
 * the latter, and that was invisible until the chip row arrived to read the
 * same state: the feed came back sorted by distance while the "Near me" chip
 * sat unlit, and pressing it twice changed nothing either time. Reset in the
 * sheet still returns `NO_FILTERS`, which is the API's own `recommended` — the
 * chip goes out and the order really does change.
 */
export const HOME_FILTERS: Filters = { ...NO_FILTERS, sort: RestaurantSort.Nearest };

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
    (filters.openNow ? 1 : 0) +
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
  openNow?: boolean;
} {
  return {
    sort: filters.sort,
    ...(filters.spendMaxAmd === null ? {} : { priceMax: filters.spendMaxAmd }),
    ...(filters.distMaxKm === null || !hasOrigin ? {} : { distMax: filters.distMaxKm }),
    ...(filters.minRating === null ? {} : { minRating: filters.minRating }),
    ...(filters.dietary.length === 0 ? {} : { dietary: filters.dietary }),
    ...(filters.service.length === 0 ? {} : { service: filters.service }),
    // Sent only when on. `openNow=false` is not the same request as leaving it
    // out — it would ask the API to include closed branches explicitly, which
    // is a filter nobody set.
    ...(filters.openNow ? { openNow: true } : {}),
  };
}

/**
 * The home screen's quick-filter chips — the artifact's row above the feed.
 *
 * **Every chip maps to a real `/restaurants` parameter; none is decorative.**
 * This is the same set the web draws (`apps/web/src/lib/filters.ts`), for the
 * same reason: a chip that lights up and narrows nothing is worse than a chip
 * that is not there. Three kinds:
 *
 *  - `bool`    → a flag (`openNow`);
 *  - `sort`    → the single active sort, so these are mutually exclusive and
 *                pressing the lit one puts the default order back;
 *  - `service` → one of `restaurants.services`, OR-ed server-side, so several
 *                may be on at once.
 *
 * **The artifact draws eight and this is seven.** Its "Special Offers" has no
 * model behind it — there are no discounts in the schema to filter on — so it
 * is left out rather than drawn dead. Its "Ready in 15 min" is the `fastest`
 * sort rather than a hard cut at fifteen minutes: the API sorts by prep time
 * and has no threshold, and a chip promising fifteen would be a promise the
 * server never made. Its "Near Me" is `nearest`, the one chip that is not
 * always offered — see `chipsFor`.
 */
export type ChipKind = 'bool' | 'sort' | 'service';

export interface FilterChip {
  /** Stable id, and the list key. */
  id: string;
  kind: ChipKind;
  /** The API value for `sort`/`service` chips; unused for `bool`. */
  value?: RestaurantSort | RestaurantService;
  labelKey: TranslationKey;
  /** The glyph the artifact puts before the label. Decorative — the label says
   *  the same thing in words, so it is hidden from the screen reader. */
  icon: string;
}

export const FILTER_CHIPS: readonly FilterChip[] = [
  { id: 'nearest', kind: 'sort', value: RestaurantSort.Nearest, labelKey: 'filterNearest', icon: '📍' },
  { id: 'openNow', kind: 'bool', labelKey: 'filterOpenNow', icon: '🟢' },
  { id: 'topRated', kind: 'sort', value: RestaurantSort.TopRated, labelKey: 'filterTopRated', icon: '⭐' },
  { id: 'fastest', kind: 'sort', value: RestaurantSort.Fastest, labelKey: 'filterFastest', icon: '⏱' },
  { id: 'pickup', kind: 'service', value: RestaurantService.Pickup, labelKey: 'filterPickup', icon: '🥡' },
  { id: 'reserve', kind: 'service', value: RestaurantService.Reserve, labelKey: 'filterReserve', icon: '🍽️' },
  { id: 'dinein', kind: 'service', value: RestaurantService.DineIn, labelKey: 'filterDineIn', icon: '🍴' },
];

/**
 * All seven are always offered here, unlike on the web, which hides `nearest`
 * until a district is chosen. This app always has coordinates to sort by — the
 * device's own once granted, Republic Square until then (`src/origin.ts`) — so
 * the API can always honour the sort. It is then measured from the centre of
 * Yerevan rather than from the reader, which is the same trade the distance
 * filter already makes, and a floor rather than a lie.
 */

/** Whether a chip is lit for the current filters. */
export function isChipActive(filters: Filters, chip: FilterChip): boolean {
  switch (chip.kind) {
    case 'bool':
      return filters.openNow;
    case 'sort':
      return filters.sort === chip.value;
    case 'service':
      return filters.service.includes(chip.value as RestaurantService);
  }
}

/**
 * Pressing a chip.
 *
 * A lit chip always turns itself off, including the sorts: pressing the active
 * sort returns the feed to `Recommended` rather than leaving it stuck on an
 * order there is no other way out of.
 */
export function toggleChip(filters: Filters, chip: FilterChip): Filters {
  switch (chip.kind) {
    case 'bool':
      return { ...filters, openNow: !filters.openNow };
    case 'sort':
      return {
        ...filters,
        sort:
          filters.sort === chip.value ? NO_FILTERS.sort : (chip.value as RestaurantSort),
      };
    case 'service':
      return toggleService(filters, chip.value as RestaurantService);
  }
}
