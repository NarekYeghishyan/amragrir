import { notFound } from 'next/navigation';

/**
 * Everything under a language prefix that is not a page.
 *
 * Without this, an unknown URL matches no route at all and Next answers with
 * its own built-in 404 — a bare black page outside this app's layout, with
 * neither the header nor the design's artwork. A catch-all that immediately
 * calls `notFound()` puts the miss back inside the `[lang]` tree, so
 * `not-found.tsx` renders with the site around it.
 *
 * It shadows nothing: a catch-all is the lowest-priority match in the App
 * Router, so every real route above it still wins.
 */
export default function MissingPage(): never {
  notFound();
}