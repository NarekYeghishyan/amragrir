import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { remainingSeconds } from './countdown';
import { formatCountdown } from './format';

const here = dirname(fileURLToPath(import.meta.url));
const components = join(here, '..', 'components');
const trackingPage = join(here, '..', 'app', '[lang]', 'orders', '[id]', 'page.tsx');

describe('remainingSeconds', () => {
  it('is the server value until any time has passed', () => {
    // The first client render has to be the markup that arrived, or hydration
    // reconciles a countdown that was never wrong.
    expect(remainingSeconds(480, 0)).toBe(480);
  });

  it('counts down a second at a time', () => {
    expect(remainingSeconds(480, 1000)).toBe(479);
    expect(remainingSeconds(480, 5000)).toBe(475);
    expect(formatCountdown(remainingSeconds(480, 5000))).toBe('7:55');
  });

  it('holds the second it is on until the clock has actually left it', () => {
    expect(remainingSeconds(480, 400)).toBe(480);
    expect(remainingSeconds(480, 1400)).toBe(479);
  });

  it('catches up in one step after a throttled or sleeping tab', () => {
    // A background tab fires this about once a minute; a laptop that was shut
    // fires it not at all. Both come back to the right number rather than to
    // however many ticks they managed.
    expect(remainingSeconds(480, 90_000)).toBe(390);
    expect(remainingSeconds(480, 300_000)).toBe(180);
  });

  it('stops at zero rather than counting into the negative', () => {
    expect(remainingSeconds(30, 45_000)).toBe(0);
    expect(formatCountdown(remainingSeconds(30, 45_000))).toBe('0:00');
  });

  it('ignores a clock that stepped backwards', () => {
    // An NTP correction mid-order must not add time to the countdown.
    expect(remainingSeconds(480, -20_000)).toBe(480);
  });
});

/**
 * Source guards, in the manner of `basket-count.spec.ts`: what this component
 * exists to do is invisible to a unit test of the arithmetic alone.
 */
describe('the tracking countdown', () => {
  it('ticks in the browser rather than only on the poll', () => {
    const page = readFileSync(trackingPage, 'utf8');
    expect(page).toContain('<Countdown seconds={order.secondsLeft} />');
    // Rendering the value straight from the server is the thing that made the
    // number stand still for ten seconds and then drop ten.
    expect(page).not.toContain('formatCountdown');
  });

  it('does not replace the watcher that owns the status', () => {
    const page = readFileSync(trackingPage, 'utf8');
    expect(page).toContain('<OrderLive');
  });

  it('re-syncs from the watcher rather than free-running to zero', () => {
    const countdown = readFileSync(join(components, 'Countdown.tsx'), 'utf8');
    // A kitchen that pushes `readyAt` back is the case this exists for: without
    // it the clock runs out and sits at 0:00 until the status happens to move.
    expect(countdown).toContain('useLiveOrder');
    expect(countdown).toMatch(/secondsLeft \?\? seconds/);
  });

  it('measures elapsed time off the clock instead of decrementing per tick', () => {
    const countdown = readFileSync(join(components, 'Countdown.tsx'), 'utf8');
    expect(countdown).toContain('Date.now() - startedAt');
    expect(countdown).not.toMatch(/value - 1|seconds - 1|-= 1|--\)/);
  });

  it('reads no clock while rendering, so the first paint matches the server', () => {
    const countdown = readFileSync(join(components, 'Countdown.tsx'), 'utf8');
    // `Date.now()` above the effect would give the browser a different first
    // render than the HTML it is hydrating.
    expect(countdown.indexOf('Date.now()')).toBeGreaterThan(countdown.indexOf('useEffect('));
  });
});
