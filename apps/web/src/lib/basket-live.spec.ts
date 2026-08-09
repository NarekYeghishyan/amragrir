import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alreadyPublished, lastBasket, publishBasket, subscribeBasket } from './basket-live';
import type { BasketPanel } from './basket-panel';

/**
 * The hand-off between the two controls that change a basket on a restaurant
 * page — the `＋` on a dish card and the order panel beside the menu. They are
 * nowhere near each other in the tree, and what passes between them is the
 * priced basket the write itself answered with.
 */

const panel = (total: string): BasketPanel => ({
  state: 'filled',
  restaurantName: 'Lavash',
  lines: [{ menuItemId: 'a', name: 'Lula Kebab', each: '4 800 ֏', qty: 1 }],
  subtotal: total,
  serviceFee: '360 ֏',
  total,
  canOrder: true,
});

beforeEach(() => {
  Object.assign(globalThis, { document: { cookie: 'amr_n=1' } });
});

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('publishBasket', () => {
  it('hands the new basket to everything watching, naming the branch', () => {
    const seen = vi.fn();
    const stop = subscribeBasket(seen);

    publishBasket('branch-1', panel('5 160 ֏'));
    expect(seen).toHaveBeenCalledWith('branch-1');
    expect(lastBasket('branch-1')).toMatchObject({ total: '5 160 ֏' });

    stop();
    publishBasket('branch-1', panel('9 999 ֏'));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('keeps branches apart — a panel must not take another kitchen’s basket', () => {
    publishBasket('branch-1', panel('5 160 ֏'));
    expect(lastBasket('branch-2')).toBeNull();
  });

  it('is null for a branch nothing has said anything about', () => {
    expect(lastBasket('never-seen')).toBeNull();
  });
});

/**
 * The panel also refetches whenever the count cookie moves, which is how a
 * change made in another tab reaches it. Its own writes must not go round that
 * way as well: that is a second request for an answer it already has, and two
 * of them in flight at once can land out of order and put the quantity back.
 */
describe('alreadyPublished', () => {
  it('claims the count its own publish just made true', () => {
    (globalThis as { document: { cookie: string } }).document.cookie = 'amr_n=4';
    publishBasket('branch-1', panel('5 160 ֏'));
    expect(alreadyPublished(4)).toBe(true);
  });

  it('claims nothing else, so another tab is still heard', () => {
    (globalThis as { document: { cookie: string } }).document.cookie = 'amr_n=4';
    publishBasket('branch-1', panel('5 160 ֏'));
    expect(alreadyPublished(5)).toBe(false);
    expect(alreadyPublished(0)).toBe(false);
  });
});
