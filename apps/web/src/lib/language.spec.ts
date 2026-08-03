import { describe, expect, it } from 'vitest';
import { Language } from '@amragrir/shared';
import { dictionaries } from '@amragrir/i18n';
import { LANGUAGES, parseLanguage, t } from './language';
import { formatAmd, formatDistance, formatPriceLevel, formatRating } from './format';
import {
  cartPath,
  checkoutPath,
  hreflangFor,
  homePath,
  orderPath,
  ordersPath,
  preorderPath,
  resolveLanguageRoute,
  restaurantPath,
  routePath,
  searchPath,
  sessionPath,
  signinPath,
} from './site';

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

describe('resolveLanguageRoute', () => {
  it('serves Armenian at the bare domain, without a redirect', () => {
    // A rewrite, so the visitor keeps the unprefixed URL they asked for.
    expect(resolveLanguageRoute('/')).toEqual({ action: 'rewrite', pathname: '/hy' });
    expect(resolveLanguageRoute('/r/sunny-table')).toEqual({
      action: 'rewrite',
      pathname: '/hy/r/sunny-table',
    });
  });

  it('leaves the prefixed languages alone', () => {
    expect(resolveLanguageRoute('/ru')).toEqual({ action: 'pass' });
    expect(resolveLanguageRoute('/en/r/sunny-table')).toEqual({ action: 'pass' });
  });

  it('redirects /hy away, so one page never has two addresses', () => {
    expect(resolveLanguageRoute('/hy')).toEqual({ action: 'redirect', pathname: '/' });
    expect(resolveLanguageRoute('/hy/r/sunny-table')).toEqual({
      action: 'redirect',
      pathname: '/r/sunny-table',
    });
  });

  it('names the route, not the link, for revalidation', () => {
    // Every route in this app is `/[lang]/…`; the unprefixed URL is a rewrite.
    expect(routePath('/')).toBe('/hy');
    expect(routePath('/cart')).toBe('/hy/cart');
    expect(routePath('/orders/abc')).toBe('/hy/orders/abc');
    expect(routePath('/ru/cart')).toBe('/ru/cart');
    // A cache entry is per route, never per query string.
    expect(routePath('/cart?switch=7%7Ca%7Cb')).toBe('/hy/cart');
  });

  it('does not mistake a longer segment for a language', () => {
    // `/rubicon` starts with `ru` but is not Russian, and `/hyphen` is not a
    // stale Armenian URL — both are Armenian pages (and then 404s).
    expect(resolveLanguageRoute('/rubicon')).toEqual({ action: 'rewrite', pathname: '/hy/rubicon' });
    expect(resolveLanguageRoute('/hyphen')).toEqual({ action: 'rewrite', pathname: '/hy/hyphen' });
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
  it('prefix the other languages but not the default one', () => {
    expect(homePath('ru')).toBe('/ru');
    expect(restaurantPath('en', 'sunny-table')).toBe('/en/r/sunny-table');

    // Armenian is served at the bare domain; `/` is a path, `''` is not.
    expect(homePath('hy')).toBe('/');
    expect(restaurantPath('hy', 'sunny-table')).toBe('/r/sunny-table');
    expect(searchPath('hy', 'khorovats')).toBe('/search?q=khorovats');
  });

  it('never emit a /hy url', () => {
    // The middleware redirects those away, so a helper that built one would
    // put a pointless round trip in front of most of the site's traffic.
    const builders = [
      homePath,
      cartPath,
      preorderPath,
      checkoutPath,
      ordersPath,
      searchPath,
      signinPath,
      (language: string) => restaurantPath(language, 'sunny-table'),
      (language: string) => orderPath(language, 'abc'),
      (language: string) => sessionPath(language, '/'),
      (language: string) => searchPath(language, 'khorovats'),
      (language: string) => signinPath(language, '/checkout'),
    ];

    for (const build of builders) {
      expect(build('hy')).not.toMatch(/^\/hy(\/|$|\?)/);
      expect(build('ru')).toMatch(/^\/ru(\/|$|\?)/);
    }
  });

  it('offer every language plus x-default for hreflang', () => {
    const map = hreflangFor(LANGUAGES, homePath);

    expect(map).toEqual({
      hy: 'https://amragrir.am/',
      ru: 'https://amragrir.am/ru',
      en: 'https://amragrir.am/en',
      // Armenian is the product default, so it is what an unmatched visitor gets.
      'x-default': 'https://amragrir.am/',
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
