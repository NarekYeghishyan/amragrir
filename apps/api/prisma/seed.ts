/**
 * Dev seed — categories + demo restaurants/menu drawn from the design
 * (see docs/BUSINESS_LOGIC.md §6 and docs/PROJECT_OVERVIEW.md).
 * Idempotent: upserts by natural unique keys, and only creates branches/menu
 * for a restaurant that has none yet, so re-running won't duplicate rows.
 *
 * Staff live in `seedStaff` below; orders and their history live in
 * `seed-orders.ts`, which this calls last.
 *
 * Run: pnpm --filter @amragrir/api db:seed   (after prisma migrate)
 */
import { PrismaClient, StaffRole } from '@prisma/client';
import { PasswordService } from '../src/staff/password.service';
import { seedOrders } from './seed-orders';
import { seedActivity } from './seed-activity';
import { photoFor, usingLocalPhotos } from './menu-photos';
import { coverFor } from './restaurant-covers';
import { refreshSeedPhotos, refreshSeedCovers } from './refresh-photos';
import { CATEGORIES } from './categories';

const prisma = new PrismaClient();

/**
 * Every dish must have a photo — `POST /restaurant/menu-items` refuses one
 * without — and demo data has no photographer behind it, so each seeded dish
 * points at a real photograph of that dish (or of its category) hosted
 * elsewhere. The table, and the trade being made by hotlinking it, is in
 * `menu-photos.ts`; `MENU_PHOTOS=local` seeds the committed placeholders in
 * `apps/api/public/menu` instead, for a demo with no way out to the internet.
 */
interface SeedMenuItem {
  /**
   * The platform category, which here doubles as the branch's menu heading:
   * each demo branch gets one section per category its dishes use, mapped to
   * that category, so the seeded data shows the inheritance the panel relies on
   * (a dish under a mapped shelf needs no category of its own).
   */
  categoryKey: string;
  /** On the branch's "Popular" shelf — a flag now, not a tab. */
  isPopular?: boolean;
  hy: string;
  ru: string;
  en: string;
  priceAmd: number;
  caloriesKcal: number;
  prepMin: number;
  dietaryTags: string[];
}

interface SeedBranch {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /**
   * The branch's own line. Seeded because the column existing while no row
   * filled it meant the restaurant page's contact line — and the "call the
   * restaurant" action beside it — never rendered for anybody, so nobody
   * could see that either worked.
   *
   * `+374 10 555 0xx`: a Yerevan landline prefix with a 555 block, which is
   * recognisably demo data and cannot dial a real subscriber.
   */
  phone: string;
  avgPrepMin: number;
  isOpen: boolean;
}

interface SeedRestaurant {
  slug: string;
  name: string;
  cuisine: string;
  priceLevel: number;
  ratingAvg: number;
  reviewsCount: number;
  reservationsEnabled: boolean;
  services: string[];
  /** A list, not one: most of the demo set are chains. Every branch gets its
   *  own copy of the menu, because a menu item belongs to a branch. */
  branches: SeedBranch[];
  menu: SeedMenuItem[];
}

const RESTAURANTS: SeedRestaurant[] = [
  {
    slug: 'sunny-table',
    name: 'Sunny Table',
    cuisine: 'Mediterranean',
    priceLevel: 2,
    ratingAvg: 4.8,
    reviewsCount: 1200,
    reservationsEnabled: true,
    // A booking restaurant: the way to a seat here is the calendar, so its
    // pre-order is take-away and the "Eat at the Restaurant" button is drawn
    // dead beside it, leading to the booking block. `dinein` is the *other*
    // way of seating somebody and cannot be declared alongside `reserve`.
    services: ['pickup', 'reserve'],
    branches: [
      {
        name: 'Northern Ave',
        address: 'Northern Ave 5, Yerevan',
        lat: 40.18111,
        lng: 44.51361,
        phone: '+374 10 555 001',
        avgPrepMin: 12,
        isOpen: true,
      },
    ],
    menu: [
      { categoryKey: 'grill', isPopular: true,hy: 'Ջեռոցի ջոթ', ru: 'Гриль-платтер', en: 'Grill Platter', priceAmd: 5800, caloriesKcal: 720, prepMin: 15, dietaryTags: ['halal'] },
      { categoryKey: 'healthy', isPopular: true,hy: 'Քինոա բոուլ', ru: 'Боул с киноа', en: 'Quinoa Bowl', priceAmd: 4200, caloriesKcal: 480, prepMin: 8, dietaryTags: ['vegetarian', 'gluten_free'] },
      { categoryKey: 'pasta', hy: 'Պաստա Ալֆրեդո', ru: 'Паста Альфредо', en: 'Pasta Alfredo', priceAmd: 4800, caloriesKcal: 640, prepMin: 12, dietaryTags: ['vegetarian'] },
      { categoryKey: 'healthy', hy: 'Կանաչ աղցան', ru: 'Зелёный салат', en: 'Green Salad', priceAmd: 2200, caloriesKcal: 180, prepMin: 5, dietaryTags: ['vegan', 'gluten_free'] },
      { categoryKey: 'drinks', hy: 'Թարմ լիմոնադ', ru: 'Свежий лимонад', en: 'Fresh Lemonade', priceAmd: 1200, caloriesKcal: 140, prepMin: 3, dietaryTags: ['vegan'] },
    ],
  },
  {
    slug: 'greenhouse',
    name: 'Greenhouse',
    cuisine: 'Healthy',
    priceLevel: 2,
    ratingAvg: 4.6,
    reviewsCount: 640,
    reservationsEnabled: false,
    // A counter with tables, and the other half of the rule: no bookings, but
    // a room that seats whoever turns up — so a guest ordering ahead picks
    // between eating it here and taking it away, and both buttons are live.
    // `dinein` is what says the tables exist; without it this would be a hatch
    // offering take-away alone. Seeded on one of the two detailed restaurants
    // so the live pair exists to look at beside a restaurant where the second
    // button is dead.
    services: ['pickup', 'dinein'],
    branches: [
      {
        name: 'Cascade',
        address: 'Tamanyan St 12, Yerevan',
        lat: 40.19012,
        lng: 44.51567,
        phone: '+374 10 555 002',
        avgPrepMin: 10,
        isOpen: true,
      },
    ],
    menu: [
      { categoryKey: 'healthy', isPopular: true,hy: 'Պոկե բոուլ', ru: 'Поке-боул', en: 'Poke Bowl', priceAmd: 4600, caloriesKcal: 520, prepMin: 9, dietaryTags: ['gluten_free'] },
      { categoryKey: 'breakfast', isPopular: true,hy: 'Ավոկադո տոստ', ru: 'Тост с авокадо', en: 'Avocado Toast', priceAmd: 2800, caloriesKcal: 340, prepMin: 6, dietaryTags: ['vegetarian'] },
      { categoryKey: 'healthy', hy: 'Բանջարեղենի ռամեն', ru: 'Овощной рамен', en: 'Veggie Ramen', priceAmd: 3900, caloriesKcal: 430, prepMin: 11, dietaryTags: ['vegan'] },
      { categoryKey: 'drinks', hy: 'Կանաչ սմուզի', ru: 'Зелёный смузи', en: 'Green Smoothie', priceAmd: 1600, caloriesKcal: 210, prepMin: 4, dietaryTags: ['vegan', 'gluten_free'] },
    ],
  },
];

