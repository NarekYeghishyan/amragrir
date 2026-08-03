import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Language } from '@amragrir/shared';
import { api } from '@/lib/api';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { formatAmd, formatPriceLevel, formatRating, telHref } from '@/lib/format';
import { MENU_TAB_LABEL, TAB_ORDER, groupByTab, restaurantJsonLd } from '@/lib/jsonld';
import { SITE_URL, cartPath, homePath, hreflangFor, restaurantPath } from '@/lib/site';
import { StickyBasket } from '@/components/StickyBasket';
import { addToBasket } from '../../actions';

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

      <Link className="back" href={homePath(language)}>
        ← {label('backHome')}
      </Link>

      <div className={restaurant.coverUrl ? 'media banner' : 'media banner ph'}>
        {restaurant.coverUrl && <img src={restaurant.coverUrl} alt="" />}
      </div>

      <div className="rest-head">
        <div>
          <h1>{restaurant.name}</h1>
          {(restaurant.cuisine ?? restaurant.priceLevel) && (
            <p className="meta">
              {[restaurant.cuisine, formatPriceLevel(restaurant.priceLevel)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="tags">
            {restaurant.branch.prepMin !== null && (
              <span className="tag prep">
                ⏱ {restaurant.branch.prepMin} {label('minutes')}
              </span>
            )}
            {restaurant.branch.address && <span className="tag">📍 {restaurant.branch.address}</span>}
            <span className={restaurant.branch.isOpen ? 'tag good' : 'tag'}>
              {restaurant.branch.isOpen ? label('open') : label('closed')}
            </span>
          </div>
        </div>

        <div className="score">
          <div className="value">
            <span style={{ color: 'var(--star)' }}>★</span> {formatRating(restaurant.rating)}
          </div>
          <div className="reviews">
            {restaurant.reviewsCount} {label('reviews')}
          </div>
        </div>
      </div>

      {/* Ordering used to be the app's job alone, and this block was two lines
          of inert text. It is now the real thing: the `＋` on each dish fills a
          basket and this leads to it. The phone stays beside it — some people
          would rather ask a person, and a closed branch cannot take an order
          but can still answer. */}
      <div className="cta">
        <strong>{label('orderAhead')}</strong>
        <span>{label('orderInAppHint')}</span>
        <Link className="cta-action" href={cartPath(language)}>
          {label('viewBasket')}
        </Link>
        {restaurant.branch.phone && (
          // A plain anchor, not a `Link`: `tel:` leaves the app entirely and
          // the router has nothing to navigate to. Secondary now that ordering
          // works — it is the alternative, no longer the only thing on offer.
          <a className="ghost-action" href={telHref(restaurant.branch.phone)}>
            {label('callRestaurant')}
          </a>
        )}
      </div>

      <h2>{label('menu')}</h2>

      {/* The design's menu tabs *filter* the list. These scroll to it instead:
          this page exists so that the entire menu is in the HTML a crawler
          receives, and a tab that hid three quarters of it would defeat the one
          thing the app is for. Same pill row, and it needs no JavaScript. */}
      <ul className="menu-nav">
        {TAB_ORDER.filter((tab) => grouped[tab]?.length).map((tab) => (
          <li key={tab}>
            <a href={`#${tab}`}>{label(MENU_TAB_LABEL[tab])}</a>
          </li>
        ))}
      </ul>

      {TAB_ORDER.map((tab) => {
        const items = grouped[tab];
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <section key={tab} className="menu-section">
            <h3 id={tab}>{label(MENU_TAB_LABEL[tab])}</h3>
            <div className="dishes">
              {items.map((item) => (
                <div key={item.id} className={item.isAvailable ? 'dish' : 'dish unavailable'}>
                  <div className={item.photoUrl ? 'media' : 'media ph'}>
                    {item.photoUrl && <img src={item.photoUrl} alt="" loading="lazy" />}
                  </div>
                  <div className="text">
                    <div className="name">{item.name}</div>
                    {item.desc && <div className="desc">{item.desc}</div>}
                    <div className="facts">
                      {[
                        item.caloriesKcal === null ? null : `${item.caloriesKcal} ${label('kcal')}`,
                        item.prepMin === null ? null : `${item.prepMin} ${label('minutes')}`,
                        item.isAvailable ? null : label('soldOut'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="price">{formatAmd(item.priceAmd)}</div>
                  </div>

                  {/* The design's per-dish `＋`. A form rather than a button
                      with a handler: it posts to a Server Action, so adding to
                      the basket works with JavaScript off — and it reads no
                      cookies, which is what lets this page stay pre-rendered. */}
                  {item.isAvailable && (
                    <form action={addToBasket}>
                      <input type="hidden" name="lang" value={language} />
                      <input type="hidden" name="branchId" value={restaurant.branch.id} />
                      <input type="hidden" name="slug" value={restaurant.slug} />
                      <input type="hidden" name="menuItemId" value={item.id} />
                      <input
                        type="hidden"
                        name="returnTo"
                        value={restaurantPath(language, restaurant.slug)}
                      />
                      <button className="add" type="submit" aria-label={label('addToBasket')}>
                        ＋
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <StickyBasket href={cartPath(language)} label={label('viewBasket')} />
    </>
  );
}

