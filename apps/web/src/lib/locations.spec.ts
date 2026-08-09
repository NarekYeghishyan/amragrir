import { describe, expect, it } from 'vitest';
import { dictionaries } from '@amragrir/i18n';
import { Language } from '@amragrir/shared';
import {
  AREAS,
  YEREVAN,
  areaPlace,
  encodePlace,
  metresBetween,
  nearestArea,
  parsePlace,
  placeQuery,
  type Place,
} from './locations';
import { MIN_ZOOM, PICKED_ZOOM } from './map-frame';

const KENTRON: Place = { lat: 40.1798, lng: 44.5152, label: 'Ереван · Центр' };

describe('encodePlace / parsePlace', () => {
  it('round-trips a place, name and all', () => {
    expect(parsePlace(encodePlace(KENTRON))).toEqual(KENTRON);
  });

  it('round-trips every alphabet the site is written in', () => {
    for (const label of ['Հյուսիսային պողոտա 5', 'Северный пр., 5', "Saryan St, 5 — O'Brien"]) {
      expect(parsePlace(encodePlace({ ...KENTRON, label }))?.label).toBe(label);
    }
  });

  it('produces only characters that survive a cookie unchanged', () => {
    // The server writes this through Next, which URL-encodes; the browser reads
    // it raw out of `document.cookie`. Anything `encodeURIComponent` touches
    // would come back different on the two sides.
    const encoded = encodePlace({ ...KENTRON, label: 'Северный пр., 5' });
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it('treats anything unusable as the whole city', () => {
    // The cookie is readable by the page, so a hand-edited value is not an
    // exotic case — it must land on "no place" rather than throw.
    expect(parsePlace(undefined)).toBeNull();
    expect(parsePlace('')).toBeNull();
    expect(parsePlace('kentron')).toBeNull(); // the old cookie's format
    expect(parsePlace('40.1~44.5')).toBeNull(); // no label
    expect(parsePlace('north~44.5~aGk')).toBeNull(); // latitude is not a number
    expect(parsePlace('40.1~44.5~!!!not base64!!!')).toBeNull();
    expect(parsePlace('40.1~44.5~')).toBeNull(); // empty label
  });

  it('refuses a point that is not on the globe', () => {
    const label = encodePlace(KENTRON).split('~')[2];
    expect(parsePlace(`91~44.5~${label}`)).toBeNull();
    expect(parsePlace(`40.1~181~${label}`)).toBeNull();
    expect(parsePlace(`40.1~-181~${label}`)).toBeNull();
  });

  it('caps a label that would wreck the header', () => {
    const parsed = parsePlace(encodePlace({ ...KENTRON, label: 'x'.repeat(500) }));
    expect(parsed?.label.length).toBe(80);
  });

  it('flattens a label onto one line', () => {
    const parsed = parsePlace(encodePlace({ ...KENTRON, label: 'Saryan\n\tSt,   5 ' }));
    expect(parsed?.label).toBe('Saryan St, 5');
  });
});

describe('placeQuery', () => {
  it('sends coordinates and nothing else', () => {
    // Deliberately no `distMax`: saying where you are is not a decision to stop
    // being shown the rest of the city.
    expect(placeQuery(KENTRON)).toEqual({ lat: '40.1798', lng: '44.5152' });
  });

  it('sends nothing at all without a place', () => {
    expect(placeQuery(null)).toEqual({});
  });
});

describe('the district presets', () => {
  it('are all named in all three languages', () => {
    for (const area of AREAS) {
      for (const language of [Language.Hy, Language.Ru, Language.En]) {
        expect(dictionaries[language][area.labelKey], `${language}.${area.labelKey}`).toBeTruthy();
      }
    }
  });

  it('all sit inside Yerevan', () => {
    // A stray decimal point would put a district in the Ararat valley and quietly
    // make every distance on the home page wrong rather than obviously broken.
    for (const area of AREAS) {
      expect(area.lat, area.id).toBeGreaterThan(40.1);
      expect(area.lat, area.id).toBeLessThan(40.3);
      expect(area.lng, area.id).toBeGreaterThan(44.4);
      expect(area.lng, area.id).toBeLessThan(44.6);
    }
  });

  it('have unique ids, since each is a DOM key on the drawn map', () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREAS.length);
  });

  it('each survive the round trip to the cookie and back', () => {
    // A district name still reaches the cookie: `nearestArea` puts one on every
    // point the geocoder cannot name, and the confirm form posts it encoded for
    // the Server Action to re-parse. One that did not survive that would be a
    // point stored under the wrong name, or not stored at all.
    for (const area of AREAS) {
      const place = areaPlace(area, 'Ереван · Центр');
      expect(parsePlace(encodePlace(place)), area.id).toEqual(place);
    }
  });

  it('each have a pin inside the fallback map', () => {
    // The drawn map uses a 400×340 viewBox. A coordinate outside it is a
    // district you cannot press, on a map that still looks complete.
    for (const area of AREAS) {
      expect(area.mapX, area.id).toBeGreaterThanOrEqual(0);
      expect(area.mapX, area.id).toBeLessThanOrEqual(400);
      expect(area.mapY, area.id).toBeGreaterThanOrEqual(0);
      expect(area.mapY, area.id).toBeLessThanOrEqual(340);
    }
  });

  it('do not stack two pins on one spot', () => {
    const pins = AREAS.map((a) => `${a.mapX},${a.mapY}`);
    expect(new Set(pins).size).toBe(AREAS.length);
  });
});