// ── the demo chains ─────────────────────────────────────────────────────────

/**
 * Menus, by kind rather than by restaurant.
 *
 * Twenty hand-written menus would be twenty chances to typo a price and no
 * more realistic than eight reused ones — a pizza place sells pizza whichever
 * pizza place it is. Each chain names the kind it serves.
 */
const MENUS: Record<string, SeedMenuItem[]> = {
  pizza: [
    { categoryKey: 'pizza', isPopular: true,hy: 'Մարգարիտա', ru: 'Маргарита', en: 'Margherita', priceAmd: 3200, caloriesKcal: 780, prepMin: 14, dietaryTags: ['vegetarian'] },
    { categoryKey: 'pizza', isPopular: true,hy: 'Պեպերոնի', ru: 'Пепперони', en: 'Pepperoni', priceAmd: 3900, caloriesKcal: 920, prepMin: 14, dietaryTags: [] },
    { categoryKey: 'pizza', hy: 'Չորս պանիր', ru: 'Четыре сыра', en: 'Four Cheese', priceAmd: 4300, caloriesKcal: 980, prepMin: 15, dietaryTags: ['vegetarian'] },
    { categoryKey: 'lunch', hy: 'Սխտորով հաց', ru: 'Чесночный хлеб', en: 'Garlic Bread', priceAmd: 1400, caloriesKcal: 260, prepMin: 6, dietaryTags: ['vegetarian'] },
    { categoryKey: 'drinks', hy: 'Կոլա', ru: 'Кола', en: 'Cola', priceAmd: 700, caloriesKcal: 140, prepMin: 1, dietaryTags: ['vegan'] },
  ],
  burgers: [
    { categoryKey: 'burgers', isPopular: true,hy: 'Դասական բուրգեր', ru: 'Классический бургер', en: 'Classic Burger', priceAmd: 3400, caloriesKcal: 850, prepMin: 11, dietaryTags: [] },
    { categoryKey: 'burgers', isPopular: true,hy: 'Չիզբուրգեր', ru: 'Чизбургер', en: 'Cheeseburger', priceAmd: 3800, caloriesKcal: 940, prepMin: 11, dietaryTags: [] },
    { categoryKey: 'burgers', hy: 'Հավով բուրգեր', ru: 'Куриный бургер', en: 'Chicken Burger', priceAmd: 3600, caloriesKcal: 790, prepMin: 12, dietaryTags: ['halal'] },
    { categoryKey: 'lunch', hy: 'Ֆրի', ru: 'Картофель фри', en: 'Fries', priceAmd: 1300, caloriesKcal: 330, prepMin: 5, dietaryTags: ['vegetarian'] },
    { categoryKey: 'drinks', hy: 'Միլքշեյք', ru: 'Молочный коктейль', en: 'Milkshake', priceAmd: 1800, caloriesKcal: 420, prepMin: 4, dietaryTags: ['vegetarian'] },
  ],
  sushi: [
    { categoryKey: 'sushi', isPopular: true,hy: 'Ֆիլադելֆիա', ru: 'Филадельфия', en: 'Philadelphia Roll', priceAmd: 4900, caloriesKcal: 480, prepMin: 13, dietaryTags: [] },
    { categoryKey: 'sushi', isPopular: true,hy: 'Կալիֆոռնիա', ru: 'Калифорния', en: 'California Roll', priceAmd: 4400, caloriesKcal: 440, prepMin: 13, dietaryTags: [] },
    { categoryKey: 'sushi', hy: 'Սաղմոնի նիգիրի', ru: 'Нигири с лососем', en: 'Salmon Nigiri', priceAmd: 2600, caloriesKcal: 220, prepMin: 9, dietaryTags: ['gluten_free'] },
    { categoryKey: 'asian', hy: 'Միսո ապուր', ru: 'Мисо-суп', en: 'Miso Soup', priceAmd: 1500, caloriesKcal: 90, prepMin: 5, dietaryTags: ['vegan'] },
    { categoryKey: 'drinks', hy: 'Կանաչ թեյ', ru: 'Зелёный чай', en: 'Green Tea', priceAmd: 800, caloriesKcal: 5, prepMin: 3, dietaryTags: ['vegan', 'gluten_free'] },
  ],
  grill: [
    { categoryKey: 'grill', isPopular: true,hy: 'Խոզի խորոված', ru: 'Свиной хоровац', en: 'Pork Khorovats', priceAmd: 6200, caloriesKcal: 880, prepMin: 20, dietaryTags: [] },
    { categoryKey: 'grill', isPopular: true,hy: 'Հավի խորոված', ru: 'Куриный хоровац', en: 'Chicken Khorovats', priceAmd: 5400, caloriesKcal: 720, prepMin: 18, dietaryTags: ['halal'] },
    { categoryKey: 'grill', hy: 'Լյուլա քյաբաբ', ru: 'Люля-кебаб', en: 'Lula Kebab', priceAmd: 4800, caloriesKcal: 660, prepMin: 16, dietaryTags: ['halal'] },
    { categoryKey: 'grill', hy: 'Խորոված բանջարեղեն', ru: 'Овощи на гриле', en: 'Grilled Vegetables', priceAmd: 2400, caloriesKcal: 190, prepMin: 12, dietaryTags: ['vegan', 'gluten_free'] },
    { categoryKey: 'drinks', hy: 'Թան', ru: 'Тан', en: 'Tan', priceAmd: 700, caloriesKcal: 90, prepMin: 1, dietaryTags: ['vegetarian', 'gluten_free'] },
  ],
  asian: [
    { categoryKey: 'asian', isPopular: true,hy: 'Պադ Թայ', ru: 'Пад Тай', en: 'Pad Thai', priceAmd: 4100, caloriesKcal: 610, prepMin: 13, dietaryTags: [] },
    { categoryKey: 'asian', isPopular: true,hy: 'Հավով ռամեն', ru: 'Рамен с курицей', en: 'Chicken Ramen', priceAmd: 4300, caloriesKcal: 580, prepMin: 14, dietaryTags: ['halal'] },
    { categoryKey: 'asian', hy: 'Տապակած բրինձ', ru: 'Жареный рис', en: 'Fried Rice', priceAmd: 3300, caloriesKcal: 520, prepMin: 10, dietaryTags: ['vegetarian'] },
    { categoryKey: 'asian', hy: 'Գարնանային ռոլլ', ru: 'Спринг-роллы', en: 'Spring Rolls', priceAmd: 1900, caloriesKcal: 240, prepMin: 7, dietaryTags: ['vegan'] },
    { categoryKey: 'drinks', hy: 'Հասմիկի թեյ', ru: 'Жасминовый чай', en: 'Jasmine Tea', priceAmd: 900, caloriesKcal: 5, prepMin: 3, dietaryTags: ['vegan', 'gluten_free'] },
  ],
  breakfast: [
    { categoryKey: 'breakfast', isPopular: true,hy: 'Ձվածեղ', ru: 'Омлет', en: 'Omelette', priceAmd: 2400, caloriesKcal: 380, prepMin: 8, dietaryTags: ['vegetarian', 'gluten_free'] },
    { categoryKey: 'breakfast', isPopular: true,hy: 'Բլիթներ', ru: 'Панкейки', en: 'Pancakes', priceAmd: 2700, caloriesKcal: 520, prepMin: 10, dietaryTags: ['vegetarian'] },
    { categoryKey: 'healthy', hy: 'Գրանոլա բոուլ', ru: 'Гранола-боул', en: 'Granola Bowl', priceAmd: 2900, caloriesKcal: 410, prepMin: 6, dietaryTags: ['vegetarian'] },
    { categoryKey: 'breakfast', hy: 'Կրուասան', ru: 'Круассан', en: 'Croissant', priceAmd: 1100, caloriesKcal: 290, prepMin: 3, dietaryTags: ['vegetarian'] },
    { categoryKey: 'drinks', hy: 'Կապուչինո', ru: 'Капучино', en: 'Cappuccino', priceAmd: 1200, caloriesKcal: 130, prepMin: 4, dietaryTags: ['vegetarian'] },
  ],
  desserts: [
    { categoryKey: 'desserts', isPopular: true,hy: 'Նապոլեոն', ru: 'Наполеон', en: 'Napoleon', priceAmd: 1800, caloriesKcal: 430, prepMin: 4, dietaryTags: ['vegetarian'] },
    { categoryKey: 'desserts', isPopular: true,hy: 'Չիզքեյք', ru: 'Чизкейк', en: 'Cheesecake', priceAmd: 2100, caloriesKcal: 470, prepMin: 4, dietaryTags: ['vegetarian'] },
    { categoryKey: 'desserts', hy: 'Գաթա', ru: 'Гата', en: 'Gata', priceAmd: 1300, caloriesKcal: 380, prepMin: 3, dietaryTags: ['vegetarian'] },
    { categoryKey: 'desserts', hy: 'Պաղպաղակ', ru: 'Мороженое', en: 'Ice Cream', priceAmd: 1400, caloriesKcal: 260, prepMin: 2, dietaryTags: ['vegetarian', 'gluten_free'] },
    { categoryKey: 'drinks', hy: 'Էսպրեսո', ru: 'Эспрессо', en: 'Espresso', priceAmd: 800, caloriesKcal: 5, prepMin: 3, dietaryTags: ['vegan', 'gluten_free'] },
  ],
  healthy: [
    { categoryKey: 'healthy', isPopular: true,hy: 'Կեսար աղցան', ru: 'Салат Цезарь', en: 'Caesar Salad', priceAmd: 3100, caloriesKcal: 390, prepMin: 8, dietaryTags: [] },
    { categoryKey: 'healthy', isPopular: true,hy: 'Ֆալաֆելի ռափ', ru: 'Фалафель-рап', en: 'Falafel Wrap', priceAmd: 2800, caloriesKcal: 450, prepMin: 9, dietaryTags: ['vegan'] },
    { categoryKey: 'lunch', hy: 'Ոսպով ապուր', ru: 'Чечевичный суп', en: 'Lentil Soup', priceAmd: 1900, caloriesKcal: 240, prepMin: 7, dietaryTags: ['vegan', 'gluten_free'] },
    { categoryKey: 'healthy', hy: 'Հումուս', ru: 'Хумус', en: 'Hummus', priceAmd: 1600, caloriesKcal: 210, prepMin: 4, dietaryTags: ['vegan', 'gluten_free'] },
    { categoryKey: 'drinks', hy: 'Թարմ հյութ', ru: 'Свежий сок', en: 'Fresh Juice', priceAmd: 1500, caloriesKcal: 160, prepMin: 4, dietaryTags: ['vegan', 'gluten_free'] },
  ],
};

