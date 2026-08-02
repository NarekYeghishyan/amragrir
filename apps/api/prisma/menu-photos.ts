/**
 * The photograph every demo dish points at.
 *
 * There is no photographer behind demo data, so these are **other people's
 * pictures, hotlinked** — recipe photos from TheMealDB and TheCocktailDB, and
 * freely-licensed photographs from Wikimedia Commons. That is a deliberate
 * trade for test data and a bad one for production:
 *
 * - nothing is downloaded, so the repository carries no images and no licences
 *   to honour beyond attribution on the pages these link to;
 * - a real restaurant replaces one by uploading (`POST /uploads/menu-photo`),
 *   which is the path this data exists to exercise;
 * - and the images are on somebody else's servers, so a demo behind a captive
 *   network or a firewall sees broken frames. `MENU_PHOTOS=local` seeds the
 *   committed placeholders in `apps/api/public/menu` instead.
 *
 * Two things to know before these reach a browser: Wikimedia rate-limits bursts
 * (a page loading a dozen thumbnails is ordinary traffic, a script fetching
 * forty in a row is not), and `next/image` refuses hosts it was not told about —
 * `apps/web` renders no dish photographs yet, and when it does these hosts need
 * an `images.remotePatterns` entry.
 *
 * Every URL here was fetched and **looked at** before it was written down. That
 * is not fussiness: a keyword search for "cola" returned a bottle among sugar
 * skulls, and one for "lemonade" a museum's empty glass pitcher. A menu is a
 * list somebody reads with their eyes, and test data that looks wrong teaches
 * the wrong thing about the screens built on it.
 */
import { CATEGORY_KEYS } from './categories';

/** One per category in the seed's `CATEGORIES`, plus `dish` for a category this
 *  table does not know. What a dish falls back to when it has no photograph of
 *  its own below. */
