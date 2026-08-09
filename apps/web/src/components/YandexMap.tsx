'use client';

import { type PointerEvent, useEffect, useRef, useState } from 'react';
import {
  BLEED,
  PICKED_ZOOM,
  type View,
  mapFrameUrl,
  mapSiteUrl,
  pixelsFrom,
  pointAt,
  zoomedBy,
} from '@/lib/map-frame';
import { MapPinShape, PIN_VIEW_BOX } from '@/components/MapPin';
import { YEREVAN, type Place } from '@/lib/locations';
import { type Theme, themeShown } from '@/lib/theme';

/**
 * The picker's map: Yandex's widget in an `<iframe>`, with this app's own hand
 * on it.
 *
 * **Why a frame and not the JS API.** The API needs a key, and a map that is
 * blank wherever nobody has configured one is not a map — it is a promise. The
 * widget embed needs nothing: no key, no quota, no script running on this page,
 * and it carries Yandex's attribution inside itself.
 *
 * What it cannot do is talk. Everything inside the frame belongs to another
 * origin: a tap in there is not reportable out here, and neither is a pan. A
 * map you cannot read is useless for *choosing* a point — so the frame is never
 * asked. It is made `inert`, and this component owns the viewport instead: the
 * pin is drawn here, the pan is a CSS transform here, and the arithmetic that
 * turns pixels into coordinates is in `lib/map-frame.ts`.
 *
 * **Panning is free; reloading is not.** The frame is drawn `BLEED` pixels
 * larger than its box on every side, so a drag slides real tiles into view
 * without touching the URL. Only a zoom, or a pan that has used up the margin,
 * re-points the frame — and that is the one thing here that blinks.
 *
 * **It reports a point and stores nothing.** `onPick` gets a coordinate; what
 * that coordinate is called, and whether it is kept, belongs to
 * `LocationPicker`.
 */
interface Props {
  language: string;
  /** Where the pin goes, and — when it arrives from outside this component —
   *  where the map goes to show it. */
  value: Place | null;
  onPick: (lat: number, lng: number) => void;
  labels: { map: string; zoomIn: string; zoomOut: string; credit: string };
}

/** A press that moved less than this was aiming, not dragging. */
const TAP_SLOP = 6;

/** Re-point the frame once a pan has spent this much of the bleed, so that the
 *  next drag has room to move before it costs a reload. */
const RE_POINT = 0.6;

