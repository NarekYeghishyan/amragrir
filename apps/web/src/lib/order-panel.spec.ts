import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyQtyLocally, bookTableState } from './order-panel';
import type { BasketPanel } from './basket-panel';

const here = dirname(fileURLToPath(import.meta.url));
const components = join(here, '..', 'components');

const filled: BasketPanel = {
  state: 'filled',
  restaurantName: 'Lavash',
  lines: [
    { menuItemId: 'a', name: 'Lula Kebab', each: '4 800 ֏', qty: 2 },
    { menuItemId: 'b', name: 'Tan', each: '700 ֏', qty: 3 },
  ],
  subtotal: '11 700 ֏',
  serviceFee: '360 ֏',
  total: '12 060 ֏',
  canOrder: true,
};

/**
 * The quantity moves on the frame it is pressed; the money does not move until
 * the server has re-priced it. That division is the whole of this function, and
 * getting it wrong would put a computed price in front of a customer.
 */
describe('applyQtyLocally', () => {
  it('moves the line that was pressed', () => {
    const next = applyQtyLocally(filled, { menuItemId: 'a', qty: 3 });
    expect(next).toMatchObject({ state: 'filled' });
    expect((next as typeof filled).lines.map((l) => [l.menuItemId, l.qty])).toEqual([
      ['a', 3],
      ['b', 3],
    ]);
  });

  it('touches no amount — every one of them is the server\'s', () => {
    const next = applyQtyLocally(filled, { menuItemId: 'a', qty: 9 }) as typeof filled;
    expect(next.subtotal).toBe(filled.subtotal);
    expect(next.serviceFee).toBe(filled.serviceFee);
    expect(next.total).toBe(filled.total);
    // Not even the per-unit price, which is the one that looks safe to scale.
    expect(next.lines.map((l) => l.each)).toEqual(['4 800 ֏', '700 ֏']);
  });

  it('drops a line taken to zero', () => {
    const next = applyQtyLocally(filled, { menuItemId: 'b', qty: 0 }) as typeof filled;
    expect(next.lines.map((l) => l.menuItemId)).toEqual(['a']);
  });

  it('is empty once the last line goes, which needs no asking', () => {
    const one = applyQtyLocally(filled, { menuItemId: 'b', qty: 0 });
    expect(applyQtyLocally(one, { menuItemId: 'a', qty: 0 })).toEqual({ state: 'empty' });
  });

  it('leaves a basket it cannot reason about alone', () => {
    expect(applyQtyLocally(null, { menuItemId: 'a', qty: 2 })).toBeNull();
    const elsewhere: BasketPanel = { state: 'elsewhere', restaurantName: 'Dolmama' };
    expect(applyQtyLocally(elsewhere, { menuItemId: 'a', qty: 2 })).toBe(elsewhere);
  });

  it('does not mutate what it was given', () => {
    applyQtyLocally(filled, { menuItemId: 'a', qty: 7 });
    expect(filled.lines[0]!.qty).toBe(2);
  });
});

/**
 * Source guards. The live path exists to avoid a route rebuild for a `＋`; the
 * form under it exists so the same press works with JavaScript off. Losing the
 * second while polishing the first would be silent — every test and every
 * browser we look at has JavaScript.
 */
describe('the basket controls on a restaurant page', () => {
  it('keeps a real form posting a Server Action under the dish ＋', () => {
    const add = readFileSync(join(components, 'AddDish.tsx'), 'utf8');
    expect(add).toMatch(/<form\s+action=\{addToBasket\}/);
    // The live path may only be taken once React is driving; before that the
    // browser's own submit has to be left alone.
    expect(add).toMatch(/if \(!scripted\) return;/);
  });

  it('keeps one under each stepper in the panel', () => {
    const panel = readFileSync(join(components, 'OrderPanel.tsx'), 'utf8');
    expect(panel.match(/<form\s+action=\{changeLineQty\}/g)).toHaveLength(2);
    expect(panel.match(/if \(!scripted\) return;/g)).toHaveLength(2);
  });

  it('does not let the live writes revalidate or redirect', () => {
    const actions = readFileSync(join(here, '..', 'app', '[lang]', 'actions.ts'), 'utf8');
    const live = actions.slice(
      actions.indexOf('export async function addToBasketLive'),
      actions.indexOf('export async function changeLineQty(' ),
    );
    expect(live).not.toContain('revalidatePath');
    // A redirect is a route rebuild, which is the entire thing these avoid.
    expect(live).not.toMatch(/\bredirect\(/);
  });
});

/**
 * The rule that decides whether a restaurant page mentions its tables at all.
 *
 * It has been wrong in both directions. It was once gated on the basket having
 * something in it, so a restaurant that takes bookings looked like one that does
 * not until somebody had already chosen a dish — the one moment they are no
 * longer deciding where to eat. Then the button was drawn but `disabled` in that
 * state, which said "we take bookings" and "you cannot book" with the same
 * control. Both were really the same limitation: the checkout prices a basket,
 * and `POST /cart/quote` refuses one with no lines.
 *
 * The checkout draws a booking without a quote now, so the basket has stopped
 * being part of this question and only the restaurant's own answer remains.
 */
describe('bookTableState', () => {
  it('offers the table wherever the restaurant takes bookings', () => {
    // Whatever is or is not in the basket: the press lands on the checkout
    // either way, which draws a booking with a quote or without one.
    expect(bookTableState(true)).toBe('ready');
  });

  it('says nothing about tables where there are none', () => {
    expect(bookTableState(false)).toBe('hidden');
  });
});
