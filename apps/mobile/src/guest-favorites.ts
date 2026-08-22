import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from './api/client';
import { favorites as favoritesApi } from './api/endpoints';
import type {
  CardDish,
  FavoriteDish,
  FavoriteItem,
  MenuItem,
  RestaurantDetail,
  RestaurantListItem,
} from './api/types';

/**
 * Favourites a guest has saved, kept on the phone until there is an account to
 * keep them in.
 *
 * `POST /favorites` requires a verified phone (`FavoritesController`), and that
 * is the right rule server-side: a guest session is per-device, so a row written
 * against it would belong to a token nobody can ever produce again. What was
 * wrong was the *client's* reading of it — the heart on a guest's card sent them
 * to the sign-in screen, which asks somebody to open an account before they have
 * been allowed to express the one preference that would give them a reason to.
 * Saving a restaurant is not an account operation to a customer; it is a
 * bookmark.
 *
 * So a guest's hearts fill, and they fill here. The store keeps whole rows
 * rather than ids, because the Favorites tab draws restaurant cards and a guest
 * has no `GET /favorites` to draw them from — the row is copied from the card
 * that was pressed, which is where the same fields came from anyway. It goes
 * stale in the way any snapshot does: a restaurant that renames itself is
 * corrected on the next sign-in, when the list stops being local.
 *
 * **Keyed by branch**, like the account's list: a card is one address, and that
 * is the thing being bookmarked (DATABASE.md §13).
 *
 * On sign-in the whole thing is handed to the account by `adoptGuestFavorites`
 * and emptied, so the hearts survive the transition rather than being the price
 * of it. It is emptied on sign-out too (`src/session.tsx`), on the basket's
 * reasoning: the next person to hold this phone inherits nothing.
 */
export const GUEST_FAVORITES_KEY = 'amragrir.favorites.guest';

/**
 * The same, for saved **dishes**.
 *
 * Its own key rather than a second array under the one above: the two lists are
 * read by different tabs, handed over by different endpoints and cleared
 * together, and one blob holding both would mean a truncated write costs a
 * guest their restaurants as well as their food.
 *
 * Whole rows again, for the same reason — the Favourites tab draws dish cards
 * and a guest has no `GET /favorites/dishes` to draw them from. What that
 * cannot keep up with is the menu: a price changed after a guest saved a dish
 * is corrected on the next sign-in, when the list stops being local. A *card* is
 * a weaker snapshot still — `/restaurants` reports no address and a slider
 * carries no description — so those rows are drawn from what was on screen and
 * no more.
 */
export const GUEST_FAVORITE_DISHES_KEY = 'amragrir.favorites.dishes.guest';

/**
 * Reads the stored list, tolerating anything that is not one.
 *
 * Storage outlives the version of the app that wrote it, so every field is
 * checked and defaulted rather than trusted: one truncated write should cost a
 * guest their favourites, not crash the tab that renders them. Rows without a
 * branch id or a name are dropped — there is nothing to draw or to send.
 *
 * **Rows written before favourites became per-branch are dropped too**, since
 * they carry a restaurant id and no branch. They are a guest's local
 * bookmarks, never more than a few, and the alternative — guessing a branch
 * from a restaurant here, on the phone, with no catalogue to ask — would
 * silently save somebody the wrong address.
 */
export function parseGuestFavorites(raw: string | null): FavoriteItem[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const items: FavoriteItem[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const row = normalize(entry);
    if (row === null || seen.has(row.branchId)) {
      continue;
    }
    seen.add(row.branchId);
    items.push(row);
  }
  return items;
}

