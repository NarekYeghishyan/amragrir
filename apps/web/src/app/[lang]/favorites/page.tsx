import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api, ApiError, type FavoriteRestaurant } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { readSession } from '@/lib/session';
import { RestaurantCard } from '@/components/RestaurantCard';
import { ORDER_ROBOTS, favoritesPath, homePath, sessionPath, signinPath } from '@/lib/site';

export const metadata: Metadata = { title: 'Favourites', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
}

/**
 * The favourites the account has collected.
 *
 * Every card here is favourited by definition, so every heart is drawn filled —
 * and pressing one removes the restaurant, which is the only thing a heart can
 * usefully mean on this screen. The card and its action are the same ones the
 * home feed uses; `toggleFavorite` revalidates this route, so the row leaves the
 * list on the press rather than on the next visit.
 *
 * The list is shared between the two clients, so what somebody favourited on
 * their phone is what this page shows, and vice versa.
 */
export default async function FavoritesPage({ params }: Props) {
  const { lang } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, favoritesPath(language)));
  }

  let favorites: { items: FavoriteRestaurant[] };
  try {
    favorites = await api.favorites(session.accessToken, language);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, favoritesPath(language)));
    }
    throw error;
  }

  if (favorites.items.length === 0) {
    return (
      <div className="empty-state">
        <div className="glyph" aria-hidden="true">
          ❤️
        </div>
        <h1>{label('noFavorites')}</h1>
        <p>{label('noFavoritesHint')}</p>
        <Link className="cta-action" href={homePath(language)}>
          {label('browseRestaurants')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="section-head">
        <h1>{label('favoritesTitle')}</h1>
        <span className="count">{favorites.items.length}</span>
      </div>

      <div className="grid">
        {favorites.items.map((favorite) => (
          <RestaurantCard
            key={favorite.restaurantId}
            restaurant={favorite}
            language={language}
            isFavorite
            returnTo={favoritesPath(language)}
          />
        ))}
      </div>
    </>
  );
}