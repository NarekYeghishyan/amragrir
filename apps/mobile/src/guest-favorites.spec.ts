import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from './api/client';
import { favorites as favoritesApi } from './api/endpoints';
import type { CardDish, MenuItem, RestaurantDetail, RestaurantListItem } from './api/types';
import {
  GUEST_FAVORITES_KEY,
  GUEST_FAVORITE_DISHES_KEY,
  addGuestFavorite,
  addGuestFavoriteDish,
  adoptGuestFavoriteDishes,
  adoptGuestFavorites,
  clearGuestFavorites,
  favoriteDishFromCardDish,
  favoriteDishFromMenuItem,
  favoriteFromListItem,
  parseGuestFavoriteDishes,
  parseGuestFavorites,
  readGuestFavoriteDishes,
  readGuestFavorites,
  removeGuestFavorite,
  removeGuestFavoriteDish,
} from './guest-favorites';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

// The whole module, so the spec never reaches `fetch` or the base URL that
// `api/client` reads out of the Expo config.
jest.mock('./api/endpoints', () => ({
  favorites: {
    add: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    addDish: jest.fn(),
    dishes: jest.fn(),
    removeDish: jest.fn(),
  },
}));

const add = favoritesApi.add as jest.MockedFunction<typeof favoritesApi.add>;
const addDish = favoritesApi.addDish as jest.MockedFunction<typeof favoritesApi.addDish>;

const card = (id: string, name: string): RestaurantListItem => ({
  id: `branch-${id}`,
  restaurantId: id,
  slug: name.toLowerCase(),
  name,
  cuisine: 'Armenian',
  priceLevel: 2,
  rating: 4.7,
  reviewsCount: 128,
  distanceKm: 1.2,
  prepMin: 20,
  isOpen: true,
  services: ['pickup'],
  reservationsEnabled: true,
  coverUrl: 'https://example.test/cover.jpg',
});

const dish = (id: string, name: string): CardDish => ({
  id,
  name,
  priceAmd: 2400,
  photoUrl: 'https://example.test/dish.jpg',
  sectionId: 'section-1',
});

const menuDish = (id: string, name: string): MenuItem => ({
  id,
  name,
  desc: 'With beef',
  priceAmd: 2400,
  caloriesKcal: 620,
  prepMin: 15,
  photoUrl: 'https://example.test/dish.jpg',
  dietaryTags: [],
  isAvailable: true,
  sectionId: 'section-1',
  isPopular: false,
  categoryId: 'cat-1',
});

const detail = (): RestaurantDetail => ({
  id: 'branch-a',
  restaurantId: 'a',
  slug: 'dolmama',
  name: 'Dolmama',
  cuisine: 'Armenian',
  priceLevel: 2,
  rating: 4.7,
  reviewsCount: 128,
  services: ['pickup'],
  reservationsEnabled: true,
  coverUrl: 'https://example.test/cover.jpg',
  branch: {
    id: 'branch-a',
    name: 'Republic Square',
    address: '5 Abovyan St',
    city: 'Yerevan',
    lat: null,
    lng: null,
    phone: null,
    isOpen: true,
    prepMin: 20,
  },
});

beforeEach(async () => {
  await clearGuestFavorites();
  jest.clearAllMocks();
  add.mockResolvedValue({ favorited: true });
  addDish.mockResolvedValue({ favorited: true });
});

