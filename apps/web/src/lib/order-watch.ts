import { OrderStatus } from '@amragrir/shared';
import type { LiveOrder } from './order-live';

/**
 * The browser's half of following an order — the parts worth testing on their
 * own, kept out of the component that runs them.
 *
 * The component polls `GET /[lang]/orders/[id]/status` and hands what comes
 * back to the steps and the countdown. Everything here is about not trusting
 * that answer more than it deserves: it arrives over the network, from a route
 * that can answer "signed out" or "no such order", and acting on a malformed
 * one would put a broken tracker in front of somebody waiting for food.
 */

/**
 * How often the browser asks.
 *
 * Five seconds, where the whole-page refresh it replaces ran at ten. The ask is
 * a fraction of the size — three fields, no re-render of the tree, nothing
 * repainted unless something actually moved — and this is the one screen whose
 * entire job is to say what is happening right now: somebody standing at a
 * counter should not be told "preparing" for another ten seconds after the food
 * is on it.
 */
export const ORDER_POLL_MS = 5_000;

/**
 * An answer from the status route, or null if it is not one.
 *
 * The status is checked against the enum rather than taken on trust: a proxy
 * that answers HTML, a deploy mid-request, a route that changed shape — all of
 * them arrive here as "some object", and a tracker that renders `undefined`
 * because of one is worse than a tracker that keeps showing the last true
 * thing it knew.
 */
export function toLiveOrder(value: unknown): LiveOrder | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<LiveOrder>;
  const known = Object.values(OrderStatus).includes(candidate.status as OrderStatus);
  if (!known) {
    return null;
  }
  return {
    status: candidate.status as OrderStatus,
    secondsLeft: typeof candidate.secondsLeft === 'number' ? candidate.secondsLeft : null,
    readyAt: typeof candidate.readyAt === 'string' ? candidate.readyAt : null,
  };
}

/**
 * Whether two readings say the same thing.
 *
 * `secondsLeft` is left out on purpose. It falls by five between every pair of
 * answers, so comparing it would make every poll a change — and a "change" here
 * re-renders the tracker and, when the status moved, re-runs the server
 * component. The countdown is already ticking on its own between polls; what
 * this decides is whether anything happened that the page did not already know.
 */
export function sameOrder(a: LiveOrder, b: LiveOrder): boolean {
  return a.status === b.status && a.readyAt === b.readyAt;
}

/**
 * Whether an answer means "stop asking" rather than "try again".
 *
 * A 401 is a session that ended and a 404 is an order this visitor may not read
 * — neither improves by being asked again five seconds later, and the page has
 * its own reload path for both. Everything else (an API restarting, a phone in
 * a tunnel, a 500) is temporary by assumption: the watcher keeps its place and
 * catches up on the next tick.
 */
export function stopWatchingOn(httpStatus: number): boolean {
  return httpStatus === 401 || httpStatus === 404;
}
