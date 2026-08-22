import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Circle, G, Path, Svg } from 'react-native-svg';
import {
  BLEED,
  PICKED_ZOOM,
  PINCH_STEP,
  YEREVAN,
  mapFrameUrl,
  mapSiteUrl,
  pixelsFrom,
  pointAt,
  roundCoord,
  withinBleed,
  zoomSteps,
  zoomedBy,
  type Place,
  type View as MapView,
} from '@amragrir/shared';
import { useLanguage } from '../language';
import { useTheme } from '../theme/useTheme';
import { MapFrame } from './MapFrame';
import { useWheelZoom, type Centre } from './wheelZoom';

/**
 * The picker's map: Yandex's widget with this app's own hand on it. The
 * browser's version of this component is `apps/web/src/components/
 * YandexMap.tsx`, and the two are the same idea with different plumbing —
 * the frame is a `WebView` on a phone and an `<iframe>` in a browser
 * (`MapFrame`), and nothing else differs.
 *
 * **Why the widget and not `react-native-maps`.** A native map would mean
 * Google's tiles, a Google Cloud project and a key in `app.json` for the
 * Android build — for a map whose whole job is to let somebody point at a
 * street. The widget embed needs nothing: no key, no quota, no account, and it
 * is the same map, from the same company, that the website already shows.
 *
 * **What it cannot do is talk.** Everything inside the frame belongs to another
 * origin: a tap in there is not reportable out here, and neither is a pan. So
 * the frame is never asked — it is wrapped in a `pointerEvents="none"` view,
 * which is the `inert` of the web version, and this component owns the viewport
 * instead. The pin is drawn here, the pan is a transform here, and the
 * arithmetic that turns a finger into a coordinate is `@amragrir/shared`'s
 * `map-view`, which the website uses for the same purpose.
 *
 * **Panning is free; reloading is not.** The frame is `BLEED` pixels larger
 * than its box on every side, so a drag slides real tiles into view without
 * touching the URL. Only a zoom, or a pan that has spent most of the margin,
 * re-points it — and that is the one thing here that blinks.
 *
 * **Two fingers zoom**, and in the browser build so does a wheel: a trackpad's
 * pinch is not a touch there and never reaches the `PanResponder` at all
 * (`wheelZoom.web.ts`). Both gestures scale the picture live and land on a
 * whole zoom level when they stop — `settle`.
 *
 * **It reports a point and stores nothing.** `onPick` gets a coordinate; what
 * that coordinate is called, and whether it is kept, belongs to
 * `LocationSheet`.
 */
