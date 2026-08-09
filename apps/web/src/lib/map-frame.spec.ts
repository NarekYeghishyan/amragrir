import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  mapFrameUrl,
  mapSiteUrl,
  pixelsFrom,
  pointAt,
  zoomedBy,
} from './map-frame';
import { YEREVAN, metresBetween } from './locations';

const CENTRE = { lat: YEREVAN.lat, lng: YEREVAN.lng, zoom: 16 };

describe('mapFrameUrl', () => {
  it('points the widget at a view, longitude first', () => {
    const url = new URL(mapFrameUrl({ lat: 40.1776, lng: 44.5126, zoom: 12 }, 'ru', 'light'));
    expect(url.origin + url.pathname).toBe('https://yandex.ru/map-widget/v1/');
    expect(url.searchParams.get('ll')).toBe('44.5126,40.1776');
    expect(url.searchParams.get('z')).toBe('12');
    expect(url.searchParams.get('lang')).toBe('ru_RU');
  });

  it('carries no key, because the widget takes none', () => {
    expect(mapFrameUrl(CENTRE, 'en', 'light')).not.toContain('apikey');
  });

  it('asks for a dark map on a dark page — the frame cannot inherit one', () => {
    expect(new URL(mapFrameUrl(CENTRE, 'en', 'dark')).searchParams.get('theme')).toBe('dark');
  });

  it('rounds, so that float noise cannot reload the frame', () => {
    const url = new URL(mapFrameUrl({ lat: 40.17764444444449, lng: 44.5126, zoom: 12 }, 'en', 'light'));
    expect(url.searchParams.get('ll')).toBe('44.5126,40.177644');
  });
});

describe('mapSiteUrl', () => {
  it('opens the same view on Yandex rather than a front page', () => {
    const url = new URL(mapSiteUrl({ lat: 40.1901, lng: 44.5157, zoom: 17 }));
    expect(url.origin + url.pathname).toBe('https://yandex.ru/maps/');
    expect(url.searchParams.get('ll')).toBe('44.5157,40.1901');
    expect(url.searchParams.get('z')).toBe('17');
  });
});

describe('pointAt / pixelsFrom', () => {
  it('are inverses', () => {
    for (const [dx, dy] of [
      [0, 0],
      [120, -80],
      [-400, 260],
      [1200, 1200],
    ]) {
      const place = pointAt(CENTRE, dx!, dy!);
      const back = pixelsFrom(CENTRE, place);
      expect(back.x).toBeCloseTo(dx!, 6);
      expect(back.y).toBeCloseTo(dy!, 6);
    }
  });

  it('counts pixels the way a screen does: right is east, down is south', () => {
    const point = pointAt(CENTRE, 100, 100);
    expect(point.lng).toBeGreaterThan(CENTRE.lng);
    expect(point.lat).toBeLessThan(CENTRE.lat);
  });

  it('is to scale — 256 pixels at zoom 16 is one tile of Yerevan', () => {
    // 156543.034 * cos(lat) / 2^16 metres per pixel, times 256. Catches a wrong
    // tile size or a zoom off by one, either of which would put the pin a
    // street away from the finger.
    const expected = ((156_543.034 * Math.cos((CENTRE.lat * Math.PI) / 180)) / 2 ** 16) * 256;
    const east = pointAt(CENTRE, 256, 0);
    const away = metresBetween(
      { lat: CENTRE.lat, lng: CENTRE.lng, label: '' },
      { lat: east.lat, lng: east.lng, label: '' },
    );
    expect(away).toBeGreaterThan(expected * 0.99);
    expect(away).toBeLessThan(expected * 1.01);
  });

  it('projects on the ellipsoid Yandex uses, not the sphere most maps use', () => {
    // The mistake this file exists to avoid, and it cannot be caught by a round
    // trip: spherical Mercator is self-consistent, it just disagrees with the
    // tiles underneath by 0.4% of every north-south move. So the spherical
    // formula is written out here as the thing this is deliberately not, and
    // the gap between them is asserted to be exactly the ellipsoid's.
    const world = 256 * 2 ** CENTRE.zoom;
    const sphericalY = (lat: number) =>
      world * (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI));
    const sphericalLat = (y: number) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;

    const dy = -400;
    const ellipsoidal = pointAt(CENTRE, 0, dy).lat - CENTRE.lat;
    const spherical = sphericalLat(sphericalY(CENTRE.lat) + dy) - CENTRE.lat;

    const e2 = 0.081_819_190_842_622 ** 2;
    const phi = (CENTRE.lat * Math.PI) / 180;
    expect(ellipsoidal / spherical).toBeCloseTo((1 - e2 * Math.sin(phi) ** 2) / (1 - e2), 5);
  });

  it('holds a pan and its undo to the point it started from', () => {
    const drifted = pointAt(CENTRE, 900, -640);
    const back = pointAt({ ...drifted, zoom: CENTRE.zoom }, -900, 640);
    expect(back.lat).toBeCloseTo(CENTRE.lat, 9);
    expect(back.lng).toBeCloseTo(CENTRE.lng, 9);
  });

  it('halves the ground a pixel covers with every step in', () => {
    const wide = pointAt({ ...CENTRE, zoom: 14 }, 256, 0);
    const close = pointAt({ ...CENTRE, zoom: 15 }, 256, 0);
    expect((wide.lng - CENTRE.lng) / (close.lng - CENTRE.lng)).toBeCloseTo(2, 6);
  });

  it('stays on the globe when dragged off the end of it', () => {
    const north = pointAt({ ...CENTRE, zoom: MIN_ZOOM }, 0, -1e7);
    const west = pointAt({ ...CENTRE, zoom: MIN_ZOOM }, -1e7, 0);
    expect(north.lat).toBeLessThanOrEqual(90);
    expect(north.lat).toBeGreaterThan(0);
    expect(west.lng).toBeGreaterThanOrEqual(-180);
    expect(west.lng).toBeLessThanOrEqual(180);
  });
});

describe('zoomedBy', () => {
  it('steps', () => {
    expect(zoomedBy(CENTRE, 1).zoom).toBe(17);
    expect(zoomedBy(CENTRE, -1).zoom).toBe(15);
  });

  it('refuses to leave the range where the map is still a city', () => {
    expect(zoomedBy({ ...CENTRE, zoom: MAX_ZOOM }, 1).zoom).toBe(MAX_ZOOM);
    expect(zoomedBy({ ...CENTRE, zoom: MIN_ZOOM }, -1).zoom).toBe(MIN_ZOOM);
  });

  it('leaves the point alone', () => {
    expect(zoomedBy(CENTRE, 1)).toMatchObject({ lat: CENTRE.lat, lng: CENTRE.lng });
  });
});
