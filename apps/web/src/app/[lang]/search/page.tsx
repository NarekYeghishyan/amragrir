import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd } from '@/lib/format';
import { favoriteDishIds, favoriteIds } from '@/lib/favorites';
import { restaurantPath, searchPath } from '@/lib/site';
import { RestaurantCard } from '@/components/RestaurantCard';
import { toggleFavoriteDish } from '@/app/[lang]/actions';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string }>;
}

/**
 * Search pages are **not** indexed.
 *
 * They are per-query and near-infinite; letting a crawler enumerate them
 * spends its budget on pages that duplicate listings it already has. `follow`
 * stays on, so the restaurant links here are still discovered.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ?? 'Search', robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const [{ lang }, { q }] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  if (!q || q.trim() === '') {
    const popular = await api.popular();
    return (
      <>
        <h1>{label('search')}</h1>
        <h2>{label('popularNearYou')}</h2>
        <ul className="chips">
          {popular.tags.map((tag) => (
            <li key={tag}>
              <Link className="chip" href={searchPath(language, tag)}>
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  // In parallel: the hearts do not depend on the results, and a searcher should
  // not wait for one read to finish before the others start. Two sets of hearts,
  // because this page answers with both — restaurants and dishes — and a dish
  // row's heart saves the dish.
  const [results, favorites, savedDishes] = await Promise.all([
    api.search(q, language),
    favoriteIds(language),
    favoriteDishIds(language),
  ]);
  const empty = results.restaurants.length === 0 && results.dishes.length === 0;

  // A heart pressed here comes back to the same query.
  const returnTo = searchPath(language, q);

  return (
    <>
      <h1>{q}</h1>

      {empty && <p className="lede">{label('noResults')}</p>}

      {results.restaurants.length > 0 && (
        <>
          <h2>{label('restaurants')}</h2>
          <div className="grid">
            {results.restaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                language={language}
                isFavorite={favorites.has(restaurant.id)}
                returnTo={returnTo}
                // Search results carry no `dishes`, so the card keeps its branch
                // heart — the strip only appears under a category filter, which
                // this page has none of.
              />
            ))}
          </div>
        </>
      )}

      {results.dishes.length > 0 && (
        <>
          <h2>{label('dishes')}</h2>
          {results.dishes.map((dish) => {
            const saved = savedDishes.has(dish.id);
            return (
              // The row and the heart are siblings: a <form> is interactive
              // content and may not live inside an <a>, so the link cannot be the
              // row. Same restructure the cards needed when they grew hearts.
              <div key={dish.id} className="dish-result">
                {/* Links to the restaurant, not the dish: a dish has no page of
                    its own, and landing on the menu at it is what a searcher
                    wants next. */}
                <Link
                  className="dish"
                  href={`${restaurantPath(language, dish.restaurantSlug)}?item=${dish.id}#dish-${dish.id}`}
                >
                  <div>
                    <div className="name">{dish.name}</div>
                    <div className="desc">{dish.restaurantName}</div>
                  </div>
                  <div className="price">{formatAmd(dish.priceAmd)}</div>
                </Link>

                {/* A dish is what this row shows, so its heart saves the dish. */}
                <form className="fav-form in-row" action={toggleFavoriteDish}>
                  <input type="hidden" name="lang" value={language} />
                  <input type="hidden" name="menuItemId" value={dish.id} />
                  <input type="hidden" name="favorited" value={saved ? '1' : '0'} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className={saved ? 'fav on' : 'fav'}
                    aria-label={`${label(saved ? 'removeFavoriteDish' : 'addFavoriteDish')} — ${dish.name}, ${dish.restaurantName}`}
                  >
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                      <path
                        d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                        fill={saved ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </form>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

/** Results depend on the query string, so there is nothing worth caching. */
export const dynamic = 'force-dynamic';
