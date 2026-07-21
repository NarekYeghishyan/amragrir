/**
 * Dev seed — categories + demo restaurants/menu drawn from the design
 * (see docs/BUSINESS_LOGIC.md §6 and docs/PROJECT_OVERVIEW.md).
 * Idempotent: upserts by natural unique keys, and only creates branches/menu
 * for a restaurant that has none yet, so re-running won't duplicate rows.
 *
 * Run: pnpm --filter @amragrir/api db:seed   (after prisma migrate)
 */
import { PrismaClient, MenuTab } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES: Array<{ key: string; icon: string; hy: string; ru: string; en: string }> = [
  { key: 'pizza', icon: '🍕', hy: 'Պիցցա', ru: 'Пицца', en: 'Pizza' },
  { key: 'burgers', icon: '🍔', hy: 'Բուրգեր', ru: 'Бургеры', en: 'Burgers' },
  { key: 'healthy', icon: '🥗', hy: 'Առողջ', ru: 'Здоровое', en: 'Healthy' },
  { key: 'sushi', icon: '🍣', hy: 'Սուշի', ru: 'Суши', en: 'Sushi' },
  { key: 'grill', icon: '🔥', hy: 'Գրիլ', ru: 'Гриль', en: 'Grill' },
  { key: 'asian', icon: '🍜', hy: 'Ասիական', ru: 'Азиатская', en: 'Asian' },
  { key: 'breakfast', icon: '🍳', hy: 'Նախաճաշ', ru: 'Завтрак', en: 'Breakfast' },
  { key: 'lunch', icon: '🍱', hy: 'Ճաշ', ru: 'Обед', en: 'Lunch' },
  { key: 'pasta', icon: '🍝', hy: 'Մակարոն', ru: 'Паста', en: 'Pasta' },
  { key: 'drinks', icon: '🥤', hy: 'Ըմպելիք', ru: 'Напитки', en: 'Drinks' },
  { key: 'desserts', icon: '🍰', hy: 'Աղանդեր', ru: 'Десерты', en: 'Desserts' },
];

interface SeedMenuItem {
  categoryKey: string;
  menuTab: MenuTab;
  hy: string;
  ru: string;
  en: string;
  priceAmd: number;
  caloriesKcal: number;
  prepMin: number;
  dietaryTags: string[];
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
  branch: { name: string; address: string; lat: number; lng: number; avgPrepMin: number };
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
    services: ['pickup', 'dinein', 'reserve'],
    branch: {
      name: 'Northern Ave',
      address: 'Northern Ave 5, Yerevan',
      lat: 40.18111,
      lng: 44.51361,
      avgPrepMin: 12,
    },
    menu: [
      { categoryKey: 'grill', menuTab: MenuTab.popular, hy: 'Ջեռոցի ջոթ', ru: 'Гриль-платтер', en: 'Grill Platter', priceAmd: 5800, caloriesKcal: 720, prepMin: 15, dietaryTags: ['halal'] },
      { categoryKey: 'healthy', menuTab: MenuTab.popular, hy: 'Քինոա բոուլ', ru: 'Боул с киноа', en: 'Quinoa Bowl', priceAmd: 4200, caloriesKcal: 480, prepMin: 8, dietaryTags: ['vegetarian', 'gluten_free'] },
      { categoryKey: 'pasta', menuTab: MenuTab.mains, hy: 'Պաստա Ալֆրեդո', ru: 'Паста Альфредо', en: 'Pasta Alfredo', priceAmd: 4800, caloriesKcal: 640, prepMin: 12, dietaryTags: ['vegetarian'] },
      { categoryKey: 'healthy', menuTab: MenuTab.sides, hy: 'Կանաչ աղցան', ru: 'Зелёный салат', en: 'Green Salad', priceAmd: 2200, caloriesKcal: 180, prepMin: 5, dietaryTags: ['vegan', 'gluten_free'] },
      { categoryKey: 'drinks', menuTab: MenuTab.drinks, hy: 'Թարմ լիմոնադ', ru: 'Свежий лимонад', en: 'Fresh Lemonade', priceAmd: 1200, caloriesKcal: 140, prepMin: 3, dietaryTags: ['vegan'] },
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
    services: ['pickup'],
    branch: {
      name: 'Cascade',
      address: 'Tamanyan St 12, Yerevan',
      lat: 40.19012,
      lng: 44.51567,
      avgPrepMin: 10,
    },
    menu: [
      { categoryKey: 'healthy', menuTab: MenuTab.popular, hy: 'Պոկե բոուլ', ru: 'Поке-боул', en: 'Poke Bowl', priceAmd: 4600, caloriesKcal: 520, prepMin: 9, dietaryTags: ['gluten_free'] },
      { categoryKey: 'breakfast', menuTab: MenuTab.popular, hy: 'Ավոկադո տոստ', ru: 'Тост с авокадо', en: 'Avocado Toast', priceAmd: 2800, caloriesKcal: 340, prepMin: 6, dietaryTags: ['vegetarian'] },
      { categoryKey: 'healthy', menuTab: MenuTab.mains, hy: 'Բանջարեղենի ռամեն', ru: 'Овощной рамен', en: 'Veggie Ramen', priceAmd: 3900, caloriesKcal: 430, prepMin: 11, dietaryTags: ['vegan'] },
      { categoryKey: 'drinks', menuTab: MenuTab.drinks, hy: 'Կանաչ սմուզի', ru: 'Зелёный смузи', en: 'Green Smoothie', priceAmd: 1600, caloriesKcal: 210, prepMin: 4, dietaryTags: ['vegan', 'gluten_free'] },
    ],
  },
];

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

  for (const r of RESTAURANTS) {
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
        ownerId: owner.id,
      },
    });

    const existingBranch = await prisma.restaurantBranch.findFirst({
      where: { restaurantId: restaurant.id },
    });
    if (existingBranch) {
      continue; // already seeded this restaurant's branch + menu
    }

    const branch = await prisma.restaurantBranch.create({
      data: {
        restaurantId: restaurant.id,
        name: r.branch.name,
        address: r.branch.address,
        lat: r.branch.lat,
        lng: r.branch.lng,
        avgPrepMin: r.branch.avgPrepMin,
        isOpen: true,
      },
    });

    await prisma.menuItem.createMany({
      data: r.menu.map((m) => ({
        branchId: branch.id,
        categoryId: categoryByKey.get(m.categoryKey) ?? null,
        menuTab: m.menuTab,
        nameI18n: { hy: m.hy, ru: m.ru, en: m.en },
        priceAmd: m.priceAmd,
        caloriesKcal: m.caloriesKcal,
        prepMin: m.prepMin,
        dietaryTags: m.dietaryTags,
      })),
    });

    // A few tables for the reservation-capable restaurant.
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

  const counts = {
    categories: await prisma.category.count(),
    restaurants: await prisma.restaurant.count(),
    branches: await prisma.restaurantBranch.count(),
    menuItems: await prisma.menuItem.count(),
    tables: await prisma.table.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
