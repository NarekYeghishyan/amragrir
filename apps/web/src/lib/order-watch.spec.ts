import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@amragrir/shared';
import { ORDER_POLL_MS, sameOrder, stopWatchingOn, toLiveOrder } from './order-watch';
import { isLive, stepIndex } from './order-status';
import { orderStatusApiPath } from './site';
import type { LiveOrder } from './order-live';

const here = dirname(fileURLToPath(import.meta.url));
const components = join(here, '..', 'components');
const trackingPage = join(here, '..', 'app', '[lang]', 'orders', '[id]', 'page.tsx');
const statusRoute = join(here, '..', 'app', '[lang]', 'orders', '[id]', 'status', 'route.ts');

const preparing: LiveOrder = {
  status: OrderStatus.Preparing,
  secondsLeft: 300,
  readyAt: '2026-08-08T09:00:00.000Z',
};

describe('toLiveOrder', () => {
  it('takes an answer from the status route', () => {
    expect(toLiveOrder({ ...preparing })).toEqual(preparing);
  });

  it('takes an order with no promise on it — as-soon-as-possible has neither', () => {
    expect(toLiveOrder({ status: OrderStatus.Paid, secondsLeft: null, readyAt: null })).toEqual({
      status: OrderStatus.Paid,
      secondsLeft: null,
      readyAt: null,
    });
  });

  it('refuses a status that is not one', () => {
    // A proxy answering HTML, a deploy mid-request, a route that changed shape.
    // Rendering `undefined` as the step somebody is waiting on is worse than
    // keeping the last true thing the page knew.
    expect(toLiveOrder({ status: 'cooking' })).toBeNull();
    expect(toLiveOrder({ status: 42 })).toBeNull();
    expect(toLiveOrder({})).toBeNull();
    expect(toLiveOrder(null)).toBeNull();
    expect(toLiveOrder('<!doctype html>')).toBeNull();
  });

  it('drops fields of the wrong type rather than passing them on', () => {
    expect(toLiveOrder({ status: OrderStatus.Ready, secondsLeft: '90', readyAt: 7 })).toEqual({
      status: OrderStatus.Ready,
      secondsLeft: null,
      readyAt: null,
    });
  });
});

describe('sameOrder', () => {
  it('is true while nothing but the clock has moved', () => {
    // Every answer carries a smaller `secondsLeft`; treating that as news would
    // repaint the tracker — and re-run the server component — five times a
    // minute for something the countdown is already doing on its own.
    expect(sameOrder(preparing, { ...preparing, secondsLeft: 295 })).toBe(true);
  });

  it('is false when the kitchen moves the order on', () => {
    expect(sameOrder(preparing, { ...preparing, status: OrderStatus.AlmostReady })).toBe(false);
  });

  it('is false when the promise itself moves', () => {
    expect(sameOrder(preparing, { ...preparing, readyAt: '2026-08-08T09:10:00.000Z' })).toBe(false);
  });
});

describe('stopWatchingOn', () => {
  it('gives up on the two answers that will not improve', () => {
    // A session that ended, and an order this visitor may not read.
    expect(stopWatchingOn(401)).toBe(true);
    expect(stopWatchingOn(404)).toBe(true);
  });

  it('keeps watching through anything temporary', () => {
    expect(stopWatchingOn(500)).toBe(false);
    expect(stopWatchingOn(502)).toBe(false);
    expect(stopWatchingOn(429)).toBe(false);
    expect(stopWatchingOn(200)).toBe(false);
  });
});

describe('isLive', () => {
  it('is true for every status the kitchen can still move', () => {
    // `ready` included: the food is on the counter, nobody has collected it,
    // and `completed` is still ahead.
    for (const status of [
      OrderStatus.Created,
      OrderStatus.Paid,
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.AlmostReady,
      OrderStatus.Ready,
    ]) {
      expect(isLive(status)).toBe(true);
    }
  });

  it('is false once the order has finished, either way', () => {
    expect(isLive(OrderStatus.Completed)).toBe(false);
    expect(isLive(OrderStatus.Cancelled)).toBe(false);
  });
});

