/**
 * The menu categories the seed plants, in the order the app rails them.
 *
 * Its own module rather than a constant inside `seed.ts` so that anything else
 * can read the list without running the seed — importing that file starts a
 * Prisma client and plants a database. The photo table is checked against this
 * one, so a category added here without a picture fails a test rather than
 * quietly shipping every dish under it a generic plate.
 */
export interface SeedCategory {
  key: string;
  icon: string;
  hy: string;
  ru: string;
  en: string;
}

export const CATEGORIES: SeedCategory[] = [
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

export const CATEGORY_KEYS: string[] = CATEGORIES.map((category) => category.key);
