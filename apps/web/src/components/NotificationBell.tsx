'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrderStatus, ReservationStatus } from '@amragrir/shared';
import type { Bell, NotificationItem } from '@/lib/notifications';
import {
  BELL_POLL_MS,
  sameBell,
  stopWatchingOn,
  toBell,
  toItem,
  withoutItem,
} from '@/lib/notification-watch';
import { alertState, raiseAlert, requestAlerts, type AlertState } from '@/lib/browser-alerts';

/** The eight status sentences, resolved on the server so the three dictionaries
 *  stay out of the browser bundle — the same trade `BasketButton` makes with its
 *  `label` prop. */
export type StatusCopy = Readonly<Record<OrderStatus, { title: string; body: string }>>;

/**
 * The booking sentences, resolved the same way.
 *
 * Partial rather than total, because only three booking statuses are ever
 * announced — see `RESERVATION_NOTIFICATION_COPY`, which decides that and hands
 * this map only what it says out loud.
 *
 * **A separate map from `StatusCopy` and not one merged by status**, because
 * `confirmed` is a status both kinds have and they mean different things by it:
 * a kitchen accepting an order, and a restaurant accepting a table. Keyed by
 * status alone, one would quietly draw the other's words.
 */
export type ReservationCopy = Readonly<
  Partial<Record<ReservationStatus, { title: string; body: string }>>
>;

/**
 * The words for one row, or undefined where this build cannot draw it.
 *
 * Keyed by `type` first and status second, because the two kinds share status
 * names and mean different things by them.
 */
function drawnBy(
  item: NotificationItem,
  statusCopy: StatusCopy,
  reservationCopy: ReservationCopy,
  reminderCopy: { title: string; body: string },
): { title: string; body: string } | undefined {
  // Before the status lookup, because a reminder does not move a booking: it is
  // `confirmed` before and after, and drawing it by status would say "Your
  // table is booked" to somebody who booked it three weeks ago.
  if (item.type === 'reservation' && item.payload?.reminder) {
    return reminderCopy;
  }

  const status = item.payload?.status;
  if (!status) {
    return undefined;
  }
  return item.type === 'reservation'
    ? reservationCopy[status as ReservationStatus]
    : statusCopy[status as OrderStatus];
}

/** Where a row leads: the thing it is about, or the list it lives on. */
function linkFor(item: NotificationItem, ordersBase: string, reservationsBase: string): string {
  if (item.type === 'reservation') {
    const id = item.payload?.reservationId;
    return id ? `${reservationsBase}/${id}` : reservationsBase;
  }
  return item.payload?.orderId ? `${ordersBase}/${item.payload.orderId}` : ordersBase;
}

/**
 * The header bell.
 *
 * The kitchen moves an order from the back office and the customer is told —
 * wherever they happen to be on the site, which is the whole reason this exists
 * beside the tracking page. That page only reports the order it is showing, and
 * somebody browsing for their next meal was hearing nothing.
 *
 * **It is pushed, not polled.** The browser cannot hold the order socket itself
 * (the gateway authenticates in its first message and the session is an
 * httpOnly cookie), so `notifications/stream` holds it server-side and streams
 * it down as SSE. `EventSource` also reconnects on its own, which is most of
 * why the client half is this short.
 *
 * **Polling is the fallback, not the mechanism.** It starts only if the stream
 * cannot be opened at all — a proxy that will not pass `text/event-stream`, a
 * host that caps request duration. When that happens the bell is thirty seconds
 * behind instead of instant, which is worse but is not broken.
 *
 * A client component because the badge is per-visitor: reading the session
 * cookie on the server would opt the whole route tree out of pre-rendering and
 * undo the decision this app is built on.
 *
 * With JavaScript off nothing here renders. Nothing is lost that is not
 * available elsewhere: the orders page lists the same orders with the same
 * statuses, and it is one press away in this same header.
 */
