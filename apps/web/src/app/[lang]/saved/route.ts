import { NextResponse, type NextRequest } from 'next/server';
import { parseLanguage } from '@/lib/language';
import { favoriteIds } from '@/lib/favorites';

/**
 * Whether the visitor has saved a given restaurant.
 *
 * This exists for the same reason `/[lang]/basket` does, and pays for the same
 * thing: the restaurant pages are **pre-rendered at build time** — they are what
 * discovery traffic lands on, and `generateStaticParams` puts every one of them
 * on disk in all three languages. Reading the session inside the page to decide
 * whether its heart is filled would opt every one of them into rendering per
 * request, to draw one glyph two ways. So the page stays static HTML and the
 * heart asks this from the browser after it mounts.
 *
 * The listings do not use it: home, search and `/favorites` render per request
 * already, so they fill their hearts on the server where there is no flicker to
 * have. This is the exception the static pages need, not the general path.
 *
 * `?restaurant=` is answered as a single boolean rather than the whole set —
 * the caller has one restaurant on screen, and its ids are not this endpoint's
 * to hand out in bulk. It answers only the caller's own cookies, and it is
 * never cached.
 */
export const dynamic = 'force-dynamic';

export interface SavedAnswer {
  favorited: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<SavedAnswer>> {
  const { lang } = await params;
  const language = parseLanguage(lang);
  const restaurantId = request.nextUrl.searchParams.get('restaurant');

  // No language, or nothing named: false is the honest answer and the one the
  // heart is already drawn in, so nothing on screen moves.
  if (!language || !restaurantId) {
    return NextResponse.json<SavedAnswer>({ favorited: false });
  }

  const saved = await favoriteIds(language);
  return NextResponse.json<SavedAnswer>({ favorited: saved.has(restaurantId) });
}
