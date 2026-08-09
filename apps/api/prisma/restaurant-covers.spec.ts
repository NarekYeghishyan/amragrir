import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CUISINE_COVERS, RESTAURANT_COVERS, coverFor, isSeedCover } from './restaurant-covers';

/**
 * The demo cover table, checked against the rules it has to satisfy.
 *
 * Nothing here reaches the network, for the reason `menu-photos.spec.ts` gives:
 * that these URLs answer was checked when they were chosen, and a suite that
 * fetched two dozen photographs would fail on a train rather than on a mistake.
 * What can be checked offline is the shape, and that the seed and this file
 * still agree about which restaurants exist.
 */
const COVER_URL = /^https:\/\/[^\s]+$/;

describe('the demo cover table', () => {
  const all = { ...CUISINE_COVERS, ...RESTAURANT_COVERS };

  it.each(Object.entries(all))('%s points at an absolute https URL', (_key, url) => {
    expect(url).toMatch(COVER_URL);
  });

  it.each(Object.entries(all))('%s is inside the 500-character limit', (_key, url) => {
    // The same ceiling `menu.dto.ts` puts on a dish photo. `cover_url` is
    // `text`, so nothing rejects a longer one today — but the upload endpoint
    // this column is waiting for is meant to be modelled on the menu one, and
    // a cover it would refuse to re-save is not demo data worth seeding.
    expect(url.length).toBeLessThanOrEqual(500);
  });

  it.each(Object.entries(all))('%s is on a host that serves the app', (_key, url) => {
    // Why this table no longer draws from Wikimedia Commons: 403 to a request
    // whose `User-Agent` is a bare library name, which is what React Native
    // sends. A cover from there is a card that is blank on every phone and
    // perfect in a browser — see `menu-photos.ts`.
    expect(new URL(url).host).toMatch(/^www\.(themealdb|thecocktaildb)\.com$/);
  });

  it('has a picture for every cuisine the seed plants, and a fallback', () => {
    // Read out of the seed rather than copied from it: a demo restaurant added
    // with a cuisine nobody wrote a cover for should fail here, not ship a card
    // showing a stranger's dining room.
    const seed = readFileSync(join(__dirname, 'seed.ts'), 'utf8');
    const cuisines = new Set(Array.from(seed.matchAll(/cuisine: '([^']+)'/g), (m) => m[1] as string));

    expect(cuisines.size).toBeGreaterThan(0); // the regex still matches something
    for (const cuisine of cuisines) {
      expect(CUISINE_COVERS[cuisine]).toMatch(COVER_URL);
    }
    expect(CUISINE_COVERS.restaurant).toMatch(COVER_URL);
  });

  it('names only restaurants the seed actually plants', () => {
    // The other direction: a slug renamed in the seed leaves a cover here that
    // can never be reached, and the restaurant silently falls back to its
    // cuisine's.
    const seed = readFileSync(join(__dirname, 'seed.ts'), 'utf8');
    const slugs = new Set(Array.from(seed.matchAll(/slug: '([^']+)'/g), (m) => m[1] as string));

    for (const slug of Object.keys(RESTAURANT_COVERS)) {
      expect(slugs).toContain(slug);
    }
  });

  it('gives the restaurants sharing a cuisine different covers', () => {
    // The point of the per-slug table. Two pizza chains showing the same oven
    // is a home feed that cannot show whether one card differs from the next.
    const urls = Object.values(RESTAURANT_COVERS);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(Object.values(CUISINE_COVERS)).not.toContain(url);
    }
  });
});

describe('coverFor', () => {
  it('gives a restaurant its own photograph when there is one', () => {
    expect(coverFor('dolmama', 'Armenian')).toBe(RESTAURANT_COVERS.dolmama);
  });

  it('falls back to the cuisine for a restaurant with none', () => {
    expect(coverFor('karas', 'Armenian')).toBe(CUISINE_COVERS.Armenian);
  });

  it('falls back to a dining room for a cuisine nothing knows', () => {
    expect(coverFor('new-place', 'Peruvian')).toBe(CUISINE_COVERS.restaurant);
    expect(coverFor(null, null)).toBe(CUISINE_COVERS.restaurant);
  });

  it('takes the restaurant over the cuisine, not the other way round', () => {
    expect(coverFor('pizza-nova', 'Pizza')).not.toBe(CUISINE_COVERS.Pizza);
  });

  describe('with MENU_PHOTOS=local', () => {
    const before = process.env.MENU_PHOTOS;
    beforeAll(() => {
      process.env.MENU_PHOTOS = 'local';
    });
    afterAll(() => {
      process.env.MENU_PHOTOS = before;
    });

    it('seeds the committed placeholder nearest the cuisine instead', () => {
      expect(coverFor('tashir-pizza', 'Pizza')).toMatch(/\/static\/menu\/pizza\.svg$/);
      // Armenian has no category of its own; the grill is what it sells.
      expect(coverFor('karas', 'Armenian')).toMatch(/\/static\/menu\/grill\.svg$/);
      expect(coverFor('new-place', 'Peruvian')).toMatch(/\/static\/menu\/dish\.svg$/);
    });
  });
});

describe('isSeedCover', () => {
  it('claims a restaurant with no cover at all', () => {
    expect(isSeedCover(null)).toBe(true);
  });

  it('claims its own photographs, so a re-run can move them', () => {
    expect(isSeedCover(CUISINE_COVERS.Pizza as string)).toBe(true);
    expect(isSeedCover(RESTAURANT_COVERS.dolmama as string)).toBe(true);
  });

  it('claims a placeholder from an older seed, whatever host it was seeded against', () => {
    expect(isSeedCover('http://localhost:3000/static/menu/grill.svg')).toBe(true);
    expect(isSeedCover('https://api.amragrir.am/static/menu/dish.svg')).toBe(true);
  });

  it('claims a Commons photograph from the first version of this table', () => {
    // The covers seeded yesterday. Claimed by host, because they are no longer
    // values in this file and a `db:photos` that skipped them would leave every
    // card blank in the app.
    expect(
      isSeedCover(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Armenian_dish_dolma_2.jpg/960px-Armenian_dish_dolma_2.jpg',
      ),
    ).toBe(true);
  });

  it('leaves an uploaded photograph alone', () => {
    // Nothing can upload one yet. Written now because the refresh will outlive
    // that, and the day it does not hold is the day a restaurant loses the one
    // picture on the platform somebody actually chose.
    expect(isSeedCover('http://localhost:3000/uploads/covers/8f3c-4e21.jpg')).toBe(false);
    expect(isSeedCover('https://cdn.example.com/their-own-cover.jpg')).toBe(false);
  });
});
