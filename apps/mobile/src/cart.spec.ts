import { cartReducer, type CartState } from './cart';

const EMPTY: CartState = { branchId: null, restaurantName: null, lines: [] };

const burger = { menuItemId: 'burger', name: 'Burger', priceAmd: 5800 };
const fries = { menuItemId: 'fries', name: 'Fries', priceAmd: 1200 };

const add = (state: CartState, line = burger, branchId = 'branch-1', restaurantName = 'Sunny') =>
  cartReducer(state, { type: 'add', branchId, restaurantName, line });

describe('adding', () => {
  it('starts a basket at the restaurant the dish came from', () => {
    const state = add(EMPTY);

    expect(state.branchId).toBe('branch-1');
    expect(state.restaurantName).toBe('Sunny');
    expect(state.lines).toEqual([{ ...burger, qty: 1 }]);
  });

  it('increments an existing line instead of duplicating it', () => {
    // The API rejects the same dish twice in one basket, so merging here is
    // not cosmetic — a duplicated line would be a 400 at checkout.
    const state = add(add(EMPTY));

    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.qty).toBe(2);
  });

  it('keeps separate dishes as separate lines', () => {
    const state = add(add(EMPTY), fries);

    expect(state.lines.map((line) => line.menuItemId)).toEqual(['burger', 'fries']);
  });

  it('replaces the basket when the dish is from another restaurant', () => {
    // A basket belongs to one restaurant (BUSINESS_LOGIC.md §4). The screen
    // asks first; this is what carrying out "yes" looks like.
    const state = add(add(EMPTY), fries, 'branch-2', 'Greenhouse');

    expect(state.branchId).toBe('branch-2');
    expect(state.restaurantName).toBe('Greenhouse');
    expect(state.lines).toEqual([{ ...fries, qty: 1 }]);
  });
});

describe('quantities', () => {
  it('sets a quantity', () => {
    const state = cartReducer(add(EMPTY), { type: 'setQty', menuItemId: 'burger', qty: 4 });

    expect(state.lines[0]?.qty).toBe(4);
  });

  it('removes a line at zero', () => {
    const withBoth = add(add(EMPTY), fries);
    const state = cartReducer(withBoth, { type: 'setQty', menuItemId: 'burger', qty: 0 });

    expect(state.lines.map((line) => line.menuItemId)).toEqual(['fries']);
  });

  it('forgets the restaurant once the last line goes', () => {
    // Otherwise an empty basket would still claim a branch and the next dish
    // from elsewhere would trigger a pointless "start a new basket?" prompt.
    const state = cartReducer(add(EMPTY), { type: 'setQty', menuItemId: 'burger', qty: 0 });

    expect(state).toEqual(EMPTY);
  });

  it('ignores a quantity change for a dish that is not in the basket', () => {
    const before = add(EMPTY);
    const after = cartReducer(before, { type: 'setQty', menuItemId: 'sushi', qty: 3 });

    expect(after.lines).toEqual(before.lines);
  });
});

describe('clearing', () => {
  it('empties everything', () => {
    expect(cartReducer(add(EMPTY), { type: 'clear' })).toEqual(EMPTY);
  });
});
