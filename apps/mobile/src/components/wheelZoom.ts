import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Where a gesture is centred, in pixels from the top-left of the map's box. */
export interface Centre {
  x: number;
  y: number;
}

/**
 * Zooming with a wheel — which a phone does not have.
 *
 * This is the native half of a split, like `MapFrame`: on a device the fingers
 * arrive through the `PanResponder` in `YandexMap` and there is nothing here to
 * listen for. The browser build is `wheelZoom.web.ts`, and it exists because a
 * trackpad pinch is not a touch — see there.
 */
export function useWheelZoom(
  _canvas: RefObject<View | null>,
  _scaled: (spread: number, centre: Centre, settled: boolean) => void,
): void {
  // Deliberately nothing.
}
