import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  api,
  ApiError,
  type FavoriteBranch,
  type MeProfile,
  type OrderSummary,
} from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd, formatDay, formatTime } from '@/lib/format';
import { readSession } from '@/lib/session';
import { ORDER_STATUS_LABEL } from '@/lib/order-status';
import {
  ORDER_ROBOTS,
  favoritesPath,
  orderPath,
  ordersPath,
  profilePath,
  sessionPath,
  signinPath,
} from '@/lib/site';
import { reorder, signOut } from '../actions';

export const metadata: Metadata = { title: 'Profile', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The account, from the design's profile screen.
 *
 * Three of its rows are not built and are not placeholders either: saved
 * addresses (there are no couriers — `AI_CONTEXT.md`), stored payment methods
 * (the API lists what the platform accepts, not cards somebody has saved) and a
 * help centre (no content exists to link to). `docs/design/README.md` carries
 * the reasoning; drawing them dead would promise three things the product does
 * not do.
 */
export default async function ProfilePage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  // An account page needs an account: a guest has no history, no points and no
  // favourites, so minting one here would produce an empty screen behind a
  // pointless redirect. Same reasoning as `/orders`.
  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, profilePath(language)));
  }

  let me: MeProfile;
  let active: { items: OrderSummary[] };
  let past: { items: OrderSummary[] };
  let favorites: { items: FavoriteBranch[] };
  let savedDishes: { ids: string[] };
  try {
    [me, active, past, favorites, savedDishes] = await Promise.all([
      api.me(session.accessToken, language),
      api.orders('active', session.accessToken, language),
      api.orders('past', session.accessToken, language),
      api.favorites(session.accessToken, language),
      // Ids, not the dishes: this page counts them and never draws one.
      api.favoriteDishIds(session.accessToken, language),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, profilePath(language)));
    }
    throw error;
  }

  // Both kinds, because "Favourites" is now both: the screen this number leads to
  // holds the saved addresses under one tab and the saved dishes under the other,
  // and a count of half of it would send somebody looking for the rest.
  const savedCount = favorites.items.length + savedDishes.ids.length;

  const stats = [
    { value: me.ordersCount, label: label('ordersCount') },
    { value: me.rewardPoints, label: label('rewardPoints') },
    { value: savedCount, label: label('favoritesTitle') },
  ];

  return (
    <>
      <section className="profile-hero rise">
        <span className="avatar" aria-hidden="true">
          {initialOf(me)}
        </span>
        <div className="who">
          <span className="kicker">{label('navProfile')}</span>
          {/* Somebody who has not given a name is identified by the number they
              verified — the one thing every account here has. */}
          <h1>{me.name ?? me.phone ?? label('navProfile')}</h1>
          {me.name !== null && me.phone !== null && <span className="phone">{me.phone}</span>}
        </div>
        <ul className="profile-stats">
          {stats.map((stat) => (
            <li key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {sp.error === 'reorder' && <p className="notice warn">{label('reorderFailed')}</p>}

      <div className="profile-grid">
        <section>
          {/* Food that is still coming outranks food already eaten, so an order
              in flight sits above the history. Nothing is drawn when there is
              none: an empty "no active orders" row on a summary screen would
              push the history down to say nothing — `/orders` is the page that
              owes both states a heading. Every active order is listed rather
              than the first few, because one waiting at a counter is exactly
              the one that must not be hidden behind a link. */}
          {active.items.length > 0 && (
            <>
              <div className="section-head">
                <h2>{label('activeOrders')}</h2>
              </div>
              <ul className="order-list">
                {active.items.map((order) => (
                  <li key={order.id}>
                    <Link className="order-row" href={orderPath(language, order.id)}>
                      <span className="who">
                        <span className="name">{order.restaurantName}</span>
                        <span className="meta">
                          {label('orderNumber')} {order.code}
                          {order.readyAt ? ` · ${formatTime(order.readyAt)}` : ''}
                        </span>
                      </span>
                      <span className="status">{label(ORDER_STATUS_LABEL[order.status])}</span>
                      <span className="amount">{formatAmd(order.totalAmd)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="section-head">
            <h2>{label('profileOrderHistory')}</h2>
            <Link className="count" href={ordersPath(language)}>
              {label('seeAll')}
            </Link>
          </div>

          {past.items.length === 0 ? (
            <p className="notice">{label('noPastOrders')}</p>
          ) : (
            <ul className="history">
              {past.items.slice(0, 5).map((order) => (
                <li key={order.id}>
                  <div className="top">
                    <Link className="who" href={orderPath(language, order.id)}>
                      <span className="name">{order.restaurantName}</span>
                      <span className="meta">
                        {order.itemsCount} {label('itemOther')} · {formatDay(order.date, language)}
                      </span>
                    </Link>
                    <span className="status">{label(ORDER_STATUS_LABEL[order.status])}</span>
                  </div>
                  <div className="bottom">
                    <span className="amount">{formatAmd(order.totalAmd)}</span>
                    {/* A form, not a link: it writes the basket. Works with
                        JavaScript off like every other write in this app. */}
                    <form action={reorder}>
                      <input type="hidden" name="lang" value={language} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <button type="submit" className="reorder">
                        ↻ {label('reorder')}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>{label('profileAccount')}</h2>
          <ul className="account-menu">
            <li>
              <Link href={ordersPath(language)}>
                <span className="icon" aria-hidden="true">
                  🧾
                </span>
                <span className="text">{label('myOrders')}</span>
                <span className="value">{me.ordersCount}</span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
            <li>
              <Link href={favoritesPath(language)}>
                <span className="icon" aria-hidden="true">
                  ❤️
                </span>
                <span className="text">{label('profileFavorites')}</span>
                <span className="value">{savedCount}</span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          </ul>

          <form action={signOut}>
            <input type="hidden" name="lang" value={language} />
            <button type="submit" className="ghost-action danger">
              {label('setLogout')}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

/** The letter in the avatar disc: the account's own initial where there is a
 *  name, and the brand's otherwise — never an empty circle. */
function initialOf(me: MeProfile): string {
  const source = me.name?.trim() || me.phone?.replace(/\D/g, '') || 'A';
  return source.slice(0, 1).toUpperCase();
}