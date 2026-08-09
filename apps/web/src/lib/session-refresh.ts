import { api, type TokenPair } from './api';

/**
 * Rotates the token pair, collapsing concurrent callers onto a single rotation.
 *
 * A refresh token is single-use: the API accepts it once, issues a new pair and
 * revokes the old one (`token.service.ts` — "a refresh token is single-use").
 * So two requests that present the *same* refresh token at the same moment get
 * one 200 and one 401, and the 401 is the problem. On the tracking page there
 * are two things that can notice an expired access token together — the page
 * re-rendering when it is reloaded, and the status poll running behind it — and
 * before this each called `api.refresh` on its own. When the loser is
 * `/session`, its 401 path mints a **guest**, quietly turning a signed-in
 * customer into one and sending them back to sign in. That is the "I refreshed
 * and got logged out" report.
 *
 * Keyed on the token being spent, so everyone holding the same cookie shares one
 * rotation and one result. The settled promise is held for a few seconds after
 * it resolves: a caller that arrives just after the winner finished then gets
 * the *new* pair from here instead of trying to spend a token that has already
 * been rotated away — which is the near-miss that a plain in-flight map would
 * still let through.
 *
 * **In-process only.** One Next server shares this map, the way the API's own
 * order fan-out is one in-process emitter; a second web instance would not, and
 * the same two-refresher race would return. The complete, cross-instance and
 * cross-client (mobile too) fix is a short grace window on the API's own
 * rotation — see the README. This removes the race for the deployment there is.
 */
const inFlight = new Map<string, Promise<TokenPair>>();

/** How long a settled rotation stays shareable. Longer than a refresh round
 *  trip and than the gap between a background poll rotating the token and a
 *  reload of the same page arriving with the cookie it was about to replace. */
const HOLD_MS = 5_000;

export function refreshTokens(refreshToken: string): Promise<TokenPair> {
  const shared = inFlight.get(refreshToken);
  if (shared) {
    return shared;
  }

  const rotation = api.refresh(refreshToken);
  inFlight.set(refreshToken, rotation);
  // Evict a while after it settles, not the instant it does, so the grace hold
  // above is real. The `catch` is only to keep this bookkeeping promise from
  // being an unhandled rejection; callers still see the original outcome.
  void rotation
    .catch(() => undefined)
    .finally(() => setTimeout(() => inFlight.delete(refreshToken), HOLD_MS));

  return rotation;
}
