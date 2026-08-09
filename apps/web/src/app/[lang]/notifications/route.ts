import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { bell, readAll, removeAll, type Bell } from '@/lib/notifications';

/**
 * The bell, as JSON, for the header that is watching it.
 *
 * A route handler for the reason `[lang]/basket` and `[lang]/orders/[id]/status`
 * are: the session is an httpOnly cookie, so only the server can turn it into an
 * API call, and only a route handler may write the rotated cookie back when the
 * token behind it expires in an open tab.
 *
 * **`GET` reads, `POST` clears.** Opening the panel is what "I have seen these"
 * means, so the panel posts once on open and gets back the bell as it now
 * stands — no second request to learn the badge went away.
 *
 * It answers the caller's own notifications and nothing else; the API decides
 * that from the token. Never cached.
 */
export const dynamic = 'force-dynamic';

export type { Bell };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<Bell | null>> {
  return answer(params, bell);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<Bell | null>> {
  return answer(params, readAll);
}

/**
 * Empties the bell, and answers with what is left — which is nothing, but from
 * the server rather than assumed here. The panel has already removed the lines;
 * this is what confirms it, or puts back what did not go.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<Bell | null>> {
  return answer(params, removeAll);
}

async function answer(
  params: Promise<{ lang: string }>,
  read: () => Promise<Bell | null>,
): Promise<NextResponse<Bell | null>> {
  const { lang } = await params;
  if (!parseLanguage(lang)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const state = await read();
    // No session, or one the API would not take: there is no bell to draw. The
    // watcher stops on this rather than asking every thirty seconds forever,
    // and the header's own render is what decides to show a sign-in link.
    return state === null ? new NextResponse(null, { status: 401 }) : NextResponse.json(state);
  } catch (error) {
    if (error instanceof ApiError) {
      // Passed through rather than flattened: the browser stops watching on a
      // 401 and keeps trying through anything else, and an API that is briefly
      // down is an "anything else".
      return new NextResponse(null, { status: error.status });
    }
    throw error;
  }
}