/**
 * Real Yerevan streets, so an address on screen reads like an address.
 *
 * Long enough that a ten-branch chain takes ten consecutive entries without
 * wrapping onto itself and naming two branches the same.
 */
const LOCATIONS: { name: string; address: string; lat: number; lng: number }[] = [
  { name: 'Northern Ave', address: 'Northern Ave 5', lat: 40.18111, lng: 44.51361 },
  { name: 'Cascade', address: 'Tamanyan St 12', lat: 40.19012, lng: 44.51567 },
  { name: 'Abovyan', address: 'Abovyan St 18', lat: 40.1832, lng: 44.5153 },
  { name: 'Mashtots', address: 'Mashtots Ave 42', lat: 40.185, lng: 44.507 },
  { name: 'Republic Square', address: 'Republic Square 2', lat: 40.1776, lng: 44.5152 },
  { name: 'Komitas', address: 'Komitas Ave 31', lat: 40.203, lng: 44.495 },
  { name: 'Baghramyan', address: 'Baghramyan Ave 24', lat: 40.191, lng: 44.503 },
  { name: 'Tigran Mets', address: 'Tigran Mets Ave 50', lat: 40.173, lng: 44.512 },
  { name: 'Saryan', address: 'Saryan St 8', lat: 40.184, lng: 44.504 },
  { name: 'Arshakunyats', address: 'Arshakunyats Ave 60', lat: 40.162, lng: 44.49 },
  { name: 'Halabyan', address: 'Halabyan St 17', lat: 40.201, lng: 44.469 },
  { name: 'Dalma Garden', address: 'Tsitsernakaberd Hwy 3', lat: 40.195, lng: 44.475 },
  { name: 'Zoravar Andranik', address: 'Zoravar Andranik St 9', lat: 40.17, lng: 44.505 },
  { name: 'Yerevan Mall', address: 'Argishti St 7', lat: 40.167, lng: 44.501 },
];