function normalize(entry: unknown): FavoriteItem | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const row = entry as Record<string, unknown>;
  const branchId = row.branchId;
  const name = row.name;
  if (typeof branchId !== 'string' || branchId === '') {
    return null;
  }
  if (typeof name !== 'string' || name === '') {
    return null;
  }
  return {
    branchId,
    restaurantId: typeof row.restaurantId === 'string' ? row.restaurantId : branchId,
    // The slug is what a half-written row falls back to for navigation; the
    // branch id is what the tab actually opens, and `/restaurants/:id` takes
    // either.
    slug: typeof row.slug === 'string' && row.slug !== '' ? row.slug : branchId,
    name,
    branchName: typeof row.branchName === 'string' ? row.branchName : null,
    address: typeof row.address === 'string' ? row.address : null,
    city: typeof row.city === 'string' ? row.city : '',
    cuisine: typeof row.cuisine === 'string' ? row.cuisine : null,
    priceLevel: typeof row.priceLevel === 'number' ? row.priceLevel : null,
    rating: typeof row.rating === 'number' ? row.rating : 0,
    reviewsCount: typeof row.reviewsCount === 'number' ? row.reviewsCount : 0,
    coverUrl: typeof row.coverUrl === 'string' ? row.coverUrl : null,
    prepMin: typeof row.prepMin === 'number' ? row.prepMin : null,
    isOpen: row.isOpen === true,
    services: Array.isArray(row.services)
      ? row.services.filter((service): service is string => typeof service === 'string')
      : [],
    addedAt: typeof row.addedAt === 'string' ? row.addedAt : new Date(0).toISOString(),
  };
}

/**
 * The dish rows, checked the same way and for the same reason.
 *
 * A row with no dish id, no branch to open and no name is dropped — there is
 * nothing to draw and nothing to send. Everything else is defaulted, so one
 * half-written entry costs a guest that dish rather than the tab that renders
 * it.
 */
export function parseGuestFavoriteDishes(raw: string | null): FavoriteDish[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const items: FavoriteDish[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const row = normalizeDish(entry);
    if (row === null || seen.has(row.menuItemId)) {
      continue;
    }
    seen.add(row.menuItemId);
    items.push(row);
  }
  return items;
}

function normalizeDish(entry: unknown): FavoriteDish | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const row = entry as Record<string, unknown>;
  const menuItemId = row.menuItemId;
  const branchId = row.branchId;
  const name = row.name;
  if (typeof menuItemId !== 'string' || menuItemId === '') {
    return null;
  }
  // Without the branch there is no menu to open the dish at, which is the one
  // thing a saved dish is for.
  if (typeof branchId !== 'string' || branchId === '') {
    return null;
  }
  if (typeof name !== 'string' || name === '') {
    return null;
  }
  return {
    menuItemId,
    branchId,
    restaurantId: typeof row.restaurantId === 'string' ? row.restaurantId : branchId,
    slug: typeof row.slug === 'string' && row.slug !== '' ? row.slug : branchId,
    name,
    desc: typeof row.desc === 'string' ? row.desc : '',
    priceAmd: typeof row.priceAmd === 'number' ? row.priceAmd : 0,
    photoUrl: typeof row.photoUrl === 'string' ? row.photoUrl : null,
    caloriesKcal: typeof row.caloriesKcal === 'number' ? row.caloriesKcal : null,
    prepMin: typeof row.prepMin === 'number' ? row.prepMin : null,
    // A dish saved from a card carries no availability, and "on the menu" is the
    // right assumption for one somebody was just shown.
    isAvailable: row.isAvailable !== false,
    sectionId: typeof row.sectionId === 'string' ? row.sectionId : '',
    restaurantName: typeof row.restaurantName === 'string' ? row.restaurantName : '',
    branchName: typeof row.branchName === 'string' ? row.branchName : null,
    address: typeof row.address === 'string' ? row.address : null,
    city: typeof row.city === 'string' ? row.city : '',
    isOpen: row.isOpen === true,
    addedAt: typeof row.addedAt === 'string' ? row.addedAt : new Date(0).toISOString(),
  };
}

async function write(items: FavoriteItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(items));
  } catch {
    // The heart has already moved on screen and there is nothing useful to say
    // about a phone that cannot write 200 bytes. The list is lost on restart,
    // which is what it was before this store existed.
  }
}

export async function readGuestFavorites(): Promise<FavoriteItem[]> {
  try {
    return parseGuestFavorites(await AsyncStorage.getItem(GUEST_FAVORITES_KEY));
  } catch {
    return [];
  }
}

/** Newest first, as `GET /favorites` orders it — the tab looks the same before
 *  and after signing in. Saving something twice moves it, never duplicates it. */
export async function addGuestFavorite(item: FavoriteItem): Promise<FavoriteItem[]> {
  const current = await readGuestFavorites();
  const next = [item, ...current.filter((row) => row.branchId !== item.branchId)];
  await write(next);
  return next;
}

