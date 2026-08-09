import type { TranslationKey } from '@amragrir/i18n';

/**
 * Where the visitor says they are.
 *
 * The design puts a location control in the header — a pin, a place name and a
 * picker behind it — and it is not decoration: `/restaurants` computes
 * `distanceKm` and can sort by it, but only for a caller that supplies `lat`
 * and `lng`. This app had no coordinates to send, so every card's distance was
 * null and `sort=nearest` was unreachable.
 *
 * **A point, not a district.** It was six districts for as long as the picker's
 * map was a drawing: there was nothing between the pins to click. With a real
 * map behind it there is, and the API has always taken a coordinate rather than
 * a district — so what is stored is a coordinate and the name to show for it.
 * The six survive as **vocabulary** (`AREAS` below) rather than as a control:
 * the chips that offered them were removed, and what is left of them is
 * `nearestArea`, which is how a tapped point gets a name when no geocoder can
 * give it a better one.
 */
export interface Place {
  lat: number;
  lng: number;
  /** What the header reads and what the picker's "recent" row lists. */
  label: string;
}

/** A district preset — one of the artifact's six, as a `Place` with a name in
 *  every language and a pin on the fallback map. */
export interface Area {
  /** Stable id, used as a DOM key and to look the preset's name up. */
  id: string;
  labelKey: TranslationKey;
  lat: number;
  lng: number;
  /** Where the pin sits on the **drawn** map, in its 400×340 viewBox.
   *
   *  Only drawn before the real map exists — the frame is built when the dialog
   *  opens, and never on a page with no JavaScript. The artifact's own layout,
   *  transcribed rather than projected from `lat` and `lng`: its map is a
   *  hand-drawn city, not Yerevan to scale, and six districts projected onto it
   *  truthfully would land in a huddle two millimetres across. These are where
   *  the drawing puts them. */
  mapX: number;
  mapY: number;
}

/**
 * Readable by the page on purpose, like the basket's count cookie.
 *
 * The header renders in the root layout, and reading a cookie there on the
 * server would opt every restaurant page out of pre-rendering — the one thing
 * `apps/web/README.md` will not trade. So the control is drawn in the browser
 * from this value, and the home page (already per-request, since it reads a
 * query string) reads the same cookie on the server to build the API query.
 * Nothing here decides money, so exposing it costs nothing.
 */
export const LOCATION_COOKIE = 'amr_loc';

/**
 * The six districts the artifact lists, at their real coordinates.
 *
 * Yerevan only. The product is a Yerevan product (`AI_CONTEXT.md`), and a
 * picker offering a city with no restaurants in it would be a list of dead
 * ends. Nothing offers them to press any more — what still reads this list is
 * `nearestArea`, naming points the geocoder cannot, and the drawn placeholder,
 * which puts a pin at each `mapX`/`mapY`.
 */
export const AREAS: readonly Area[] = [
  { id: 'northern', labelKey: 'locNorthern', lat: 40.1811, lng: 44.5136, mapX: 200, mapY: 150 },
  { id: 'kentron', labelKey: 'locKentron', lat: 40.1798, lng: 44.5152, mapX: 120, mapY: 95 },
  { id: 'cascade', labelKey: 'locCascade', lat: 40.1901, lng: 44.5157, mapX: 255, mapY: 70 },
  { id: 'arabkir', labelKey: 'locArabkir', lat: 40.2043, lng: 44.4938, mapX: 300, mapY: 200 },
  { id: 'zeytun', labelKey: 'locZeytun', lat: 40.2138, lng: 44.5245, mapX: 95, mapY: 235 },
  { id: 'shengavit', labelKey: 'locShengavit', lat: 40.1403, lng: 44.4818, mapX: 180, mapY: 285 },
];

/** Where the map opens when nothing has been chosen: Republic Square, zoomed to
 *  hold the city the product serves. */
export const YEREVAN = { lat: 40.1776, lng: 44.5126, zoom: 12 } as const;

/** How precisely a stored point is kept. Six decimals is ~10cm — far past what
 *  a tap on a map means, and past what any distance on a card would show. */
const PRECISION = 6;

/** A pasted or hand-edited label is rendered in the header, where React escapes
 *  it but will happily let 4KB of it destroy the row. */