interface SeedChain {
  slug: string;
  name: string;
  cuisine: string;
  /** Which entry of `MENUS` this one sells. */
  menu: keyof typeof MENUS;
  priceLevel: number;
  ratingAvg: number;
  reviewsCount: number;
  reservationsEnabled: boolean;
  services: string[];
  branchCount: number;
}

/**
 * Twenty demo restaurants, deliberately uneven: two ten-branch chains, four
 * with five, six with three and eight with two — 74 branches in all.
 *
 * The spread is the point. A dataset where every restaurant has one branch
 * cannot show whether the panel's restaurant-then-branch pickers, its branch
 * filter or its pagination actually work; one where they all have ten is just
 * as unrepresentative of a market that is mostly single-site restaurants.
 *
 * **The services spread is the point too**, and it is the three kinds of place
 * BUSINESS_LOGIC.md §2 allows — one of which had no example at all until
 * `dinein` stopped requiring `reserve`:
 *
 * - **`pickup` + `reserve`** (9 chains) — tables are booked. The pre-order is
 *   take-away, and "Eat at the Restaurant" is drawn dead beside it, leading to
 *   the calendar.
 * - **`pickup` + `dinein`** (6 chains, 25 branches) — a room that seats whoever
 *   turns up. Both endings live, the food paid for as a pre-order with no
 *   deposit and no table held.
 * - **`pickup` alone** (5 chains) — a hatch with nowhere to sit. Take-away and
 *   nothing else.
 *
 * A combination with no seeded example is one nobody notices is broken, which
 * is why the walk-in case gets the biggest chain rather than a token two-branch
 * one: the live pair has to survive a paginated list, not just a detail page.
 */
