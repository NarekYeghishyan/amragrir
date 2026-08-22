/**
 * The location picker's map, as arithmetic.
 *
 * The map is Yandex's **widget in a frame** — the embed anyone may use, with no
 * key and no script of ours running inside it. That buys a map that always
 * works and costs the one thing a frame can never give: nothing inside it is
 * readable from outside. A click in the frame is Yandex's click, a pan in the
 * frame is Yandex's pan, and neither is reportable across the boundary — an
 * `<iframe>` on the web and a `WebView` on the phone are the same wall.
 *
 * So the frame is never asked. **The app owns the viewport** — the frame is
 * told where to look through its URL, its own controls are made inert, and the
 * pin, the panning and the zoom are drawn and computed outside it. Which means
 * projecting between coordinates and pixels, which is what this file is.
 *
 * Web Mercator, on the **WGS84 ellipsoid** — EPSG:3395, the projection Yandex
 * uses, rather than the spherical EPSG:3857 of most other maps. The difference
 * is 0.4% of any north-south movement: too small to see in a single pan, large
 * enough to be a wrong answer, and four lines either way.
 *
 * Shared rather than written twice: the browser and the phone point the same
 * widget at the same city, and a projection that disagreed between them would
 * put the pin on a different street for the same tap.
 */

/** Yandex's tile size, and so the size of the world at zoom 0. */
const TILE = 256;

/** WGS84's first eccentricity — the whole of the difference from a sphere. */
const ECCENTRICITY = 0.081_819_190_842_622;

/** Below 10 Yerevan is a dot on a country; above 18 the tiles run out. */
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 18;

/** Close enough to see which side of the street a pin is on. Used when a place
 *  arrives from somewhere other than the map — a search result, a recent,
 *  geolocation — and the map has to go and show it. */
export const PICKED_ZOOM = 16;

/**
 * How far the frame is drawn past the edges of its box, in pixels.
 *
 * This is what makes panning free. Changing the frame's URL reloads the whole
 * widget, so a map that re-pointed the frame on every drag would blink on every
 * drag. Instead the frame is bigger than the hole it shows through and gets
 * *moved* — real tiles slide into view, nothing reloads, and the URL is only
 * rewritten once a pan has used most of the margin up.
 */
export const BLEED = 220;

export interface View {
  lat: number;
  lng: number;
  zoom: number;
}

/** The frame cannot inherit a page's theme across the boundary, so it is told
 *  which one to draw. */
export type MapTheme = 'light' | 'dark';

/**
 * Yandex's language codes — one per language this product is published in.
 *
 * All three are real: `hy_AM` answers `Վարդանանց փողոց, 10 · Երևան, Հայաստան`
 * and the map widget draws its labels and its own controls in Armenian too.
 * Shared with the geocoder, which points at the same company in the same
 * language; that mapping is one fact.
 */
export function yandexLang(language: string): string {
  if (language === 'ru') {
    return 'ru_RU';
  }
  return language === 'hy' ? 'hy_AM' : 'en_US';
}

/**
 * The frame's URL.
 *
 * `map-widget/v1` is the public embed — no key, no quota to run out, and no
 * script of ours inside it. Coordinates go in longitude-first, as they do
 * everywhere in Yandex's APIs.
 */
export function mapFrameUrl(view: View, language: string, theme: MapTheme): string {
  const url = new URL('https://yandex.ru/map-widget/v1/');
  url.searchParams.set('ll', `${round(view.lng)},${round(view.lat)}`);
  url.searchParams.set('z', String(view.zoom));
  url.searchParams.set('l', 'map');
  url.searchParams.set('lang', yandexLang(language));
  url.searchParams.set('theme', theme);
  return url.toString();
}

/**
 * The same view, on Yandex's own site.
 *
 * The widget draws its logo and its terms link in its own bottom corner, and
 * the frame is deliberately larger than the box it shows through — so that
 * corner is off-screen, clipped along with everything else outside the hole.
 * The credit is therefore put back by hand, as a link that goes where the
 * widget's own would have gone.
 */
export function mapSiteUrl(view: View): string {
  const url = new URL('https://yandex.ru/maps/');
  url.searchParams.set('ll', `${round(view.lng)},${round(view.lat)}`);
  url.searchParams.set('z', String(view.zoom));
  return url.toString();
}

/**
 * The point `dx` pixels right and `dy` pixels down from the middle of a view.
 *
 * Both directions are screen directions: `dy` positive is *south*, because that
 * is the way pixels count. This is how a tap becomes a place.
 */
