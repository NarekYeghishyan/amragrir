import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd } from '@/lib/format';
import { restaurantPath, searchPath } from '@/lib/site';
import { RestaurantCard } from '@/components/RestaurantCard';

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

  const results = await api.search(q, language);
  const empty = results.restaurants.length === 0 && results.dishes.length === 0;

  return (
    <>
      <h1>{q}</h1>

      {empty && <p className="lede">{label('noResults')}</p>}

      {results.restaurants.length > 0 && (
        <>
          <h2>{label('restaurants')}</h2>
          <div className="grid">
            {results.restaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} language={language} />
            ))}
          </div>
        </>
      )}

      {results.dishes.length > 0 && (
        <>
          <h2>{label('dishes')}</h2>
          {results.dishes.map((dish) => (
            // Links to the restaurant, not the dish: a dish has no page of its
            // own, and landing on the menu is what a searcher wants next.
            <Link key={dish.id} className="dish" href={restaurantPath(language, dish.restaurantSlug)}>
              <div>
                <div className="name">{dish.name}</div>
                <div className="desc">{dish.restaurantName}</div>
              </div>
              <div className="price">{formatAmd(dish.priceAmd)}</div>
            </Link>
          ))}
        </>
      )}
    </>
  );
}

/** Results depend on the query string, so there is nothing worth caching. */
export const dynamic = 'force-dynamic';
