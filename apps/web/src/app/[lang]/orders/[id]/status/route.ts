import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { liveOrder, type LiveOrder } from '@/lib/order-live';

/**
 * Where this order has got to, as JSON, for the page that is watching it.
 *
 * The tracking screen used to keep up by re-running its whole server component
 * every ten seconds. That is a lot of machinery for four words and a clock, and
 * it moved nothing until the round trip landed. This is the small answer the
 * browser can ask for instead — `{ status, secondsLeft, readyAt }` — which the
 * steps and the countdown patch themselves from without the page changing
 * underneath the reader.
 *
 * It exists as a route handler for the reason `[lang]/basket` does: the session
 * is an httpOnly cookie, so only the server can turn it into an API call, and
 * only a route handler may write the rotated cookie back when the token behind
 * it expires mid-order.
 *
 * It answers the caller's own order and nothing else — the API decides that,
 * against the same visibility rule every other read of an order goes through —
 * and it is never cached.
 */
export const dynamic = 'force-dynamic';

export type { LiveOrder };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; id: string }> },
): Promise<NextResponse<LiveOrder | null>> {
  const { lang, id } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const live = await liveOrder(id, language);
    // No session, or one the API would not take: nothing to watch with. The
    // watcher stops on this rather than asking every few seconds forever, and
    // the page's own reload path is what asks for a sign-in properly.
    return live === null ? new NextResponse(null, { status: 401 }) : NextResponse.json(live);
  } catch (error) {
    if (error instanceof ApiError) {
      // Passed through rather than flattened: the browser stops watching on a
      // 401 or a 404 and keeps trying through anything else, and an API that is
      // briefly down is an "anything else".
      return new NextResponse(null, { status: error.status });
    }
    throw error;
  }
}
