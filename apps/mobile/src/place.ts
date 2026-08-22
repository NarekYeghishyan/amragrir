import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cleanLabel,
  isOnGlobe,
  nearestAreaPoint,
  roundCoord,
  withRecent,
  type AreaId,
  type Place,
} from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import { geocode } from './api/endpoints';

/**
 * The place the customer has chosen, and the phone's way of naming one.
 *
 * **The web has had this since the picker was built; the phone had nothing.**
 * The feed measured from wherever the device happened to be (`src/origin.ts`)
 * and there was no way to say "show me what is near the office" without walking
 * there. `GET /restaurants` takes `lat`/`lng` from whoever asks, so the fix is a
 * stored point — the same point, in the same units, as the cookie the browser
 * keeps: `Place` and everything about how one is compared or rounded live in
 * `@amragrir/shared`.
 *
 * **What "nothing chosen" means differs between the two, and deliberately.** On
 * the web it is the whole city: a browser that has not been asked has no
 * position to offer. A phone does — so here, no choice means *the device*, and
 * clearing the choice hands the feed back to the GPS rather than to the centre
 * of Yerevan. That is why this module stores `null` rather than storing
 * Republic Square.
 *
 * **Names come from the API, not from the device.** This was the other way
 * round for a day: `expo-location` geocodes with no key and works on a plane,
 * which sounded like the phone's advantage over the browser. It is not, because
 * it takes **no language** — SDK 57's `geocodeAsync` accepts an address and
 * nothing else — so it answers in the language of the *operating system*, and
 * an Armenian query on a Russian phone came back in Russian. The website has
 * always answered in the alphabet the question was typed in, so the phone now
 * asks the same kind of proxy the website does: `GET /geocode`
 * (`apps/api/src/geocode`), where the Yandex key lives and where `queryLang`
 * decides the answer's alphabet. Nothing here holds a key.
 */

/** The chosen place. One key, holding JSON — no cookie to be careful with. */
export const CHOSEN_PLACE_KEY = 'amragrir.place.chosen';

/** Where this phone has chosen before, newest first. `RECENTS_MAX` of them. */
export const RECENT_PLACES_KEY = 'amragrir.place.recent';

/**
 * Whether the API this app is talking to has a geocoder key behind it.
 *
 * Asked once, when the picker first opens, and remembered for the session: it
 * is a fact about the deployment, not about the customer. The sheet draws no
 * search box where the answer is no — the same rule the website follows with no
 * key, and for the same reason: a box that can answer nothing is worse than no
 * box. Unknown until it has been asked, which is why this is three-valued.
 */
export async function canGeocode(language?: string): Promise<boolean> {
  if (available !== null) {
    return available;
  }
  try {
    available = (await geocode.available(language)).available;
    return available;
  } catch {
    // The API is unreachable — which is not the same as "no geocoder", but the
    // search box would be just as useless, and the next open asks again.
    return false;
  }
}

/** Null until the API has been asked. */
let available: boolean | null = null;

/** Forgets the answer — for tests, and for a sign-out that may change nothing
 *  else about this app but should not leave stale facts behind. */
export function forgetGeocoderAvailability(): void {
  available = null;
}

/** The dictionary key for each of shared's district points. Typed against
 *  `AreaId`, so a district added there cannot be left unnamed here. */
const AREA_LABEL_KEYS: Record<AreaId, TranslationKey> = {
  northern: 'locNorthern',
  kentron: 'locKentron',
  cascade: 'locCascade',
  arabkir: 'locArabkir',
  zeytun: 'locZeytun',
  shengavit: 'locShengavit',
};

/** What to call a point no geocoder would name — the nearest district. The key
 *  rather than the string: the caller holds the dictionary. */
export function areaKeyFor(lat: number, lng: number): TranslationKey {
  return AREA_LABEL_KEYS[nearestAreaPoint(lat, lng).id];
}

/**
 * A stored place, or null for anything that is not one.
 *
 * Storage outlives the version of the app that wrote it, and a place is three
 * fields any of which could come back missing or off the globe. A bad value
 * costs the choice — the feed falls back to the device — rather than crashing
 * the screen that reads it.
 */