describe('the step a live status lands on', () => {
  it('follows the back office through the four steps', () => {
    expect(stepIndex(OrderStatus.Confirmed)).toBe(0);
    expect(stepIndex(OrderStatus.Preparing)).toBe(1);
    expect(stepIndex(OrderStatus.AlmostReady)).toBe(2);
    expect(stepIndex(OrderStatus.Ready)).toBe(3);
  });
});

describe('orderStatusApiPath', () => {
  it('is unprefixed in Armenian and prefixed in the other two', () => {
    expect(orderStatusApiPath('hy', 'abc')).toBe('/orders/abc/status');
    expect(orderStatusApiPath('ru', 'abc')).toBe('/ru/orders/abc/status');
    expect(orderStatusApiPath('en', 'abc')).toBe('/en/orders/abc/status');
  });
});

/**
 * Source guards, in the manner of `basket-count.spec.ts`: the point of this
 * module is a page that changes without reloading, and none of that shows up
 * in a unit test of the helpers.
 */
describe('the tracking page', () => {
  it('watches the order rather than re-running itself on a timer', () => {
    const page = readFileSync(trackingPage, 'utf8');
    expect(page).toContain('<OrderLive');
    expect(page).toContain('endpoint={orderStatusApiPath(language, order.id)}');
    // The old mechanism: a blind `router.refresh()` every ten seconds, which
    // rebuilt the whole tree to change one word.
    expect(page).not.toContain('OrderRefresh');
  });

  it('draws the steps server-side too, so a page without JavaScript still has them', () => {
    const steps = readFileSync(join(components, 'OrderSteps.tsx'), 'utf8');
    // The server's status is a prop, not something fetched on mount: a client
    // component still renders in the HTML, and it must render the truth there.
    expect(steps).toMatch(/live\?\.status \?\? status/);
    expect(steps).toContain('className="steps"');
  });

  it('says the new step out loud, since nothing reloads to announce it', () => {
    const steps = readFileSync(join(components, 'OrderSteps.tsx'), 'utf8');
    expect(steps).toContain('aria-live="polite"');
  });

  it('re-runs the server component on news, and not on the clock', () => {
    const watcher = readFileSync(join(components, 'OrderLive.tsx'), 'utf8');
    // Whether the order can still be cancelled, which headline it gets and what
    // time it says the food arrives are the server's to decide — patching those
    // from here would be a second source of truth. Doing it on every poll,
    // where `secondsLeft` always differs, would be the old behaviour back.
    expect(watcher).toContain('const news = !sameOrder(previous, next)');
    expect(watcher).toMatch(/if \(news\) \{\s*router\.refresh\(\);/);
  });

  it('stops asking once the order can no longer move', () => {
    const watcher = readFileSync(join(components, 'OrderLive.tsx'), 'utf8');
    expect(watcher).toMatch(/if \(!isLive\(live\.status\)\)/);
  });

  it('asks often enough to be worth calling live', () => {
    // Slower than the ten seconds this replaced would have been a refactor with
    // no visible effect.
    expect(ORDER_POLL_MS).toBeLessThanOrEqual(5_000);
  });
});

describe('the status route', () => {
  it('answers the three fields the socket pushes, and no more of the order', () => {
    const live = readFileSync(join(here, 'order-live.ts'), 'utf8');
    expect(live).toContain('status: order.status');
    expect(live).toContain('secondsLeft: order.secondsLeft');
    expect(live).toContain('readyAt: order.readyAt');
    // Not the pickup code, the lines or the total: none of them can change
    // under the reader, and sending them again every five seconds is waste.
    expect(live).not.toContain('pickupCode');
    expect(live).not.toContain('totalAmd');
  });

  it('refreshes an expired token instead of letting the tracker die quietly', () => {
    const live = readFileSync(join(here, 'order-live.ts'), 'utf8');
    // Fifteen-minute tokens against a page open for as long as food takes.
    // Through the shared rotation, not `api.refresh` directly, so this poll and
    // a reload cannot spend one single-use token twice.
    expect(live).toContain('refreshTokens(session.refreshToken)');
    expect(live).not.toContain('api.refresh(');
    expect(live).toContain('writeSession(');
  });

  it('is never cached — a cached status is the frozen tracker in another form', () => {
    const route = readFileSync(statusRoute, 'utf8');
    expect(route).toContain("export const dynamic = 'force-dynamic'");
  });
});