describe('reading what was stored', () => {
  it('is empty before anything is saved', async () => {
    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it.each([
    ['nothing stored', null],
    ['not JSON at all', 'half a write'],
    ['a JSON value that is not a list', '{"branchId":"a"}'],
  ])('reads %s as no favourites rather than throwing', (_case, raw) => {
    expect(parseGuestFavorites(raw)).toEqual([]);
  });

  it('drops rows with nothing to draw or send', () => {
    // Storage outlives the version of the app that wrote it. A row without a
    // branch id cannot be sent to `POST /favorites`, and one without a name
    // cannot be rendered — neither is worth keeping.
    const raw = JSON.stringify([
      { branchId: 'a', name: 'Dolmama' },
      { branchId: 'b' },
      { name: 'Nameless id' },
      'not an object',
      null,
    ]);

    expect(parseGuestFavorites(raw).map((row) => row.branchId)).toEqual(['a']);
  });

  it('drops rows written before a favourite was a branch', () => {
    // They carry a restaurant id and no branch. Guessing an address from a
    // business, on the phone, with no catalogue to ask, would quietly save
    // somebody the wrong kitchen.
    expect(parseGuestFavorites(JSON.stringify([{ restaurantId: 'a', name: 'Dolmama' }]))).toEqual(
      [],
    );
  });

  it('defaults every field a half-written row is missing', () => {
    const [row] = parseGuestFavorites(JSON.stringify([{ branchId: 'a', name: 'Dolmama' }]));

    expect(row).toMatchObject({
      branchId: 'a',
      name: 'Dolmama',
      // The slug is what the card navigates by, and `/restaurants/:id` takes an
      // id just as happily.
      slug: 'a',
      address: null,
      rating: 0,
      isOpen: false,
      services: [],
    });
  });

  it('keeps the first of a duplicated branch', () => {
    const raw = JSON.stringify([
      { branchId: 'a', name: 'Newest' },
      { branchId: 'a', name: 'Older' },
    ]);

    expect(parseGuestFavorites(raw)).toHaveLength(1);
    expect(parseGuestFavorites(raw)[0]?.name).toBe('Newest');
  });

  it('keeps two branches of one restaurant apart', () => {
    // The whole point: hearting the Abovyan St kitchen is not hearting the one
    // in Malatia.
    const raw = JSON.stringify([
      { branchId: 'branch-a', restaurantId: 'r', name: 'Dolmama' },
      { branchId: 'branch-b', restaurantId: 'r', name: 'Dolmama' },
    ]);

    expect(parseGuestFavorites(raw).map((row) => row.branchId)).toEqual(['branch-a', 'branch-b']);
  });
});

describe('saving and giving back', () => {
  it('keeps the whole card, so the Favorites tab can draw it with no API', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));

    const [row] = await readGuestFavorites();
    expect(row).toMatchObject({
      // A card is a branch, and so is a favourite — `id` on the row is the key.
      branchId: 'branch-a',
      restaurantId: 'a',
      slug: 'dolmama',
      name: 'Dolmama',
      cuisine: 'Armenian',
      priceLevel: 2,
      rating: 4.7,
      coverUrl: 'https://example.test/cover.jpg',
      prepMin: 20,
      isOpen: true,
    });
  });

  it('orders newest first, as GET /favorites does', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    await addGuestFavorite(favoriteFromListItem(card('b', 'Lavash')));

    expect((await readGuestFavorites()).map((row) => row.branchId)).toEqual(['branch-b', 'branch-a']);
  });

  it('moves a branch saved twice instead of duplicating it', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    await addGuestFavorite(favoriteFromListItem(card('b', 'Lavash')));
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));

    expect((await readGuestFavorites()).map((row) => row.branchId)).toEqual(['branch-a', 'branch-b']);
  });

  it('gives one back', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    await addGuestFavorite(favoriteFromListItem(card('b', 'Lavash')));

    await removeGuestFavorite('branch-a');

    expect((await readGuestFavorites()).map((row) => row.branchId)).toEqual(['branch-b']);
  });

  it('survives a phone that cannot write', async () => {
    const setItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
    setItem.mockRejectedValueOnce(new Error('disk full'));

    // The heart has already filled on screen; a storage failure must not turn
    // that into a crash.
    await expect(
      addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama'))),
    ).resolves.toHaveLength(1);
  });
});