export function pointAt(view: View, dx: number, dy: number): { lat: number; lng: number } {
  const world = worldSize(view.zoom);
  return {
    lat: latAt(clamp(yOf(view.lat, view.zoom) + dy, 0, world), view.zoom),
    lng: wrapLng(view.lng + (dx / world) * 360),
  };
}

/** The inverse: where a place sits relative to the middle of a view, in pixels.
 *  This is how a place becomes a pin. */
export function pixelsFrom(
  view: View,
  place: { lat: number; lng: number },
): { x: number; y: number } {
  const world = worldSize(view.zoom);
  return {
    x: (shortestWay(place.lng - view.lng) / 360) * world,
    y: yOf(place.lat, view.zoom) - yOf(view.lat, view.zoom),
  };
}

/** A step in or out, refusing to leave the range where the map is a city. */
export function zoomedBy(view: View, step: number): View {
  return { ...view, zoom: clamp(view.zoom + step, MIN_ZOOM, MAX_ZOOM) };
}

/**
 * How much larger the picture has to get before it is worth a whole zoom level.
 *
 * A quarter again as large is a deliberate spread; anything smaller is a hand
 * settling on the glass, or a trackpad's idea of a nudge.
 */
export const PINCH_STEP = 1.25;

/**
 * The zoom levels a scaling of the picture is worth.
 *
 * The frame is a *picture* of a map drawn at one whole zoom level — the widget
 * cannot be asked to zoom, and re-pointing its URL is a reload. So a pinch (or,
 * on a trackpad, a wheel) scales the picture live and is only turned into a
 * level when the gesture stops, which is what this converts.
 *
 * **Doubling is one level**, as it is in any tile pyramid — hence `log2`. What
 * `Math.round` alone would do with the rest of the range is the part worth
 * writing down: it asks for half as much again (`√2`) before *anything*
 * happens, and on a map box the size of a phone's that is most of the box.
 * People pinch a quarter, watch the map spring back to exactly where it was,
 * and conclude the gesture does not work. So past `PINCH_STEP` the answer is
 * never zero, and rounding only decides between one level and several.
 */
export function zoomSteps(spread: number): number {
  // Compared as a ratio rather than as a rounded logarithm, so that pinching in
  // by a quarter is worth exactly what pinching out by a quarter is. `1.25` and
  // `1/1.25` do not have logarithms of equal size in floating point, and a
  // gesture that worked one way and not the other would be a strange bug.
  if (!(spread > 0) || (spread < PINCH_STEP && spread > 1 / PINCH_STEP)) {
    return 0;
  }
  const levels = Math.log2(spread);
  return levels > 0 ? Math.max(1, Math.round(levels)) : Math.min(-1, Math.round(levels));
}

/** Sliding further than the bleed would show the void past the frame's edge. */
export function withinBleed(pixels: number): number {
  return Math.min(BLEED, Math.max(-BLEED, pixels));
}

function worldSize(zoom: number): number {
  return TILE * 2 ** zoom;
}

/** Latitude to a pixel down the world, ellipsoidal Mercator. */
function yOf(lat: number, zoom: number): number {
  const phi = (clamp(lat, -85, 85) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const scaled =
    Math.tan(Math.PI / 4 + phi / 2) *
    ((1 - ECCENTRICITY * sin) / (1 + ECCENTRICITY * sin)) ** (ECCENTRICITY / 2);
  return worldSize(zoom) * (0.5 - Math.log(scaled) / (2 * Math.PI));
}

/**
 * And back again.
 *
 * The ellipsoidal inverse has no closed form; it is solved by repeating it.
 * Six passes is far more than the four this converges in at any latitude a
 * street address exists at.
 */
function latAt(y: number, zoom: number): number {
  const scaled = Math.exp((0.5 - y / worldSize(zoom)) * 2 * Math.PI);
  let phi = Math.PI / 2 - 2 * Math.atan(1 / scaled);
  for (let pass = 0; pass < 6; pass += 1) {
    const sin = Math.sin(phi);
    phi =
      Math.PI / 2 -
      2 *
        Math.atan(
          (1 / scaled) * ((1 - ECCENTRICITY * sin) / (1 + ECCENTRICITY * sin)) ** (ECCENTRICITY / 2),
        );
  }
  return (phi * 180) / Math.PI;
}

/** Six decimals is ~10cm, and keeps the frame's URL from changing over float
 *  noise — every change to it is a reload. */
function round(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Longitudes either side of the date line are neighbours, not half a world
 *  apart. Nothing in Yerevan needs this; a pin that jumped the globe when the
 *  arithmetic wrapped would be a strange bug to find. */
function shortestWay(degrees: number): number {
  return wrapLng(degrees);
}
