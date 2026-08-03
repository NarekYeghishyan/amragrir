'use client';

import Link from 'next/link';
import { useBasketCount } from './BasketButton';

/**
 * The design's sticky "View basket" bar on a restaurant page.
 *
 * Client-side for the same reason as `BasketButton`: the count comes from a
 * cookie, and reading a cookie on the server would make this page — the one
 * page in the app that most needs to be pre-rendered — render per request.
 *
 * It appears only once there is something in the basket, exactly as the design
 * specifies ("if basket not empty", SCREENS.md §3). Without JavaScript it never
 * appears; nothing is lost, because the CTA block further up the page links to
 * the basket in plain HTML.
 */
export function StickyBasket({ href, label }: { href: string; label: string }) {
  const count = useBasketCount();
  if (count === 0) {
    return null;
  }

  return (
    <Link className="sticky-cta" href={href}>
      <span>{label}</span>
      <span className="pill">{count}</span>
    </Link>
  );
}
