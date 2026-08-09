/**
 * The photograph every demo dish points at.
 *
 * There is no photographer behind demo data, so these are **other people's
 * pictures, hotlinked** — recipe photography from TheMealDB and TheCocktailDB.
 * That is a deliberate trade for test data and a bad one for production:
 *
 * - nothing is downloaded, so the repository carries no images and no licences
 *   to honour beyond attribution on the pages these link to;
 * - a real restaurant replaces one by uploading (`POST /uploads/menu-photo`),
 *   which is the path this data exists to exercise;
 * - and the images are on somebody else's servers, so a demo behind a captive
 *   network or a firewall sees broken frames. `MENU_PHOTOS=local` seeds the
 *   committed placeholders in `apps/api/public/menu` instead.
 *
 * **Those two hosts and no others, and Wikimedia Commons in particular not.**
 * This table used to draw about half its pictures from Commons, and every one
 * of them was blank in `apps/mobile` from the day it was seeded: Wikimedia
 * answers **403 to a request whose `User-Agent` is a bare library name**, by
 * policy, and `okhttp/4.x` is what React Native sends. The site showed
 * everything, the app showed a placeholder, and the placeholder is also what
 * the app draws for "this dish has no photograph" — so the failure was
 * invisible from both ends. Sending a real agent (`Photo.tsx`) is correct and
 * was not enough on the device, so the host is gone instead. Every URL here
 * answers 200 to the agent React Native sends, which is the check to re-run
 * before adding one from anywhere new.
 *
 * `next/image` also refuses hosts it was not told about — `apps/web` renders
 * these with a plain `<img>`, and the day it does not, these hosts need an
 * `images.remotePatterns` entry.
 *
 * Every URL here was fetched and **looked at** before it was written down. That
 * is not fussiness: a keyword search for "cola" returned a bottle among sugar
 * skulls, and one for "lemonade" a museum's empty glass pitcher. A menu is a
 * list somebody reads with their eyes, and test data that looks wrong teaches
 * the wrong thing about the screens built on it.
 *
 * A dish with no picture of its own falls back to its category's rather than to
 * a picture of something else — see `DISH_PHOTOS`. Losing Commons cost a few of
 * those: "Gata" and "Four Cheese" now show their category, which is the
 * mechanism working, not a regression to fix by naming the wrong photograph.
 */
import { CATEGORY_KEYS } from './categories';

/** One per category in the seed's `CATEGORIES`, plus `dish` for a category this
 *  table does not know. What a dish falls back to when it has no photograph of
 *  its own below. */
export const CATEGORY_PHOTOS: Record<string, string> = {
  pizza: 'https://www.themealdb.com/images/media/meals/lrfdwz1764438393.jpg', // Cassava pizza — a plain pizza, which is what a category needs to be
  burgers: 'https://www.themealdb.com/images/media/meals/44bzep1761848278.jpg', // Aussie Burgers
  healthy: 'https://www.themealdb.com/images/media/meals/k29viq1585565980.jpg', // Chicken Quinoa Greek Salad
  sushi: 'https://www.themealdb.com/images/media/meals/g046bb1663960946.jpg', // Sushi
  grill: 'https://www.themealdb.com/images/media/meals/kgfh3q1763075438.jpg', // Asado — meat over open fire
  asian: 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg', // Ramen Noodles with Boiled Egg
  breakfast: 'https://www.themealdb.com/images/media/meals/rwuyqx1511383174.jpg', // Pancakes
  lunch: 'https://www.themealdb.com/images/media/meals/wuyd2h1765655837.jpg', // Chicken Fried Rice
  pasta: 'https://www.themealdb.com/images/media/meals/0jv5gx1661040802.jpg', // Fettuccine Alfredo
  drinks: 'https://www.thecocktaildb.com/images/media/drink/ytsxxw1441167732.jpg', // Orangeade
  desserts: 'https://www.themealdb.com/images/media/meals/swttys1511385853.jpg', // New York cheesecake
  /** Nothing generic looked like anything anybody would order, so an unknown
   *  category takes the lunch photograph. */
  dish: 'https://www.themealdb.com/images/media/meals/wuyd2h1765655837.jpg', // Chicken Fried Rice
};