const LABEL_MAX = 80;

/**
 * The cookie's value for a place: `lat~lng~base64url(label)`.
 *
 * Every character this produces — digits, `.`, `-`, `~`, and base64url's
 * `A-Za-z0-9-_` — is one `encodeURIComponent` leaves alone. That is the point.
 * The server writes this cookie through Next, which URL-encodes values, and the
 * **browser** reads it raw out of `document.cookie`; anything that survived
 * encoding differently on the two sides would be a bug that only appears for
 * names with a space in them.
 */
export function encodePlace(place: Place): string {
  return [
    round(place.lat),
    round(place.lng),
    toBase64Url(cleanLabel(place.label)),
  ].join('~');
}

/**
 * A place from a cookie, or null for the whole city.
 *
 * Null is also what every unusable value means. This cookie is deliberately
 * readable, so a hand-edited one is not an exotic case: it is refused rather
 * than repaired, and the visitor is back to "all districts", which is a state
 * the page already knows how to be in.
 */
export function parsePlace(value: string | undefined): Place | null {
  if (!value) {
    return null;
  }
  const parts = value.split('~');
  if (parts.length !== 3) {
    return null;
  }
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  // Off the globe is not somewhere a person can be standing. The API would
  // take it and compute distances from it, so it is refused here.
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  const label = cleanLabel(fromBase64Url(parts[2]!) ?? '');
  return label === '' ? null : { lat: round(lat), lng: round(lng), label };
}

/** A preset as the thing that gets stored. `label` needs the dictionary, which
 *  lives with the caller — the layout translates, as it does for every other
 *  string this control shows. */
export function areaPlace(area: Area, label: string): Place {
  return { lat: area.lat, lng: area.lng, label };
}

/**
 * The preset a pair of coordinates falls closest to.
 *
 * Two callers: "use current location", which turns the browser's answer into
 * something nameable, and the picker naming a point that came back from the map
 * with no address on it.
 *
 * Flat geometry, not haversine: the six points span three kilometres, where a
 * degree of longitude is a constant to five decimal places. The `cos(lat)`
 * factor is still applied, because without it a degree east would count as far
 * as a degree north and Shengavit would win from the wrong side of town.
 *
 * Never null. Somebody in Tbilisi asking for the nearest Yerevan district gets
 * the nearest Yerevan district — the alternative is a control that refuses to
 * answer, and the list beside it says plainly that this is a Yerevan product.
 */
export function nearestArea(lat: number, lng: number): Area {
  const scale = Math.cos((lat * Math.PI) / 180);
  return AREAS.reduce((closest, area) => (span(area) < span(closest) ? area : closest));

  function span(area: Area): number {
    const dy = area.lat - lat;
    const dx = (area.lng - lng) * scale;
    return dy * dy + dx * dx;
  }
}

/**
 * Metres between two points, near enough.
 *
 * Used to decide whether two stored places are the same place — the recents
 * list, and nothing that decides money or distance shown to anybody. Same flat
 * approximation as `nearestArea`, for the same reason.
 */
export function metresBetween(a: Place, b: Place): number {
  const scale = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * scale;
  return Math.sqrt(dy * dy + dx * dx);
}

/**
 * The place as `/restaurants` parameters.
 *
 * Coordinates only — deliberately no `distMax`. A radius would *hide*
 * restaurants, and saying where you are is not a decision to stop being shown
 * the rest of the city. Sorting by distance is the separate, explicit act of
 * pressing the "nearest" chip.
 */
export function placeQuery(place: Place | null): Record<string, string | undefined> {
  return place === null ? {} : { lat: String(place.lat), lng: String(place.lng) };
}

function round(value: number): number {
  return Number(value.toFixed(PRECISION));
}

/** One line, no control characters, and short enough to sit in a header. */
function cleanLabel(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX);
}

/** base64url of UTF-8. `btoa`/`atob` are byte-oriented and exist in both Node
 *  and the browser, so the encoding runs the same on both sides of the cookie. */
function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    // Not base64 at all — a truncated or invented cookie. Caller reads this as
    // "no place", which is the whole city.
    return null;
  }
}
