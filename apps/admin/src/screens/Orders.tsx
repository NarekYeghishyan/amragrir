import { useCallback, useEffect, useRef, useState } from 'react';
import { ORDER_STATUS_FLOW, OrderStatus, TERMINAL_ORDER_STATUSES } from '@amragrir/shared';
import { ApiError, api, type OwnerOrder } from '../api';
import { watchOrders } from '../order-stream';
import { formatAmd, formatCountdown, formatStatus, formatWaiting } from '../format';

/**
 * Statuses the panel may set, in the order a kitchen moves through them.
 *
 * Derived from the shared state machine rather than listed here: the buttons
 * shown for an order are exactly the moves the API would accept, so the panel
 * cannot offer one that 422s. `paid` is excluded because only a payment makes
 * an order paid.
 */
function nextStatuses(status: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_FLOW[status].filter((next) => next !== OrderStatus.Paid);
}

export function Orders() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const stream = useRef<ReturnType<typeof watchOrders> | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await api.orders('active');
      setOrders(page.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load orders');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One socket for the whole board. New orders still arrive by polling — the
  // stream carries changes to orders it already knows about, not creations.
  useEffect(() => {
    stream.current = watchOrders(
      [],
      (update) =>
        setOrders((current) =>
          current
            .map((order) =>
              order.id === update.orderId
                ? { ...order, status: update.status, secondsLeft: update.secondsLeft }
                : order,
            )
            // An order that reached a terminal status leaves the board.
            .filter((order) => !TERMINAL_ORDER_STATUSES.includes(order.status)),
        ),
      setLive,
    );
    const poll = window.setInterval(() => void load(), 20_000);

    return () => {
      stream.current?.close();
      window.clearInterval(poll);
    };
  }, [load]);

  useEffect(() => {
    stream.current?.setOrders(orders.map((order) => order.id));
  }, [orders]);

  const advance = async (order: OwnerOrder, status: OrderStatus): Promise<void> => {
    setBusyId(order.id);
    try {
      await api.setOrderStatus(order.id, status);
      // The board updates from the broadcast this triggers, so nothing is set
      // optimistically here — what is shown is what the server recorded.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the order');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <span className="muted">
          {orders.length} active {orders.length === 1 ? 'order' : 'orders'}
        </span>
        <span className={live ? 'live' : 'offline'}>{live ? '● live' : '○ reconnecting…'}</span>
      </div>

      {error !== null && <p className="error">{error}</p>}

      {orders.length === 0 ? (
        <p className="faint">Nothing in the queue.</p>
      ) : (
        <div className="grid">
          {orders.map((order) => {
            const countdown = formatCountdown(order.secondsLeft);
            return (
              <article key={order.id} className="card">
                <div className="row spread">
                  <span className="pickup">{order.pickupCode}</span>
                  <span className="badge">{formatStatus(order.status)}</span>
                </div>

                <p className="muted">
                  {order.code} · {order.branch.name ?? 'Branch'} ·{' '}
                  {formatWaiting(order.createdAt)}
                  {countdown !== null && ` · ready in ${countdown}`}
                </p>

                <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                  {order.items.map((item) => (
                    <li key={item.name}>
                      {item.qty} × {item.name}
                    </li>
                  ))}
                </ul>

                {order.notes !== null && <p className="muted">Note: {order.notes}</p>}

                <div className="row spread">
                  <span className="strong">{formatAmd(order.totalAmd)}</span>
                  <span className="faint">
                    {order.paymentStatus === null ? 'unpaid' : order.paymentStatus}
                  </span>
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  {nextStatuses(order.status).map((next) => (
                    <button
                      key={next}
                      className={next === OrderStatus.Cancelled ? 'small' : 'primary small'}
                      disabled={busyId === order.id}
                      onClick={() => void advance(order, next)}
                    >
                      {formatStatus(next)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
