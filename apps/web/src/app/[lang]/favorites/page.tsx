import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api, ApiError, type FavoriteBranch, type FavoriteDish } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { readSession } from '@/lib/session';
import { RestaurantCard } from '@/components/RestaurantCard';
import { FavoriteDishCard } from '@/components/FavoriteDishCard';
import {
  ORDER_ROBOTS,
  favoritesPath,
  homePath,
  restaurantPath,
  sessionPath,
  signinPath,
} from '@/lib/site';

export const metadata: Metadata = { title: 'Favourites', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  /** `?tab=dishes` — which half of the screen to draw. Anything else is the
   *  restaurants half, which is the path's own meaning. */
  searchParams: Promise<{ tab?: string }>;
}

/**
 * The favourites the account has collected, in two halves.
 *
 * **A heart means two different things in this product**, so this screen shows
 * two lists: the addresses somebody saved (the heart on a cover) and the dishes
 * they saved (the heart over a plate — a filtered card's slider, a row on a
 * menu, a dish among search results). They are not merged into one list: they are
 * different cards with different links — one opens a menu at the top, the other
 * opens it at a dish — and a mixed list would have to explain which is which on
 * every row.
 *
 * Which half is showing lives in the URL, so it works with JavaScript off, can be
 * linked to, and survives the press of a heart.
 *
 * Every card here is favourited by definition, so every heart is drawn filled —
 * and pressing one removes it, which is the only thing a heart can usefully mean
 * on this screen. The cards and their actions are the same ones the listings use;
 * both `toggleFavorite` and `toggleFavoriteDish` revalidate this route, so a row
 * leaves the list on the press rather than on the next visit.
 *
 * **A restaurant row is a branch**, so a chain saved twice is two rows on two
 * streets — which is why each card carries its address and links by branch id
 * rather than by slug: a slug resolves to the oldest branch, and that is not
 * necessarily the one that was saved. A dish row links by branch for the same
 * reason, and carries `?item=` so the menu opens at the dish.
 *
 * The lists are shared between the two clients, so what somebody favourited on
 * their phone is what this page shows, and vice versa.
 */
export default async function FavoritesPage({ params, searchParams }: Props) {
  const [{ lang }, { tab }] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);
  const onDishes = tab === 'dishes';

  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, favoritesPath(language, onDishes ? 'dishes' : undefined)));
  }

  let favorites: { items: FavoriteBranch[] };
  let dishes: { items: FavoriteDish[] };
  try {
    // Both halves, whichever is showing: the counts on the two tabs have to be
    // true before either is pressed, and they are two reads that do not depend
    // on each other.
    [favorites, dishes] = await Promise.all([
      api.favorites(session.accessToken, language),
      api.favoriteDishes(session.accessToken, language),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, favoritesPath(language, onDishes ? 'dishes' : undefined)));
    }
    throw error;
  }

  const returnTo = favoritesPath(language, onDishes ? 'dishes' : undefined);
  const showing = onDishes ? dishes.items.length : favorites.items.length;

  const tabs = (
    <ul className="fav-tabs">
      <li>
        <Link className={onDishes ? 'chip' : 'chip on'} href={favoritesPath(language)}>
          {label('favTabRestaurants')}
          {favorites.items.length > 0 ? ` · ${favorites.items.length}` : ''}
        </Link>
      </li>
      <li>
        <Link className={onDishes ? 'chip on' : 'chip'} href={favoritesPath(language, 'dishes')}>
          {label('favTabDishes')}
          {dishes.items.length > 0 ? ` · ${dishes.items.length}` : ''}
        </Link>
      </li>
    </ul>
  );

  return (
    <>
      <div className="section-head">
        <h1>{label('favoritesTitle')}</h1>
        <span className="count">{showing}</span>
      </div>

      {tabs}

      {showing === 0 ? (
        // The empty state names the half somebody is looking at: "no favourites
        // yet" on the dishes tab would be answering about the restaurants.
        <div className="empty-state">
          <div className="glyph" aria-hidden="true">
            {onDishes ? '🍽️' : '❤️'}
          </div>
          <h2>{label(onDishes ? 'noFavoriteDishes' : 'noFavorites')}</h2>
          <p>{label(onDishes ? 'noFavoriteDishesHint' : 'noFavoritesHint')}</p>
          <Link className="cta-action" href={homePath(language)}>
            {label('browseRestaurants')}
          </Link>
        </div>
      ) : onDishes ? (
        <div className="dishes-saved">
          {dishes.items.map((dish) => (
            <FavoriteDishCard
              key={dish.menuItemId}
              dish={dish}
              language={language}
              // The menu, opened at this dish: `?item=` picks the heading on the
              // server and the hash scrolls to the card, both without
              // JavaScript.
              href={`${restaurantPath(language, dish.branchId)}?item=${dish.menuItemId}#dish-${dish.menuItemId}`}
              returnTo={returnTo}
            />
          ))}
        </div>
      ) : (
        <div className="grid">
          {favorites.items.map((favorite) => (
            <RestaurantCard
              key={favorite.branchId}
              restaurant={{
                ...favorite,
                id: favorite.branchId,
                // The street is the useful one; the branch's own name and then
                // its city stand in for a branch that has not been given one.
                address: favorite.address ?? favorite.branchName ?? favorite.city,
              }}
              language={language}
              isFavorite
              returnTo={returnTo}
              href={restaurantPath(language, favorite.branchId)}
            />
          ))}
        </div>
      )}
    </>
  );
}
