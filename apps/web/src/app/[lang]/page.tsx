import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { SITE_URL, homePath, hreflangFor } from '@/lib/site';
import { LOCATION_COOKIE, parsePlace, placeQuery } from '@/lib/locations';
import {
  categoryHref,
  forOrigin,
  homeHref,
  parseFilters,
  toApiQuery,
  hasAnyFilter,
} from '@/lib/filters';
import { favoriteDishIds, favoriteIds } from '@/lib/favorites';
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

  // Where the visitor said they are, from the header's picker. Reading a cookie
  // here costs nothing this page had not already spent: it takes a query string,
  // so it renders per request either way. It would cost the whole catalogue if
  // it were read in the layout, which is why the header control reads it in the
  // browser instead (see `lib/locations.ts`).
  const place = parsePlace((await cookies()).get(LOCATION_COOKIE)?.value);
  const filters = forOrigin(parseFilters(sp), place !== null);

  // In parallel: four independent reads should not cost four round trips.
  // The favourites go in here rather than beside the cards for that reason —
  // they are what fills in the hearts, and for a visitor who is not signed in
  // both calls are skipped entirely and the sets come back empty.
  //
  // Two of them, because a heart on this page has two possible subjects: the
  // address, and — where a category filter has the cards wearing the dishes that
  // matched it — the dish on the plate.
  const [restaurants, categories, favorites, savedDishes] = await Promise.all([
    // One row per restaurant, not one per branch. A row from `/restaurants` is
    // normally a branch, which is right for the app — it sends coordinates and
    // shows how far each one is. This app has no coordinates and one page per
    // restaurant, so ungrouped it drew a five-branch chain as five identical
    // cards that all linked to the same page, and counted branches in the
    // heading. Grouping also picks the branch that page resolves to, so a card
    // reading "open · 12 min" agrees with what opens behind it.
    // Coordinates go with it when there are any: they are what makes each card
    // able to say how far away it is, and what `sort=nearest` sorts by.
    api.restaurants(language, {
      limit: 24,
      groupByRestaurant: 1,
      ...placeQuery(place),
      ...toApiQuery(filters),
    }),
    api.categories(language),
    favoriteIds(language),
    // Every branch's saved dishes, not one branch's: this page draws two dozen
    // cards and the ones under a filter each carry up to a few plates.
    favoriteDishIds(language),
  ]);

  // Where a heart returns to: this listing with its filters still on.
  const returnTo = homeHref(filters, language);

  return (
    <>
      <Hero language={language} />

      {categories.items.length > 0 && (
        // A horizontally scrolling rail, as in the design. It is a real list of
        // real links: `Link` renders an <a href> into the HTML, so a crawler
        // follows it exactly as before and a visitor gets client navigation.
        <ul className="cats" aria-label={label('browseByCuisine')}>
          {categories.items.map((category) => {
            const lit = filters.category === category.key;
            return (
              <li key={category.id}>
                {/* The rail **filters this listing** rather than running a
                    search for the category's name (2026-08-16). That is what
                    the design draws and what the app has always done; the site
                    was the one out of step, and a search for "Суши" answered a
                    different question — it matched restaurant names and cuisine
                    text, not the dishes those kitchens actually cook.

                    Pressing the lit one clears it, like every chip below. */}
                <Link
                  className={lit ? 'cat on' : 'cat'}
                  href={categoryHref(filters, category.key, language)}
                  aria-current={lit ? 'true' : undefined}
                >
                  <span className="emoji" aria-hidden="true">
                    {category.icon}
                  </span>
                  <span className="name">{category.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <FilterChips state={filters} language={language} hasOrigin={place !== null} />

      {/* The hero CTA anchors here. */}
      <div className="section-head">
        <h2 id="restaurants">{label('nearbyRestaurants')}</h2>
        <span className="count">
          {restaurants.total} {label('restaurants').toLowerCase()}
        </span>
      </div>

      {restaurants.items.length === 0 ? (
        <p className="lede">{label('noResults')}</p>
      ) : (
        <div className="grid">
          {restaurants.items.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              language={language}
              isFavorite={favorites.has(restaurant.id)}
              // Narrowed to this card's own plates, which is all its slider can
              // draw a heart for.
              savedDishes={(restaurant.dishes ?? [])
                .filter((dish) => savedDishes.has(dish.id))
                .map((dish) => dish.id)}
              returnTo={returnTo}
            />
          ))}
        </div>
      )}
    </>
  );
}
