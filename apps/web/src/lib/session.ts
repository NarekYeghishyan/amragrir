import { cookies } from 'next/headers';
import { api } from './api';

/**
 * Who the browser is, as far as this app is concerned.
 *
 * The tokens live in an **httpOnly** cookie and never reach the page: the
 * browser talks to the Next server, and the Next server talks to the API. That
 * is the same rule `api.ts` already states for reads — no `NEXT_PUBLIC_API_URL`,
 * no API address in the bundle — extended to the writes that ordering needs.
 * `localStorage` would have been fewer lines and would have handed every token
 * to any script that ever runs on the page.
 */

const COOKIE = 'amr_session';

/** Matches the API's refresh-token life, so the session and the basket cookie
 *  (same age) expire together rather than leaving a basket nobody can price. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface Session {
  accessToken: string;
  refreshToken: string;
  /**
   * Mirrors the user's `phoneVerified`.
   *
   * Cached here because every screen in the order flow has to know whether to
   * send the visitor to sign in, and asking the API once per render would cost
   * a round trip on every page. It is a *hint*, not the authority: `POST
   * /orders` re-checks it and returns 403 regardless of what this says.
   */
  verified: boolean;
}

interface StoredSession {
  a: string;
  r: string;
  v: boolean;
}

function isStored(value: unknown): value is StoredSession {
  const candidate = value as StoredSession | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.a === 'string' &&
    typeof candidate.r === 'string' &&
    typeof candidate.v === 'boolean'
  );
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed)
      ? { accessToken: parsed.a, refreshToken: parsed.r, verified: parsed.v }
      : null;
  } catch {
    // A cookie we cannot read is a cookie we do not have. Throwing here would
    // turn one bad value into an unrecoverable 500 on every page.
    return null;
  }
}

/**
 * Only callable from a Server Action or a Route Handler — Next forbids writing
 * cookies during a page render, which is why pages bounce through
 * `app/[lang]/session/route.ts` instead of minting inline.
 */
export async function writeSession(session: Session): Promise<void> {
  const stored: StoredSession = {
    a: session.accessToken,
    r: session.refreshToken,
    v: session.verified,
  };
  (await cookies()).set(COOKIE, JSON.stringify(stored), {
    httpOnly: true,
    sameSite: 'lax',
    // `lax` rather than `strict`: a link from an email or a search result is a
    // top-level GET, and `strict` would drop the session on exactly that hop.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * The session, minting a guest account if there isn't one.
 *
 * Callable only where cookies are writable — which is exactly where it is
 * wanted. Guest accounts are created on the first *deliberate* act (adding a
 * dish), never on a page view, so browsing the catalogue — or crawling it —
 * does not fill the users table with rows that will never order anything.
 */
export async function ensureSession(): Promise<Session> {
  const existing = await readSession();
  if (existing) {
    return existing;
  }
  const session: Session = { ...(await api.guest()), verified: false };
  await writeSession(session);
  return session;
}
