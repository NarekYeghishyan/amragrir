import { api, ApiError, type NotificationItem } from './api';
import { readSession, writeSession } from './session';
import { refreshTokens } from './session-refresh';

export type { NotificationItem };

/** What the bell needs to draw itself: the recent lines and the badge. */
export interface Bell {
  items: NotificationItem[];
  unread: number;
}

/**
 * Reads the bell as the visitor, for the route handler the browser polls.
 *
 * Written the way `order-live.ts` is and for the same reasons. The tokens live
 * in an httpOnly cookie the page cannot read, so the browser asks *this* app
 * and this app asks the API; and it refreshes the token itself on a 401,
 * because an access token lives fifteen minutes while a tab stays open for
 * hours — for the bell, an expired token is the ordinary case rather than the
 * exception, and it would arrive as a badge that silently stopped counting.
 *
 * Null means there is no session to ask with. That is not an error here: most
 * visitors are signed out, and the header simply draws no bell for them.
 */
export async function bell(): Promise<Bell | null> {
  return (await bellWithToken())?.bell ?? null;
}

/**
 * The bell, **and the token that was good enough to read it**.
 *
 * The stream route needs both: it opens an upstream WebSocket, and the gateway
 * authenticates that in its first message — so it has to be handed a token that
 * is known to work *now*, not one that expired twenty minutes into an open tab.
 * Reading the bell first is how that is known, and the answer is not wasted:
 * it becomes the stream's first event, so a connecting client gets the current
 * state without a second request.
 */
export async function bellWithToken(): Promise<{ bell: Bell; accessToken: string } | null> {
  const session = await readSession();
  if (!session) {
    return null;
  }

  try {
    return { bell: await api.notifications(session.accessToken), accessToken: session.accessToken };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    // Shared with `/session`, the basket panel and the order poll — all of
    // these fire on a timer, so two of them refreshing at the same instant is
    // the normal case rather than a race to be surprised by. See
    // `session-refresh.ts`.
    const rotated = await refreshTokens(session.refreshToken);
    await writeSession({ ...rotated, verified: session.verified });
    return { bell: await api.notifications(rotated.accessToken), accessToken: rotated.accessToken };
  }
}

/**
 * Does something to the bell, then reports it as it now stands.
 *
 * Returning the fresh state rather than an empty body saves the panel a second
 * round trip to learn what it already knows will happen — and makes the result
 * a fact from the server rather than a guess by the client, which matters most
 * for a delete: the client has already removed the line optimistically, and
 * this is what confirms or corrects it.
 *
 * The 401 retry is written once here rather than in each of the three callers.
 * A tab with the bell in it stays open for hours while an access token lives
 * fifteen minutes, so an expired one is the ordinary case rather than the
 * exception — and it would arrive as a cross that silently does nothing.
 */
async function mutate(act: (token: string) => Promise<unknown>): Promise<Bell | null> {
  const session = await readSession();
  if (!session) {
    return null;
  }

  try {
    await act(session.accessToken);
    return await api.notifications(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    const rotated = await refreshTokens(session.refreshToken);
    await writeSession({ ...rotated, verified: session.verified });
    await act(rotated.accessToken);
    return await api.notifications(rotated.accessToken);
  }
}

/** Marks everything read — what opening the panel means. */
export function readAll(): Promise<Bell | null> {
  return mutate((token) => api.readAllNotifications(token));
}

/** Throws one away — the cross on a line. */
export function removeOne(id: string): Promise<Bell | null> {
  return mutate((token) => api.deleteNotification(id, token));
}

/** Empties the bell. */
export function removeAll(): Promise<Bell | null> {
  return mutate((token) => api.clearNotifications(token));
}
