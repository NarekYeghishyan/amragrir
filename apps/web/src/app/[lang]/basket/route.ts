import { NextResponse, type NextRequest } from 'next/server';
import { parseLanguage } from '@/lib/language';
import { pricedPanel, type BasketPanel } from '@/lib/basket-panel';

/**
 * The visitor's own basket, priced and already formatted, as JSON.
 *
 * This exists so a restaurant page can show the design's order panel without
 * giving up the one thing that page is built for. Reading the basket on the
 * server *inside the page* would opt all 69 pre-rendered restaurant pages into
 * rendering per request; so the page stays static HTML and the panel asks for
 * the basket from the browser, exactly as the header's badge already does.
 *
 * This is the panel's **first** answer. Every one after it comes back from the
 * live basket actions, which return the new panel from the write itself rather
 * than making the browser ask again — see `lib/basket-panel.ts`, which both
 * share, and `actions.ts`.
 *
 * It answers only the caller's own cookies, and it is never cached.
 */
export const dynamic = 'force-dynamic';

export type { BasketPanel };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<BasketPanel>> {
  const { lang } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    return NextResponse.json<BasketPanel>({ state: 'empty' });
  }

  return NextResponse.json<BasketPanel>(
    await pricedPanel(language, request.nextUrl.searchParams.get('branch')),
  );
}
