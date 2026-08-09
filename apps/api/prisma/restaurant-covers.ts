/**
 * The photograph on every demo restaurant's card.
 *
 * `restaurants.cover_url` is read by the catalog, favourites and orders
 * endpoints, and drawn by the restaurant card, the restaurant banner and the
 * thumbnail beside a past order. It was null for every seeded restaurant, so
 * every one of those rendered its empty state — a picture of the upload feature
 * not existing rather than of the screens working.
 *
 * **This is seed data, not the feature.** A restaurant sets its own cover
 * through the panel (`PATCH /restaurant/restaurants/:id/cover`, `restaurant:write`
 * — see ROLES_AND_PERMISSIONS.md), which overwrites whatever this file planted
 * without ceremony. `isSeedCover` below is the other half of that bargain: it is
 * what keeps this file from ever overwriting a picture a restaurant chose.
 *
 * The pictures are **other people's, hotlinked**, on the same terms and for the
 * same reasons as the dish photographs in `menu-photos.ts` — and from the same
 * two hosts, TheMealDB and TheCocktailDB, which is not a coincidence but a
 * constraint. See that file for why Wikimedia is not among them: it answers 403
 * to a client that does not identify itself, and `apps/mobile` is such a
 * client, so a Wikimedia cover is a card that is blank on every phone while
 * looking perfect in a browser. Every URL here answers 200 to the agent React
 * Native sends.
 *
 * A cover is a photograph of what that kitchen sends out — the demo has no
 * photographer and no rights to a picture of anybody's dining room, and food is
 * what a card is selling anyway. Every URL was fetched and **looked at** before
 * it was written down.
 *
 * `MENU_PHOTOS=local` seeds the committed category placeholders in
 * `apps/api/public/menu` instead, for a demo with no way out to the internet.
 * One switch covers dishes and covers together.
 */
import { placeholderPhoto, usingLocalPhotos } from './menu-photos';

/** One per `cuisine` the seed plants, plus `restaurant` for a cuisine this
 *  table does not know. What a restaurant falls back to when it has no cover of
 *  its own below. Keyed by the exact string in the seed's `cuisine` column;
 *  `restaurant` is lower-case, so it cannot collide with one. */
export const CUISINE_COVERS: Record<string, string> = {
  Mediterranean: 'https://www.themealdb.com/images/media/meals/rjhf741585564676.jpg', // Lamb and Lemon Souvlaki
  Armenian: 'https://www.themealdb.com/images/media/meals/kgfh3q1763075438.jpg', // Asado — meat over open fire, which is what khorovats is
  'Middle Eastern': 'https://www.themealdb.com/images/media/meals/pb6mj11763788331.jpg', // Ezme
  Japanese: 'https://www.themealdb.com/images/media/meals/lwsnkl1604181187.jpg', // Tonkatsu pork
  Asian: 'https://www.themealdb.com/images/media/meals/pbzcrx1763765096.jpg', // Beef pho
  Pizza: 'https://www.themealdb.com/images/media/meals/lrfdwz1764438393.jpg', // Cassava pizza
  Coffee: 'https://www.thecocktaildb.com/images/media/drink/wquwxs1441247025.jpg', // Thai Coffee
  Desserts: 'https://www.themealdb.com/images/media/meals/9kmyly1784660555.jpg', // Strawberry tart
  Healthy: 'https://www.themealdb.com/images/media/meals/02s6gc1763799560.jpg', // Aubergine couscous salad
  Burgers: 'https://www.themealdb.com/images/media/meals/k420tj1585565244.jpg', // Lamb Tzatziki Burgers
  European: 'https://www.themealdb.com/images/media/meals/wwuqvt1487345467.jpg', // Osso Buco alla Milanese
  Breakfast: 'https://www.themealdb.com/images/media/meals/1550440197.jpg', // Salmon eggs benedict
  /** A cuisine nothing here knows — including the ones somebody types into the
   *  panel. Something plated and unplaceable, which claims nothing about the
   *  food. */
  restaurant: 'https://www.themealdb.com/images/media/meals/vvpprx1487325699.jpg', // Beef Wellington
};

/**
 * A restaurant's own cover, by slug — the key the seed's restaurants are
 * written in, and the one thing about them that does not change between runs.
 *
 * Only where it should differ from its cuisine's. Six of the demo cuisines are
 * sold by two or three restaurants apiece, and a home feed where both pizza
 * chains show the same pizza is a feed that cannot show whether the cards are
 * distinguishable at all.
 */