export async function removeGuestFavorite(branchId: string): Promise<FavoriteItem[]> {
  const current = await readGuestFavorites();
  const next = current.filter((row) => row.branchId !== branchId);
  await write(next);
  return next;
}

export async function clearGuestFavorites(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_FAVORITES_KEY);
    // The dishes go with them: they are the same guest's, kept for the same
    // reason, and handed over or dropped at the same moments.
    await AsyncStorage.removeItem(GUEST_FAVORITE_DISHES_KEY);
  } catch {
    // Nothing to do about it, and nothing depends on the answer.
  }
}

async function writeDishes(items: FavoriteDish[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_FAVORITE_DISHES_KEY, JSON.stringify(items));
  } catch {
    // As above: the heart has already filled, and there is nothing useful to
    // say about a phone that cannot write a few hundred bytes.
  }
}

export async function readGuestFavoriteDishes(): Promise<FavoriteDish[]> {
  try {
    return parseGuestFavoriteDishes(await AsyncStorage.getItem(GUEST_FAVORITE_DISHES_KEY));
  } catch {
    return [];
  }
}

/** Newest first, as `GET /favorites/dishes` orders it. Saving the same dish
 *  twice moves it, never duplicates it. */
export async function addGuestFavoriteDish(item: FavoriteDish): Promise<FavoriteDish[]> {
  const current = await readGuestFavoriteDishes();
  const next = [item, ...current.filter((row) => row.menuItemId !== item.menuItemId)];
  await writeDishes(next);
  return next;
}

export async function removeGuestFavoriteDish(menuItemId: string): Promise<FavoriteDish[]> {
  const current = await readGuestFavoriteDishes();
  const next = current.filter((row) => row.menuItemId !== menuItemId);
  await writeDishes(next);
  return next;
}

/**
 * Hands the phone's list to the account that has just signed in.
 *
 * Called after the session is installed, so the bearer these requests carry is
 * the verified one. `POST /favorites` is idempotent, so a restaurant the account
 * had already saved is not a conflict — which is the whole reason this can be a
 * blind replay rather than a merge.
 *
 * Only what the server accepted is dropped from the phone. A branch that was
 * closed since it was saved (404) is dropped too, since retrying it forever
 * would mean it is never dropped at all. What is left is what could not be sent
 * — an offline sign-in keeps its list and hands it over on the next one, and the
 * tokens do not survive a restart, so those hearts are still that guest's when
 * the app comes back.
 *
 * Returns how many the account took, for the log and for tests.
 */
