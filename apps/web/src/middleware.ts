import { NextResponse, type NextRequest } from 'next/server';
import { resolveLanguageRoute } from '@/lib/site';

/**
 * Maps the site's published URLs onto the `[lang]` tree.
 *
 * Armenian is the default language and carries no prefix: it is served at the
 * bare domain, so `/` and `/r/sunny-table` are Armenian pages, while Russian
 * and English keep an address of their own (`/ru`, `/en/r/sunny-table`) for a
 * crawler to index separately. `/hy/…` is redirected to the unprefixed form so
 * one page never has two addresses.
 *
 * Nothing here reads `Accept-Language`. The URL is the only thing that decides
 * a language — with the default unprefixed, a header redirect would bounce a
 * Russian-speaking visitor who deliberately clicked "HY" straight back to
 * `/ru`, leaving no way to ask for Armenian at all.
 *
 * The decision itself lives in `lib/site.ts`, next to the helpers that build
 * these URLs, so the two cannot disagree.
 */
export function middleware(request: NextRequest) {
  const route = resolveLanguageRoute(request.nextUrl.pathname);

  if (route.action === 'pass') {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = route.pathname;
  // 308 rather than 307: `/hy/…` is not a temporary detour, it is an address
  // this site no longer publishes.
  return route.action === 'redirect'
    ? NextResponse.redirect(url, 308)
    : NextResponse.rewrite(url);
}

export const config = {
  // Everything except Next's own assets and the files that must stay at the
  // root — a crawler looks for /robots.txt, not /ru/robots.txt.
  //
  // `notifications-sw.js` is in that list for a stricter reason than the
  // crawler ones: **a service worker's scope is its own URL path.** Rewritten
  // to `/ru/notifications-sw.js` it would not merely 404 (which is what it did
  // before this entry existed) — even served, it could only ever control
  // `/ru/`, so an alert would work in one language and silently not in the
  // others.
  matcher: ['/((?!_next|robots.txt|sitemap.xml|favicon.ico|notifications-sw.js).*)'],
};
