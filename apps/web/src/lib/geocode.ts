import { YEREVAN, type Place } from './locations';

/**
 * Talking to Yandex's geocoder.
 *
 * Nothing here performs a request. That keeps it all testable without a key,
 * which matters: a deployment can be missing the key entirely, and the parts
 * that are easy to get quietly wrong — the language codes, the coordinate
 * order, the shape of an answer — are exactly the parts that would then never
 * be exercised.
 *
 * `yandexLang` is shared with `lib/map-frame.ts`, which points the map at the
 * same company in the same language. That mapping is one fact and lives here.
 */

/** Five is what the picker can show under its search box without becoming a
 *  page of its own. */
export const MAX_RESULTS = 5;

/**
 * Yandex's language codes — one per language this site is published in.
 *
 * All three are real: `hy_AM` answers `Վարդանանց փողոց, 10 · Երևան, Հայաստան`
 * and the map widget draws its labels and its own controls in Armenian too.
 * (An earlier version of this file claimed Yandex had no Armenian and sent
 * Armenian readers to the English map. It was wrong, and it cost them the
 * street names in their own alphabet.)
 */
export function yandexLang(language: string): string {
  if (language === 'ru') {
    return 'ru_RU';
  }
  return language === 'hy' ? 'hy_AM' : 'en_US';
}

/**
 * The language to answer a *search* in — decided by what was typed, not by
 * which language the site happens to be open in.
 *
 * Somebody typing `Վարդանանց` is asking in Armenian and should be offered
 * `Վարդանանց փողոց, 10` to pick from, even if they are reading the Russian
 * pages; the same for Cyrillic on the Armenian site. Getting a list back in an
 * alphabet you did not type in is the moment a search box stops feeling like it
 * understood you.
 *
 * **Latin does not count**, and that asymmetry is deliberate: Armenian and
 * Russian names are routinely transliterated into it (`Vardanants`, `Mashtots`),
 * so Latin says nothing about which language the reader wants — where the two
 * non-Latin scripts each belong to exactly one. So Latin keeps the site's own
 * language, and only a script that can mean one thing overrides it.
 */
export function queryLang(query: string, language: string): string {
  if (/\p{Script=Armenian}/u.test(query)) {
    return 'hy_AM';
  }
  if (/\p{Script=Cyrillic}/u.test(query)) {
    return 'ru_RU';
  }
  return yandexLang(language);
}

/**
 * Search is biased to the city the product serves.
 *
 * Without this, "Northern Avenue" finds one in a dozen countries and Yerevan's
 * is not first. `ll` + `spn` is a soft preference, not a filter — Yandex still
 * answers outside the window, which is right: a visitor is allowed to look up
 * somewhere this app has no restaurants and see for themselves that it is empty.
 */
export function geocoderUrl(
  apiKey: string,
  language: string,
  request: { q: string } | { lat: number; lng: number },
): string {
  const url = new URL('https://geocode-maps.yandex.ru/1.x/');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('format', 'json');

  if ('q' in request) {
    // Answered in the language it was asked in — see `queryLang`.
    url.searchParams.set('lang', queryLang(request.q, language));
    url.searchParams.set('geocode', request.q);
    url.searchParams.set('results', String(MAX_RESULTS));
    url.searchParams.set('ll', `${YEREVAN.lng},${YEREVAN.lat}`);
    url.searchParams.set('spn', '0.5,0.5');
  } else {
    // A tap on the map asked nothing in any language, so this one follows the
    // page: the name it comes back with is going into the header.
    url.searchParams.set('lang', yandexLang(language));
    // Longitude first, everywhere in this API — including here, where getting
    // it the wrong way round would silently name a point in the Indian Ocean.
    url.searchParams.set('geocode', `${request.lng},${request.lat}`);
    url.searchParams.set('results', '1');
  }
  return url.toString();
}

/**
 * Places out of a geocoder response.
 *
 * Yandex's JSON is deeply nested and every level of it is optional. Anything
 * that is not a complete, finite point with a name is skipped rather than
 * passed on half-built — a result with no coordinates cannot be chosen, and one
 * with no name cannot be shown in the header afterwards.
 */
export function readPlaces(payload: unknown): Place[] {
  const members = path(payload, ['response', 'GeoObjectCollection', 'featureMember']);
  if (!Array.isArray(members)) {
    return [];
  }

  const places: Place[] = [];
  for (const member of members.slice(0, MAX_RESULTS)) {
    const object = path(member, ['GeoObject']);
    const point = path(object, ['Point', 'pos']);
    if (typeof point !== 'string') {
      continue;
    }
    // "44.5152 40.1798" — longitude, then latitude, space-separated.
    const [lng, lat] = point.split(' ').map(Number);
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    const label = nameOf(object);
    if (label !== '') {
      places.push({ lat, lng, label });
    }
  }
  return places;
}

/**
 * The name to show for a result.
 *
 * `name` is the specific part ("Northern Avenue, 5") and `description` the
 * containing places ("Yerevan, Armenia"). The pair reads the way an address is
 * said out loud, and `name` alone would list five identical "5"s for a street
 * number in five districts.
 */
function nameOf(object: unknown): string {
  const name = path(object, ['name']);
  const description = path(object, ['description']);
  return [typeof name === 'string' ? name : '', typeof description === 'string' ? description : '']
    .filter((part) => part !== '')
    .join(', ');
}

function path(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