const CHAINS: SeedChain[] = [
  // Ten branches — the two big chains.
  { slug: 'tashir-pizza', name: 'Tashir Pizza', cuisine: 'Pizza', menu: 'pizza', priceLevel: 2, ratingAvg: 4.4, reviewsCount: 3100, reservationsEnabled: false, services: ['pickup', 'dinein'], branchCount: 10 },
  { slug: 'jazzve', name: 'Jazzve', cuisine: 'Coffee', menu: 'breakfast', priceLevel: 2, ratingAvg: 4.5, reviewsCount: 2870, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 10 },

  // Five branches.
  { slug: 'karas', name: 'Karas', cuisine: 'Armenian', menu: 'grill', priceLevel: 1, ratingAvg: 4.3, reviewsCount: 4200, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 5 },
  { slug: 'black-angus', name: 'Black Angus', cuisine: 'Burgers', menu: 'burgers', priceLevel: 3, ratingAvg: 4.6, reviewsCount: 1560, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 5 },
  { slug: 'sushi-time', name: 'Sushi Time', cuisine: 'Japanese', menu: 'sushi', priceLevel: 3, ratingAvg: 4.5, reviewsCount: 980, reservationsEnabled: false, services: ['pickup'], branchCount: 5 },
  { slug: 'green-bean', name: 'Green Bean', cuisine: 'Healthy', menu: 'healthy', priceLevel: 2, ratingAvg: 4.7, reviewsCount: 720, reservationsEnabled: false, services: ['pickup', 'dinein'], branchCount: 5 },

  // Three branches.
  { slug: 'lavash', name: 'Lavash', cuisine: 'Armenian', menu: 'grill', priceLevel: 3, ratingAvg: 4.8, reviewsCount: 5400, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 3 },
  { slug: 'wok-star', name: 'Wok Star', cuisine: 'Asian', menu: 'asian', priceLevel: 2, ratingAvg: 4.2, reviewsCount: 610, reservationsEnabled: false, services: ['pickup', 'dinein'], branchCount: 3 },
  { slug: 'gouroo', name: 'Gouroo', cuisine: 'European', menu: 'breakfast', priceLevel: 3, ratingAvg: 4.6, reviewsCount: 1340, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 3 },
  { slug: 'pizza-nova', name: 'Pizza Nova', cuisine: 'Pizza', menu: 'pizza', priceLevel: 2, ratingAvg: 4.1, reviewsCount: 880, reservationsEnabled: false, services: ['pickup'], branchCount: 3 },
  { slug: 'sweet-hour', name: 'Sweet Hour', cuisine: 'Desserts', menu: 'desserts', priceLevel: 2, ratingAvg: 4.7, reviewsCount: 1020, reservationsEnabled: false, services: ['pickup', 'dinein'], branchCount: 3 },
  { slug: 'ramen-house', name: 'Ramen House', cuisine: 'Asian', menu: 'asian', priceLevel: 2, ratingAvg: 4.4, reviewsCount: 540, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 3 },

  // Two branches.
  { slug: 'dolmama', name: 'Dolmama', cuisine: 'Armenian', menu: 'grill', priceLevel: 4, ratingAvg: 4.9, reviewsCount: 2100, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 2 },
  { slug: 'anteb', name: 'Anteb', cuisine: 'Middle Eastern', menu: 'grill', priceLevel: 3, ratingAvg: 4.6, reviewsCount: 760, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 2 },
  { slug: 'burger-bros', name: 'Burger Bros', cuisine: 'Burgers', menu: 'burgers', priceLevel: 2, ratingAvg: 4.3, reviewsCount: 430, reservationsEnabled: false, services: ['pickup'], branchCount: 2 },
  { slug: 'kohaku', name: 'Kohaku', cuisine: 'Japanese', menu: 'sushi', priceLevel: 4, ratingAvg: 4.8, reviewsCount: 690, reservationsEnabled: true, services: ['pickup', 'reserve'], branchCount: 2 },
  { slug: 'morning-set', name: 'Morning Set', cuisine: 'Breakfast', menu: 'breakfast', priceLevel: 1, ratingAvg: 4.2, reviewsCount: 310, reservationsEnabled: false, services: ['pickup', 'dinein'], branchCount: 2 },
  { slug: 'salad-lab', name: 'Salad Lab', cuisine: 'Healthy', menu: 'healthy', priceLevel: 2, ratingAvg: 4.5, reviewsCount: 280, reservationsEnabled: false, services: ['pickup'], branchCount: 2 },
  { slug: 'pastry-corner', name: 'Pastry Corner', cuisine: 'Desserts', menu: 'desserts', priceLevel: 1, ratingAvg: 4.4, reviewsCount: 950, reservationsEnabled: false, services: ['pickup', 'dinein'], branchCount: 2 },
  { slug: 'noodle-bar', name: 'Noodle Bar', cuisine: 'Asian', menu: 'asian', priceLevel: 1, ratingAvg: 4.0, reviewsCount: 190, reservationsEnabled: false, services: ['pickup'], branchCount: 2 },
];

/**
 * A chain expanded into the same shape the hand-written restaurants use.
 *
 * Everything is derived from the index rather than randomised. A seed that
 * produces different data on every run makes a bug someone found this morning
 * unreproducible this afternoon.
 */
function expand(chain: SeedChain, chainIndex: number): SeedRestaurant {
  const branches = Array.from({ length: chain.branchCount }, (_, i) => {
    // Offset per chain so two chains do not stack all their branches on the
    // same street in the same order.
    const spot = LOCATIONS[(chainIndex * 3 + i) % LOCATIONS.length] as (typeof LOCATIONS)[number];
    return {
      name: spot.name,
      address: `${spot.address}, Yerevan`,
      // Nudged per branch so two restaurants on one street are not one pin.
      lat: Number((spot.lat + chainIndex * 0.0002).toFixed(5)),
      lng: Number((spot.lng + chainIndex * 0.0002).toFixed(5)),
      // Unique per branch, and derived from the index like everything else
      // here. Starts at 100, so it never collides with the hand-written pair
      // above. A branch of a chain answers its own line, not head office.
      phone: `+374 10 555 ${String(100 + chainIndex * 10 + i).padStart(3, '0')}`,
      avgPrepMin: 8 + ((chainIndex + i) % 5) * 3,
      // Every seventh branch is shut, so the panel's "Closed" badge and the
      // "open and selling nothing" tooltip have something to render against.
      isOpen: (chainIndex + i) % 7 !== 0,
    };
  });

  return {
    slug: chain.slug,
    name: chain.name,
    cuisine: chain.cuisine,
    priceLevel: chain.priceLevel,
    ratingAvg: chain.ratingAvg,
    reviewsCount: chain.reviewsCount,
    reservationsEnabled: chain.reservationsEnabled,
    services: chain.services,
    branches,
    menu: MENUS[chain.menu] as SeedMenuItem[],
  };
}

/** The two hand-written ones, then the twenty chains. */
const ALL_RESTAURANTS: SeedRestaurant[] = [...RESTAURANTS, ...CHAINS.map(expand)];

/**
 * Gives already-seeded branches the phone number they predate.
 *
 * Matched on the branch name, which is what identifies a branch within its
 * restaurant here, and applied **only where the column is still null** — a
 * number corrected in the back office must survive the next reseed.
 */
async function backfillPhones(restaurantId: string, branches: SeedBranch[]): Promise<void> {
  for (const b of branches) {
    await prisma.restaurantBranch.updateMany({
      where: { restaurantId, name: b.name, phone: null },
      data: { phone: b.phone },
    });
  }
}

