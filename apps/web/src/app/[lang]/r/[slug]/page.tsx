import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Language } from '@amragrir/shared';
import { api } from '@/lib/api';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { formatAmd, formatRating } from '@/lib/format';
import { TAB_ORDER, groupByTab, restaurantJsonLd } from '@/lib/jsonld';
import { SITE_URL, hreflangFor, restaurantPath } from '@/lib/site';

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

/**
 * Per-page metadata, from the same data the page renders.
 *
 * Next calls this and the component separately, but both `fetch` the same URL
 * with the same options, so the request is deduplicated — the API is hit once.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    return { robots: { index: false } };
  }

  const restaurant = await api.restaurant(slug, language);
  if (!restaurant) {
    return { title: 'Not found', robots: { index: false } };
  }

  const description = [
    restaurant.cuisine,
    `★ ${formatRating(restaurant.rating)} (${restaurant.reviewsCount})`,
    restaurant.branch.address ?? restaurant.branch.city,
  ]
    .filter(Boolean)
    .join(' · ');

  const path = (code: string) => restaurantPath(code, restaurant.slug);

  return {
    title: restaurant.name,
    description,
    alternates: {
      // Canonical uses the slug even when the visitor arrived by branch id, so
      // the two URLs do not compete as duplicates.
      canonical: `${SITE_URL}${path(language)}`,
      languages: hreflangFor(LANGUAGES, path),
    },
    openGraph: {
      title: restaurant.name,
      description,
      url: `${SITE_URL}${path(language)}`,
      type: 'website',
      images: restaurant.coverUrl ? [restaurant.coverUrl] : undefined,
    },
  };
}

/**
 * Pre-renders every restaurant in every language at build time.
 *
 * These are the pages discovery traffic lands on, so they should be HTML on
 * disk rather than a render per visit. `dynamicParams` stays on (the default),
 * so a restaurant added after the build is still served — rendered on demand
 * and then cached.
 */
export async function generateStaticParams() {
  const slugs = new Set<string>();

  for (let page = 1; ; page += 1) {
    const { items, total } = await api.restaurants(Language.Hy, { page, limit: 50 });
    items.forEach((item) => slugs.add(item.slug));
    if (items.length === 0 || page * 50 >= total) {
      break;
    }
  }

  return LANGUAGES.flatMap((lang) => [...slugs].map((slug) => ({ lang, slug })));
}

export default async function RestaurantPage({ params }: Props) {
  const { lang, slug } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  const restaurant = await api.restaurant(slug, language);
  if (!restaurant) {
    notFound();
  }

  const menu = await api.menu(slug, language);
  const grouped = groupByTab(menu.items);

  return (
    <>
      {/* Structured data, so a search engine can show the rating, price range
          and opening state directly in results. This is the concrete reason
          this app is server-rendered at all. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(restaurantJsonLd(restaurant, menu.items, language)),
        }}
      />

      <h1>{restaurant.name}</h1>
      <p className="lede">
        ★ {formatRating(restaurant.rating)}{' '}
        <span className="faint">
          ({restaurant.reviewsCount} {label('reviews')})
        </span>
        {restaurant.cuisine && ` · ${restaurant.cuisine}`}
        {restaurant.branch.prepMin !== null &&
          ` · ${restaurant.branch.prepMin} ${label('minutes')}`}
      </p>

      <p>
        <span className={restaurant.branch.isOpen ? 'badge open' : 'badge closed'}>
          {restaurant.branch.isOpen ? label('open') : label('closed')}
        </span>
      </p>

      {(restaurant.branch.address ?? restaurant.branch.phone) && (
        <p className="muted">
          {restaurant.branch.address}
          {restaurant.branch.phone && (
            <>
              {' · '}
              <a href={`tel:${restaurant.branch.phone}`}>{restaurant.branch.phone}</a>
            </>
          )}
        </p>
      )}

      <div className="cta">
        <strong>{label('orderInApp')}</strong>
        <span>{label('orderInAppHint')}</span>
      </div>

      <h2>{label('menu')}</h2>
      {TAB_ORDER.map((tab) => {
        const items = grouped[tab];
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <section key={tab}>
            <h3 style={{ fontSize: 16, margin: '20px 0 4px' }}>{tab}</h3>
            {items.map((item) => (
              <div key={item.id} className={item.isAvailable ? 'dish' : 'dish unavailable'}>
                <div>
                  <div className="name">{item.name}</div>
                  {item.desc && <div className="desc">{item.desc}</div>}
                  {!item.isAvailable && <div className="faint">{label('soldOut')}</div>}
                </div>
                <div className="price">{formatAmd(item.priceAmd)}</div>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

