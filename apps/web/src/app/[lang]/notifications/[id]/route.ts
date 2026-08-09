import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { removeOne, type Bell } from '@/lib/notifications';

/**
 * Throws one notification away — the cross on a line in the bell.
 *
 * A route handler for the reason its siblings are: the session is an httpOnly
 * cookie, so only the server can turn it into an API call, and only a route
 * handler may write the rotated cookie back when the token behind it expires in
 * a tab that has been open for hours.
 *
 * **It answers with the bell as it now stands**, not 204. The panel has already
 * removed the line optimistically — that is what makes a cross feel like a
 * cross — so what it needs back is the truth to settle on, including the unread
 * count, which changes when the line that went was unread.
 *
 * A sibling of `stream` rather than a conflict with it: `stream` is a static
 * segment and wins the match, so `/notifications/stream` never arrives here.
 */
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ lang: string; id: string }> },
): Promise<NextResponse<Bell | null>> {
  const { lang, id } = await params;
  if (!parseLanguage(lang)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const state = await removeOne(id);
    return state === null ? new NextResponse(null, { status: 401 }) : NextResponse.json(state);
  } catch (error) {
    if (error instanceof ApiError) {
      // Passed through rather than flattened. A 404 here is an id that is not
      // this visitor's or no longer exists — which is also what a second cross
      // on the same line looks like, and the panel treats it as done rather
      // than as a failure to undo.
      return new NextResponse(null, { status: error.status });
    }
    throw error;
  }
}
