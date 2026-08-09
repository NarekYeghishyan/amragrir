import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OrderStatus, PickupOption, ServiceMode } from '@amragrir/shared';
import { api, ApiError } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd, formatTime } from '@/lib/format';
import { readSession } from '@/lib/session';
import { ORDER_STATUS_LABEL, TRACKER_STEPS, canCancel, isLive } from '@/lib/order-status';
import { Countdown } from '@/components/Countdown';
import { OrderLive } from '@/components/OrderLive';
import { OrderSteps } from '@/components/OrderSteps';
import { PickupQr } from '@/components/PickupQr';
import {
  ORDER_ROBOTS,
  homePath,
  orderPath,
  orderStatusApiPath,
  ordersPath,
  sessionPath,
  signinPath,
} from '@/lib/site';
import { cancelOrder } from '../../actions';

export const metadata: Metadata = { title: 'Order', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Order tracking — and the confirmation.
 *
 * The artifact draws confirmation as a toast over the page it was placed from.
 * It is a route here instead, because what it carries is the pickup code: that
 * has to survive a reload, be reachable again from the orders list, and still
 * be there when somebody reaches the counter twenty minutes later. A toast is
 * the one shape that cannot do any of those.
 */
export default async function OrderPage({ params, searchParams }: Props) {
  const [{ lang, id }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  // Sign in rather than mint: an order belongs to a verified account, and
  // bouncing a cookieless client through `/session` would loop. See
  // `orders/page.tsx` for the full reasoning.
  const session = await readSession();
  if (!session) {
    redirect(signinPath(language, orderPath(language, id)));
  }

  let order;
  try {
    order = await api.order(id, session.accessToken, language);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, orderPath(language, id)));
    }
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const cancelled = order.status === OrderStatus.Cancelled;
  const live = isLive(order.status);

  return (
    <div className="tracking">
      {/* Renders no markup — it watches the order and hands what it hears to the
          steps and the countdown, which repaint in place. It only asks while
          something can still move; a finished order has nothing left to watch
          for. */}
      <OrderLive
        endpoint={orderStatusApiPath(language, order.id)}
        status={order.status}
        secondsLeft={order.secondsLeft}
        readyAt={order.readyAt}
      >
        <div className={cancelled ? 'confirm-mark cancelled' : 'confirm-mark'} aria-hidden="true">
          {cancelled ? '✕' : '✓'}
        </div>

        <h1>{cancelled ? label('statusCancelled') : label('orderConfirmed')}</h1>
        <p className="lede">
          {order.restaurantName} · {label('orderNumber')} {order.code}
        </p>

        {sp.error === 'cancel' && <p className="notice warn">{label('cancelOnlyUnpaid')}</p>}

        {!cancelled && (
          <>
            {/* A pre-order counts down to a promise, not from a timer that has
                not started: "for 13:00", not "ready in 4,320 minutes". */}
            <div className="timer">
              {order.scheduled || order.secondsLeft === null ? (
                <span className="value">
                  {order.readyAt ? formatTime(order.readyAt) : label('asSoonAsPossible')}
                </span>
              ) : (
                <>
                  {/* Ticks every second between answers, and re-syncs from each
                      one. The server still owns the number — see `Countdown`. */}
                  <Countdown seconds={order.secondsLeft} />
                  <span className="sub">
                    {label('readyIn')}
                    {order.readyAt ? ` · ${label('arrivesAt')} ${formatTime(order.readyAt)}` : ''}
                  </span>
                </>
              )}
            </div>

            {/* The line the back office moves. Translated here, because naming a
                status is the server's job in the language the page is being
                read in. */}
            <OrderSteps
              status={order.status}
              labels={TRACKER_STEPS.map((step) => label(ORDER_STATUS_LABEL[step]))}
            />

            <div className="code-card">
              <div className="code-label">
                {order.serviceMode === ServiceMode.DineIn && order.tableNo
                  ? `${label('atTable')} ${order.tableNo}`
                  : label('pickupCode')}
              </div>
              <div className="code-value">{order.pickupCode}</div>
              {/* Scannable as well as readable. The code is what closes the
                  order now, so the counter types it rather than hearing it —
                  and a scanner pointed at this is one gesture instead of six
                  digits read off somebody else's screen. */}
              <PickupQr code={order.pickupCode} label={label('pickupQrLabel')} />
              {/* Said back on the screen the guest holds at the counter, so
                  "I asked to eat in" is something they can point at rather than
                  remember. Only for the ending that is not the default — every
                  pickup order is take-away unless somebody chose otherwise, and
                  labelling all of them would be noise on most. */}
              <p>
                {order.pickupOption === PickupOption.EatIn
                  ? label('pickupEatIn')
                  : label('showAtCounter')}
              </p>
            </div>
          </>
        )}

        <dl className="summary">
          {order.items.map((item) => (
            <div key={item.menuItemId}>
              <dt>
                {item.qty} × {item.name}
              </dt>
              <dd>{formatAmd(item.lineTotalAmd)}</dd>
            </div>
          ))}
          <div className="grand">
            <dt>{label('total')}</dt>
            <dd>{formatAmd(order.totalAmd)}</dd>
          </div>
        </dl>

        {canCancel(order.status) && (
          <form action={cancelOrder}>
            <input type="hidden" name="lang" value={language} />
            <input type="hidden" name="orderId" value={order.id} />
            <button className="ghost-action" type="submit">
              {label('cancelOrder')}
            </button>
          </form>
        )}

        <div className="tracking-actions">
          {/* A plain link, so the page reloads from the server — this is the
              manual refresh for anyone without JavaScript, and the way back to
              a page whose watcher has given up. */}
          {live && (
            <a className="ghost-action" href={orderPath(language, order.id)}>
              {label('refreshStatus')}
            </a>
          )}
          <Link className="ghost-action" href={ordersPath(language)}>
            {label('myOrders')}
          </Link>
          <Link className="cta-action" href={homePath(language)}>
            {label('done')}
          </Link>
        </div>
      </OrderLive>
    </div>
  );
}
