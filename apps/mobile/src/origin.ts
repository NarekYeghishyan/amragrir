import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

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
 */

/** Republic Square — the fallback, and what every user got until 2026-08-10. */
export const YEREVAN_CENTRE = { lat: 40.1776, lng: 44.5126 } as const;

export interface Origin {
  lat: number;
  lng: number;
  /** True once this is the device's own position rather than the fallback, so
   *  a screen can say whether the distances are about the reader. */
  isDevice: boolean;
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
export function useOrigin(): Origin {
  const [origin, setOrigin] = useState<Origin>({ ...YEREVAN_CENTRE, isDevice: false });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) {
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        if (!cancelled) {
          setOrigin({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            isDevice: true,
          });
        }
      } catch {
        // A simulator with no fix, a sensor that is off, a refusal that throws
        // rather than answers. The fallback is already on screen and is the
        // honest one — there is nothing to tell somebody that a list of
        // restaurants in Yerevan does not already say.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return origin;
}