export const RESTAURANT_COVERS: Record<string, string> = {
  // Healthy: Green Bean keeps the cuisine's couscous salad.
  greenhouse: 'https://www.themealdb.com/images/media/meals/wvqpwt1468339226.jpg', // Mediterranean Pasta Salad
  'salad-lab': 'https://www.themealdb.com/images/media/meals/93iok31766436070.jpg', // Sesame Cucumber Salad

  // Armenian: Karas keeps the fire.
  lavash: 'https://www.themealdb.com/images/media/meals/8825lo1763815264.jpg', // Griddled flatbreads
  dolmama: 'https://www.themealdb.com/images/media/meals/lqshrh1779648160.jpg', // Dolma, for the restaurant named after it

  // Pizza: Tashir keeps the cuisine's pizza.
  'pizza-nova': 'https://www.themealdb.com/images/media/meals/wf49qs1763075222.jpg', // Matambre a la Pizza

  // Desserts: Pastry Corner keeps the tart.
  'sweet-hour': 'https://www.themealdb.com/images/media/meals/ytme8t1764111401.jpg', // Baklava

  // Burgers: Black Angus keeps the burger.
  'burger-bros': 'https://www.themealdb.com/images/media/meals/lgmnff1763789847.jpg', // Kofta burgers

  // Japanese: Kohaku keeps the tonkatsu.
  'sushi-time': 'https://www.themealdb.com/images/media/meals/xxyupu1468262513.jpg', // Honey Teriyaki Salmon

  // Asian: Ramen House keeps the pho.
  'wok-star': 'https://www.themealdb.com/images/media/meals/1525872624.jpg', // Kung Pao Chicken
  'noodle-bar': 'https://www.themealdb.com/images/media/meals/uuuspp1468263334.jpg', // Pad See Ew
};

/**
 * Which committed placeholder stands in for a cuisine under `MENU_PHOTOS=local`.
 *
 * The category placeholders in `apps/api/public/menu` are reused rather than
 * drawn again: a gradient with an emoji on it says the same thing whether it is
 * behind a dish or a restaurant, and a second set of SVGs would be a second set
 * to keep in step with the palette.
 */
const PLACEHOLDER_CATEGORY: Record<string, string> = {
  Mediterranean: 'lunch',
  Armenian: 'grill',
  'Middle Eastern': 'grill',
  Japanese: 'sushi',
  Asian: 'asian',
  Pizza: 'pizza',
  Coffee: 'drinks',
  Desserts: 'desserts',
  Healthy: 'healthy',
  Burgers: 'burgers',
  European: 'lunch',
  Breakfast: 'breakfast',
};

/** The committed stand-in for a restaurant of this cuisine — the category
 *  placeholder nearest to what it sells, and the generic plate for a cuisine
 *  this file does not know. */
export function placeholderCover(cuisine: string | null | undefined): string {
  return placeholderPhoto(PLACEHOLDER_CATEGORY[cuisine ?? ''] ?? null);
}

/**
 * The cover for one restaurant: its own if this file has one, its cuisine's if
 * not, and something plated for a cuisine nothing here knows.
 *
 * Matching on the slug rather than an id is what lets this run against a
 * database seeded months ago: ids are generated per run, slugs are not.
 */
export function coverFor(slug: string | null | undefined, cuisine: string | null | undefined): string {
  if (usingLocalPhotos()) {
    return placeholderCover(cuisine);
  }
  const own = slug === null || slug === undefined ? undefined : RESTAURANT_COVERS[slug];
  return own ?? CUISINE_COVERS[cuisine ?? ''] ?? CUISINE_COVERS.restaurant;
}

/**
 * Whether a stored cover is one this file put there, rather than one a
 * restaurant uploaded.
 *
 * The refresh only rewrites these. Now that the upload exists, this is load
 * bearing rather than a precaution: a seed that quietly replaced a restaurant's
 * own photograph would be the worst thing in here, and an uploaded cover is
 * served from this API's own origin, so it matches nothing below.
 */
export function isSeedCover(url: string | null): boolean {
  if (url === null) {
    return true; // no cover at all: anything is an improvement
  }
  if (/\/static\/menu\/[a-z]+\.svg$/.test(url)) {
    return true; // a committed placeholder, from this seed or an older one
  }
  if (url.startsWith('https://upload.wikimedia.org/')) {
    // A cover from the first version of this table, which hotlinked Wikimedia
    // before we learned the app cannot load those. Claimed by host rather than
    // by value, because the values are gone from this file — and without this,
    // a database seeded last week would keep its blank cards forever.
    return true;
  }
  return Object.values(CUISINE_COVERS).includes(url) || Object.values(RESTAURANT_COVERS).includes(url);
}
