import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Language, RestaurantService } from '@amragrir/shared';
import { api } from '@/lib/api';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { formatAmd, formatPriceLevel, formatRating } from '@/lib/format';
import { MENU_TAB_LABEL, TAB_ORDER, groupByTab, restaurantJsonLd } from '@/lib/jsonld';
import {
  SITE_URL,
  basketApiPath,
  cartPath,
  homePath,
  hreflangFor,
  restaurantPath,
  savedApiPath,
} from '@/lib/site';
import { OrderPanel } from '@/components/OrderPanel';
import { AddDish } from '@/components/AddDish';
import { FavoriteButton } from '@/components/FavoriteButton';

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
  // A tab with nothing under it is a pill that empties the page when pressed.
  const shownTabs = TAB_ORDER.filter((tab) => grouped[tab]?.length);

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

        {/* Drawn in the browser, like the order panel below and for the same
            reason — see the component for what this page would give up if it
            filled the heart itself. */}
        <FavoriteButton
          restaurantId={restaurant.restaurantId}
          language={language}
          returnTo={restaurantPath(language, restaurant.slug)}
          endpoint={savedApiPath(language, restaurant.restaurantId)}
          name={restaurant.name}
          labels={{ add: label('addFavorite'), remove: label('removeFavorite') }}
          className="on-banner"
        />
      </div>

      {/* The artifact's `1fr 380px`: everything about the restaurant on the
          left, the order panel sticky on the right. */}
      <div className="rest-grid">
        <div>
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

          {/* The design's menu tabs, which **filter** the list — one category on
              the screen at a time, the selected pill dark.

              They filter in CSS: a radio per tab, and `:has(:checked)` in
              `globals.css` picking the section to show. They used to be anchors
              into a page that drew every section at once, on the reasoning that
              a tab hiding three quarters of the menu would defeat the one thing
              this page is for — the whole menu in the HTML a crawler receives.
              The premise was right and the conclusion was not: every section is
              still in the markup here, unconditionally. Only which one is
              *painted* depends on the radio, and that costs a crawler nothing
              and a reader without JavaScript nothing either. */}
          <div className="menu">
            <div className="menu-tabs" role="radiogroup" aria-label={label('menu')}>
              {shownTabs.map((tab, index) => (
                <label className="menu-tab" key={tab}>
                  {/* No `name` collision with the dish forms below: these sit
                      outside every one of them, so nothing here is posted. */}
                  <input
                    type="radio"
                    name="menu-tab"
                    value={tab}
                    defaultChecked={index === 0}
                  />
                  {label(MENU_TAB_LABEL[tab])}
                </label>
              ))}
            </div>

            {shownTabs.map((tab) => {
              const items = grouped[tab]!;
              return (
                <section key={tab} className="menu-section" data-tab={tab}>
                  {/* The tab above says this word already, so the heading is not
                      drawn — but it stays, because a flat run of dish cards with
                      no headings at all is a menu with no structure for a crawler
                      or a screen reader to read. `globals.css` hides it, and only
                      where the filtering it belongs to actually works. */}
                  <h3 id={tab}>{label(MENU_TAB_LABEL[tab])}</h3>
                  <div className="dishes">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={item.isAvailable ? 'dish' : 'dish unavailable'}
                      >
                        <div className={item.photoUrl ? 'media' : 'media ph'}>
                          {item.photoUrl && <img src={item.photoUrl} alt="" loading="lazy" />}
                        </div>
                        <div className="text">
                          <div className="name">{item.name}</div>
                          {item.desc && <div className="desc">{item.desc}</div>}
                          <div className="facts">
                            {[
                              item.caloriesKcal === null
                                ? null
                                : `${item.caloriesKcal} ${label('kcal')}`,
                              item.prepMin === null ? null : `${item.prepMin} ${label('minutes')}`,
                              item.isAvailable ? null : label('soldOut'),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                          {/* Price and `＋` on one row at the foot of the card, as
                              the artifact draws them — the button belongs to the
                              price it acts on, not to the card's right edge. */}
                          <div className="dish-foot">
                            <div className="price">{formatAmd(item.priceAmd)}</div>

                            {/* The design's per-dish `＋`. Still a form posting a
                                Server Action, so adding to the basket works with
                                JavaScript off — and it still reads no cookies,
                                which is what lets this page stay pre-rendered.
                                See the component for what it does instead of
                                redirecting when there is a browser to do it in. */}
                            {item.isAvailable && (
                              <AddDish
                                language={language}
                                branchId={restaurant.branch.id}
                                slug={restaurant.slug}
                                menuItemId={item.id}
                                returnTo={restaurantPath(language, restaurant.slug)}
                                label={label('addToBasket')}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Drawn in the browser — see the component for why this page may not
            read the basket itself, and what that buys. */}
        <OrderPanel
          language={language}
          branchId={restaurant.branch.id}
          endpoint={basketApiPath(language)}
          returnTo={restaurantPath(language, restaurant.slug)}
          basketHref={cartPath(language)}
          slug={restaurant.slug}
          canBook={
            restaurant.reservationsEnabled &&
            restaurant.services.includes(RestaurantService.Reserve)
          }
          labels={{
            yourOrder: label('yourOrder'),
            bookTable: label('bookTable'),
            subtotal: label('subtotal'),
            serviceFee: label('serviceFee'),
            total: label('total'),
            checkout: label('checkout'),
            empty: label('emptyPanelHint'),
            elsewhere: label('basketOtherRestaurant'),
            viewBasket: label('viewBasket'),
            closed: label('branchClosed'),
            increase: label('increase'),
            decrease: label('decrease'),
          }}
        />
      </div>
    </>
  );
}

