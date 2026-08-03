import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api, ApiError, type Order } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd, formatTime } from '@/lib/format';
import { readSession } from '@/lib/session';
import { ORDER_STATUS_LABEL } from '@/lib/order-status';
import { ORDER_ROBOTS, homePath, orderPath, ordersPath, sessionPath, signinPath } from '@/lib/site';

export const metadata: Metadata = { title: 'My orders', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
}

export default async function OrdersPage({ params }: Props) {
  const { lang } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  // Orders belong to a verified account, so someone with no session at all is
  // sent to sign in rather than through `/session`. Minting a guest here would
  // buy nothing — a guest has no orders — and `/signin` is a page that ends the
  // journey instead of bouncing. A client that keeps no cookies (a crawler, a
  // browser with them disabled) would otherwise ping-pong between this page and
  // `/session` forever, minting a guest account on every lap.
  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, ordersPath(language)));
  }

  let active: { items: Order[] };
  let past: { items: Order[] };
  try {
    [active, past] = await Promise.all([
      api.orders('active', session.accessToken, language),
      api.orders('past', session.accessToken, language),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, ordersPath(language)));
    }
    throw error;
  }

  return (
    <>
      <h1>{label('myOrders')}</h1>

      <h2 className="section-label">{label('activeOrders')}</h2>
      {active.items.length === 0 ? (
        <p className="notice">{label('noActiveOrders')}</p>
      ) : (
        <ul className="order-list">
          {active.items.map((order) => (
            <OrderRow key={order.id} order={order} language={language} />
          ))}
        </ul>
      )}

      <h2 className="section-label">{label('pastOrders')}</h2>
      {past.items.length === 0 ? (
        <p className="notice">{label('noPastOrders')}</p>
      ) : (
        <ul className="order-list">
          {past.items.map((order) => (
            <OrderRow key={order.id} order={order} language={language} />
          ))}
        </ul>
      )}

      <Link className="ghost-action" href={homePath(language)}>
        {label('browseRestaurants')}
      </Link>
    </>
  );
}

function OrderRow({ order, language }: { order: Order; language: string }) {
  const label = t(language as Parameters<typeof t>[0]);
  return (
    <li>
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
  );
}