export function YandexMap({
  value,
  onPick,
  labels,
}: {
  /** Where the pin goes, and — when it arrives from outside this component —
   *  where the map goes to show it. */
  value: Place | null;
  onPick: (lat: number, lng: number) => void;
  labels: { map: string; credit: string; zoomIn: string; zoomOut: string };
}) {
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const [frame, setFrame] = useState<MapView>(() =>
    value
      ? { lat: value.lat, lng: value.lng, zoom: PICKED_ZOOM }
      : { lat: YEREVAN.lat, lng: YEREVAN.lng, zoom: YEREVAN.zoom },
  );
  const [slide, setSlide] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState({ width: 0, height: 0 });

  /**
   * A place chosen anywhere but here — a search result, a recent, "my location"
   * — is taken to and framed; un-choosing comes back to the city.
   *
   * Read during render rather than in an effect, and compared by point: a tap
   * writes its own point in on the way out, so it never arrives back here. A
   * map that re-centred every time it was touched would fight whoever was
   * reading it, and the geocoder renaming a point 300ms later is not a new
   * point.
   */
  const shown = useRef(pointKey(value));
  if (shown.current !== pointKey(value)) {
    shown.current = pointKey(value);
    setSlide({ x: 0, y: 0 });
    setFrame((current) =>
      value
        ? { lat: value.lat, lng: value.lng, zoom: Math.max(current.zoom, PICKED_ZOOM) }
        : { lat: YEREVAN.lat, lng: YEREVAN.lng, zoom: YEREVAN.zoom },
    );
  }

  /**
   * How much larger the picture is being drawn than the map it is a picture of.
   *
   * The frame is a *picture* of a map at one zoom level — the widget cannot be
   * asked to zoom, and re-pointing its URL is a reload. So a pinch scales the
   * picture under the fingers and is only turned into a zoom when they lift.
   * The gesture is therefore live and free, and costs exactly one reload, in
   * the same trade `BLEED` makes for panning.
   */
  const [scale, setScale] = useState(1);
  /**
   * The point the scaling happens about, in pixels from the middle of the box.
   *
   * **The fingers, not the middle.** A picture that grew about its own centre
   * would slide whatever is under the fingers away from them as it grew, which
   * is the half of "the pinch does not work properly" that a screenshot cannot
   * show. Anchored here, the street somebody is pinching on stays under their
   * hand for the whole gesture, and the frame lands on it afterwards.
   */
  const [pivot, setPivot] = useState({ x: 0, y: 0 });

  // Held in a ref as well as in state: the responder below is created once and
  // would otherwise close over the first frame forever.
  const live = useRef({ frame, slide, box, scale });
  live.current = { frame, slide, box, scale };

  /**
   * A scaled picture, put back on a whole zoom level.
   *
   * Both gestures end here — the fingers lifting on a phone, the wheel going
   * quiet in a browser — because both say the same thing: this much larger,
   * about this point. `zoomSteps` decides how many levels that is worth.
   */
  const settle = useCallback((asked: number, centre: Centre) => {
    setScale(1);
    const { frame: view, box: size, slide: slid } = live.current;
    // What was *drawn*, not what was asked for: a gesture must land on the map
    // it appeared to be moving.
    const zoom = zoomedBy(view, zoomSteps(shownScale(asked, size))).zoom;
    if (zoom === view.zoom) {
      // Too small a gesture to reach a level, or the map is already as close as
      // it goes. Either way the picture springs back and nothing reloads.
      return;
    }
    // The map goes to what was held rather than staying where it was: the point
    // somebody pinched on is the point they are asking to see. Because the
    // scaling was anchored there, that point is exactly where it was when the
    // gesture began, and the arithmetic does not have to undo the scaling.
    const held = pointAt(
      view,
      centre.x - size.width / 2 - slid.x,
      centre.y - size.height / 2 - slid.y,
    );
    setFrame({ ...held, zoom });
    setSlide({ x: 0, y: 0 });
  }, []);

  /** Where a gesture is centred, as the transform below wants it: from the
   *  middle of the box rather than from its corner. */
  const pivotAt = useCallback(
    (centre: Centre) => ({
      x: centre.x - live.current.box.width / 2,
      y: centre.y - live.current.box.height / 2,
    }),
    [],
  );

  // A trackpad's pinch reaches the browser as a wheel and never as a touch, so
  // the web build hears it separately and hands it here in the same shape.
  const canvas = useRef<View>(null);
  useWheelZoom(
    canvas,
    useCallback(
      (spread: number, centre: Centre, settled: boolean) => {
        if (settled) {
          settle(spread, centre);
          return;
        }
        setPivot(pivotAt(centre));
        setScale(shownScale(spread, live.current.box));
      },
      [settle, pivotAt],
    ),
  );

  /** Where the slide was when the finger landed. */
  const grabbed = useRef({ x: 0, y: 0 });
  /** Where the box is on the screen, measured when a finger lands on it. A
   *  second finger may come down on the zoom keys or the credit, and its
   *  `locationX` would then be measured from *those* — page coordinates and one
   *  known origin are the same answer for every finger. */
  const origin = useRef({ x: 0, y: 0 });
  /**
   * The most fingers this gesture has had at once.
   *
   * **Fingers do not leave the glass together**, and the one that stays is the
   * tail of a zoom rather than the start of anything. It matters because it can
   * arrive as a *new* gesture: things sit above the map's touch overlay — the
   * badge, the zoom keys, the credit — and when the finger holding the overlay
   * lifts, React Native hands the gesture back, whereupon the finger still down
   * takes it again through `onMoveShouldSetPanResponder`. That second gesture
   * is a few pixels long, which is a tap, which would move the chosen point to
   * wherever a hand happened to be coming off the screen.
   *
   * So this is *not* cleared when a gesture is granted — only when a finger
   * lands on an empty screen (`onPanResponderStart` with one touch) or when the
   * last one leaves. Two fingers seen anywhere in that span means nothing
   * afterwards is a tap or a pan until the glass is clear.
   */
  const fingers = useRef(0);
  /** The pinch in progress: how far apart the fingers started, how far apart
   *  they are now, and where they are centred. Null while one finger, or none,
   *  is down. Kept here rather than read back off `scale` at the end, so that a
   *  gesture let go of between two frames still commits what it drew. */
  const pinch = useRef<{ startedApart: number; apart: number; centre: Centre } | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A pinch is several touches over several hundred milliseconds, and the
        // sheet it sits in is full of things that would like to have them.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event, gesture) => {
          const touch = event.nativeEvent;
          origin.current = {
            x: touch.pageX - touch.locationX,
            y: touch.pageY - touch.locationY,
          };
          grabbed.current = live.current.slide;
          fingers.current = Math.max(fingers.current, gesture.numberActiveTouches);
          // Not cleared unconditionally: two fingers landing together can be
          // reported as a start before the grant, and the baseline that
          // measured is the one worth keeping.
          if (gesture.numberActiveTouches < 2) {
            pinch.current = null;
          }
        },
        // Fires for *every* finger that lands, not only the first — which is
        // the one moment the fingers are exactly as far apart as the gesture
        // began. Measured from the first move instead, the pinch would already
        // have lost however far the hand travelled in that frame, and a small
        // deliberate spread would come out just under a whole level.
        onPanResponderStart: (event, gesture) => {
          const [first, second] = event.nativeEvent.touches ?? [];
          if (gesture.numberActiveTouches < 2 || !first || !second) {
            // A finger landing on an empty screen is the only thing that starts
            // a gesture from nothing, and so the only thing that may forget the
            // one before it.
            if (gesture.numberActiveTouches <= 1) {
              fingers.current = gesture.numberActiveTouches;
            }
            return;
          }
          fingers.current = Math.max(fingers.current, gesture.numberActiveTouches);
          const apart = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
          if (apart <= 0) {
            // Two fingers in one place is not a distance to measure against.
            return;
          }
          pinch.current = {
            startedApart: apart,
            apart,
            centre: {
              x: (first.pageX + second.pageX) / 2 - origin.current.x,
              y: (first.pageY + second.pageY) / 2 - origin.current.y,
            },
          };
        },
        onPanResponderMove: (event, gesture) => {
          const touches = event.nativeEvent.touches ?? [];
          const [first, second] = touches;

          // `numberActiveTouches` is asked as well as the list: a move can
          // arrive carrying only the finger that moved, and treating that as
          // one finger mid-pinch would leap the map sideways.
          if (gesture.numberActiveTouches >= 2 || touches.length >= 2) {
            fingers.current = Math.max(fingers.current, 2);
            if (!first || !second) {
              return;
            }
            const apart = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
            const centre = {
              x: (first.pageX + second.pageX) / 2 - origin.current.x,
              y: (first.pageY + second.pageY) / 2 - origin.current.y,
            };
            if (pinch.current === null || pinch.current.startedApart <= 0) {
              // Two fingers this responder never saw land — `onPanResponderStart`
              // should have measured them. This frame only establishes what
              // "unchanged" means; scaling from it would jump.
              pinch.current = { startedApart: apart, apart, centre };
              return;
            }
            pinch.current.centre = centre;
            pinch.current.apart = apart;
            setPivot(pivotAt(centre));
            setScale(shownScale(apart / pinch.current.startedApart, live.current.box));
            return;
          }

          // A finger lifted mid-pinch leaves the other one on the screen. Its
          // movement is not a pan — the map would leap sideways out from under
          // a gesture that was about zoom — and that holds whether the pinch is
          // still this gesture or was handed back when the first finger left.
          if (pinch.current !== null || fingers.current >= 2) {
            return;
          }

          const from = grabbed.current;
          setSlide({
            x: withinBleed(from.x + gesture.dx),
            y: withinBleed(from.y + gesture.dy),
          });
        },
        onPanResponderRelease: (event, gesture) => {
          const from = grabbed.current;
          const { frame: view, box: size } = live.current;
          const zoomed = fingers.current >= 2;
          if (gesture.numberActiveTouches === 0) {
            fingers.current = 0;
          }

          if (pinch.current !== null) {
            const { centre, apart, startedApart } = pinch.current;
            pinch.current = null;
            settle(apart / startedApart, centre);
            return;
          }

          if (zoomed) {
            // The last finger of a zoom, coming off on its own. It has already
            // been paid for — the pinch settled when the responder was handed
            // back — and the pixel or two it moved is not a tap.
            return;
          }

          if (Math.hypot(gesture.dx, gesture.dy) <= TAP_SLOP) {
            // A tap picks the point under it, and the map does not move. The
            // pin is drawn by this component rather than by the widget, so it
            // can simply appear where the finger is. `locationX/Y` are measured
            // from this overlay, which is the box itself.
            setSlide(from);
            const point = pointAt(
              view,
              event.nativeEvent.locationX - size.width / 2 - from.x,
              event.nativeEvent.locationY - size.height / 2 - from.y,
            );
            // Rounded here, to the precision a place is stored at. The guard
            // above compares points, so a tap reported at full precision and
            // handed back rounded would read as somebody asking to be taken
            // somewhere — and the map would re-centre and zoom on every tap.
            const lat = roundCoord(point.lat);
            const lng = roundCoord(point.lng);
            shown.current = pointKey({ lat, lng });
            onPick(lat, lng);
            return;
          }

          // A drag moved the view and chose nothing: looking around is not
          // choosing.
          const slid = {
            x: withinBleed(from.x + gesture.dx),
            y: withinBleed(from.y + gesture.dy),
          };
          if (Math.abs(slid.x) > BLEED * RE_POINT || Math.abs(slid.y) > BLEED * RE_POINT) {
            setFrame({ ...pointAt(view, -slid.x, -slid.y), zoom: view.zoom });
            setSlide({ x: 0, y: 0 });
            return;
          }
          setSlide(slid);
        },
        onPanResponderTerminate: (event, gesture) => {
          if (pinch.current !== null) {
            // Taken away mid-zoom. What the fingers had already asked for is
            // worth keeping — the alternative is a gesture that scaled the map
            // for a second and then pretended it had not happened.
            const { centre, apart, startedApart } = pinch.current;
            pinch.current = null;
            settle(apart / startedApart, centre);
          } else {
            setScale(1);
            setSlide(grabbed.current);
          }
          if (gesture.numberActiveTouches === 0) {
            fingers.current = 0;
          }
        },
      }),
    [onPick, settle, pivotAt],
  );

  // What is in the middle of the box now — the same thing as `frame` only while
  // nothing has been panned, which is why the zoom and the credit ask for it.
  const middle: MapView = { ...pointAt(frame, -slide.x, -slide.y), zoom: frame.zoom };

  const step = (by: number) => {
    setFrame({ ...middle, zoom: zoomedBy(frame, by).zoom });
    setSlide({ x: 0, y: 0 });
  };

  const at = value ? pixelsFrom(frame, value) : null;

  return (
    <View
      ref={canvas}
      style={[styles.canvas, { backgroundColor: colors.placeholder }]}
      onLayout={(event: LayoutChangeEvent) =>
        setBox({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {/* Built only once the box is measured: the frame's size is the box plus
          the bleed, and a frame sized to nothing would load the widget twice. */}
      {box.width > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.frame,
            {
              width: box.width + BLEED * 2,
              height: box.height + BLEED * 2,
              // Read right to left, as a transform list is: scaled about the
              // middle of the box, then moved so that the scaling lands on
              // `pivot` — the fingers — instead. At rest (`scale === 1`) the
              // pivot term is zero and this is the pan and nothing else.
              transform: [
                { translateX: slide.x * scale + pivot.x * (1 - scale) },
                { translateY: slide.y * scale + pivot.y * (1 - scale) },
                { scale },
              ],
            },
          ]}
        >
          <MapFrame
            url={mapFrameUrl(frame, language, isDark ? 'dark' : 'light')}
            title={labels.map}
            background={colors.placeholder}
          />
        </View>
      ) : null}

      {/* What the finger actually touches. */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {at ? (
        <View
          pointerEvents="none"
          style={[
            styles.pin,
            {
              // The frame's own transform, applied by hand — the pin is drawn
              // outside the frame and would otherwise walk off its street as
              // the map grows under it.
              left: box.width / 2 + (at.x + slide.x - pivot.x) * scale + pivot.x - PIN_SIZE / 2,
              top: box.height / 2 + (at.y + slide.y - pivot.y) * scale + pivot.y - PIN_SIZE,
            },
          ]}
        >
          <Svg width={PIN_SIZE} height={PIN_SIZE} viewBox="-12 -26 24 30">
            <G>
              <Path
                d="M0 2 C0 2 -9 -8 -9 -15 A9 9 0 1 1 9 -15 C9 -8 0 2 0 2 Z"
                fill={colors.accent}
                stroke="#fff"
                strokeWidth={2}
              />
              <Circle cx={0} cy={-15} r={3.6} fill="#fff" />
            </G>
          </Svg>
        </View>
      ) : null}

      <View style={styles.zoom}>
        <Pressable
          onPress={() => step(1)}
          accessibilityLabel={labels.zoomIn}
          style={[styles.zoomKey, { backgroundColor: colors.glass, borderColor: colors.line }]}
        >
          <Text style={[styles.zoomText, { color: colors.ink }]}>+</Text>
        </Pressable>
        <Pressable
          onPress={() => step(-1)}
          accessibilityLabel={labels.zoomOut}
          style={[styles.zoomKey, { backgroundColor: colors.glass, borderColor: colors.line }]}
        >
          <Text style={[styles.zoomText, { color: colors.ink }]}>−</Text>
        </Pressable>
      </View>

      {/* The widget's own credit sits in a corner this box does not show — the
          frame is larger than the hole. This is that credit, put back, and it
          opens the view on screen rather than a front page. */}
      <Pressable
        onPress={() => void Linking.openURL(mapSiteUrl(middle))}
        accessibilityRole="link"
        style={[styles.credit, { backgroundColor: colors.glass, borderColor: colors.line }]}
      >
        <Text style={[styles.creditText, { color: colors.ink2 }]}>{labels.credit}</Text>
      </Pressable>
    </View>
  );
}

