'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { noBasketCount, readBasketCount, subscribeToBasketCount } from '@/lib/basket-count';

/**
 * The header basket, from the design's `cartCount` / `cartTotal` control.
 *
 * A client component for one specific reason: both the count and the total live
 * behind cookies, and reading a cookie on the server opts the whole route tree
 * out of pre-rendering. Doing that in the layout would make every restaurant
 * page render per request — undoing the decision this app is built on. So the
 * catalogue stays static HTML and the browser fills the button in afterwards.
 *
 * **It computes no money.** The total arrives as a string `GET /[lang]/basket`
 * has already formatted from `POST /cart/quote` — the same route the restaurant
 * page's order panel reads. There is no arithmetic here to get wrong.
 *
 * What that costs: with JavaScript off the header shows the empty basket. Nothing
 * else is lost — every page in the order flow links to the basket in its own
 * markup, so the badge is decoration on a path that exists without it.
 */
export function BasketButton({
  href,
  endpoint,
  label,
}: {
  href: string;
  /** Where to ask for the priced basket. Built on the server, because the
   *  language-prefix rule lives there and this runs in the browser. */
  endpoint: string;
  label: string;
}) {
  const count = useBasketCount();
  const total = useBasketTotal(endpoint, count);

  return (
    <Link className="basket-button" href={href} aria-label={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 7h12l-1 13H7L6 7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 7a3 3 0 016 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {/* The design puts the money on the button. Until the browser has been
          told what it is, the button is still a button — it just has no number
          on it yet, rather than flashing a wrong one. */}
      {total !== null && <span className="basket-total">{total}</span>}
      {count > 0 && <span className="basket-count">{count}</span>}
    </Link>
  );
}

/**
 * Watches the count cookie — see `lib/basket-count.ts` for why it is watched
 * rather than listened for.
 *
 * Starting at zero and filling in afterwards is deliberate: the server renders
 * this page once for everybody, so any other starting value would be wrong for
 * somebody and would hydrate into a mismatch.
 */
export function useBasketCount(): number {
  return useSyncExternalStore(subscribeToBasketCount, readBasketCount, noBasketCount);
}

/**
 * The formatted total, or null while there is nothing to show one for.
 *
 * Keyed on the count so that adding a dish re-asks: the count cookie is
 * readable here and changes on every basket write, which makes it the cheapest
 * available signal that the total is stale. An empty basket skips the request
 * entirely rather than asking the server to confirm it is empty.
 */
function useBasketTotal(endpoint: string, count: number): string | null {
  const [total, setTotal] = useState<string | null>(null);

  useEffect(() => {
    if (count === 0) {
      setTotal(null);
      return;
    }
    let live = true;
    fetch(endpoint, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { state: string; total?: string } | null) => {
        if (live && data?.state === 'filled' && data.total) {
          setTotal(data.total);
        }
      })
      .catch(() => {
        // A total that failed to load leaves the button without a number on it.
        // There is nothing here a visitor could do about it, and the basket page
        // is one press away.
      });
    return () => {
      live = false;
    };
  }, [endpoint, count]);

  return total;
}
