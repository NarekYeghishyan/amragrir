import { NextResponse, type NextRequest } from 'next/server';
import { parseLanguage } from '@/lib/language';
import { favoriteDishIds, favoriteIds } from '@/lib/favorites';

/**
 * What the visitor has saved at one branch: the branch itself, and which of its
 * dishes.
 *
 * This exists for the same reason `/[lang]/basket` does, and pays for the same
 * thing: the restaurant pages are **pre-rendered at build time** — they are what
 * discovery traffic lands on, and `generateStaticParams` puts every one of them
 * on disk in all three languages. Reading the session inside the page to decide
 * whether its hearts are filled would opt every one of them into rendering per
 * request, to draw a glyph two ways. So the page stays static HTML and the
 * hearts ask this from the browser after they mount.
 *
 * The listings do not use it: home, search and `/favorites` render per request
 * already, so they fill their hearts on the server where there is no flicker to
 * have. This is the exception the static pages need, not the general path.
 *
 * **Both answers in one response**, because one page asks both questions at
 * once: the banner's heart is about the address and every menu row's heart is
 * about a dish, and two routes would be two round trips for one page. The dish
 * ids are scoped to the branch that was asked about — this endpoint hands out
 * what the caller already has on screen and no more. It answers only the
 * caller's own cookies, and it is never cached.
 */
export const dynamic = 'force-dynamic';

export interface SavedAnswer {
  favorited: boolean;
  /** Ids of this branch's dishes the visitor has saved. Empty for a visitor who
   *  is not signed in, which is the state the page was drawn in. */
  dishes: string[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<SavedAnswer>> {
  const { lang } = await params;
  const language = parseLanguage(lang);
  const branchId = request.nextUrl.searchParams.get('branch');

  // No language, or nothing named: false is the honest answer and the one the
  // hearts are already drawn in, so nothing on screen moves.
  if (!language || !branchId) {
    return NextResponse.json<SavedAnswer>({ favorited: false, dishes: [] });
  }

  const [saved, dishes] = await Promise.all([
    favoriteIds(language),
    favoriteDishIds(language, branchId),
  ]);
  return NextResponse.json<SavedAnswer>({
    favorited: saved.has(branchId),
    dishes: [...dishes],
  });
}
