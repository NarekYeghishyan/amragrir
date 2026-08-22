import { RECENTS_MAX, SAME_PLACE_METRES, withRecent } from '@amragrir/shared';
import { encodePlace, parsePlace, type Place } from './locations';

/** The list itself is `@amragrir/shared` — the phone keeps one too, with the
 *  same cap and the same idea of what counts as the same corner. What is here
 *  is the browser's way of holding it. */
export { RECENTS_MAX, SAME_PLACE_METRES, withRecent };

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