describe('the default view', () => {
  // Where the map opens with nothing chosen, and where the ✕ on the badge sends
  // it back to. It is also the geocoder's bias (`lib/geocode.ts`), so a slipped
  // decimal here would move the map *and* start ranking addresses around the
  // wrong city — in a place nothing else would report.
  it('is inside Yerevan', () => {
    expect(YEREVAN.lat).toBeGreaterThan(40.1);
    expect(YEREVAN.lat).toBeLessThan(40.3);
    expect(YEREVAN.lng).toBeGreaterThan(44.4);
    expect(YEREVAN.lng).toBeLessThan(44.6);
  });

  it('opens wide enough to hold every district, and closer than a country', () => {
    // Zoomed in past the city, the six districts would be off the screen and
    // the opening view would be one street; zoomed out past MIN_ZOOM, Yerevan
    // is a dot on Armenia.
    expect(YEREVAN.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(YEREVAN.zoom).toBeLessThan(PICKED_ZOOM);
  });
});

describe('nearestArea', () => {
  it('returns the district a position is standing in', () => {
    for (const area of AREAS) {
      expect(nearestArea(area.lat, area.lng).id).toBe(area.id);
    }
  });

  it('measures east–west on the same scale as north–south', () => {
    // A degree of longitude is only 76% of a degree of latitude at Yerevan's
    // latitude, and the correction decides real cases rather than trailing
    // digits: from this point Shengavit is 2.4km away and Kentron 3.0km, but
    // counting a degree east as a degree north would answer Kentron.
    expect(nearestArea(40.15, 44.511).id).toBe('shengavit');
  });

  it('always answers, even from outside Yerevan', () => {
    // A refusal would leave a map tap with no name to carry.
    expect(nearestArea(41.6938, 44.8015).id).toBeTruthy(); // Tbilisi
  });
});

describe('metresBetween', () => {
  it('measures a short hop about right', () => {
    // 0.001° of latitude is 111m anywhere on earth.
    const north: Place = { ...KENTRON, lat: KENTRON.lat + 0.001 };
    expect(metresBetween(KENTRON, north)).toBeGreaterThan(105);
    expect(metresBetween(KENTRON, north)).toBeLessThan(117);
  });

  it('is zero between a point and itself', () => {
    expect(metresBetween(KENTRON, { ...KENTRON })).toBe(0);
  });

  it('shortens a degree of longitude, as the latitude requires', () => {
    const east: Place = { ...KENTRON, lng: KENTRON.lng + 0.001 };
    const north: Place = { ...KENTRON, lat: KENTRON.lat + 0.001 };
    expect(metresBetween(KENTRON, east)).toBeLessThan(metresBetween(KENTRON, north));
  });
});
