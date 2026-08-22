import { CATEGORY_KEY_PATTERN, type Language } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import { homePath } from './site';

/**
 * The home page's quick-filter chips.
 *
 * Every chip maps to a real `/restaurants` query parameter — none is
 * decorative. Three kinds:
 *
 *  - `bool`    → a flag (`openNow`);
 *  - `sort`    → the single active sort (`sort=top_rated|fastest`), so these
 *                chips are mutually exclusive;
 *  - `service` → one of `restaurants.services`, combined with OR server-side
 *                (`service=pickup,reserve`), so several may be on at once.
 *
 * The design's "Near me" is `nearest`, and it is the one chip that is not
 * always offered: sorting by distance needs an origin, and this app's origin is
 * the district chosen in the header. With no district there is nothing to be
 * near, so the chip is left out rather than drawn dead — see `chipsFor` below.
 */
export type ChipKind = 'bool' | 'sort' | 'service';

export interface FilterChip {
  /** Stable id, also the DOM key. */
  id: string;
  kind: ChipKind;
  /** The API value for `sort`/`service` chips; unused for `bool`. */
  value?: string;
  labelKey: TranslationKey;
  /**
   * The glyph the design puts before the label. Decorative — the label says
   * the same thing in words, so it is `aria-hidden` where it renders.
   *
   * Taken from the artifact's own set where a chip corresponds. Its list is
   * not ours: it has "Near Me" and "Ready in 15 min", which map to no API
   * parameter (see the note above), and it has no dine-in chip at all — so
   * that one glyph is chosen here rather than transcribed.
   */
  icon: string;
}

export const FILTER_CHIPS: readonly FilterChip[] = [
  { id: 'nearest', kind: 'sort', value: 'nearest', labelKey: 'filterNearest', icon: '📍' },
  { id: 'openNow', kind: 'bool', labelKey: 'filterOpenNow', icon: '🟢' },
  { id: 'topRated', kind: 'sort', value: 'top_rated', labelKey: 'filterTopRated', icon: '⭐' },
  { id: 'fastest', kind: 'sort', value: 'fastest', labelKey: 'filterFastest', icon: '⏱' },
  { id: 'pickup', kind: 'service', value: 'pickup', labelKey: 'filterPickup', icon: '🥡' },
  { id: 'reserve', kind: 'service', value: 'reserve', labelKey: 'filterReserve', icon: '🍽️' },
  { id: 'dinein', kind: 'service', value: 'dinein', labelKey: 'filterDineIn', icon: '🍴' },
];

/**
 * The chips to draw, given whether the visitor has told us where they are.
 *
 * Only `nearest` depends on it. Offering it with no origin would produce a
 * sort the API cannot honour — it would quietly fall back to its default order
 * while the chip claimed otherwise, which is worse than not offering it.
 */
export function chipsFor(hasOrigin: boolean): readonly FilterChip[] {
  return hasOrigin ? FILTER_CHIPS : FILTER_CHIPS.filter((chip) => chip.id !== 'nearest');
}

/**
 * The same rule applied to a parsed state, for a URL somebody typed.
 *
 * `?sort=nearest` with no district chosen is a request the API answers in its
 * default order — so without this the page would show the chip lit and the
 * listing unsorted. Dropping it makes the URL mean what the page shows.
 */
export function forOrigin(state: FilterState, hasOrigin: boolean): FilterState {
  return !hasOrigin && state.sort === 'nearest' ? { ...state, sort: undefined } : state;
}

const SORT_VALUES = new Set(
  FILTER_CHIPS.filter((c) => c.kind === 'sort').map((c) => c.value),
);
const SERVICE_VALUES = FILTER_CHIPS.filter((c) => c.kind === 'service').map((c) => c.value!);

export interface FilterState {
  openNow: boolean;
  /** `top_rated` | `fastest`, or undefined for the default (recommended). */
  sort?: string;
  /** A subset of the service values, in chip order (so the URL is canonical). */
  services: string[];
  /**
   * A platform category key from the rail — `sushi`, `pizza`.
   *
   * Part of the filter state rather than a parameter of its own, so that every
   * link the page builds carries it: pressing "Open now" under a lit category
   * must not silently drop the category. It also decides what the cards look
   * like — a filtered card wears the matching dishes instead of its cover
   * (BUSINESS_LOGIC.md §6).
   */
  category?: string;
}

