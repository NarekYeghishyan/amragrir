import { describe, expect, it } from 'vitest';
import {
  APPROACH,
  CEILING,
  START_PROGRESS,
  formTarget,
  nextProgress,
  startsNavigation,
  type ClickIntent,
} from './navigation-progress';

const HERE = 'https://amragrir.am/ru/?sort=fastest';

const click = (overrides: Partial<ClickIntent> = {}): ClickIntent => ({
  href: '/ru/orders',
  target: null,
  download: false,
  modified: false,
  ...overrides,
});

describe('startsNavigation', () => {
  it('is true for a link to another page on this site', () => {
    expect(startsNavigation(click(), HERE)).toBe(true);
    expect(startsNavigation(click({ href: 'https://amragrir.am/ru/orders' }), HERE)).toBe(true);
  });

  it('counts a change of query string on the same path — the filter chips', () => {
    expect(startsNavigation(click({ href: '/ru/?sort=top_rated' }), HERE)).toBe(true);
    expect(startsNavigation(click({ href: '/ru/' }), HERE)).toBe(true);
  });

  it('is false for the page already on screen, hash or not', () => {
    expect(startsNavigation(click({ href: '/ru/?sort=fastest' }), HERE)).toBe(false);
    expect(startsNavigation(click({ href: '#restaurants' }), HERE)).toBe(false);
    expect(startsNavigation(click({ href: '/ru/?sort=fastest#restaurants' }), HERE)).toBe(false);
  });

  it('is false when the press opens the link somewhere else', () => {
    expect(startsNavigation(click({ modified: true }), HERE)).toBe(false);
    expect(startsNavigation(click({ target: '_blank' }), HERE)).toBe(false);
    expect(startsNavigation(click({ download: true }), HERE)).toBe(false);
  });

  it('accepts the target spelled out as the default', () => {
    expect(startsNavigation(click({ target: '_self' }), HERE)).toBe(true);
  });

  it('is false for another site and for the protocols the browser hands away', () => {
    expect(startsNavigation(click({ href: 'https://yandex.ru/maps' }), HERE)).toBe(false);
    expect(startsNavigation(click({ href: 'mailto:hello@amragrir.am' }), HERE)).toBe(false);
    expect(startsNavigation(click({ href: 'tel:+37410000000' }), HERE)).toBe(false);
  });

  it('is false for a link with nothing to follow', () => {
    expect(startsNavigation(click({ href: null }), HERE)).toBe(false);
    expect(startsNavigation(click({ href: '' }), HERE)).toBe(false);
  });
});

describe('formTarget', () => {
  it('resolves the header search box against its fields, Armenian encoded', () => {
    expect(formTarget('get', '/ru/search', [['q', 'խորոված']], HERE)).toBe(
      `https://amragrir.am/ru/search?q=${encodeURIComponent('խորոված')}`,
    );
  });

  it('replaces the query string rather than merging into it', () => {
    // Submitted from a results page: the old `q` goes, the new one lands.
    expect(formTarget('get', '/ru/search', [['q', 'pizza']], 'https://amragrir.am/ru/search?q=old'))
      .toBe('https://amragrir.am/ru/search?q=pizza');
  });

  it('reads an absent action as the page it was submitted from', () => {
    expect(formTarget('get', null, [['q', 'x']], HERE)).toBe('https://amragrir.am/ru/?q=x');
  });

  it('is null for the Server Action forms — they mutate and stay put', () => {
    expect(formTarget('post', '/ru/cart', [], HERE)).toBeNull();
    expect(formTarget('POST', '/ru/', [], HERE)).toBeNull();
  });

  it('is null for a form aimed off this site', () => {
    expect(formTarget('get', 'https://yandex.ru/search', [['text', 'x']], HERE)).toBeNull();
  });

  it('pairs with startsNavigation to ignore a query resubmitted unchanged', () => {
    const here = 'https://amragrir.am/ru/search?q=pizza';
    const target = formTarget('get', '/ru/search', [['q', 'pizza']], here);
    expect(target).toBe(here);
    expect(startsNavigation(click({ href: target }), here)).toBe(false);
  });
});

describe('nextProgress', () => {
  it('moves forward and slows down', () => {
    const first = nextProgress(START_PROGRESS);
    const second = nextProgress(first);
    expect(first).toBeGreaterThan(START_PROGRESS);
    expect(second - first).toBeLessThan(first - START_PROGRESS);
  });

  it('closes the stated fraction of the gap that is left', () => {
    expect(nextProgress(0.5)).toBeCloseTo(0.5 + (CEILING - 0.5) * APPROACH, 10);
  });

  it('never reaches the end, however long it runs', () => {
    let progress = START_PROGRESS;
    for (let tick = 0; tick < 500; tick += 1) {
      progress = nextProgress(progress);
    }
    expect(progress).toBeLessThan(CEILING);
  });
});
