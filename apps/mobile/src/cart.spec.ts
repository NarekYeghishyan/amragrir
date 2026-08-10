import { PickupOption, ServiceMode } from '@amragrir/shared';
import { cartReducer, type CartLine, type CartState } from './cart';

const EMPTY: CartState = {
  branchId: null,
  restaurantName: null,
  lines: [],
  serviceMode: ServiceMode.Pickup,
  pickupOption: null,
  reservationId: null,
  readyAt: null,
};

// One with a photograph and one without: every seeded dish has one, but the
// column is nullable and the basket has to render either.
const burger = {
  menuItemId: 'burger',
  name: 'Burger',
  priceAmd: 5800,
  photoUrl: 'https://example.test/burger.jpg',
};
const fries = { menuItemId: 'fries', name: 'Fries', priceAmd: 1200, photoUrl: null };

const add = (
  state: CartState,
  line: Omit<CartLine, 'qty'> = burger,
  branchId = 'branch-1',
  restaurantName = 'Sunny',
) =>
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

describe('the pickup ending', () => {
  const chooseEatIn = (state: CartState) =>
    cartReducer(state, { type: 'setPickupOption', pickupOption: PickupOption.EatIn });

  it('starts unchosen, which the API reads as take-away', () => {
    // The whole reason it is nullable: a basket nobody made a choice in must
    // send the request this app has always sent.
    expect(add(EMPTY).pickupOption).toBeNull();
  });

  it('is remembered while the basket is', () => {
    const state = cartReducer(chooseEatIn(add(EMPTY)), {
      type: 'add',
      branchId: 'branch-1',
      restaurantName: 'Sunny',
      line: fries,
    });

    expect(state.pickupOption).toBe(PickupOption.EatIn);
  });

  it('goes when the basket starts again at another restaurant', () => {
    // The new restaurant may not offer eating in — carrying the choice across
    // would send an order the API refuses.
    const elsewhere = cartReducer(chooseEatIn(add(EMPTY)), {
      type: 'add',
      branchId: 'branch-2',
      restaurantName: 'Greenhouse',
      line: burger,
    });

    expect(elsewhere.pickupOption).toBeNull();
  });

  it('goes with the last line, and with a clear', () => {
    const emptied = cartReducer(chooseEatIn(add(EMPTY)), {
      type: 'setQty',
      menuItemId: 'burger',
      qty: 0,
    });

    expect(emptied).toEqual(EMPTY);
    expect(cartReducer(chooseEatIn(add(EMPTY)), { type: 'clear' })).toEqual(EMPTY);
  });
});

describe('pickup or a booked table', () => {
  const dineIn = (state: CartState) =>
    cartReducer(state, { type: 'setServiceMode', serviceMode: ServiceMode.DineIn });
  const booked = (state: CartState, reservationId = 'res-1') =>
    cartReducer(state, { type: 'setReservation', reservationId });

  it('starts as pickup, which is what the app used to send unconditionally', () => {
    expect(add(EMPTY).serviceMode).toBe(ServiceMode.Pickup);
    expect(add(EMPTY).reservationId).toBeNull();
  });

  it('keeps the table while the basket stays dine-in', () => {
    const state = booked(dineIn(add(EMPTY)));

    expect(state.serviceMode).toBe(ServiceMode.DineIn);
    expect(state.reservationId).toBe('res-1');
  });

  it('drops the table when the customer goes back to pickup', () => {
    // Not tidiness: a pickup order carrying a reservation id is refused by the
    // API, and a table left attached is a table held for somebody who has
    // decided not to sit at it.
    const state = cartReducer(booked(dineIn(add(EMPTY))), {
      type: 'setServiceMode',
      serviceMode: ServiceMode.Pickup,
    });

    expect(state.reservationId).toBeNull();
  });

  it('drops the chosen time with every change of mode', () => {
    // The time means a different thing in each mode — the table's hour on one
    // side, a slot off the pickup grid on the other — so carrying it across
    // would cook food for a table nobody booked.
    const pickupTime = cartReducer(add(EMPTY), {
      type: 'setReadyAt',
      readyAt: '2026-08-04T15:30:00.000Z',
    });

    expect(dineIn(pickupTime).readyAt).toBeNull();

    const tableTime = cartReducer(booked(dineIn(add(EMPTY))), {
      type: 'setReadyAt',
      readyAt: '2026-08-05T15:30:00.000Z',
    });
    const backToPickup = cartReducer(tableTime, {
      type: 'setServiceMode',
      serviceMode: ServiceMode.Pickup,
    });

    expect(backToPickup.readyAt).toBeNull();
    expect(backToPickup.reservationId).toBeNull();
  });

  it('drops the table when the basket starts again at another restaurant', () => {
    // A table at the old branch is not a table at this one.
    const elsewhere = cartReducer(booked(dineIn(add(EMPTY))), {
      type: 'add',
      branchId: 'branch-2',
      restaurantName: 'Greenhouse',
      line: burger,
    });

    expect(elsewhere.reservationId).toBeNull();
    expect(elsewhere.serviceMode).toBe(ServiceMode.Pickup);
  });
});

