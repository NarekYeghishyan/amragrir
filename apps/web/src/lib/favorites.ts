import type { Language } from '@amragrir/shared';
import { api, ApiError } from './api';
import { readSession } from './session';

/**
 * Which branches this visitor has saved, keyed the way a card can ask.
 *
 * Every listing that draws a heart needs this, and all of them need the same
 * thing: a set of **branch** ids, because that is what a favourite is stored
 * against and what every heart posts. A listing row's own `id` *is* its branch,
 * so a card looks itself up here directly — hearting the Abovyan St kitchen no
 * longer fills the heart on the one in Malatia (DATABASE.md §13).
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
    return new Set(favorites.items.map((favorite) => favorite.branchId));
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return new Set();
  }
}

/**
 * Which **dishes** this visitor has saved.
 *
 * The same question as above for the other subject a heart can have: a card
 * wearing the dishes that matched a filter draws a heart over each plate, and a
 * menu draws one on every row. Ids rather than the whole rows, because that is
 * the one bit each heart needs — `GET /favorites/dishes/ids` exists for exactly
 * this, and returning twenty dish descriptions to decide twenty booleans would
 * be the wrong shape.
 *
 * `branchId` narrows it to one menu, which is what a restaurant page asks: an
 * account may have saved dishes all over Yerevan and this page draws one
 * kitchen's.
 *
 * Empty for anyone not signed in, and empty on a failure — hollow hearts on a
 * listing beat a listing that will not render.
 */
export async function favoriteDishIds(
  language: Language,
  branchId?: string,
): Promise<Set<string>> {
  const session = await readSession();
  if (!session || !session.verified) {
    return new Set();
  }

  try {
    const saved = await api.favoriteDishIds(session.accessToken, language, branchId);
    return new Set(saved.ids);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return new Set();
  }
}
