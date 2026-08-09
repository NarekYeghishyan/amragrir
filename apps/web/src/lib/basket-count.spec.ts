import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noBasketCount, readBasketCount, subscribeToBasketCount } from './basket-count';

const here = dirname(fileURLToPath(import.meta.url));
const components = join(here, '..', 'components');

/**
 * A browser, to the extent this module uses one: a cookie string and somewhere
 * to hang listeners. `window.setInterval` delegates to the global so vitest's
 * fake timers drive it.
 */
function stubBrowser(cookie: string) {
  const listeners = new Map<string, Set<() => void>>();
  const add = (type: string, fn: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  };
  const remove = (type: string, fn: () => void) => listeners.get(type)?.delete(fn);
  const doc = { cookie, addEventListener: add, removeEventListener: remove };

  Object.assign(globalThis, {
    document: doc,
    window: {
      addEventListener: add,
      removeEventListener: remove,
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (id: number) => clearInterval(id),
    },
  });

  return {
    set: (value: string) => {
      doc.cookie = value;
    },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
});

describe('readBasketCount', () => {
  it('is zero on the server, where there is no cookie to read', () => {
    expect(readBasketCount()).toBe(0);
    expect(noBasketCount()).toBe(0);
  });

  it('reads the count out of a crowded cookie jar', () => {
    stubBrowser('amr_theme=dark; amr_n=7; other=1');
    expect(readBasketCount()).toBe(7);
  });

  it('reads it first in the jar too', () => {
    stubBrowser('amr_n=2; amr_theme=dark');
    expect(readBasketCount()).toBe(2);
  });

  it('is zero once the cookie is deleted — which is how emptying the basket reads', () => {
    stubBrowser('amr_theme=dark');
    expect(readBasketCount()).toBe(0);
  });

  it('does not match a cookie whose name merely ends in the same letters', () => {
    stubBrowser('xamr_n=9');
    expect(readBasketCount()).toBe(0);
  });
});

describe('subscribeToBasketCount', () => {
  it('reports a change, and only a change', () => {
    vi.useFakeTimers();
    const browser = stubBrowser('amr_n=2');
    const onChange = vi.fn();
    const unsubscribe = subscribeToBasketCount(onChange);

    // A basket nobody is touching must not wake React four times a second.
    vi.advanceTimersByTime(2000);
    expect(onChange).not.toHaveBeenCalled();

    // What a Server Action's `Set-Cookie` looks like from in here.
    browser.set('amr_n=3');
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    browser.set('amr_n=4');
    vi.advanceTimersByTime(2000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(browser.listenerCount()).toBe(0);
  });

  it('notices an emptied basket', () => {
    vi.useFakeTimers();
    const browser = stubBrowser('amr_n=3');
    const onChange = vi.fn();
    const unsubscribe = subscribeToBasketCount(onChange);

    browser.set('');
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(readBasketCount()).toBe(0);
    unsubscribe();
  });

  it('answers a tab coming back without waiting for the next tick', () => {
    vi.useFakeTimers();
    const browser = stubBrowser('amr_n=1');
    const onChange = vi.fn();
    const unsubscribe = subscribeToBasketCount(onChange);

    browser.set('amr_n=5');
    browser.fire('focus');
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

/**
 * Source guards, in the manner of `theme.spec.ts`: these two are the shape of
 * the bugs this module was written to end, and neither shows up in a unit test
 * of the module itself.
 */
describe('the controls that watch the basket', () => {
  it('read the count through this module rather than parsing the cookie again', () => {
    const button = readFileSync(join(components, 'BasketButton.tsx'), 'utf8');
    expect(button).toMatch(/from '@\/lib\/basket-count'/);
    // A second copy of the regex is a second thing to keep in step with the
    // cookie's name.
    expect(button).not.toContain('document.cookie');
  });

  it('does not let the order panel draw "empty" before it has been told', () => {
    const panel = readFileSync(join(components, 'OrderPanel.tsx'), 'utf8');
    // `null` is "not asked yet". Rendering the empty state from it claimed an
    // empty basket on every first paint and for a second after every press of
    // `＋`. The empty block must hang off an explicit `'empty'`, whatever the
    // thing being rendered from is called.
    expect(panel).not.toMatch(/=== null \|\| \w+\.state === 'empty'/);
    expect(panel).toMatch(/\w+\?\.state === 'empty'/);
  });

  it('refetches the panel when the basket changes, since no event says so', () => {
    const panel = readFileSync(join(components, 'OrderPanel.tsx'), 'utf8');
    expect(panel).toMatch(/\[endpoint, branchId, count\]/);
  });
});
