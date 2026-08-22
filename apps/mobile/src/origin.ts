import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { YEREVAN } from '@amragrir/shared';
import { useLanguage } from './language';
import { nameOf } from './place';

/**
 * Where "near me" is measured from.
 *
 * **Republic Square used to be the answer for everybody.** The feed sent one
 * hardcoded pair of coordinates, so every distance on every card was the
 * distance from the centre of Yerevan and "Nearest" sorted by it — which is
 * right for nobody standing anywhere else, and quietly wrong rather than
 * visibly broken. The browser has asked for the visitor's position since the
 * location picker was built; the device with the actual GPS did not.
 *
 * Kept as a hook with a fallback rather than as a gate: a feed that shows
 * nothing until somebody answers a permission dialog is a feed that shows
 * nothing to anyone who says no. Republic Square stays as the answer for a
 * refusal, an unavailable sensor, or the moments before the fix arrives — the
 * distances are then wrong in the same way they were wrong for everybody
 * before, which is a floor rather than a regression.
 *
 * **This is the feed's origin only while nothing has been chosen.** The
 * location picker (`src/place.ts`, `components/LocationSheet.tsx`) stores a
 * point, and a stored point wins over the sensor — somebody who says "show me
 * what is near the office" means it whether or not they are standing there.
 */

/** Republic Square — the fallback, and what every user got until 2026-08-10.
 *  The same point the picker's map opens on, so it is read from the one place
 *  that names it. */
export const YEREVAN_CENTRE = { lat: YEREVAN.lat, lng: YEREVAN.lng } as const;

export interface Origin {
  lat: number;
  lng: number;
  /** True once this is the device's own position rather than the fallback, so
   *  a screen can say whether the distances are about the reader. */
  isDevice: boolean;
}

export interface Located {
  /**
   * Where to measure from. **Its identity changes only when the position
   * does** — the label below settles a moment later, and the feed refetches on
   * this object, so folding the two together would reload the whole list to
   * put a street name on screen.
   */
  origin: Origin;
  /** "Yerevan · Northern Ave" — the reverse-geocoded place, once it answers.
   *  Null while it has not, and when there is no fix to name. */
  label: string | null;
  /** True once the permission has been refused, so a screen can offer the way
   *  back in rather than showing a blank where a place should be. */
  denied: boolean;
  /** Ask again — or, where the OS will no longer prompt, open the app's
   *  settings, which is the only remaining way to say yes. */
  retry: () => void;
}

/**
 * Asks once, and answers immediately either way.
 *
 * The permission prompt is raised on first use of the feed rather than at
 * launch: asking for somebody's location before showing them anything is the
 * request with the worst answer rate, and the screen behind the dialog is
 * already useful.
 *
 * `Accuracy.Low` — roughly a kilometre — because the answer is used to sort a
 * list of restaurants and round a distance to 100m for display. Asking for a
 * ten-metre fix would spend the radio and the battery on precision nothing
 * here reads.
 */
export function useOrigin(): Located {
  const { language } = useLanguage();
  const [origin, setOrigin] = useState<Origin>({ ...YEREVAN_CENTRE, isDevice: false });
  const [label, setLabel] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  /** Bumped by `retry`, which is the whole point of it: the effect below is the
   *  only thing that talks to the sensor, so asking again means running it. */
  const [attempt, setAttempt] = useState(0);
  /** Whether the OS will still show the dialog. A ref rather than state: only
   *  `retry` reads it, and re-rendering the feed to record it would be a render
   *  for something nothing draws. */
  const askable = useRef(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) {
          if (!cancelled) {
            setDenied(true);
            // Remembered so `retry` knows the OS will not prompt again and goes
            // to the settings app instead of calling a dialog that never opens.
            askable.current = canAskAgain;
          }
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        if (cancelled) {
          return;
        }
        setDenied(false);
        setOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          isDevice: true,
        });

        // Named after the fix is on screen, not before it: the distances and
        // the order do not wait on a round trip for a string. One request per
        // fix, and there is one fix. It goes to `GET /geocode` rather than to
        // the device's own geocoder, so the row is written in the language the
        // app is being read in instead of the language of the OS.
        const named = await nameOf(
          position.coords.latitude,
          position.coords.longitude,
          language,
        );
        if (!cancelled && named) {
          setLabel(named);
        }
      } catch {
        // A simulator with no fix, a sensor that is off, a refusal that throws
        // rather than answers, or a geocoder that did not reply. The fallback is
        // already on screen and is the honest one — there is nothing to tell
        // somebody that a list of restaurants in Yerevan does not already say.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, language]);

  const retry = useCallback(() => {
    if (askable.current) {
      setAttempt((current) => current + 1);
      return;
    }
    // Refused for good: iOS stops prompting after the first no, and the switch
    // lives in the settings app from then on.
    void Linking.openSettings();
  }, []);

  return { origin, label, denied, retry };
}
