'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@amragrir/shared';
import type { LiveOrder } from '@/lib/order-live';
import { isLive } from '@/lib/order-status';
import { ORDER_POLL_MS, sameOrder, stopWatchingOn, toLiveOrder } from '@/lib/order-watch';

/**
 * Follows an order while somebody is looking at it.
 *
 * The kitchen moves an order from the back office — Confirmed, Preparing,
 * Almost ready, Ready — and the tracking page has to show that happening. It
 * used to do it by re-running its own server component every ten seconds and
 * replacing the tree with the answer: correct, but the whole page was rebuilt
 * to change one word, and nothing moved until the round trip landed.
 *
 * This asks a much smaller question instead (`GET /[lang]/orders/[id]/status`,
 * three fields) and hands the answer to the two things that care —
 * `OrderSteps` and `Countdown` — which repaint themselves. Nothing else on the
 * page is touched: no navigation, no scroll jump, no flash.
 *
 * **The server component is still re-run, but only when something it drew has
 * actually changed** — the status, or the promise the clock counts to. Parts of
 * that page are the server's to decide and cannot be patched from here: whether
 * the order can still be cancelled, whether the headline says confirmed or
 * cancelled, whether there is a countdown at all, what time it says the food
 * arrives. So a change triggers `router.refresh()` behind the repaint that
 * already happened. Between changes, which is nearly all of the time, the page
 * is left alone.
 *
 * **Why polling and not the order socket.** The gateway authenticates in its
 * first message and this page has no token to put there: the session lives in
 * an httpOnly cookie, deliberately unreadable from the browser. Bridging the
 * socket server-side is the upgrade — see `README.md` — and this is the version
 * that needs nothing but a route handler.
 *
 * It renders no markup of its own, so the page's DOM is unchanged. With
 * JavaScript off nothing here runs: the steps stay as the server drew them and
 * the refresh link below them is the way forward, exactly as before.
 */
const Live = createContext<LiveOrder | null>(null);

export function OrderLive({
  endpoint,
  status,
  secondsLeft,
  readyAt,
  children,
}: {
  /** `orderStatusApiPath(language, id)` — built on the server, see `lib/site.ts`. */
  endpoint: string;
  status: OrderStatus;
  secondsLeft: number | null;
  readyAt: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // Primitives in, object out: an object prop would be a new one on every
  // render of the page above, and every effect below it would restart.
  const fromServer = useMemo(
    () => ({ status, secondsLeft, readyAt }),
    [status, secondsLeft, readyAt],
  );

  const [live, setLive] = useState<LiveOrder>(fromServer);
  // What the last poll saw, for comparing the next one against without making
  // the poll restart every time it answers.
  const latest = useRef<LiveOrder>(fromServer);

  // The server rendered again — a refresh this component asked for, a reload,
  // a cancellation posted from the form below. Its value is the authority.
  useEffect(() => {
    latest.current = fromServer;
    setLive(fromServer);
  }, [fromServer]);

  useEffect(() => {
    if (!isLive(live.status)) {
      return;
    }

    let stopped = false;
    let timer = 0;

    const check = async () => {
      let answer: Response;
      try {
        answer = await fetch(endpoint, { cache: 'no-store' });
      } catch {
        // Offline, or an API being restarted. The next tick asks again; a
        // tracker that gave up on the first dropped packet would be worse than
        // one that is briefly behind.
        return;
      }
      if (stopped) {
        return;
      }
      if (stopWatchingOn(answer.status)) {
        window.clearInterval(timer);
        return;
      }
      if (!answer.ok) {
        return;
      }

      const next = toLiveOrder(await answer.json().catch(() => null));
      if (!next || stopped) {
        return;
      }

      const previous = latest.current;
      latest.current = next;
      const news = !sameOrder(previous, next);

      // The countdown re-syncs from every answer, so a moved `readyAt` reaches
      // it at once; the steps only move when the kitchen does.
      if (news || previous.secondsLeft !== next.secondsLeft) {
        setLive(next);
      }
      // Something the *server* drew is now wrong — the step, or the "arrives
      // at" beside the clock, or a cancel button that should no longer be
      // there. A falling `secondsLeft` is not that, which is the whole reason
      // `sameOrder` ignores it: refreshing on it would be the old behaviour
      // back, only twice as often.
      if (news) {
        router.refresh();
      }
    };

    timer = window.setInterval(() => void check(), ORDER_POLL_MS);
    // A tab that was in the background had its interval throttled to about once
    // a minute, so the first thing somebody coming back sees would otherwise be
    // a minute-old status. This is the catch-up, and it costs one request.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [endpoint, live.status, router]);

  return <Live.Provider value={live}>{children}</Live.Provider>;
}

/**
 * The order as last heard, or null outside the provider.
 *
 * Null is a real answer rather than an error: both consumers are given the
 * server's value as a prop as well, so either can be rendered on its own — and
 * on the first client render the two agree by construction, which is what keeps
 * hydration quiet.
 */
export function useLiveOrder(): LiveOrder | null {
  return useContext(Live);
}
