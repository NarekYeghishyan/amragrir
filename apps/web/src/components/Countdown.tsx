'use client';

import { useEffect, useState } from 'react';
import { formatCountdown } from '@/lib/format';
import { remainingSeconds } from '@/lib/countdown';
import { useLiveOrder } from './OrderLive';

/**
 * The tracking page's `mm:ss`, moving every second instead of every poll.
 *
 * The page hears from the server every few seconds (`OrderLive`), which is the
 * right cadence for a *status* and the wrong one for a clock: the number stood
 * still and then jumped, and a number that does not move is exactly how a stuck
 * order looks. This ticks in between, in the browser, with no navigation and no
 * request behind it.
 *
 * **The server still owns the number.** `seconds` is the API's `secondsLeft` as
 * the page was rendered, and every answer the watcher gets replaces it — the
 * kitchen pushing a promise back by ten minutes lands here rather than leaving
 * this counting to a zero that means nothing. The browser only counts how long
 * ago it heard the current value (`lib/countdown.ts`), so there is no second
 * source of truth to drift.
 *
 * With JavaScript off it renders the server's value and stays there, which is
 * what the whole page did before; the refresh link below it is still the way
 * forward.
 */
export function Countdown({ seconds }: { seconds: number }) {
  const live = useLiveOrder();
  return <Ticking seconds={live?.secondsLeft ?? seconds} />;
}

/** The clock itself, keyed on nothing: `seconds` changing is what restarts it,
 *  and that is the whole of its state. */
function Ticking({ seconds }: { seconds: number }) {
  // How long ago this render's `seconds` was read. Zero to begin with, so the
  // first client render is the markup that arrived and hydration has nothing to
  // reconcile.
  const [from, setFrom] = useState(seconds);
  const [elapsedMs, setElapsedMs] = useState(0);

  // A poll landed with a newer number. Adjusted here rather than in an effect
  // so the second never paints as last cycle's arithmetic first — React redoes
  // this render before the browser sees any of it.
  if (from !== seconds) {
    setFrom(seconds);
    setElapsedMs(0);
  }

  useEffect(() => {
    if (seconds <= 0) {
      return;
    }
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      // Nothing left to count. The poll is what moves the page past zero — a
      // countdown that has run out must not keep waking React once a second
      // while it waits for the kitchen.
      if (elapsed >= seconds * 1000) {
        window.clearInterval(tick);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [seconds]);

  return <span className="value">{formatCountdown(remainingSeconds(seconds, elapsedMs))}</span>;
}