/** Next hands a param as `string | string[] | undefined`; take the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Keep only known services, de-duplicated and in chip order. */
function canonicalServices(values: readonly string[]): string[] {
  return SERVICE_VALUES.filter((service) => values.includes(service));
}

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FilterState {
  const openNowRaw = first(searchParams.openNow);
  const sortRaw = first(searchParams.sort);
  const serviceRaw = first(searchParams.service);
  const categoryRaw = first(searchParams.category);

  return {
    openNow: openNowRaw === '1' || openNowRaw === 'true',
    sort: sortRaw && SORT_VALUES.has(sortRaw) ? sortRaw : undefined,
    services: serviceRaw ? canonicalServices(serviceRaw.split(',').map((s) => s.trim())) : [],
    // Not checked against the live rail here: this runs on every home render
    // and the categories are a database read. A key that names nothing simply
    // matches no dish, which is the same empty listing by a shorter route.
    category: categoryRaw && CATEGORY_KEY_PATTERN.test(categoryRaw) ? categoryRaw : undefined,
  };
}

export function hasAnyFilter(state: FilterState): boolean {
  return (
    state.openNow ||
    state.sort !== undefined ||
    state.services.length > 0 ||
    state.category !== undefined
  );
}

export function isActive(state: FilterState, chip: FilterChip): boolean {
  if (chip.kind === 'bool') {
    return state.openNow;
  }
  if (chip.kind === 'sort') {
    return state.sort === chip.value;
  }
  return state.services.includes(chip.value!);
}

/** The state that results from clicking `chip` — toggled on if off, off if on. */
function toggled(state: FilterState, chip: FilterChip): FilterState {
  if (chip.kind === 'bool') {
    return { ...state, openNow: !state.openNow };
  }
  if (chip.kind === 'sort') {
    return { ...state, sort: state.sort === chip.value ? undefined : chip.value };
  }
  const isOn = state.services.includes(chip.value!);
  const next = isOn
    ? state.services.filter((service) => service !== chip.value)
    : [...state.services, chip.value!];
  return { ...state, services: canonicalServices(next) };
}

function serialize(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.openNow) {
    params.set('openNow', '1');
  }
  if (state.sort) {
    params.set('sort', state.sort);
  }
  if (state.services.length > 0) {
    params.set('service', state.services.join(','));
  }
  if (state.category) {
    params.set('category', state.category);
  }
  return params.toString();
}

/**
 * The address of the listing under a given filter state.
 *
 * The chips below build their targets with it, and the home page uses it on its
 * own state to say where a write on it returns to — a heart pressed on a
 * filtered listing has to come back to that listing, not to the bare feed.
 */
export function homeHref(state: FilterState, language: Language): string {
  const query = serialize(state);
  const base = homePath(language);
  return query ? `${base}?${query}` : base;
}

/** Href for a chip: the home path with that chip toggled. A real URL, so the
 *  link works with JavaScript off and a crawler can follow it. */
export function chipHref(state: FilterState, chip: FilterChip, language: Language): string {
  return homeHref(toggled(state, chip), language);
}

/** Href that clears every filter. */
export function clearHref(language: Language): string {
  return homePath(language);
}

/** The filter state as `/restaurants` query parameters. */
export function toApiQuery(state: FilterState): Record<string, string | undefined> {
  return {
    openNow: state.openNow ? '1' : undefined,
    sort: state.sort,
    service: state.services.length > 0 ? state.services.join(',') : undefined,
    category: state.category,
  };
}

/**
 * The listing under a category, with the rest of the filters kept.
 *
 * Pressing the lit one clears it, the way every chip on this page behaves — a
 * rail with no way back out is a filter somebody has to delete from the address
 * bar.
 */
export function categoryHref(state: FilterState, key: string, language: Language): string {
  return homeHref({ ...state, category: state.category === key ? undefined : key }, language);
}