/** A press that moved less than this was aiming, not dragging. */
const TAP_SLOP = 6;

/** How far a gesture may stretch the picture before it stops following the
 *  fingers. Two levels in is as much as one of them can mean, and past that the
 *  tiles are too coarse to be worth showing. */
const MAX_PINCH = 4;

/** The smallest the picture may ever be drawn, for a box not yet measured. */
const MIN_PINCH = 0.25;

/**
 * The scaling actually drawn.
 *
 * **Shrinking has a harder limit than growing**, and it is the bleed's. The
 * frame is only `BLEED` pixels larger than the box on each side, so a picture
 * scaled much below its own size pulls its edges into view and the customer
 * ends up pinching a rectangle of background with a small map in it. The floor
 * is therefore whatever still covers the hole — about a level out, on a phone,
 * which is as much as one gesture needs to mean anyway.
 *
 * On a box large enough that even `PINCH_STEP` would show an edge, the edge
 * wins: a sliver of background for a moment is a smaller failure than a gesture
 * that cannot zoom out at all.
 */
function shownScale(spread: number, box: { width: number; height: number }): number {
  const covered =
    box.width > 0 && box.height > 0
      ? Math.max(box.width / (box.width + BLEED * 2), box.height / (box.height + BLEED * 2))
      : MIN_PINCH;
  return clamp(spread, Math.max(MIN_PINCH, Math.min(covered, 1 / PINCH_STEP)), MAX_PINCH);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Re-point the frame once a pan has spent this much of the bleed, so that the
 *  next drag has room to move before it costs a reload. */
const RE_POINT = 0.6;

const PIN_SIZE = 30;

/** Two places are the same place when they are the same point — the geocoder
 *  renaming one is not a reason to move the map. */
function pointKey(place: { lat: number; lng: number } | null): string {
  return place ? `${place.lat},${place.lng}` : '';
}

const styles = StyleSheet.create({
  canvas: { flex: 1, minHeight: 180, borderRadius: 18, overflow: 'hidden' },
  frame: { position: 'absolute', left: -BLEED, top: -BLEED },
  pin: { position: 'absolute', width: PIN_SIZE, height: PIN_SIZE },
  zoom: { position: 'absolute', right: 10, bottom: 58, gap: 8 },
  zoomKey: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { fontSize: 19, fontWeight: '700', lineHeight: 22 },
  credit: {
    position: 'absolute',
    right: 10,
    top: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  creditText: { fontSize: 10.5, fontWeight: '600' },
});
