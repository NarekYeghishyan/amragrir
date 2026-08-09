import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { homePath } from '@/lib/site';
import { readSession, writeSession } from '@/lib/session';
import { refreshTokens } from '@/lib/session-refresh';

/**
 * Gets the visitor a usable token, then sends them where they were going.
 *
 * This exists because of one Next rule: a cookie may only be written from a
 * Server Action or a Route Handler, never during a page render. So a page that
 * needs a token and has none — first visit, expired session, a refresh token
 * the API has revoked — cannot fix it in place. It redirects here instead.
 *
 * The ladder is refresh-then-mint: an existing session is rotated if it can be,
 * and only a session that cannot be saved is replaced with a fresh guest. The
 * order matters, because minting first would abandon the account the basket
 * was built under.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    return new NextResponse(null, { status: 404 });
  }

  const existing = await readSession();
  if (existing) {
    try {
      // Shared with the tracking page's status poll and the basket panel, so a
      // reload landing at the same moment as one of those does not become the
      // second request to spend one single-use refresh token — the loser of
      // which used to fall through and mint a guest over a signed-in customer.
      const rotated = await refreshTokens(existing.refreshToken);
      await writeSession({ ...rotated, verified: existing.verified });
      return NextResponse.redirect(destination(request, language));
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
      // A refresh token the API will not take is not worth keeping. Fall
      // through and start again as a guest.
    }
  }

  const tokens = await api.guest();
  await writeSession({ ...tokens, verified: false });
  return NextResponse.redirect(destination(request, language));
}

/**
 * Where to send the visitor afterwards.
 *
 * Only same-site paths are honoured. `next` arrives in a query string, so
 * without this check the route would forward anyone anywhere — a redirect a
 * phishing link could point at its own site and blame on this domain.
 */
function destination(request: NextRequest, language: string): URL {
  const next = request.nextUrl.searchParams.get('next');
  const url = request.nextUrl.clone();
  url.search = '';
  url.pathname = next?.startsWith('/') && !next.startsWith('//') ? next : homePath(language);
  return url;
}