describe('handing the list to an account', () => {
  it('does nothing when the guest saved nothing', async () => {
    await expect(adoptGuestFavorites()).resolves.toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('posts every saved branch and empties the phone', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    await addGuestFavorite(favoriteFromListItem(card('b', 'Lavash')));

    await expect(adoptGuestFavorites()).resolves.toBe(2);

    expect(add).toHaveBeenCalledWith('branch-a');
    expect(add).toHaveBeenCalledWith('branch-b');
    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it('keeps what it could not send, for the next sign-in', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    await addGuestFavorite(favoriteFromListItem(card('b', 'Lavash')));
    // `b` is posted first — the list is newest-first.
    add.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'));

    await expect(adoptGuestFavorites()).resolves.toBe(1);

    expect((await readGuestFavorites()).map((row) => row.branchId)).toEqual(['branch-b']);
  });

  it('drops what the API will never accept', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    // The branch closed and was deleted while it sat on this phone. Retrying it
    // on every sign-in would mean never being rid of it.
    add.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Branch not found'));

    await expect(adoptGuestFavorites()).resolves.toBe(0);
    await expect(readGuestFavorites()).resolves.toEqual([]);
  });
});

describe('saved dishes', () => {
  it('is empty before anything is saved', async () => {
    await expect(readGuestFavoriteDishes()).resolves.toEqual([]);
  });

  it.each([
    ['nothing stored', null],
    ['not JSON at all', 'half a write'],
    ['a JSON value that is not a list', '{"menuItemId":"a"}'],
  ])('reads %s as no dishes rather than throwing', (_case, raw) => {
    expect(parseGuestFavoriteDishes(raw)).toEqual([]);
  });

  it('drops rows with nothing to draw or open', () => {
    // Without the branch there is no menu to open the dish at, which is the one
    // thing a saved dish is for; without a name there is nothing to draw.
    const raw = JSON.stringify([
      { menuItemId: 'a', branchId: 'branch-a', name: 'Khinkali' },
      { menuItemId: 'b', name: 'No branch' },
      { branchId: 'branch-a', name: 'No dish id' },
      { menuItemId: 'c', branchId: 'branch-a' },
      'not an object',
    ]);

    expect(parseGuestFavoriteDishes(raw).map((row) => row.menuItemId)).toEqual(['a']);
  });

  it('keeps the whole row from a menu, so the tab can draw it with no API', async () => {
    await addGuestFavoriteDish(favoriteDishFromMenuItem(menuDish('dish-a', 'Khinkali'), detail()));

    const [row] = await readGuestFavoriteDishes();
    expect(row).toMatchObject({
      menuItemId: 'dish-a',
      // The kitchen travels with the dish — it is what the row opens.
      branchId: 'branch-a',
      name: 'Khinkali',
      desc: 'With beef',
      priceAmd: 2400,
      restaurantName: 'Dolmama',
      address: '5 Abovyan St',
      isOpen: true,
    });
  });

  it('keeps what a card can say and no more', async () => {
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'Dolmama')));

    const [row] = await readGuestFavoriteDishes();
    // A listing sends no address and no description; those are filled in by the
    // account's own list at sign-in rather than guessed at here.
    expect(row).toMatchObject({ menuItemId: 'dish-a', branchId: 'branch-a', address: null, desc: '' });
  });

  it('moves a dish saved twice instead of duplicating it', async () => {
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'D')));
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-b', 'Lavash'), card('a', 'D')));
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'D')));

    expect((await readGuestFavoriteDishes()).map((row) => row.menuItemId)).toEqual([
      'dish-a',
      'dish-b',
    ]);
  });

  it('gives one back', async () => {
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'D')));
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-b', 'Lavash'), card('a', 'D')));

    await removeGuestFavoriteDish('dish-a');

    expect((await readGuestFavoriteDishes()).map((row) => row.menuItemId)).toEqual(['dish-b']);
  });

  it('hands them to the account and empties the phone', async () => {
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'D')));
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-b', 'Lavash'), card('a', 'D')));

    await expect(adoptGuestFavoriteDishes()).resolves.toBe(2);

    expect(addDish).toHaveBeenCalledWith('dish-a');
    expect(addDish).toHaveBeenCalledWith('dish-b');
    await expect(readGuestFavoriteDishes()).resolves.toEqual([]);
  });

  it('keeps what it could not send and drops what will never be accepted', async () => {
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'D')));
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-b', 'Lavash'), card('a', 'D')));
    // Newest first, so `dish-b` is posted first: it came off the menu and is
    // dropped, while the network failure on `dish-a` is worth another attempt.
    addDish.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Menu item not found'));
    addDish.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'));

    await expect(adoptGuestFavoriteDishes()).resolves.toBe(0);

    expect((await readGuestFavoriteDishes()).map((row) => row.menuItemId)).toEqual(['dish-a']);
  });
});

describe('ending the session', () => {
  it('leaves nothing for whoever holds the phone next', async () => {
    await addGuestFavorite(favoriteFromListItem(card('a', 'Dolmama')));
    await addGuestFavoriteDish(favoriteDishFromCardDish(dish('dish-a', 'Khinkali'), card('a', 'D')));

    await clearGuestFavorites();

    await expect(AsyncStorage.getItem(GUEST_FAVORITES_KEY)).resolves.toBeNull();
    // The dishes go with them: same guest, same moment.
    await expect(AsyncStorage.getItem(GUEST_FAVORITE_DISHES_KEY)).resolves.toBeNull();
  });
});