export function NotificationBell({
  endpoint,
  streamEndpoint,
  ordersBase,
  reservationsBase,
  labels,
  statusCopy,
  reservationCopy,
  reminderCopy,
}: {
  /** `notificationsApiPath(language)` — built on the server, because the
   *  language-prefix rule lives there and this runs in the browser. */
  endpoint: string;
  /** `notificationsStreamPath(language)`; the same data, pushed. */
  streamEndpoint: string;
  /** `ordersPath(language)`; a line links to `${ordersBase}/${orderId}`. */
  ordersBase: string;
  /** `reservationsPath(language)`; a booking line links to
   *  `${reservationsBase}/${reservationId}`. */
  reservationsBase: string;
  labels: {
    bell: string;
    empty: string;
    hint: string;
    enableAlerts: string;
    alertsOn: string;
    remove: string;
    clearAll: string;
  };
  statusCopy: StatusCopy;
  reservationCopy: ReservationCopy;
  /** The one sentence a booking reminder draws. */
  reminderCopy: { title: string; body: string };
}) {
  const router = useRouter();
  const [bell, setBell] = useState<Bell | null>(null);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertState>('unsupported');

  // Held in a ref as well as state so the stream and the poll can compare
  // without listing `bell` as a dependency — which would tear the connection
  // down and rebuild it on every answer.
  const latest = useRef<Bell | null>(null);

  // Read after mount, never during render: `Notification.permission` does not
  // exist on the server, and reading it in render would be a hydration
  // mismatch on the one element whose whole job is to be consistent.
  useEffect(() => setAlerts(alertState()), []);

  /**
   * Applies a bell unconditionally.
   *
   * Separate from `replace` below because **`sameBell` is the wrong test for a
   * local edit.** It compares the count and the newest id — the two things the
   * header draws — which is exactly right for "did the answer to my poll
   * change" and exactly wrong for "I just deleted a read line from the middle":
   * neither of those two moves, so the change would be dropped and the cross
   * would appear to do nothing.
   */
  const set = useCallback((next: Bell) => {
    latest.current = next;
    setBell(next);
  }, []);

  const replace = useCallback(
    (next: Bell, options: { refresh?: boolean } = {}) => {
      const previous = latest.current;
      if (previous && sameBell(previous, next)) {
        return;
      }
      set(next);
      if (options.refresh && previous) {
        // Something moved, and the page the visitor is on may be drawing that
        // order — the orders list, the tracking page. Their own watchers
        // handle the ones that have them; this catches the rest.
        router.refresh();
      }
    },
    [router, set],
  );

  /** Settles on whatever the server says is left after a delete. */
  const settle = useCallback(
    (response: Response): Promise<void> =>
      (response.ok ? response.json() : Promise.resolve(null)).then((data: unknown) => {
        const next = toBell(data);
        if (next) {
          set(next);
        }
      }),
    [set],
  );

  /**
   * The cross on a line.
   *
   * The line goes at once and the server is told afterwards, because a cross
   * that waits for a round trip before anything happens does not read as a
   * cross. The answer carries the bell as it now stands, so a delete that did
   * not go puts the line back rather than leaving a gap that a reload would
   * fill in confusingly.
   */
  const remove = useCallback(
    (id: string) => {
      const current = latest.current;
      if (current) {
        // The arithmetic lives in `notification-watch.ts` and is tested there —
        // a badge that goes negative is the failure this is guarding.
        set(withoutItem(current, id));
      }
      void fetch(`${endpoint}/${id}`, { method: 'DELETE', cache: 'no-store' })
        .then(settle)
        .catch(() => {
          // Offline, or the API is down. The line is gone from this panel and
          // will be back on the next stream connect — which is the honest
          // outcome, since it was never actually deleted.
        });
    },
    [endpoint, set, settle],
  );

  /** Empties it. Same bargain as the cross: it happens, then it is confirmed. */
  const clear = useCallback(() => {
    set({ items: [], unread: 0 });
    void fetch(endpoint, { method: 'DELETE', cache: 'no-store' })
      .then(settle)
      .catch(() => {});
  }, [endpoint, set, settle]);

  /** One notification, pushed. Goes to the top and raises the browser alert. */
  const arrive = useCallback(
    (item: NotificationItem) => {
      const current = latest.current ?? { items: [], unread: 0 };
      // Guarded because a reconnect re-sends the current bell, and the stream
      // may deliver an item that snapshot already contained.
      if (current.items.some((existing) => existing.id === item.id)) {
        return;
      }
      replace(
        { items: [item, ...current.items], unread: current.unread + (item.isRead ? 0 : 1) },
        { refresh: true },
      );

      const copy = drawnBy(item, statusCopy, reservationCopy, reminderCopy);
      const title = copy?.title ?? item.title;
      const body = copy?.body ?? item.body ?? '';
      if (title) {
        void raiseAlert({
          title,
          body,
          url: linkFor(item, ordersBase, reservationsBase),
          // One alert per order or booking, replaced as it moves — six stages
          // should not leave six alerts stacked up.
          tag: item.payload?.orderId ?? item.payload?.reservationId ?? item.id,
        });
      }
    },
    [ordersBase, reservationsBase, replace, statusCopy, reservationCopy, reminderCopy],
  );

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    let live = true;

    /** The fallback. Only ever started by the stream failing to open. */
    const ask = async (): Promise<void> => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) {
          if (stopWatchingOn(response.status) && poll) {
            clearInterval(poll);
            poll = null;
          }
          return;
        }
        const next = toBell(await response.json());
        if (live && next) {
          replace(next, { refresh: true });
        }
      } catch {
        // A tab that slept, an API restarting. The badge keeps the last number
        // it was sure of and the next tick catches up.
      }
    };

    const startPolling = (): void => {
      if (poll || !live) {
        return;
      }
      void ask();
      poll = setInterval(() => void ask(), BELL_POLL_MS);
    };

    const source = new EventSource(streamEndpoint);
    let everOpened = false;

    // The bell as it stands — sent on connect and on every reconnect, so a
    // stream that dropped comes back current rather than only forward-looking.
    source.addEventListener('bell', (event) => {
      everOpened = true;
      const next = toBell(JSON.parse((event as MessageEvent).data));
      if (live && next) {
        replace(next);
      }
    });

    source.addEventListener('notification', (event) => {
      const item = toItem(JSON.parse((event as MessageEvent).data));
      if (live && item) {
        arrive(item);
      }
    });

    source.onerror = () => {
      // `EventSource` retries by itself after a dropped connection, and gives
      // up only when the response was not a stream at all — a 401, or a proxy
      // answering something else. `CLOSED` is that case, and the only one
      // worth falling back for: a signed-out visitor gets a 401 and no poll,
      // and everybody else keeps the connection.
      if (source.readyState === EventSource.CLOSED && !everOpened) {
        startPolling();
      }
    };

    return () => {
      live = false;
      source.close();
      if (poll) {
        clearInterval(poll);
      }
    };
  }, [arrive, endpoint, replace, streamEndpoint]);

  /**
   * Opening the panel is what "I have seen these" means, so it clears the badge
   * — server-side, and the answer is the bell as it now stands rather than a
   * guess made here.
   */
  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) {
        return false;
      }
      void fetch(endpoint, { method: 'POST', cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          const next = toBell(data);
          if (next) {
            latest.current = next;
            setBell(next);
          }
        })
        .catch(() => {
          // The panel is open and showing the right lines either way; only the
          // badge is wrong, and the stream corrects it.
        });
      return true;
    });
  }, [endpoint]);

  // Nothing to draw until the first answer lands: a visitor who is signed out
  // has no bell, and rendering one that then vanishes is worse than rendering
  // it a moment late. Also what keeps the server's HTML and the browser's
  // first paint identical.
  if (!bell) {
    return null;
  }

  return (
    <div className="bell">
      <button
        type="button"
        className="bell-button"
        aria-label={labels.bell}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9a6 6 0 1112 0c0 3.5.7 5.2 1.5 6.2.4.5 0 1.3-.7 1.3H5.2c-.7 0-1.1-.8-.7-1.3C5.3 14.2 6 12.5 6 9z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {bell.unread > 0 && (
          <span className="bell-count">{bell.unread > 99 ? '99+' : bell.unread}</span>
        )}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label={labels.bell}>
          <div className="bell-head">
            <p className="bell-title">{labels.bell}</p>
            {/* Offered only when there is something to clear — a button that
                empties an empty list is a button that teaches nothing. */}
            {bell.items.length > 0 && (
              <button type="button" className="bell-clear" onClick={clear}>
                {labels.clearAll}
              </button>
            )}
          </div>

          {/* Offered only where pressing it can do something. `denied` is
              permanent from here — nothing this app does can re-ask — and
              `unsupported` includes an ordinary iPhone visit, where the API
              does not exist until the site is on the home screen. */}
          {alerts === 'default' && (
            <button
              type="button"
              className="bell-allow"
              onClick={() => void requestAlerts().then(setAlerts)}
            >
              {labels.enableAlerts}
            </button>
          )}
          {alerts === 'granted' && <p className="bell-allowed">{labels.alertsOn}</p>}

          {bell.items.length === 0 ? (
            <p className="bell-empty">
              {labels.empty}
              <span>{labels.hint}</span>
            </p>
          ) : (
            <ul className="bell-list">
              {bell.items.map((item) => {
                const copy = drawnBy(item, statusCopy, reservationCopy, reminderCopy);
                // `title`/`body` are the fallback rather than the source: they
                // are only populated for the kinds this app cannot draw itself
                // (a promo, a system note), and for those the API's words are
                // all there is.
                const title = copy?.title ?? item.title;
                const body = copy?.body ?? item.body;
                if (!title) {
                  // A kind this build does not know — a newer API talking to an
                  // older page. Skipped rather than rendered blank.
                  return null;
                }
                const href = linkFor(item, ordersBase, reservationsBase);
                return (
                  <li key={item.id} className={item.isRead ? 'bell-item' : 'bell-item is-unread'}>
                    <Link href={href} onClick={() => setOpen(false)}>
                      <span className="bell-item-title">
                        {title}
                        {item.payload?.code && (
                          <span className="bell-item-code">{item.payload.code}</span>
                        )}
                      </span>
                      {body && <span className="bell-item-body">{body}</span>}
                    </Link>
                    {/* A sibling of the link, never inside it: a button nested
                        in an anchor is invalid HTML, and the press would be the
                        link's as much as the button's. `aria-label` carries the
                        order code, so a screen reader hears which line is being
                        thrown away rather than "delete" eight times. */}
                    <button
                      type="button"
                      className="bell-remove"
                      aria-label={`${labels.remove}${item.payload?.code ? ` — ${item.payload.code}` : ''}`}
                      onClick={() => remove(item.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path
                          d="M2 2l8 8M10 2l-8 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
