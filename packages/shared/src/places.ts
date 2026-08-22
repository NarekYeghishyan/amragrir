/**
 * Where a customer says they are.
 *
 * `GET /restaurants` computes `distanceKm` and can sort by it, but only for a
 * caller that supplies `lat` and `lng` — so every client needs a way to answer
 * "where are you", and all of them must answer it in the same units. This
 * module is that agreement: the shape of a place, how precisely a point is
 * kept, what counts as the *same* point, and the districts a nameless point
 * falls back to.
 *
 * **A point, not a district.** The six districts below survive as vocabulary
 * rather than as a control — `nearestAreaPoint` is how a tapped point gets a
 * name when no geocoder can give it a better one. What is stored, on the web
 * and on the phone, is a coordinate and the name to show for it.
 *
 * Storage is *not* here, because the two clients cannot share it: the web
 * keeps the choice in a cookie the server reads on the way to building the API
 * query, and the phone keeps it in `AsyncStorage`. What they do share is
 * everything above that line.
 */

/** What the header reads, the picker lists, and the feed measures from. */
export interface Place {
  lat: number;
  lng: number;
  label: string;
}

/** Where a map opens when nothing has been chosen: Republic Square, zoomed to
 *  hold the city the product serves. Also the fallback the phone measures
 *  distances from before it is allowed to ask the GPS. */
export const YEREVAN = { lat: 40.1776, lng: 44.5126, zoom: 12 } as const;

/** How precisely a stored point is kept. Six decimals is ~10cm — far past what
 *  a tap on a map means, and past what any distance on a card would show. */
export const COORD_PRECISION = 6;

/** A pasted, hand-edited or geocoded label is rendered in a header row, where
 *  React escapes it but will happily let 4KB of it destroy the layout. */
export const LABEL_MAX = 80;

export function roundCoord(value: number): number {
  return Number(value.toFixed(COORD_PRECISION));
}

/** One line, no control characters, and short enough to sit in a header. */
export function cleanLabel(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX);
}

/** A coordinate a person could be standing on. Anything else is a corrupted
 *  store or a hand-edited cookie: the API would take it and compute distances
 *  from it, so every reader refuses it here instead. */
export function isOnGlobe(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/**
 * Metres between two points, near enough.
 *
 * Used to decide whether two stored places are the same place — the recents
 * list, and nothing that decides money or a distance shown to anybody. Flat
 * geometry rather than haversine: over a city a degree of longitude is a
 * constant to five decimal places, and the `cos(lat)` factor is still applied
 * so that a degree east does not count as far as a degree north.
 */
export function metresBetween(a: Place, b: Place): number {
  const scale = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * scale;
  return Math.sqrt(dy * dy + dx * dx);
}

/** Five is what fits on one row of a picker without scrolling, and a history
 *  nobody can see the end of is a list, not a shortcut. */
export const RECENTS_MAX = 5;

/**
 * How close two points have to be to count as the same place.
 *
 * A map tap is never repeated to the metre, so exact equality would fill the
 * row with five copies of one street corner. 120m is about a block: near enough
 * that offering both would be offering the same answer twice.
 */
export const SAME_PLACE_METRES = 120;

/**
 * The list with `place` at the front.
 *
 * Anything within `SAME_PLACE_METRES` of it drops out first, so choosing the
 * same corner twice moves it up rather than duplicating it — and re-choosing it
 * under a new name (a geocoder is not deterministic across zoom levels)
 * replaces the old name instead of listing both.
 */
export function withRecent(places: readonly Place[], place: Place): Place[] {
  const others = places.filter((existing) => metresBetween(existing, place) > SAME_PLACE_METRES);
  return [place, ...others].slice(0, RECENTS_MAX);
}

/** The six districts the design lists. Ids only — a name for one is an i18n
 *  key, which each client looks up in its own dictionary. */
export type AreaId = 'northern' | 'kentron' | 'cascade' | 'arabkir' | 'zeytun' | 'shengavit';

export interface AreaPoint {
  readonly id: AreaId;
  readonly lat: number;
  readonly lng: number;
}

/**
 * The districts at their real coordinates.
 *
 * Yerevan only. The product is a Yerevan product (`AI_CONTEXT.md`), and a
 * picker offering a city with no restaurants in it would be a list of dead
 * ends.
 */
export const AREA_POINTS: readonly AreaPoint[] = [
  { id: 'northern', lat: 40.1811, lng: 44.5136 },
  { id: 'kentron', lat: 40.1798, lng: 44.5152 },
  { id: 'cascade', lat: 40.1901, lng: 44.5157 },
  { id: 'arabkir', lat: 40.2043, lng: 44.4938 },
  { id: 'zeytun', lat: 40.2138, lng: 44.5245 },
  { id: 'shengavit', lat: 40.1403, lng: 44.4818 },
];

/**
 * The district a pair of coordinates falls closest to.
 *
 * Callers: "use current location", which turns a device's answer into something
 * nameable, and a picker naming a point that came back from the map with no
 * address on it.
 *
 * Never null. Somebody in Tbilisi asking for the nearest Yerevan district gets
 * the nearest Yerevan district — the alternative is a control that refuses to
 * answer, and everything beside it says plainly that this is a Yerevan product.
 */
export function nearestAreaPoint(lat: number, lng: number): AreaPoint {
  const scale = Math.cos((lat * Math.PI) / 180);
  return AREA_POINTS.reduce((closest, area) => (span(area) < span(closest) ? area : closest));

  function span(area: AreaPoint): number {
    const dy = area.lat - lat;
    const dx = (area.lng - lng) * scale;
    return dy * dy + dx * dx;
  }
}
