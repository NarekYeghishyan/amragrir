import type { Language } from '@amragrir/shared';
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
 * "Near me" from the design is deliberately absent: it needs the visitor's
 * coordinates (`lat`/`lng`), which only the browser can supply, so it belongs
 * to a client geolocation flow rather than a server-rendered link.
 */
export type ChipKind = 'bool' | 'sort' | 'service';

export interface FilterChip {
  /** Stable id, also the DOM key. */
  id: string;
  kind: ChipKind;
  /** The API value for `sort`/`service` chips; unused for `bool`. */
  value?: string;
  labelKey: TranslationKey;
}

export const FILTER_CHIPS: readonly FilterChip[] = [
  { id: 'openNow', kind: 'bool', labelKey: 'filterOpenNow' },
  { id: 'topRated', kind: 'sort', value: 'top_rated', labelKey: 'filterTopRated' },
  { id: 'fastest', kind: 'sort', value: 'fastest', labelKey: 'filterFastest' },
  { id: 'pickup', kind: 'service', value: 'pickup', labelKey: 'filterPickup' },
  { id: 'reserve', kind: 'service', value: 'reserve', labelKey: 'filterReserve' },
  { id: 'dinein', kind: 'service', value: 'dinein', labelKey: 'filterDineIn' },
];

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

  return {
    openNow: openNowRaw === '1' || openNowRaw === 'true',
    sort: sortRaw && SORT_VALUES.has(sortRaw) ? sortRaw : undefined,
    services: serviceRaw ? canonicalServices(serviceRaw.split(',').map((s) => s.trim())) : [],
  };
}

export function hasAnyFilter(state: FilterState): boolean {
  return state.openNow || state.sort !== undefined || state.services.length > 0;
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
  return params.toString();
}

/** Href for a chip: the home path with that chip toggled. A real URL, so the
 *  link works with JavaScript off and a crawler can follow it. */
export function chipHref(state: FilterState, chip: FilterChip, language: Language): string {
  const query = serialize(toggled(state, chip));
  const base = homePath(language);
  return query ? `${base}?${query}` : base;
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
  };
}