export function YandexMap({ language, value, onPick, labels }: Props) {
  const [frame, setFrame] = useState<View>(() =>
    value
      ? { lat: value.lat, lng: value.lng, zoom: PICKED_ZOOM }
      : { lat: YEREVAN.lat, lng: YEREVAN.lng, zoom: YEREVAN.zoom },
  );
  const [slide, setSlide] = useState({ x: 0, y: 0 });
  // Read once, when the map is built. Nothing needs to watch it: this component
  // exists only while the dialog is open, and the theme toggle that could
  // change the answer is in the header, behind the dialog's scrim.
  const [theme] = useState<Theme>(() =>
    typeof document === 'undefined'
      ? 'light'
      : themeShown(
          document.documentElement.dataset.theme,
          window.matchMedia('(prefers-color-scheme: dark)').matches,
        ),
  );
  const [dragging, setDragging] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const grabbed = useRef<{ x: number; y: number; slide: { x: number; y: number } } | null>(null);
  const shown = useRef(pointKey(value));

  /**
   * A place chosen anywhere but here — a search result, a recent, "my location"
   * — is taken to and framed. **Un-choosing comes back to Yerevan.**
   *
   * **Everything that gets past the guard came from outside**, which is what
   * makes that the right thing to do. A tap writes the point into `shown` on
   * its way out, so it never arrives here: a map that re-centred every time it
   * was touched would fight whoever was reading it. And the geocoder renaming a
   * point is not a new point, so an address arriving 300ms after the tap that
   * chose it does not move anything either.
   *
   * What is left is somebody asking to be shown something. For a place that is
   * the place, close enough to see which building. For `null` — the ✕ on the
   * badge, the only un-choose there is — it is the city: they have just said
   * "anywhere in Yerevan", and a map still framed on the one street they
   * rejected, at zoom 16, would be showing the opposite of the answer. Same
   * view `YEREVAN` opens on with nothing chosen, so "no place" looks the same
   * however it was arrived at.
   */
  useEffect(() => {
    const key = pointKey(value);
    if (shown.current === key) {
      return;
    }
    shown.current = key;
    setSlide({ x: 0, y: 0 });
    setFrame(
      value
        ? { lat: value.lat, lng: value.lng, zoom: Math.max(frame.zoom, PICKED_ZOOM) }
        : { lat: YEREVAN.lat, lng: YEREVAN.lng, zoom: YEREVAN.zoom },
    );
    // `frame` is read only for "do not zoom back out if they were closer in".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const grab = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    grabbed.current = { x: event.clientX, y: event.clientY, slide };
    setDragging(true);
  };

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const from = grabbed.current;
    if (!from) {
      return;
    }
    setSlide({
      x: within(from.slide.x + event.clientX - from.x),
      y: within(from.slide.y + event.clientY - from.y),
    });
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    const from = grabbed.current;
    grabbed.current = null;
    setDragging(false);
    if (!from || !canvas.current) {
      return;
    }
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;

    if (Math.hypot(dx, dy) <= TAP_SLOP) {
      // A tap picks the point under it, and the map does not move. The pin is
      // drawn by this component rather than by the widget, so it can simply
      // appear where the finger is.
      const box = canvas.current.getBoundingClientRect();
      setSlide(from.slide);
      const point = pointAt(
        frame,
        event.clientX - (box.left + box.width / 2) - from.slide.x,
        event.clientY - (box.top + box.height / 2) - from.slide.y,
      );
      shown.current = pointKey(point);
      onPick(point.lat, point.lng);
      return;
    }

    // A drag moved the view and chose nothing: looking around is not choosing.
    const slid = { x: within(from.slide.x + dx), y: within(from.slide.y + dy) };
    setSlide(slid);
    if (Math.abs(slid.x) > BLEED * RE_POINT || Math.abs(slid.y) > BLEED * RE_POINT) {
      setFrame({ ...pointAt(frame, -slid.x, -slid.y), zoom: frame.zoom });
      setSlide({ x: 0, y: 0 });
    }
  };

  // What is in the middle of the box now. The same thing as `frame` only while
  // nothing has been panned, which is why the zoom and the credit link both ask
  // for it rather than reading `frame`.
  const middle: View = { ...pointAt(frame, -slide.x, -slide.y), zoom: frame.zoom };

  const step = (by: number) => {
    setFrame({ ...middle, zoom: zoomedBy(frame, by).zoom });
    setSlide({ x: 0, y: 0 });
  };

  const at = value ? pixelsFrom(frame, value) : null;

  return (
    <div className="locpick-canvas" ref={canvas}>
      <iframe
        className="locpick-frame"
        title={labels.map}
        src={mapFrameUrl(frame, language, theme)}
        style={{
          left: -BLEED,
          top: -BLEED,
          width: `calc(100% + ${BLEED * 2}px)`,
          height: `calc(100% + ${BLEED * 2}px)`,
          transform: `translate(${slide.x}px, ${slide.y}px)`,
        }}
        // The widget brings controls of its own and they must never run: a pan
        // inside the frame is a pan this app cannot see, and the pin would then
        // be pointing at the wrong street. `inert` takes the frame out of
        // hit-testing and out of the tab order in one attribute — without the
        // second half the dialog's focus trap would have a hole in it the size
        // of a map.
        inert
      />
      {/* What the pointer actually touches. Not reachable by keyboard: a
          surface whose whole vocabulary is "the point under this pixel" has
          nothing to offer a keyboard, and the search box, the recents and "my
          location" are ordinary controls a step away that reach the same
          places by name. */}
      <div
        className={dragging ? 'locpick-grab dragging' : 'locpick-grab'}
        aria-hidden="true"
        onPointerDown={grab}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={() => {
          grabbed.current = null;
          setDragging(false);
        }}
      />
      <div className="locpick-zoom">
        <button type="button" aria-label={labels.zoomIn} onClick={() => step(1)}>
          +
        </button>
        <button type="button" aria-label={labels.zoomOut} onClick={() => step(-1)}>
          −
        </button>
      </div>
      {/* The widget's own credit is drawn in a corner this box does not show —
          see `mapSiteUrl`. This is that credit, put back, and it goes to the
          view on screen rather than to a front page. */}
      <a className="locpick-credit" href={mapSiteUrl(middle)} target="_blank" rel="noreferrer">
        {labels.credit}
      </a>
      {at && (
        <svg
          className="locpick-mappin"
          viewBox={PIN_VIEW_BOX}
          aria-hidden="true"
          style={{
            left: `calc(50% + ${Math.round(at.x + slide.x)}px)`,
            top: `calc(50% + ${Math.round(at.y + slide.y)}px)`,
          }}
        >
          <MapPinShape fill="var(--accent)" />
        </svg>
      )}
    </div>
  );
}

/** Two places are the same place when they are the same point — the geocoder
 *  renaming one is not a reason to move the map. */
function pointKey(place: { lat: number; lng: number } | null): string {
  return place ? `${place.lat},${place.lng}` : '';
}

/** Sliding further than the bleed would show the void past the frame's edge. */
function within(pixels: number): number {
  return Math.min(BLEED, Math.max(-BLEED, pixels));
}