/**
 * A photograph of the dish itself, by its English name — the key the seed's
 * menus are written in.
 *
 * Not every dish has one. Where a search could not produce a picture of the
 * right thing, the dish takes its category's rather than a picture of the wrong
 * thing: "Napoleon" showing a cheesecake is a placeholder, "Grilled Vegetables"
 * showing chicken and rice is a lie about the menu.
 */
export const DISH_PHOTOS: Record<string, string> = {
  Margherita: 'https://www.themealdb.com/images/media/meals/x0lk931587671540.jpg', // Pizza Express Margherita
  Pepperoni: 'https://www.themealdb.com/images/media/meals/wf49qs1763075222.jpg', // Matambre a la Pizza — cured meat and tomato
  // "Four Cheese" and "Garlic Bread" have no photograph of their own here and
  // take the pizza category's. Naming a picture of a different pizza for them
  // would be worse than the stand-in.

  Cheeseburger: 'https://www.themealdb.com/images/media/meals/k420tj1585565244.jpg', // Lamb Tzatziki Burgers
  'Chicken Burger': 'https://www.themealdb.com/images/media/meals/vdwloy1713225718.jpg', // 15-minute chicken & halloumi burgers
  Fries: 'https://www.themealdb.com/images/media/meals/j223gc1784579841.jpg', // Baked Yuca Fries
  // "Classic Burger" takes the burgers category, which is a plain burger.

  'Quinoa Bowl': 'https://www.themealdb.com/images/media/meals/k29viq1585565980.jpg', // Chicken Quinoa Greek Salad
  'Green Salad': 'https://www.themealdb.com/images/media/meals/6awyvm1782685205.jpg', // Bulgarian Green Salad
  Hummus: 'https://www.themealdb.com/images/media/meals/gpon5u1763801180.jpg',
  'Falafel Wrap': 'https://www.themealdb.com/images/media/meals/ae6clc1760524712.jpg', // Falafel Pita Sandwich with Tahini Sauce
  // "Poke Bowl" takes the healthy category — a grain bowl either way.

  'California Roll': 'https://www.themealdb.com/images/media/meals/g046bb1663960946.jpg', // Sushi

  'Pork Khorovats': 'https://www.themealdb.com/images/media/meals/kgfh3q1763075438.jpg', // Asado — the same fire khorovats is cooked over
  'Lula Kebab': 'https://www.themealdb.com/images/media/meals/04axct1763793018.jpg', // Adana kebab
  'Grilled Vegetables': 'https://www.themealdb.com/images/media/meals/yoj48r1763817100.jpg', // Griddled aubergines with sesame dressing

  'Pad Thai': 'https://www.themealdb.com/images/media/meals/rg9ze01763479093.jpg',
  // Both ramen dishes take the ramen photograph rather than their categories',
  // which are a salad and a grill.
  'Chicken Ramen': 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg',
  'Veggie Ramen': 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg',
  'Fried Rice': 'https://www.themealdb.com/images/media/meals/wuyd2h1765655837.jpg', // Chicken Fried Rice
  'Spring Rolls': 'https://www.themealdb.com/images/media/meals/grhn401765687086.jpg', // Air Fryer Egg Rolls
  'Miso Soup': 'https://www.themealdb.com/images/media/meals/1529446137.jpg', // Egg Drop Soup — a clear broth in a bowl

  Omelette: 'https://www.themealdb.com/images/media/meals/yvpuuy1511797244.jpg', // French Omelette

  'Ice Cream': 'https://www.themealdb.com/images/media/meals/1xscby1764790242.jpg', // Grape Nut Ice Cream
  // "Gata" takes the desserts category. Neither of these two hosts has a
  // photograph of it, and Armenian pastry is not interchangeable with any other.

  Cola: 'https://www.thecocktaildb.com/images/media/drink/yrtxxp1472719367.jpg', // Coke and Drops
  Milkshake: 'https://www.thecocktaildb.com/images/media/drink/861tzm1504784164.jpg',
  'Green Smoothie': 'https://www.thecocktaildb.com/images/media/drink/xwqvur1468876473.jpg', // Apple Berry Smoothie
  Cappuccino: 'https://www.thecocktaildb.com/images/media/drink/xwtptq1441247579.jpg', // Melya — coffee under a head of foam
  Espresso: 'https://www.thecocktaildb.com/images/media/drink/ytprxy1454513855.jpg', // Iced Coffee
  // Neither table has a shot of black espresso; the nearest coffee is what it
  // gets, and the alternative — falling back to the drinks category — would put
  // a glass of orange juice under it.
  'Green Tea': 'https://www.thecocktaildb.com/images/media/drink/uyrpww1441246384.jpg', // Masala Chai
  'Jasmine Tea': 'https://www.thecocktaildb.com/images/media/drink/uyrpww1441246384.jpg', // the same cup of tea: better than the juice their category would give them
  // "Fresh Juice" takes the drinks category, which is a glass of orange juice.
};