describe('the chosen ready time', () => {
  const at = '2026-08-04T15:30:00.000Z';

  it('starts unchosen, which the API reads as as-soon-as-possible', () => {
    expect(add(EMPTY).readyAt).toBeNull();
  });

  it('can be chosen and then given back', () => {
    const chosen = cartReducer(add(EMPTY), { type: 'setReadyAt', readyAt: at });

    expect(chosen.readyAt).toBe(at);
    expect(cartReducer(chosen, { type: 'setReadyAt', readyAt: null }).readyAt).toBeNull();
  });

  it('goes when the basket starts again at another restaurant', () => {
    // It was a slot in the old kitchen's queue, not this one's.
    const chosen = cartReducer(add(EMPTY), { type: 'setReadyAt', readyAt: at });
    const elsewhere = cartReducer(chosen, {
      type: 'add',
      branchId: 'branch-2',
      restaurantName: 'Greenhouse',
      line: burger,
    });

    expect(elsewhere.readyAt).toBeNull();
  });
});

/**
 * Putting a past order back in the basket.
 *
 * The button that does this said "Reorder" and opened the tracking screen for
 * as long as the screen existed. What it needs from the basket is a single
 * replacement rather than a run of `add`s, which would each have to notice they
 * were starting a new basket.
 */
describe('reordering', () => {
  const previous: CartLine[] = [
    { ...burger, qty: 2 },
    { ...fries, qty: 1 },
  ];

  it('fills an empty basket with the whole order at once', () => {
    const state = cartReducer(EMPTY, {
      type: 'refill',
      branchId: 'branch-1',
      restaurantName: 'Sunny',
      lines: previous,
    });

    expect(state.branchId).toBe('branch-1');
    expect(state.restaurantName).toBe('Sunny');
    expect(state.lines).toEqual(previous);
  });

  it('keeps the quantities, which is what makes it the same order', () => {
    const state = cartReducer(EMPTY, {
      type: 'refill',
      branchId: 'branch-1',
      restaurantName: 'Sunny',
      lines: previous,
    });

    expect(state.lines.map((line) => line.qty)).toEqual([2, 1]);
  });

  it('replaces whatever was there rather than mixing two restaurants', () => {
    // One basket, one kitchen (BUSINESS_LOGIC.md §4). The screen asks first;
    // this carries the answer out.
    const busy = add(EMPTY, fries, 'branch-9', 'Elsewhere');
    const state = cartReducer(busy, {
      type: 'refill',
      branchId: 'branch-1',
      restaurantName: 'Sunny',
      lines: [{ ...burger, qty: 1 }],
    });

    expect(state.branchId).toBe('branch-1');
    expect(state.lines).toEqual([{ ...burger, qty: 1 }]);
  });

  it('forgets the mode, the ending, the table and the time', () => {
    // Every one of those was an answer about a different order. A dine-in
    // basket carrying the old booking would send an order pointing at a table
    // somebody else's evening was built around.
    const dining = cartReducer(
      cartReducer(add(EMPTY), { type: 'setServiceMode', serviceMode: ServiceMode.DineIn }),
      { type: 'setReservation', reservationId: 'res-1' },
    );
    const state = cartReducer(dining, {
      type: 'refill',
      branchId: 'branch-1',
      restaurantName: 'Sunny',
      lines: previous,
    });

    expect(state.serviceMode).toBe(ServiceMode.Pickup);
    expect(state.reservationId).toBeNull();
    expect(state.pickupOption).toBeNull();
    expect(state.readyAt).toBeNull();
  });
});
