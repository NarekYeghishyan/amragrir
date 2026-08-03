'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { COUNT_COOKIE } from '@/lib/cart';

/**
 * The header basket, from the design's `cartCount` / `openCart` control.
 *
 * A client component for one specific reason: the count lives in a cookie, and
 * reading a cookie on the server opts the whole route tree out of
 * pre-rendering. Doing that in the layout would make every restaurant page
 * render per request — undoing the decision this app is built on. So the
 * catalogue stays static HTML and the browser adds the badge afterwards.
 *
 * What that costs: with JavaScript off there is no basket button in the header.
 * Nothing else is lost — every page in the order flow links to the basket in
 * its own markup, and the sticky bar on a restaurant page is a plain link. The
 * badge is decoration on a path that exists without it.
 */
export function BasketButton({ href, label }: { href: string; label: string }) {
  const count = useBasketCount();
  if (count === 0) {
    return null;
  }

  return (
    <Link className="basket-button" href={href}>
      <span aria-hidden="true">🧺</span>
      <span className="visually-hidden">{label}</span>
      <span className="basket-count">{count}</span>
    </Link>
  );
}

/**
 * Reads the count cookie after mount.
 *
 * Starting at zero and filling in afterwards is deliberate: the server renders
 * this page once for everybody, so any other starting value would be wrong for
 * somebody and would hydrate into a mismatch.
 */
export function useBasketCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const read = () => setCount(readCountCookie());
    read();
    // The cookie changes when a Server Action responds, which is a navigation
    // rather than a storage event — so re-read when the page regains focus or
    // is restored from the back/forward cache.
    window.addEventListener('pageshow', read);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('pageshow', read);
      window.removeEventListener('focus', read);
    };
  }, []);

  return count;
}

function readCountCookie(): number {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COUNT_COOKIE}=(\\d+)`));
  return match ? Number(match[1]) : 0;
}