/** Where the API answers from — a dish stores the **absolute** address of its
 *  picture, and the local placeholders are served by the API's own static
 *  mount. Same default as `API_PUBLIC_URL` in `src/config/env.validation.ts`. */
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** The committed stand-in for a category: a gradient and the category's emoji,
 *  visibly not a photograph. What `MENU_PHOTOS=local` seeds, and what a demo
 *  with no way out to the internet wants. There is one SVG per category in
 *  `apps/api/public/menu`, so the file has to exist for the key. */
export function placeholderPhoto(categoryKey: string | null | undefined): string {
  const known = categoryKey !== null && categoryKey !== undefined && CATEGORY_KEYS.includes(categoryKey);
  return `${API_PUBLIC_URL}/static/menu/${known ? categoryKey : 'dish'}.svg`;
}

/** Whether the seed is planting hotlinked photographs (the default) or the
 *  committed placeholders. */
export const usingLocalPhotos = (): boolean => process.env.MENU_PHOTOS === 'local';

/**
 * The picture for one dish: its own if this table has one, its category's if
 * not, and the generic plate for a category nothing here knows.
 *
 * `englishName` is the dish's `name_i18n.en`. Matching on the English name
 * rather than an id is what lets this run against a database seeded months ago:
 * ids are generated per run, names are not.
 */
export function photoFor(
  englishName: string | null | undefined,
  categoryKey: string | null | undefined,
): string {
  if (usingLocalPhotos()) {
    return placeholderPhoto(categoryKey);
  }
  const own = englishName === null || englishName === undefined ? undefined : DISH_PHOTOS[englishName];
  return own ?? CATEGORY_PHOTOS[categoryKey ?? ''] ?? CATEGORY_PHOTOS.dish;
}

/**
 * Whether a stored photo is one this file put there, rather than one a
 * restaurant uploaded.
 *
 * The refresh script only rewrites these. Overwriting an uploaded photograph
 * with demo data would be the single most annoying thing a seed script could
 * do — it is the one image in the table somebody actually chose.
 */
export function isSeedPhoto(url: string | null): boolean {
  if (url === null) {
    return true; // no photograph at all: anything is an improvement
  }
  if (/\/static\/menu\/[a-z]+\.svg$/.test(url)) {
    return true; // a committed placeholder, from this seed or an older one
  }
  if (url.startsWith('https://upload.wikimedia.org/')) {
    // A photograph from when this table hotlinked Commons, before we learned
    // the app cannot load those. Claimed by host rather than by value, because
    // the values are gone from this file — and without this, every database
    // seeded before the change keeps the pictures no phone can show. Nothing
    // uploaded can be mistaken for one: an upload is served from our own host.
    return true;
  }
  return (
    Object.values(CATEGORY_PHOTOS).includes(url) || Object.values(DISH_PHOTOS).includes(url)
  );
}
