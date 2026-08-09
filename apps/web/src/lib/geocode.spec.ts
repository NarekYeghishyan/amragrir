import { describe, expect, it } from 'vitest';
import { MAX_RESULTS, geocoderUrl, queryLang, readPlaces, yandexLang } from './geocode';

/** A response trimmed from Yandex's own documented shape — two results, one of
 *  them missing the parts this app needs. */
const RESPONSE = {
  response: {
    GeoObjectCollection: {
      featureMember: [
        {
          GeoObject: {
            name: 'Северный проспект, 5',
            description: 'Ереван, Армения',
            Point: { pos: '44.513600 40.181100' },
          },
        },
        {
          GeoObject: {
            name: 'Каскад',
            description: 'Ереван, Армения',
            Point: { pos: '44.515700 40.190100' },
          },
        },
      ],
    },
  },
};

describe('yandexLang', () => {
  it('has a real code for each of the three, Armenian included', () => {
    expect(yandexLang('ru')).toBe('ru_RU');
    expect(yandexLang('en')).toBe('en_US');
    // Not en_US. Yandex answers `Վարդանանց փողոց` to hy_AM, and sending an
    // Armenian reader to the English map was a plain loss of their alphabet.
    expect(yandexLang('hy')).toBe('hy_AM');
  });
});

describe('queryLang', () => {
  it('answers in the alphabet the question was asked in, whatever the site is', () => {
    expect(queryLang('Վարդանանց 10', 'ru')).toBe('hy_AM');
    expect(queryLang('Вардананц 10', 'hy')).toBe('ru_RU');
    expect(queryLang('Вардананц 10', 'en')).toBe('ru_RU');
  });

  it('leaves Latin to the site, because Latin is where both get transliterated', () => {
    // `Vardanants` is how the street is written in a Russian *and* an Armenian
    // reader's transliteration, so it is evidence of nothing.
    expect(queryLang('Vardanants 10', 'hy')).toBe('hy_AM');
    expect(queryLang('Vardanants 10', 'ru')).toBe('ru_RU');
    expect(queryLang('Vardanants 10', 'en')).toBe('en_US');
  });

  it('falls back to the site when there are no letters to go on', () => {
    expect(queryLang('10', 'hy')).toBe('hy_AM');
    expect(queryLang('', 'ru')).toBe('ru_RU');
    expect(queryLang('  ,  ', 'en')).toBe('en_US');
  });

  it('reads one letter of a script as enough, since typing starts somewhere', () => {
    // A search runs on every pause, including after the first character.
    expect(queryLang('Վ', 'ru')).toBe('hy_AM');
    expect(queryLang('В', 'hy')).toBe('ru_RU');
  });
});

describe('geocoderUrl', () => {
  it('escapes a key rather than letting it end the query string', () => {
    expect(geocoderUrl('a&b=c', 'en', { q: 'x' })).toContain('apikey=a%26b%3Dc');
  });

  it('biases a search to Yerevan', () => {
    const url = new URL(geocoderUrl('K', 'ru', { q: 'Северный проспект' }));
    expect(url.searchParams.get('geocode')).toBe('Северный проспект');
    expect(url.searchParams.get('ll')).toBe('44.5126,40.1776');
    expect(url.searchParams.get('spn')).toBe('0.5,0.5');
    expect(url.searchParams.get('results')).toBe(String(MAX_RESULTS));
    expect(url.searchParams.get('apikey')).toBe('K');
  });

  it('takes its language from the query rather than from the page', () => {
    const armenian = new URL(geocoderUrl('K', 'ru', { q: 'Վարդանանց 10' }));
    expect(armenian.searchParams.get('lang')).toBe('hy_AM');
    const russian = new URL(geocoderUrl('K', 'hy', { q: 'Вардананц 10' }));
    expect(russian.searchParams.get('lang')).toBe('ru_RU');
  });

  it('takes it from the page when reversing, because a point asks nothing', () => {
    const url = new URL(geocoderUrl('K', 'hy', { lat: 40.1798, lng: 44.5152 }));
    expect(url.searchParams.get('lang')).toBe('hy_AM');
  });

  it('sends longitude first when reversing a point', () => {
    // The one mistake in this file that would be silent: latitude first names a
    // point in the Indian Ocean and returns a plausible-looking nothing.
    const url = new URL(geocoderUrl('K', 'en', { lat: 40.1798, lng: 44.5152 }));
    expect(url.searchParams.get('geocode')).toBe('44.5152,40.1798');
    expect(url.searchParams.get('results')).toBe('1');
    // A reverse lookup is about one point; biasing it to the city centre would
    // be asking a question that has already been answered.
    expect(url.searchParams.get('ll')).toBeNull();
  });
});

describe('readPlaces', () => {
  it('reads points, longitude first, with the full address as the name', () => {
    expect(readPlaces(RESPONSE)).toEqual([
      { lat: 40.1811, lng: 44.5136, label: 'Северный проспект, 5, Ереван, Армения' },
      { lat: 40.1901, lng: 44.5157, label: 'Каскад, Ереван, Армения' },
    ]);
  });

  it('skips a result with no usable point instead of inventing one', () => {
    const payload = {
      response: {
        GeoObjectCollection: {
          featureMember: [
            { GeoObject: { name: 'No point at all' } },
            { GeoObject: { name: 'Broken', Point: { pos: 'north west' } } },
            { GeoObject: { Point: { pos: '44.5 40.1' } } }, // no name to show
            RESPONSE.response.GeoObjectCollection.featureMember[0],
          ],
        },
      },
    };
    expect(readPlaces(payload)).toHaveLength(1);
  });

  it('survives every shape that is not a geocoder response', () => {
    // This parses whatever came back over the network, including an error page,
    // an empty body, or a shape Yandex changes under us.
    for (const payload of [null, undefined, '', 42, {}, { response: {} }, [], { response: null }]) {
      expect(readPlaces(payload)).toEqual([]);
    }
  });

  it('never returns more than the dialog can show', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      GeoObject: { name: `p${i}`, Point: { pos: `44.5 40.${i}` } },
    }));
    const payload = { response: { GeoObjectCollection: { featureMember: many } } };
    expect(readPlaces(payload)).toHaveLength(MAX_RESULTS);
  });
});