async function main(): Promise<void> {
  // Demo owner for all seeded restaurants.
  const owner = await prisma.user.upsert({
    where: { phone: '+37400000000' },
    update: {},
    create: {
      phone: '+37400000000',
      phoneVerified: true,
      name: 'Demo Owner',
      role: 'owner',
    },
  });

  // Demo platform administrator. Dev-only, like the owner above: there is no
  // bootstrap path for the first admin otherwise, and creating one by hand in
  // SQL is how a production credential ends up undocumented.
  await prisma.user.upsert({
    where: { phone: '+37400000001' },
    update: {},
    create: {
      phone: '+37400000001',
      phoneVerified: true,
      name: 'Demo Admin',
      role: 'admin',
    },
  });

  const categoryByKey = new Map<string, string>();
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { key: c.key },
      update: { icon: c.icon, nameI18n: { hy: c.hy, ru: c.ru, en: c.en } },
      create: {
        key: c.key,
        icon: c.icon,
        sortOrder: CATEGORIES.indexOf(c),
        nameI18n: { hy: c.hy, ru: c.ru, en: c.en },
      },
    });
    categoryByKey.set(c.key, cat.id);
  }

  for (const r of ALL_RESTAURANTS) {
    const restaurant = await prisma.restaurant.upsert({
      where: { slug: r.slug },
      update: {
        name: r.name,
        cuisine: r.cuisine,
        priceLevel: r.priceLevel,
        ratingAvg: r.ratingAvg,
        reviewsCount: r.reviewsCount,
        reservationsEnabled: r.reservationsEnabled,
        services: r.services,
      },
      create: {
        slug: r.slug,
        name: r.name,
        cuisine: r.cuisine,
        priceLevel: r.priceLevel,
        ratingAvg: r.ratingAvg,
        reviewsCount: r.reviewsCount,
        reservationsEnabled: r.reservationsEnabled,
        services: r.services,
        // On create only. A restaurant that has been here a while may have had
        // its cover changed, and the update above must not walk over that —
        // `refreshSeedCovers` below fills the empty ones instead, and knows the
        // difference between a picture this seed planted and one somebody chose.
        coverUrl: coverFor(r.slug, r.cuisine),
        ownerId: owner.id,
      },
    });

    const existingBranch = await prisma.restaurantBranch.findFirst({
      where: { restaurantId: restaurant.id },
    });
    if (existingBranch) {
      // Branches and menus are already there — but a phone may not be. It was
      // added to this seed after these rows existed, and returning here would
      // leave every database seeded before then without one, which looks
      // exactly like the contact line and the call action not working.
      await backfillPhones(restaurant.id, r.branches);
      continue; // already seeded this restaurant's branches + menus
    }

    for (const b of r.branches) {
      const branch = await prisma.restaurantBranch.create({
        data: {
          restaurantId: restaurant.id,
          name: b.name,
          address: b.address,
          lat: b.lat,
          lng: b.lng,
          phone: b.phone,
          avgPrepMin: b.avgPrepMin,
          isOpen: b.isOpen,
        },
      });

      // Per branch, not per restaurant: a menu item hangs off a branch, which
      // is what lets one branch of a chain sell out a dish while the rest
      // carry on.
      // The branch's own menu headings: one per category its dishes use, in the
      // order the category rail runs, each mapped to that category. The dishes
      // below then inherit a category without naming one — the arrangement the
      // panel nudges every real restaurant towards, and the reason this seed
      // exercises it rather than setting both fields on every row.
      const sectionByCategory = new Map<string, string>();
      const usedKeys = CATEGORIES.map((c) => c.key).filter((key) =>
        r.menu.some((m) => m.categoryKey === key),
      );
      for (const [index, key] of usedKeys.entries()) {
        const category = CATEGORIES.find((c) => c.key === key)!;
        const section = await prisma.branchMenuSection.create({
          data: {
            branchId: branch.id,
            categoryId: categoryByKey.get(key) ?? null,
            nameI18n: { hy: category.hy, ru: category.ru, en: category.en },
            sortOrder: index,
          },
        });
        sectionByCategory.set(key, section.id);
      }

      await prisma.menuItem.createMany({
        data: r.menu.map((m) => ({
          branchId: branch.id,
          sectionId: sectionByCategory.get(m.categoryKey)!,
          categoryId: null,
          isPopular: m.isPopular ?? false,
          nameI18n: { hy: m.hy, ru: m.ru, en: m.en },
          priceAmd: m.priceAmd,
          caloriesKcal: m.caloriesKcal,
          prepMin: m.prepMin,
          photoUrl: photoFor(m.en, m.categoryKey),
          dietaryTags: m.dietaryTags,
        })),
      });

      // A few tables for the reservation-capable restaurants.
      if (r.reservationsEnabled) {
        await prisma.table.createMany({
          data: [
            { branchId: branch.id, tableNo: '1', seats: 2, zone: 'hall' },
            { branchId: branch.id, tableNo: '2', seats: 4, zone: 'hall' },
            { branchId: branch.id, tableNo: '3', seats: 4, zone: 'terrace' },
            { branchId: branch.id, tableNo: '4', seats: 6, zone: 'terrace' },
          ],
        });
      }
    }
  }

  // Dishes from before a photo was required, and menus this seed planted when
  // the placeholders were the best it had. Runs after the loop above so it
  // catches both those and anything added by hand against an older API. An
  // uploaded photograph is never touched — see `isSeedPhoto`.
  const refreshed = await refreshSeedPhotos(prisma);
  if (refreshed > 0) {
    console.log(`Menu photos: gave ${refreshed} dish(es) the picture for what they are.`);
  }

  // And the same for restaurants seeded before covers existed here — every one
  // of them was planted with `cover_url` null, which is why the card, the
  // restaurant banner and the order thumbnail all drew their empty state.
  const covers = await refreshSeedCovers(prisma);
  if (covers > 0) {
    console.log(`Restaurant covers: gave ${covers} restaurant(s) a picture.`);
  }

  await seedStaff();
  // Last: an order needs a branch to belong to, a menu to be made of and
  // somebody at that branch to have moved it through the kitchen.
  await seedOrders(prisma);
  // Later still: an audit entry names a person, a dish and a branch, so all
  // three have to exist before it can describe anything.
  await seedActivity(prisma);

  const counts = {
    categories: await prisma.category.count(),
    restaurants: await prisma.restaurant.count(),
    // Should print 0 too, and for the same reason as the dishes below: the
    // screens that read this column have no other way of saying "no picture"
    // than the empty state they used to show for every restaurant.
    restaurantsWithoutCover: await prisma.restaurant.count({ where: { coverUrl: null } }),
    branches: await prisma.restaurantBranch.count(),
    menuItems: await prisma.menuItem.count(),
    // Should always print 0. It is in the summary rather than in a comment
    // because "every dish has a picture" is a claim worth re-checking on every
    // run, not one to take on trust from the code above.
    menuItemsWithoutPhoto: await prisma.menuItem.count({ where: { photoUrl: null } }),
    // Which kind of picture, so a menu full of gradients-with-emoji is a line
    // in the log rather than a puzzle.
    menuPhotos: usingLocalPhotos() ? 'local placeholders' : 'hotlinked photographs',
    tables: await prisma.table.count(),
    staff: await prisma.staffUser.count(),
    orders: await prisma.order.count(),
    orderEvents: await prisma.orderEvent.count(),
  };
  console.log('Seed complete:', counts);
}


