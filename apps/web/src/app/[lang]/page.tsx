import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { SITE_URL, homePath, hreflangFor, searchPath } from '@/lib/site';
import { parseFilters, toApiQuery, hasAnyFilter } from '@/lib/filters';
import { RestaurantCard } from '@/components/RestaurantCard';
import { FilterChips } from '@/components/FilterChips';
import { Hero } from '@/components/Hero';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    return { robots: { index: false } };
  }

  // A filtered view is one of near-infinite query permutations that duplicate
  // the listing — the same reasoning that makes /search noindex. The canonical
  // always points at the bare home path, so any link equity consolidates there.
  const filtered = hasAnyFilter(parseFilters(sp));

  return {
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: `${SITE_URL}${homePath(language)}`,
      languages: hreflangFor(LANGUAGES, homePath),
    },
  };
}

export default async function HomePage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);
  const filters = parseFilters(sp);

  // In parallel: two independent reads should not cost two round trips.
  const [restaurants, categories] = await Promise.all([
    api.restaurants(language, { limit: 24, ...toApiQuery(filters) }),
    api.categories(language),
  ]);

  return (
    <>
      <Hero language={language} />

      {categories.items.length > 0 && (
        <>
          <h2>{label('browseByCuisine')}</h2>
          <ul className="chips">
            {categories.items.map((category) => (
              <li key={category.id}>
                {/* `Link` renders a real <a href> into the HTML, so a crawler
                    follows it exactly as before — and a visitor gets client
                    navigation instead of a full reload. */}
                <Link className="chip" href={searchPath(language, category.name)}>
                  {category.icon} {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The hero CTA anchors here. */}
      <h2 id="restaurants">
        {label('nearbyRestaurants')} <span className="faint">({restaurants.total})</span>
      </h2>

      <FilterChips state={filters} language={language} />

      {restaurants.items.length === 0 ? (
        <p className="lede">{label('noResults')}</p>
      ) : (
        <div className="grid">
          {restaurants.items.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} language={language} />
          ))}
        </div>
      )}
    </>
  );
}
