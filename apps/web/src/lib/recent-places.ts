import { encodePlace, metresBetween, parsePlace, type Place } from './locations';

/**
 * The places this browser has chosen before, newest first.
 *
 * **`localStorage`, not a cookie.** Only the picker's dialog ever reads this,
 * and a cookie would ride along on every request to every page for the sake of
 * a row of chips that most visits never open. The chosen place itself *is* a
 * cookie, because the server needs it to build the API query — that is the
 * difference between the two.
 *
 * It follows that recents need JavaScript. Nothing is lost by that: since the
 * district chips were removed, every way to choose a place needs a browser, so
 * a reader without one has nothing to have a history of either.
 */
export const RECENTS_KEY = 'amr_recent_places';

/** Five is what fits on one row at the dialog's width without scrolling, and
 *  a history nobody can see the end of is a list, not a shortcut. */
export const RECENTS_MAX = 5;

/**
 * How close two points have to be to count as the same place.
 *
 * A map tap is never repeated to the metre, so exact equality would fill the
 * row with five copies of one street corner. 120m is about a block: near enough
 * that offering both would be offering the same answer twice.
 */
export const SAME_PLACE_METRES = 120;

/** Newline-separated `encodePlace` values — so every entry is validated on the
 *  way back in by the same parser the cookie uses, and a corrupted line costs
 *  that line rather than the list. */
export function parseRecents(raw: string | null | undefined): Place[] {
  if (!raw) {
    return [];
  }
  const places: Place[] = [];
  for (const line of raw.split('\n')) {
    const place = parsePlace(line.trim());
    if (place) {
      places.push(place);
    }
    if (places.length === RECENTS_MAX) {
      break;
    }
  }
  return places;
}

export function serializeRecents(places: readonly Place[]): string {
  return places.slice(0, RECENTS_MAX).map(encodePlace).join('\n');
}

/**
 * The list with `place` at the front.
 *
 * Anything within `SAME_PLACE_METRES` of it drops out first, so choosing the
 * same corner twice moves it up rather than duplicating it — and re-choosing it
 * under a new name (the geocoder is not deterministic across zoom levels)
 * replaces the old name instead of listing both.
 */
export function withRecent(places: readonly Place[], place: Place): Place[] {
  const others = places.filter((existing) => metresBetween(existing, place) > SAME_PLACE_METRES);
  return [place, ...others].slice(0, RECENTS_MAX);
}

/** Reads the list, tolerating a browser that refuses storage entirely —
 *  Safari's private mode throws on access rather than returning null. */
export function readRecents(): Place[] {
  try {
    return parseRecents(window.localStorage.getItem(RECENTS_KEY));
  } catch {
    return [];
  }
}

/** Records a choice. A failure here must never stop the choice itself from
 *  being stored: the cookie is the thing that matters, this is a convenience. */
export function rememberPlace(place: Place): void {
  try {
    window.localStorage.setItem(RECENTS_KEY, serializeRecents(withRecent(readRecents(), place)));
  } catch {
    // Storage full, disabled, or private mode. The row simply stays as it was.
  }
}