/** Armenian names, so the back office reads like one somebody works in
 *  rather than a list of "Test User 4". */
const FIRST_NAMES = [
  'Ani', 'Aram', 'Narek', 'Lusine', 'Tigran', 'Mariam', 'Davit', 'Anahit',
  'Gor', 'Nare', 'Hayk', 'Sona', 'Vahe', 'Mane', 'Armen', 'Karine',
  'Levon', 'Astghik', 'Suren', 'Gayane', 'Arsen', 'Nune', 'Vardan', 'Syuzi',
];

const LAST_NAMES = [
  'Grigoryan', 'Sargsyan', 'Hakobyan', 'Petrosyan', 'Vardanyan', 'Manukyan',
  'Harutyunyan', 'Khachatryan', 'Avetisyan', 'Mkrtchyan', 'Poghosyan',
  'Ghazaryan', 'Melkonyan', 'Baghdasaryan', 'Simonyan', 'Tovmasyan',
];

/**
 * A small stable hash, used to pick a name and a sign-in date from an email.
 *
 * Deterministic on purpose: re-running the seed has to produce the *same*
 * person behind the same address, or every run would rename the staff.
 */
function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function nameFor(email: string): string {
  const hash = stableHash(email);
  const first = FIRST_NAMES[hash % FIRST_NAMES.length] ?? 'Ani';
  const last = LAST_NAMES[(hash >>> 5) % LAST_NAMES.length] ?? 'Grigoryan';
  return `${first} ${last}`;
}

/** `Northern Ave` → `northern-ave`, for an address somebody can read. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'branch'
  );
}

interface DemoStaff {
  email: string;
  name: string;
  /** Null for somebody who has an account and has not used it yet — a real
   *  directory always has a few. */
  lastLoginAt: Date | null;
  /** Somebody who left. Deactivated rather than deleted, because `audit_log`
   *  still has to be able to name them. */
  isActive: boolean;
}

interface DemoAssignment {
  email: string;
  role: StaffRole;
  restaurantId: string | null;
  branchId: string | null;
}

/**
 * The back office needs a first account.
 *
 * There is no sign-up for staff — an account is only ever created by someone
 * who already has one — so without a seeded super admin nobody can invite
 * anybody and the panel is unreachable. Dev-only credentials, printed on every
 * run so they are never a secret somebody has to be told.
 */
