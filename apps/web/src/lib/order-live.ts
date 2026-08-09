import type { Language, OrderStatus } from '@amragrir/shared';
import { api, ApiError } from './api';
import { readSession, writeSession } from './session';
import { refreshTokens } from './session-refresh';

/**
 * Where an order has got to, and nothing else.
 *
 * The three fields the tracking screen has to be told about while somebody is
 * watching it: the step the kitchen has reached, the countdown, and the promise
 * it counts to. Everything else on that page — the pickup code, the lines, the
 * total — is settled at the moment the order is placed and cannot change under
 * the reader, so it is not worth sending again every few seconds.
 *
 * Deliberately the same three fields the order socket pushes
 * (`API_DOCUMENTATION.md`, "Realtime status"), so the day this page can hold a
 * socket open the payload it already understands is the one that arrives.
 */
export interface LiveOrder {
  status: OrderStatus;
  secondsLeft: number | null;
  readyAt: string | null;
}

/**
 * Reads that state as the visitor, for the route handler the browser polls.
 *
 * Written the way `basket-panel.ts` is and for the same reason: the tokens live
 * in an httpOnly cookie that the page cannot read, so the browser asks *this*
 * app and this app asks the API. Null means there is no session to ask with —
 * the page itself sends that visitor to sign in; a poll has nothing useful to
 * say about it.
 *
 * **It refreshes the token itself on a 401.** An access token lives fifteen
 * minutes and a tracking page is open for as long as the food takes, so an
 * expired one is the ordinary case here rather than the exception — and it
 * arrives as a silently dead tracker, which is the exact failure this endpoint
 * exists to prevent. A Route Handler may write cookies where a page may not,
 * which is why the retry can live here at all.
 */
export async function liveOrder(id: string, language: Language): Promise<LiveOrder | null> {
  const session = await readSession();
  if (!session) {
    return null;
  }

  let order;
  try {
    order = await api.order(id, session.accessToken, language);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    // Shared with `/session` and the basket panel — this poll fires every few
    // seconds, so it is the likeliest thing to be refreshing at the same instant
    // as a reload. See `session-refresh.ts`.
    const rotated = await refreshTokens(session.refreshToken);
    await writeSession({ ...rotated, verified: session.verified });
    order = await api.order(id, rotated.accessToken, language);
  }

  return { status: order.status, secondsLeft: order.secondsLeft, readyAt: order.readyAt };
}
