'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps a live order's page current.
 *
 * `router.refresh()` re-runs the server component, so the status, the timer and
 * the ready time all come from the API rather than from a copy kept in the
 * browser — there is no second source of truth to drift.
 *
 * Polling rather than the API's order socket: the gateway needs its own
 * authenticated handshake, and the token deliberately lives in an httpOnly
 * cookie the page cannot read. A ten-second poll on a page somebody watches for
 * a few minutes is a fair trade; the socket is the upgrade once the token can
 * be handed over server-side.
 *
 * This is the only client component in the order flow. With JavaScript off the
 * page still renders every fact — it simply needs the refresh link beside it.
 */
export function OrderRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
