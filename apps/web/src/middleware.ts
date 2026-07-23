import { NextResponse, type NextRequest } from 'next/server';
import { LANGUAGES, negotiate } from '@/lib/language';

/**
 * Sends an unprefixed URL to the visitor's language.
 *
 * This is the only place `Accept-Language` is consulted: it picks *which*
 * language URL to land on, and after that the URL is the single source of
 * truth. A crawler following `/` gets a 307 to `/hy` and then indexes each
 * language at its own address.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LANGUAGES.some((lang) => pathname === `/${lang}` || pathname.startsWith(`/${lang}/`))) {
    return NextResponse.next();
  }

  const language = negotiate(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${language}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the files that must stay at the
  // root — a crawler looks for /robots.txt, not /hy/robots.txt.
  matcher: ['/((?!_next|robots.txt|sitemap.xml|favicon.ico).*)'],
};
