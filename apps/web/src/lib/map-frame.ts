/**
 * The picker's map, as arithmetic — **now `@amragrir/shared/map-view`**.
 *
 * It moved there when the phone grew the same picker: an `<iframe>` here and a
 * `WebView` there are the same wall around the same widget, so the projection
 * that turns a tap into a coordinate has to be one implementation or the two
 * apps will eventually disagree about which street was pressed. See that file
 * for why the frame is never asked, why it is drawn `BLEED` pixels too large,
 * and why the projection is ellipsoidal (EPSG:3395) rather than spherical.
 *
 * This module stays as the web's name for it — every component and test here
 * imports from `@/lib/map-frame` — and adds nothing of its own.
 */
export {
  BLEED,
  MAX_ZOOM,
  MIN_ZOOM,
  PICKED_ZOOM,
  mapFrameUrl,
  mapSiteUrl,
  pixelsFrom,
  pointAt,
  zoomedBy,
  type View,
} from '@amragrir/shared';