export function parsePlace(value: unknown): Place | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const { lat, lng } = row;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isOnGlobe(lat, lng)) {
    return null;
  }
  const label = typeof row.label === 'string' ? cleanLabel(row.label) : '';
  return label === '' ? null : { lat: roundCoord(lat), lng: roundCoord(lng), label };
}

/** A stored list, dropping whatever is no longer readable rather than the
 *  whole row of chips with it. */
export function parsePlaces(raw: string | null): Place[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const places: Place[] = [];
  for (const entry of parsed) {
    const place = parsePlace(entry);
    if (place) {
      places.push(place);
    }
  }
  return places;
}

export async function readChosenPlace(): Promise<Place | null> {
  try {
    const raw = await AsyncStorage.getItem(CHOSEN_PLACE_KEY);
    return raw === null ? null : parsePlace(JSON.parse(raw) as unknown);
  } catch {
    // Unreadable or unparseable: the feed measures from the device, which is
    // where it measured from before anybody chose anything.
    return null;
  }
}

/** Stores the choice, or takes it back — `null` is "use my device again". */
export async function writeChosenPlace(place: Place | null): Promise<void> {
  try {
    if (place === null) {
      await AsyncStorage.removeItem(CHOSEN_PLACE_KEY);
    } else {
      await AsyncStorage.setItem(CHOSEN_PLACE_KEY, JSON.stringify(place));
    }
  } catch {
    // The feed has already moved to the new point; this only costs the choice
    // its life beyond a restart.
  }
}

export async function readRecentPlaces(): Promise<Place[]> {
  try {
    return parsePlaces(await AsyncStorage.getItem(RECENT_PLACES_KEY));
  } catch {
    return [];
  }
}

/** Records a choice, newest first. Never the reason a confirm fails: the
 *  chosen place is what matters, this is a shortcut for next time. */
export async function rememberPlace(place: Place): Promise<Place[]> {
  const next = withRecent(await readRecentPlaces(), place);
  try {
    await AsyncStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable. The row simply stays as it was.
  }
  return next;
}

/**
 * What the map's point is called, or null if nothing will say.
 *
 * One request per point, and the caller has a district name to fall back on —
 * so a phone with no signal still puts a usable label on a pin.
 */
export async function nameOf(lat: number, lng: number, language?: string): Promise<string | null> {
  try {
    const { items } = await geocode.reverse(lat, lng, language);
    const label = items[0]?.label;
    return label ? cleanLabel(label) : null;
  } catch {
    // Offline, or the API is down. Nothing here is worth an error on screen:
    // the pin keeps the district it was named after.
    return null;
  }
}

/**
 * Addresses matching what was typed, named and ready to choose.
 *
 * One request, and the answers come back **in the alphabet the query was typed
 * in** — Armenian for `Մաշտոց`, Russian for `Маштоц`, and the app's own
 * language for anything Latin, which says nothing about what was meant since
 * both other alphabets are routinely transliterated into it. That rule is
 * `queryLang` in `@amragrir/shared` and the API applies it; this only carries
 * the language the app is being read in, for the Latin case.
 *
 * Throws nothing, and answers in two parts. `failed` is the difference between
 * "Yerevan has no such street" and "this search is broken" — the same
 * distinction the web's route makes, and it exists because those two are
 * otherwise the same empty list.
 */
export async function searchPlaces(
  query: string,
  language?: string,
): Promise<{ items: Place[]; failed: boolean }> {
  const text = query.trim();
  if (text === '') {
    return { items: [], failed: false };
  }

  try {
    const answer = await geocode.search(text, language);
    const items: Place[] = [];
    for (const place of answer.items) {
      // The API is trusted to be the API and not trusted to be perfect: a
      // place off the globe or with no name cannot be chosen or shown, and
      // `parsePlace` is the same check the store applies.
      const clean = parsePlace(place);
      if (clean) {
        items.push(clean);
      }
    }
    return { items, failed: answer.failed === true || !answer.available };
  } catch {
    // Offline, throttled, or the API is down.
    return { items: [], failed: true };
  }
}
