import { describe, expect, it } from 'vitest';
import { Language } from '@amragrir/shared';
import { dictionaries } from '@amragrir/i18n';
import { LANGUAGES, negotiate, parseLanguage, t } from './language';
import { formatAmd, formatDistance, formatPriceLevel, formatRating } from './format';
import { hreflangFor, homePath, restaurantPath } from './site';

describe('parseLanguage', () => {
  it('accepts the three supported languages', () => {
    expect(parseLanguage('hy')).toBe(Language.Hy);
    expect(parseLanguage('ru')).toBe(Language.Ru);
    expect(parseLanguage('en')).toBe(Language.En);
  });

  it('rejects anything else, so /de/… is a 404 rather than silent Armenian', () => {
    // A silent fallback would serve content at a URL that then gets indexed.
    expect(parseLanguage('de')).toBeNull();
    expect(parseLanguage('')).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
  });
});

describe('negotiate', () => {
  it('picks the first supported tag', () => {
    expect(negotiate('ru-RU,ru;q=0.9,en;q=0.8')).toBe(Language.Ru);
    expect(negotiate('en-GB,en;q=0.9')).toBe(Language.En);
  });

  it('skips unsupported tags rather than giving up on the first one', () => {
    expect(negotiate('de-DE,de;q=0.9,hy;q=0.5')).toBe(Language.Hy);
    expect(negotiate('fr,ru;q=0.7')).toBe(Language.Ru);
  });

  it('defaults to Armenian', () => {
    expect(negotiate(null)).toBe(Language.Hy);
    expect(negotiate('de,fr')).toBe(Language.Hy);
  });
});

describe('dictionaries', () => {
  it('define the same keys in every language', () => {
    // A string added to one file and forgotten in the others is how
    // translations rot; this is the guard.
    const hyKeys = Object.keys(dictionaries[Language.Hy]).sort();
    expect(Object.keys(dictionaries[Language.Ru]).sort()).toEqual(hyKeys);
    expect(Object.keys(dictionaries[Language.En]).sort()).toEqual(hyKeys);
  });

  it('have no empty values', () => {
    for (const language of LANGUAGES) {
      for (const [key, value] of Object.entries(dictionaries[language])) {
        expect(value, `${language}.${key}`).not.toBe('');
      }
    }
  });
});

describe('t', () => {
  it('returns the requested language', () => {
    expect(t(Language.En)('open')).toBe('Open');
    expect(t(Language.Ru)('open')).toBe('Открыто');
  });

  it('falls back per key, not per dictionary', () => {
    // One missing string must not drop the whole language.
    const label = t(Language.En);
    expect(label('brand')).toBe('Amragrir');
  });
});

describe('paths', () => {
  it('build language-prefixed urls', () => {
    expect(homePath('ru')).toBe('/ru');
    expect(restaurantPath('en', 'sunny-table')).toBe('/en/r/sunny-table');
  });

  it('offer every language plus x-default for hreflang', () => {
    const map = hreflangFor(LANGUAGES, homePath);

    expect(map).toEqual({
      hy: 'https://amragrir.am/hy',
      ru: 'https://amragrir.am/ru',
      en: 'https://amragrir.am/en',
      // Armenian is the product default, so it is what an unmatched visitor gets.
      'x-default': 'https://amragrir.am/hy',
    });
  });
});

describe('formatting', () => {
  it('groups dram with spaces', () => {
    expect(formatAmd(5800)).toBe('5 800 ֏');
  });

  it('shows metres below a kilometre', () => {
    expect(formatDistance(0.4)).toBe('400 m');
    expect(formatDistance(1.25)).toBe('1.3 km');
    expect(formatDistance(null)).toBeNull();
  });

  it('always shows one decimal of rating', () => {
    expect(formatRating(5)).toBe('5.0');
    expect(formatRating(4.75)).toBe('4.8');
  });

  it('returns null for an unknown price level rather than an empty string', () => {
    expect(formatPriceLevel(2)).toBe('֏֏');
    expect(formatPriceLevel(null)).toBeNull();
    expect(formatPriceLevel(0)).toBeNull();
  });
});
