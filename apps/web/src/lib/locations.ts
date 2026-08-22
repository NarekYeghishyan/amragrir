import type { TranslationKey } from '@amragrir/i18n';
import {
  AREA_POINTS,
  YEREVAN,
  cleanLabel,
  isOnGlobe,
  metresBetween,
  nearestAreaPoint,
  roundCoord,
  type AreaId,
  type Place,
} from '@amragrir/shared';

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
 *
 * **The model itself lives in `@amragrir/shared`** — the shape of a place, the
 * precision it is kept to, the districts and the distance between two points.
 * The phone's picker answers the same API with the same units, and the two
 * cannot be allowed to drift. What stays here is what only a browser has: the
 * cookie, and the drawing the six pins sit on.
 */
export type { Place };
export { YEREVAN, metresBetween };

/** A district preset — one of the artifact's six, as a `Place` with a name in
 *  every language and a pin on the fallback map. */
export interface Area {
  /** Stable id, used as a DOM key and to look the preset's name up. */
  id: AreaId;
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

/** What each district is called, and where the drawing puts its pin. The
 *  coordinates are not here: they are `AREA_POINTS`, which the phone reads too. */
const DRAWN: Record<AreaId, { labelKey: TranslationKey; mapX: number; mapY: number }> = {
  northern: { labelKey: 'locNorthern', mapX: 200, mapY: 150 },
  kentron: { labelKey: 'locKentron', mapX: 120, mapY: 95 },
  cascade: { labelKey: 'locCascade', mapX: 255, mapY: 70 },
  arabkir: { labelKey: 'locArabkir', mapX: 300, mapY: 200 },
  zeytun: { labelKey: 'locZeytun', mapX: 95, mapY: 235 },
  shengavit: { labelKey: 'locShengavit', mapX: 180, mapY: 285 },
};

/**
 * The six districts the artifact lists, at their real coordinates.
 *
 * Nothing offers them to press any more — what still reads this list is
 * `nearestArea`, naming points the geocoder cannot, and the drawn placeholder,
 * which puts a pin at each `mapX`/`mapY`.
 */
export const AREAS: readonly Area[] = AREA_POINTS.map((point) => ({
  ...point,
  ...DRAWN[point.id],
}));

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
    roundCoord(place.lat),
    roundCoord(place.lng),
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
  // Off the globe is not somewhere a person can be standing. The API would
  // take it and compute distances from it, so it is refused here.
  if (!isOnGlobe(lat, lng)) {
    return null;
  }
  const label = cleanLabel(fromBase64Url(parts[2]!) ?? '');
  return label === '' ? null : { lat: roundCoord(lat), lng: roundCoord(lng), label };
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
 * with no address on it. The arithmetic is `nearestAreaPoint`; this puts the
 * drawing and the dictionary key back on the answer.
 */
export function nearestArea(lat: number, lng: number): Area {
  const { id } = nearestAreaPoint(lat, lng);
  // Every point has an entry: both lists are built from the same six ids.
  return AREAS.find((area) => area.id === id)!;
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