export const CATEGORY_PHOTOS: Record<string, string> = {
  pizza: 'https://www.themealdb.com/images/media/meals/x0lk931587671540.jpg', // Pizza Express Margherita
  burgers: 'https://www.themealdb.com/images/media/meals/44bzep1761848278.jpg', // Aussie Burgers
  healthy: 'https://www.themealdb.com/images/media/meals/k29viq1585565980.jpg', // Chicken Quinoa Greek Salad
  sushi: 'https://www.themealdb.com/images/media/meals/g046bb1663960946.jpg', // Sushi
  grill:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Mixed_Grill_%26_Rice_on_Sizzling_Plate.jpg/960px-Mixed_Grill_%26_Rice_on_Sizzling_Plate.jpg',
  asian: 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg', // Ramen Noodles with Boiled Egg
  breakfast: 'https://www.themealdb.com/images/media/meals/rwuyqx1511383174.jpg', // Pancakes
  lunch: 'https://www.themealdb.com/images/media/meals/wuyd2h1765655837.jpg', // Chicken Fried Rice
  pasta: 'https://www.themealdb.com/images/media/meals/0jv5gx1661040802.jpg', // Fettuccine Alfredo
  drinks:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Orange_juice_1_edit1.jpg/960px-Orange_juice_1_edit1.jpg',
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
  Margherita:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg/960px-Eq_it-na_pizza-margherita_sep2005_sml.jpg',
  Pepperoni:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Pepperoni_Pizza_from_Fellini%E2%80%99s_Pizza.jpg/960px-Pepperoni_Pizza_from_Fellini%E2%80%99s_Pizza.jpg',
  'Four Cheese':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Pizza_quattro_formaggi_at_restaurant%2C_Chalk_Farm_Road%2C_London.jpg/960px-Pizza_quattro_formaggi_at_restaurant%2C_Chalk_Farm_Road%2C_London.jpg',
  'Garlic Bread':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Garlic_bread_-_on_plate%2C_ready_to_eat.jpg/960px-Garlic_bread_-_on_plate%2C_ready_to_eat.jpg',

  'Classic Burger':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/NCI_Visuals_Food_Hamburger.jpg/960px-NCI_Visuals_Food_Hamburger.jpg',
  Cheeseburger:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Cheeseburger_with_onions_at_Hatfield_Heath_Festival_2017.jpg/960px-Cheeseburger_with_onions_at_Hatfield_Heath_Festival_2017.jpg',
  'Chicken Burger': 'https://www.themealdb.com/images/media/meals/vdwloy1713225718.jpg', // 15-minute chicken & halloumi burgers
  Fries:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Fried_egg_surrounded_by_French_fries_on_a_white_plate.jpg/960px-Fried_egg_surrounded_by_French_fries_on_a_white_plate.jpg',

  'Quinoa Bowl': 'https://www.themealdb.com/images/media/meals/k29viq1585565980.jpg', // Chicken Quinoa Greek Salad
  'Green Salad': 'https://www.themealdb.com/images/media/meals/6awyvm1782685205.jpg', // Bulgarian Green Salad
  'Poke Bowl':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Fried_Tofu_Poke_Bowl_%28S%29_with_kimchi_sauce_-_Kitokito.jpg/960px-Fried_Tofu_Poke_Bowl_%28S%29_with_kimchi_sauce_-_Kitokito.jpg',
  Hummus: 'https://www.themealdb.com/images/media/meals/gpon5u1763801180.jpg',
  'Falafel Wrap': 'https://www.themealdb.com/images/media/meals/ae6clc1760524712.jpg', // Falafel Pita Sandwich with Tahini Sauce

  'California Roll':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/California_Sushi_mit_Kaviar_%2826545022496%29.jpg/960px-California_Sushi_mit_Kaviar_%2826545022496%29.jpg',

  'Pork Khorovats':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Khorovats_in_the_making.jpg/960px-Khorovats_in_the_making.jpg',
  'Lula Kebab': 'https://www.themealdb.com/images/media/meals/04axct1763793018.jpg', // Adana kebab
  'Grilled Vegetables':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Grilled_vegetables_%286373328369%29.jpg/960px-Grilled_vegetables_%286373328369%29.jpg',

  'Pad Thai': 'https://www.themealdb.com/images/media/meals/rg9ze01763479093.jpg',
  // Both ramen dishes take the ramen photograph rather than their categories',
  // which are a salad and a grill.
  'Chicken Ramen': 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg',
  'Veggie Ramen': 'https://www.themealdb.com/images/media/meals/ip5xtp1769779958.jpg',
  'Fried Rice': 'https://www.themealdb.com/images/media/meals/wuyd2h1765655837.jpg', // Chicken Fried Rice
  'Spring Rolls':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Spring_Rolls_%283357696061%29.jpg/960px-Spring_Rolls_%283357696061%29.jpg',
  'Miso Soup':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Miso_Soup_001.jpg/960px-Miso_Soup_001.jpg',

  Omelette: 'https://www.themealdb.com/images/media/meals/yvpuuy1511797244.jpg', // French Omelette

  Gata:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Gata_%28p%C3%A2tisserie%29.jpg/960px-Gata_%28p%C3%A2tisserie%29.jpg',
  'Ice Cream': 'https://www.themealdb.com/images/media/meals/1xscby1764790242.jpg', // Grape Nut Ice Cream

  Cola:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/15-09-26-RalfR-WLC-0098_-_Coca-Cola_glass_bottle_%28Germany%29.jpg/960px-15-09-26-RalfR-WLC-0098_-_Coca-Cola_glass_bottle_%28Germany%29.jpg',
  'Fresh Juice':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Orange_juice_1_edit1.jpg/960px-Orange_juice_1_edit1.jpg',
  Milkshake: 'https://www.thecocktaildb.com/images/media/drink/861tzm1504784164.jpg',
  'Green Smoothie': 'https://www.thecocktaildb.com/images/media/drink/xwqvur1468876473.jpg', // Apple Berry Smoothie
  Cappuccino: 'https://www.thecocktaildb.com/images/media/drink/ytprxy1454513855.jpg', // Iced Coffee
  Espresso:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/A_cup_of_espresso.jpg/960px-A_cup_of_espresso.jpg',
  'Green Tea':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/White_cup_with_green_tea_in_it.jpg/960px-White_cup_with_green_tea_in_it.jpg',
  'Jasmine Tea':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Jasmine_tea_at_Pizza_Hut_Sudirman%2C_Yogyakarta%2C_2014-08-12.jpg/960px-Jasmine_tea_at_Pizza_Hut_Sudirman%2C_Yogyakarta%2C_2014-08-12.jpg',
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
  return (
    Object.values(CATEGORY_PHOTOS).includes(url) || Object.values(DISH_PHOTOS).includes(url)
  );
}