export async function adoptGuestFavorites(): Promise<number> {
  const pending = await readGuestFavorites();
  if (pending.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(pending.map((row) => favoritesApi.add(row.branchId)));
  const kept = pending.filter((_, index) => {
    const result = results[index];
    return result !== undefined && result.status === 'rejected' && !isGone(result.reason);
  });
  await write(kept);
  // What the account took — not `pending.length - kept.length`, which would also
  // count a restaurant dropped because it no longer exists.
  return results.filter((result) => result.status === 'fulfilled').length;
}

/**
 * The same handover for the dishes, run beside it at sign-in.
 *
 * Deliberately a second call rather than a merge into the one above: the two
 * lists go to two endpoints, and a dish that has since left the menu must be
 * dropped without taking a restaurant's transfer down with it. `POST
 * /favorites/dishes` is idempotent too, so this is a blind replay.
 *
 * Returns how many the account took, for the log and for tests.
 */
export async function adoptGuestFavoriteDishes(): Promise<number> {
  const pending = await readGuestFavoriteDishes();
  if (pending.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(
    pending.map((row) => favoritesApi.addDish(row.menuItemId)),
  );
  const kept = pending.filter((_, index) => {
    const result = results[index];
    return result !== undefined && result.status === 'rejected' && !isGone(result.reason);
  });
  await writeDishes(kept);
  return results.filter((result) => result.status === 'fulfilled').length;
}

/**
 * Whether a refusal is permanent.
 *
 * Only where the id itself is the problem — the branch was deleted (404) or
 * the value is not one the endpoint takes (400/422). A network failure (status
 * 0), a rejected token or a rate limit are all worth another attempt, so those
 * rows stay on the phone.
 */
function isGone(reason: unknown): boolean {
  return (
    reason instanceof ApiError &&
    (reason.status === 400 || reason.status === 404 || reason.status === 422)
  );
}

/**
 * The row a home-feed card would have been saved as.
 *
 * A card *is* a branch, and so is a favourite (DATABASE.md §13) — `id` is the
 * branch and it is the key here, the same id the heart sends to the API.
 *
 * The address is what a listing row cannot supply: `/restaurants` does not
 * report one, since a card says how far away a branch is rather than where it
 * is. The Favorites tab falls back to the restaurant's name for those, and the
 * real address arrives with the list on the next sign-in.
 */
export function favoriteFromListItem(restaurant: RestaurantListItem): FavoriteItem {
  return {
    branchId: restaurant.id,
    restaurantId: restaurant.restaurantId,
    slug: restaurant.slug,
    name: restaurant.name,
    branchName: null,
    address: null,
    city: '',
    cuisine: restaurant.cuisine,
    priceLevel: restaurant.priceLevel,
    rating: restaurant.rating,
    reviewsCount: restaurant.reviewsCount,
    coverUrl: restaurant.coverUrl,
    prepMin: restaurant.prepMin,
    isOpen: restaurant.isOpen,
    services: restaurant.services,
    addedAt: new Date().toISOString(),
  };
}

/**
 * The row a **menu** would have saved a dish as.
 *
 * The richest of the two: the menu carries the description, the calories and
 * whether the kitchen has run out tonight, and the loaded restaurant carries
 * the address. Close to what `GET /favorites/dishes` would answer, so a guest's
 * dish card and an account's are the same card.
 */
export function favoriteDishFromMenuItem(
  item: MenuItem,
  restaurant: RestaurantDetail,
): FavoriteDish {
  return {
    menuItemId: item.id,
    branchId: restaurant.branch.id,
    restaurantId: restaurant.restaurantId,
    slug: restaurant.slug,
    name: item.name,
    desc: item.desc,
    priceAmd: item.priceAmd,
    photoUrl: item.photoUrl,
    caloriesKcal: item.caloriesKcal,
    prepMin: item.prepMin,
    isAvailable: item.isAvailable,
    sectionId: item.sectionId,
    restaurantName: restaurant.name,
    branchName: restaurant.branch.name,
    address: restaurant.branch.address,
    city: restaurant.branch.city,
    isOpen: restaurant.branch.isOpen,
    addedAt: new Date().toISOString(),
  };
}

/**
 * The same row from a **filtered card's slider**, which knows less.
 *
 * A `CardDish` is a picture, a name and a price — no description, no calories,
 * no address — because that is all a listing sends. What is missing is left
 * empty rather than guessed at, and the account's own list replaces the row
 * with the full one at sign-in.
 */
export function favoriteDishFromCardDish(
  dish: CardDish,
  restaurant: RestaurantListItem,
): FavoriteDish {
  return {
    menuItemId: dish.id,
    branchId: restaurant.id,
    restaurantId: restaurant.restaurantId,
    slug: restaurant.slug,
    name: dish.name,
    desc: '',
    priceAmd: dish.priceAmd,
    photoUrl: dish.photoUrl,
    caloriesKcal: null,
    prepMin: null,
    // A dish only appears in the strip because it matched and is on sale — the
    // sold-out ones are already left out of it (`RestaurantsService.list`).
    isAvailable: true,
    sectionId: dish.sectionId,
    restaurantName: restaurant.name,
    branchName: null,
    address: null,
    city: '',
    isOpen: restaurant.isOpen,
    addedAt: new Date().toISOString(),
  };
}

/** The same row, from the restaurant screen — where the branch fields live one
 *  level down, and where there is an address to keep. */
export function favoriteFromDetail(restaurant: RestaurantDetail): FavoriteItem {
  return {
    branchId: restaurant.branch.id,
    restaurantId: restaurant.restaurantId,
    slug: restaurant.slug,
    name: restaurant.name,
    branchName: restaurant.branch.name,
    address: restaurant.branch.address,
    city: restaurant.branch.city,
    cuisine: restaurant.cuisine,
    priceLevel: restaurant.priceLevel,
    rating: restaurant.rating,
    reviewsCount: restaurant.reviewsCount,
    coverUrl: restaurant.coverUrl,
    prepMin: restaurant.branch.prepMin,
    isOpen: restaurant.branch.isOpen,
    services: restaurant.services,
    addedAt: new Date().toISOString(),
  };
}
