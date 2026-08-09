import type { Language } from '@amragrir/shared';
import { api, ApiError } from './api';
import { readSession } from './session';

/**
 * Which restaurants this visitor has saved, keyed the way a card can ask.
 *
 * Every listing that draws a heart needs this, and all of them need the same
 * thing: a set of **restaurant** ids, because that is what a favourite is
 * stored against and what `RestaurantCard` posts. A listing row's own `id` is
 * its branch, so it cannot be looked up here — hence `restaurantId` on the
 * catalog's rows.
 *
 * `GET /favorites` rather than a lighter endpoint listing only ids: no such
 * endpoint exists, this is one round trip either way, and the favourites screen
 * already reads exactly this. `FavoritesService.idsFor` is the shape a leaner
 * one would return if the extra call ever proves worth it.
 *
 * **Empty is the honest answer for anyone who is not signed in.** A guest has no
 * favourites and the endpoint refuses them, so their hearts are all hollow — and
 * pressing one sends them to sign in and back. A failure is treated the same
 * way: hollow hearts on a listing beat a listing that will not render.
 */
export async function favoriteIds(language: Language): Promise<Set<string>> {
  const session = await readSession();
  if (!session || !session.verified) {
    return new Set();
  }

  try {
    const favorites = await api.favorites(session.accessToken, language);
    return new Set(favorites.items.map((favorite) => favorite.restaurantId));
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return new Set();
  }
}