async function seedStaff(): Promise<void> {
  const email = 'admin@amragrir.local';
  const password = 'change-me-in-dev-only';
  const passwordHash = await new PasswordService().hash(password);

  const admin = await prisma.staffUser.upsert({
    where: { email },
    // Left alone if it already exists: re-seeding must not reset a password
    // somebody has since changed.
    update: {},
    create: {
      email,
      name: 'Demo Super Admin',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const held = await prisma.staffAssignment.findFirst({
    where: { staffUserId: admin.id, role: StaffRole.super_admin },
  });
  if (!held) {
    await prisma.staffAssignment.create({
      data: { staffUserId: admin.id, role: StaffRole.super_admin },
    });
  }

  // Every seeded restaurant gets a restaurant_admin, so the owner-side screens
  // have somebody to be signed in as.
  const managerEmail = 'owner@amragrir.local';
  const manager = await prisma.staffUser.upsert({
    where: { email: managerEmail },
    update: {},
    create: {
      email: managerEmail,
      name: 'Demo Restaurant Admin',
      passwordHash: await new PasswordService().hash(password),
      emailVerifiedAt: new Date(),
    },
  });

  for (const restaurant of await prisma.restaurant.findMany({ select: { id: true } })) {
    const existing = await prisma.staffAssignment.findFirst({
      where: {
        staffUserId: manager.id,
        role: StaffRole.restaurant_admin,
        restaurantId: restaurant.id,
      },
    });
    if (!existing) {
      await prisma.staffAssignment.create({
        data: {
          staffUserId: manager.id,
          role: StaffRole.restaurant_admin,
          restaurantId: restaurant.id,
        },
      });
    }
  }

  await seedDemoTeams(admin.id, passwordHash);

  console.log(`Staff seed: ${email} / ${managerEmail} — password "${password}"`);
}

/**
 * A staffed platform rather than two demo logins.
 *
 * Every restaurant gets its own `restaurant_admin`, every branch a
 * `restaurant_manager` and two `branch_staff`. Without this the back office is
 * true but empty: the People tab holds two rows, a restaurant's own page can
 * only ever show one group, and nothing exercises a role scoped to a branch —
 * which is most of what the permission model is *for*.
 *
 * Additive and idempotent like the rest of the seed. Addresses are derived from
 * the restaurant and branch rather than from a counter, so re-running finds the
 * same accounts instead of making a second set of them.
 */
async function seedDemoTeams(invitedById: string, passwordHash: string): Promise<void> {
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      slug: true,
      branches: { select: { id: true, name: true, city: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const wanted = new Map<string, DemoStaff>();
  const assignments: DemoAssignment[] = [];
  const used = new Set<string>();

  /** Unique within the run: two branches of one restaurant may share a name,
   *  and two people cannot share an address. */
  const address = (local: string, slug: string): string => {
    const base = `${local}@${slug}.amragrir.local`;
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let n = 2;
    while (used.has(`${local}${n}@${slug}.amragrir.local`)) {
      n += 1;
    }
    const unique = `${local}${n}@${slug}.amragrir.local`;
    used.add(unique);
    return unique;
  };

  const hire = (email: string): string => {
    const hash = stableHash(email);
    wanted.set(email, {
      email,
      name: nameFor(email),
      // One in seven has never signed in, the rest within the last 45 days.
      lastLoginAt:
        hash % 7 === 0
          ? null
          : new Date(Date.now() - ((hash >>> 3) % 45) * 24 * 3600 * 1000),
      // One in twenty-nine has left. Rare enough to be an exception on screen
      // rather than a pattern.
      isActive: hash % 29 !== 0,
    });
    return email;
  };

  for (const restaurant of restaurants) {
    assignments.push({
      email: hire(address('admin', restaurant.slug)),
      role: StaffRole.restaurant_admin,
      restaurantId: restaurant.id,
      branchId: null,
    });

    let previousManager: string | null = null;

    for (const [index, branch] of restaurant.branches.entries()) {
      const where = slugify(branch.name ?? branch.city);

      // Every third branch of a chain is covered by the manager next door
      // rather than getting its own. That is how a chain actually staffs, and
      // it is the case the panel has to render honestly: one person, two rows.
      if (index > 0 && index % 3 === 0 && previousManager !== null) {
        assignments.push({
          email: previousManager,
          role: StaffRole.restaurant_manager,
          restaurantId: null,
          branchId: branch.id,
        });
      } else {
        previousManager = hire(address(`manager.${where}`, restaurant.slug));
        assignments.push({
          email: previousManager,
          role: StaffRole.restaurant_manager,
          restaurantId: null,
          branchId: branch.id,
        });
      }

      for (const shift of [1, 2]) {
        assignments.push({
          email: hire(address(`staff${shift}.${where}`, restaurant.slug)),
          role: StaffRole.branch_staff,
          restaurantId: null,
          branchId: branch.id,
        });
      }
    }
  }

  const emails = [...wanted.keys()];

  // Created in bulk, and only the ones missing: `skipDuplicates` leaves an
  // account somebody has since edited — or whose password they changed —
  // exactly as it is.
  const existing = await prisma.staffUser.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const have = new Set(existing.map((row) => row.email));

  await prisma.staffUser.createMany({
    skipDuplicates: true,
    data: [...wanted.values()]
      .filter((person) => !have.has(person.email))
      .map((person) => ({
        email: person.email,
        name: person.name,
        // The same hash for every demo account, derived once. scrypt is
        // deliberately expensive — two hundred of them would add minutes to a
        // seed — and the password is printed on every run anyway, so there is
        // nothing here a shared salt could give away.
        passwordHash,
        emailVerifiedAt: new Date(),
        lastLoginAt: person.lastLoginAt,
        isActive: person.isActive,
      })),
  });

  const idByEmail = new Map(
    (
      await prisma.staffUser.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      })
    ).map((row) => [row.email, row.id]),
  );

  const held = new Set(
    (
      await prisma.staffAssignment.findMany({
        where: { staffUserId: { in: [...idByEmail.values()] } },
        select: { staffUserId: true, role: true, restaurantId: true, branchId: true },
      })
    ).map((row) => `${row.staffUserId}|${row.role}|${row.restaurantId}|${row.branchId}`),
  );

  const toCreate = assignments
    .map((assignment) => ({
      staffUserId: idByEmail.get(assignment.email) ?? '',
      role: assignment.role,
      restaurantId: assignment.restaurantId,
      branchId: assignment.branchId,
    }))
    .filter(
      (row) =>
        row.staffUserId !== '' &&
        !held.has(`${row.staffUserId}|${row.role}|${row.restaurantId}|${row.branchId}`),
    );

  if (toCreate.length > 0) {
    await prisma.staffAssignment.createMany({ data: toCreate, skipDuplicates: true });
  }

  await seedOpenInvites(invitedById, restaurants);

  const byRole = (role: StaffRole): number =>
    assignments.filter((assignment) => assignment.role === role).length;
  console.log(
    `Demo teams: ${wanted.size} accounts — ${byRole(StaffRole.restaurant_admin)} admins, ` +
      `${byRole(StaffRole.restaurant_manager)} manager roles, ` +
      `${byRole(StaffRole.branch_staff)} shifts. Addresses like ` +
      `manager.<branch>@<restaurant>.amragrir.local`,
  );
}

/**
 * A few invitations nobody has accepted.
 *
 * The People tab has a whole section for these, and a section that is never
 * populated in dev is a section nobody notices is broken. They are deliberately
 * left unaccepted: accepting one is what the panel is for.
 */
async function seedOpenInvites(
  invitedById: string,
  restaurants: { id: string; slug: string; branches: { id: string }[] }[],
): Promise<void> {
  const targets = restaurants.filter((restaurant) => restaurant.branches.length > 0).slice(0, 3);

  for (const [index, restaurant] of targets.entries()) {
    const email = `new.hire${index + 1}@${restaurant.slug}.amragrir.local`;
    const open = await prisma.staffInvite.findFirst({ where: { email, acceptedAt: null } });
    if (open) {
      continue;
    }

    const branchId = restaurant.branches[0]?.id ?? null;
    await prisma.staffInvite.create({
      data: {
        email,
        // One of each kind that takes a branch, plus one over the restaurant,
        // so the invitations list shows more than a single shape.
        role: index === 0 ? StaffRole.branch_staff : index === 1 ? StaffRole.restaurant_manager : StaffRole.restaurant_admin,
        restaurantId: index === 2 ? restaurant.id : null,
        branchId: index === 2 ? null : branchId,
        // Only the hash is ever stored. The raw token lives in the email, and
        // these are demo rows nobody is meant to accept — so this one is a
        // stable string rather than a secret that would have to be printed.
        tokenHash: `seed-invite-${restaurant.slug}-${index}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        invitedById,
      },
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
