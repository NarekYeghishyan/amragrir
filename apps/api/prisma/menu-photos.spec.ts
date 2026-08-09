import { CATEGORY_KEYS } from './categories';
import { CATEGORY_PHOTOS, DISH_PHOTOS, isSeedPhoto, photoFor } from './menu-photos';

/**
 * The demo photo table, checked against the rule it has to satisfy.
 *
 * Nothing here reaches the network — that these URLs answer at all was checked
 * when they were chosen, and a test suite that fetched thirty images would fail
 * on a train rather than on a mistake. What can be checked offline is the shape:
 * every one of them has to be something `POST /restaurant/menu-items` would
 * accept, because that is exactly what the seed is doing on the caller's behalf.
 */
const PHOTO_URL = /^https:\/\/[^\s]+$/;

describe('the demo photo table', () => {
  const all = { ...CATEGORY_PHOTOS, ...DISH_PHOTOS };

  it.each(Object.entries(all))('%s points at an absolute https URL', (_key, url) => {
    expect(url).toMatch(PHOTO_URL);
  });

  it.each(Object.entries(all))('%s is inside the 500-character column', (_key, url) => {
    // `@MaxLength(500)` in `menu.dto.ts`. Commons file names get long, and a
    // URL that is one character over is a dish the panel could not re-save.
    expect(url.length).toBeLessThanOrEqual(500);
  });

  it.each(Object.entries(all))('%s is on a host that serves the app', (_key, url) => {
    // The rule this table was rewritten for. Wikimedia answers 403 to a request
    // whose `User-Agent` is a bare library name — which is what React Native
    // sends — so a Commons URL here is a dish that is blank on every phone
    // while looking right in a browser, and blank is also how the app draws
    // "no photograph". Nothing catches that but this.
    expect(new URL(url).host).toMatch(/^www\.(themealdb|thecocktaildb)\.com$/);
  });

  it('has a picture for every category the seed plants, and a fallback', () => {
    // Against the real list rather than a copy of it: a category added to the
    // seed without a photograph should fail here, not ship every dish under it
    // a generic plate.
    for (const key of CATEGORY_KEYS) {
      expect(CATEGORY_PHOTOS[key]).toMatch(PHOTO_URL);
    }
    expect(CATEGORY_PHOTOS.dish).toMatch(PHOTO_URL);
  });
});

describe('photoFor', () => {
  it('gives a dish its own photograph when there is one', () => {
    expect(photoFor('Margherita', 'pizza')).toBe(DISH_PHOTOS.Margherita);
  });

  it('falls back to the category for a dish with none', () => {
    // "Napoleon" showing a cheesecake is a stand-in; showing a photograph of
    // something else entirely would be a lie about the menu.
    expect(photoFor('Napoleon', 'desserts')).toBe(CATEGORY_PHOTOS.desserts);
  });

  it('falls back to the generic plate for a category nothing knows', () => {
    expect(photoFor('Something New', 'fusion')).toBe(CATEGORY_PHOTOS.dish);
    expect(photoFor(null, null)).toBe(CATEGORY_PHOTOS.dish);
  });

  it('takes the dish over the category, not the other way round', () => {
    // Both ramen dishes are filed under categories whose photograph is a salad
    // and a grill; naming them is what stops the menu showing lettuce for soup.
    expect(photoFor('Veggie Ramen', 'healthy')).not.toBe(CATEGORY_PHOTOS.healthy);
  });

  describe('with MENU_PHOTOS=local', () => {
    const before = process.env.MENU_PHOTOS;
    beforeAll(() => {
      process.env.MENU_PHOTOS = 'local';
    });
    afterAll(() => {
      process.env.MENU_PHOTOS = before;
    });

    it('seeds the committed placeholder for the category instead', () => {
      expect(photoFor('Margherita', 'pizza')).toMatch(/\/static\/menu\/pizza\.svg$/);
      expect(photoFor('Something New', 'fusion')).toMatch(/\/static\/menu\/dish\.svg$/);
    });
  });
});

describe('isSeedPhoto', () => {
  it('claims a dish with no photograph at all', () => {
    expect(isSeedPhoto(null)).toBe(true);
  });

  it('claims its own photographs, so a re-run can move them', () => {
    expect(isSeedPhoto(CATEGORY_PHOTOS.pizza)).toBe(true);
    expect(isSeedPhoto(DISH_PHOTOS.Margherita)).toBe(true);
  });

  it('claims a placeholder from an older seed, whatever host it was seeded against', () => {
    expect(isSeedPhoto('http://localhost:3000/static/menu/pizza.svg')).toBe(true);
    expect(isSeedPhoto('https://api.amragrir.am/static/menu/dish.svg')).toBe(true);
  });

  it('claims a Commons photograph from the version of this table that had them', () => {
    // Not in either table any more, so it cannot be claimed by value — and a
    // database seeded before the hosts changed would otherwise keep the
    // pictures the app cannot load, forever.
    expect(
      isSeedPhoto(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Miso_Soup_001.jpg/960px-Miso_Soup_001.jpg',
      ),
    ).toBe(true);
  });

  it('leaves an uploaded photograph alone', () => {
    // The one picture in the table somebody actually chose. A seed script that
    // replaced it with stock photography would be the worst thing in here.
    expect(isSeedPhoto('http://localhost:3000/uploads/menu/8f3c-4e21.jpg')).toBe(false);
    expect(isSeedPhoto('https://cdn.example.com/their-own-photo.jpg')).toBe(false);
  });
});
