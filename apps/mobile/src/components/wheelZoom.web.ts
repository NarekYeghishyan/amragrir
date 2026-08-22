import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import type { Centre } from './wheelZoom';

export type { Centre } from './wheelZoom';

/**
 * Zooming with a wheel, which on a laptop is what two fingers are.
 *
 * **A trackpad pinch is not a touch.** The browser reports it as a `wheel`
 * event with `ctrlKey` set — no touches, no pointers, nothing the
 * `PanResponder` in `YandexMap` can ever see. So in the browser build the map
 * listens for wheels itself and reports them in the shape a pinch has: how much
 * larger the picture should be, about which point, and whether the gesture has
 * stopped. `YandexMap` cannot tell the two apart, and does not need to.
 *
 * An ordinary mouse wheel zooms too, one level a notch. Nothing scrolls under
 * this box — the sheet's map is a fixed pane — so a wheel over it has no other
 * meaning, and a map that ignored one would be the only map that does.
 */
export function useWheelZoom(
  canvas: RefObject<View | null>,
  scaled: (spread: number, centre: Centre, settled: boolean) => void,
): void {
  // The listener is attached once; without this it would close over the first
  // render's callback forever.
  const report = useRef(scaled);
  report.current = scaled;

  useEffect(() => {
    // On web a `View`'s ref *is* the DOM node — the whole app is React DOM
    // through `react-native-web`.
    const node = canvas.current as unknown as HTMLElement | null;
    if (node === null || typeof node.addEventListener !== 'function') {
      return;
    }

    /** How far the wheel has turned since this gesture began. */
    let spent = 0;
    let centre: Centre = { x: 0, y: 0 };
    let settling: ReturnType<typeof setTimeout> | undefined;

    const spreadNow = () => 2 ** (-spent / LEVEL);

    const onWheel = (event: WheelEvent) => {
      // Without this the browser zooms its own page on ctrl+wheel: the whole
      // app grows, which is the one thing the customer did not ask for.
      event.preventDefault();
      const box = node.getBoundingClientRect();
      centre = { x: event.clientX - box.left, y: event.clientY - box.top };
      spent = Math.min(SPAN, Math.max(-SPAN, spent + weigh(event)));
      report.current(spreadNow(), centre, false);

      // A wheel has no "lift", so the pause after the last notch is what ends
      // the gesture — the moment the pinch's release stands in for. One reload
      // of the widget per gesture rather than one per notch.
      clearTimeout(settling);
      settling = setTimeout(() => {
        const spread = spreadNow();
        spent = 0;
        report.current(spread, centre, true);
      }, SETTLE_MS);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      clearTimeout(settling);
      node.removeEventListener('wheel', onWheel);
    };
  }, [canvas]);
}

/** A notch of an ordinary mouse wheel, near enough, and so one zoom level. */
const LEVEL = 120;

/** Two levels each way, the same range the fingers are allowed. */
const SPAN = LEVEL * 2;

/** A trackpad's pinch arrives in fractions of a notch — a whole gesture would
 *  otherwise be worth a third of a level. */
const PINCH_WEIGHT = 4;

/** Long enough to cover the gap between notches of the same flick, short
 *  enough that the map does not feel like it is thinking. */
const SETTLE_MS = 180;

/** Wheels report in three different units, and browsers disagree about which. */
function weigh(event: WheelEvent): number {
  const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? PAGE_HEIGHT : 1;
  return event.deltaY * unit * (event.ctrlKey ? PINCH_WEIGHT : 1);
}

const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 400;
