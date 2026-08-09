import { describe, expect, it } from 'vitest';
import {
  ORDER_MAX_ITEM_QTY,
  ORDER_MAX_LINES,
  PickupOption,
  BOOKING_POLICY_LIMITS,
  ServiceMode,
} from '@amragrir/shared';
import {
  addItem,
  itemCount,
  parseCart,
  removeItem,
  serialiseCart,
  setPickupOption,
  setQty,
  setServiceMode,
  toBasket,
  type Cart,
} from './cart';

const BASE: Cart = {
  branchId: 'branch-1',
  slug: 'green-bean',
  serviceMode: ServiceMode.Pickup,
  items: [{ menuItemId: 'dish-1', qty: 2 }],
  nonce: 'nonce-1',
};

describe('parseCart', () => {
  it('round-trips a basket', () => {
    expect(parseCart(serialiseCart(BASE))).toEqual(BASE);
  });

  it('treats a missing or unreadable cookie as no basket', () => {
    expect(parseCart(undefined)).toBeNull();
    expect(parseCart('not json')).toBeNull();
    expect(parseCart('null')).toBeNull();
  });

  // The cookie is httpOnly, so a page cannot write it — but a person with
  // devtools can, and these are the bounds `apps/api/src/orders/dto.ts`
  // enforces. Rejecting here means the refusal is not a surprise at checkout.
  it('rejects a quantity above the cap the API enforces', () => {
    const tampered = { ...BASE, items: [{ menuItemId: 'dish-1', qty: ORDER_MAX_ITEM_QTY + 1 }] };
    expect(parseCart(JSON.stringify(tampered))).toBeNull();
  });

  it('rejects a zero or fractional quantity', () => {
    expect(parseCart(JSON.stringify({ ...BASE, items: [{ menuItemId: 'd', qty: 0 }] }))).toBeNull();
    expect(
      parseCart(JSON.stringify({ ...BASE, items: [{ menuItemId: 'd', qty: 1.5 }] })),
    ).toBeNull();
  });

  it('rejects more lines than an order may have', () => {
    const items = Array.from({ length: ORDER_MAX_LINES + 1 }, (_, index) => ({
      menuItemId: `dish-${index}`,
      qty: 1,
    }));
    expect(parseCart(JSON.stringify({ ...BASE, items }))).toBeNull();
  });

  it('rejects a service mode that is not one of ours', () => {
    expect(parseCart(JSON.stringify({ ...BASE, serviceMode: 'delivery' }))).toBeNull();
  });

  it('replaces a missing nonce rather than dropping the basket', () => {
    const { nonce: _absent, ...withoutNonce } = BASE;
    const parsed = parseCart(JSON.stringify(withoutNonce));
    expect(parsed?.items).toEqual(BASE.items);
    expect(parsed?.nonce).toBeTruthy();
  });
});

describe('addItem', () => {
  it('adds a new line, then increments it', () => {
    const first = addItem(null, { branchId: 'b1', slug: 's', menuItemId: 'd1' });
    expect(first.items).toEqual([{ menuItemId: 'd1', qty: 1 }]);

    const second = addItem(first, { branchId: 'b1', slug: 's', menuItemId: 'd1' });
    expect(second.items).toEqual([{ menuItemId: 'd1', qty: 2 }]);
  });

  // Items from two restaurants must never share a basket (AI_CONTEXT.md).
  it('starts a new basket when the branch changes', () => {
    const replaced = addItem(BASE, { branchId: 'branch-2', slug: 'other', menuItemId: 'dish-9' });
    expect(replaced.branchId).toBe('branch-2');
    expect(replaced.slug).toBe('other');
    expect(replaced.items).toEqual([{ menuItemId: 'dish-9', qty: 1 }]);
  });

  it('gives a new basket its own nonce, so two orders cannot share a key', () => {
    const replaced = addItem(BASE, { branchId: 'branch-2', slug: 'other', menuItemId: 'dish-9' });
    expect(replaced.nonce).not.toBe(BASE.nonce);
  });

  it('refuses to grow past the line limit', () => {
    const full: Cart = {
      ...BASE,
      items: Array.from({ length: ORDER_MAX_LINES }, (_, index) => ({
        menuItemId: `dish-${index}`,
        qty: 1,
      })),
    };
    expect(addItem(full, { branchId: 'branch-1', slug: 'green-bean', menuItemId: 'extra' })).toBe(
      full,
    );
  });
});

describe('setQty', () => {
  it('clamps rather than rejecting, so holding + stops at the cap', () => {
    expect(setQty(BASE, 'dish-1', 999).items[0]?.qty).toBe(ORDER_MAX_ITEM_QTY);
  });

  it('removes the line at zero', () => {
    expect(setQty(BASE, 'dish-1', 0).items).toEqual([]);
  });
});

describe('setServiceMode', () => {
  // A pickup order attached to a table would be an order nobody is sitting for,
  // and `POST /orders` refuses the pair anyway.
  it('drops the booking when leaving dine-in', () => {
    const booked: Cart = { ...BASE, serviceMode: ServiceMode.DineIn, reservationId: 'res-1' };
    expect(setServiceMode(booked, ServiceMode.Pickup).reservationId).toBeUndefined();
  });

  it('keeps the booking when staying dine-in', () => {
    const booked: Cart = { ...BASE, serviceMode: ServiceMode.DineIn, reservationId: 'res-1' };
    expect(setServiceMode(booked, ServiceMode.DineIn).reservationId).toBe('res-1');
  });

  // The mirror image: food brought to a table is neither taken away nor
  // collected, and the API refuses a basket carrying both.
  it('drops the pickup ending when switching to dine-in', () => {
    const eating: Cart = { ...BASE, pickupOption: PickupOption.EatIn };
    expect(setServiceMode(eating, ServiceMode.DineIn).pickupOption).toBeUndefined();
  });

  it('comes back to pickup on take-away rather than a remembered choice', () => {
    // The restaurant may have withdrawn the option in the meantime; absent is
    // what the API reads as take-away.
    const eating: Cart = { ...BASE, pickupOption: PickupOption.EatIn };
    const there = setServiceMode(eating, ServiceMode.DineIn);
    expect(setServiceMode(there, ServiceMode.Pickup).pickupOption).toBeUndefined();
  });
});

describe('the pickup ending', () => {
  it('round-trips through the cookie, and refuses a value it does not know', () => {
    const eating: Cart = { ...BASE, pickupOption: PickupOption.EatIn };
    expect(parseCart(serialiseCart(eating))?.pickupOption).toBe(PickupOption.EatIn);

    // The cookie is httpOnly, but devtools can still write one — and an unknown
    // ending would be a 422 three screens later.
    const tampered = JSON.stringify({ ...BASE, pickupOption: 'drive_through' });
    expect(parseCart(tampered)?.pickupOption).toBeUndefined();
  });

  it('is sent on a pickup basket', () => {
    expect(toBasket(setPickupOption(BASE, PickupOption.EatIn)).pickupOption).toBe(
      PickupOption.EatIn,
    );
  });

  it('is never sent on a dine-in basket', () => {
    // Belt and braces over `setServiceMode`: a hand-written cookie can hold the
    // pair, and the API answers it with a 422 at the payment.
    const impossible: Cart = {
      ...BASE,
      serviceMode: ServiceMode.DineIn,
      pickupOption: PickupOption.EatIn,
    };
    expect(toBasket(impossible)).not.toHaveProperty('pickupOption');
  });

  it('says nothing when nothing was chosen, which the API reads as take-away', () => {
    expect(toBasket(BASE)).not.toHaveProperty('pickupOption');
  });
});

/**
 * The table somebody is *asking* for, before anything is booked.
 *
 * It is in the cookie because the checkout's date-and-time control is a native
 * `datetime-local` whose value lives only in the page — see `Cart.reservedFor`.
 */
describe('the booking being asked for', () => {
  const asking: Cart = {
    ...BASE,
    serviceMode: ServiceMode.DineIn,
    reservedFor: '2026-08-08T15:30:00.000Z',
    guests: 4,
  };

  it('round-trips through the cookie', () => {
    const parsed = parseCart(serialiseCart(asking));
    expect(parsed?.reservedFor).toBe('2026-08-08T15:30:00.000Z');
    expect(parsed?.guests).toBe(4);
  });

  // Same reasoning as the quantity bounds above: devtools can write this cookie,
  // and `POST /reservations` would refuse the party anyway.
  //
  // Bounded by the **platform ceiling**, not by a party size. How many people a
  // branch seats is that branch's setting, and this cookie does not know which
  // branch it will be spent at — clamping it at twelve here would have quietly
  // dropped the party for a hall that takes eighty.
  it('drops a party size the API would not seat', () => {
    for (const guests of [0, 2.5, BOOKING_POLICY_LIMITS.maxGuests.max + 1]) {
      expect(parseCart(JSON.stringify({ ...asking, guests }))?.guests).toBeUndefined();
    }
    // …and keeps the rest of the basket rather than dropping it whole: the
    // party is a detail of one screen, the dishes are the order.
    expect(
      parseCart(JSON.stringify({ ...asking, guests: 10_000 }))?.items,
    ).toEqual(BASE.items);
  });

  it('keeps a party that only a large branch could seat', () => {
    // Eighty is not a mistake in a cookie — it is an event at a branch whose
    // admin raised the cap, and the booking endpoint is what decides.
    expect(parseCart(JSON.stringify({ ...asking, guests: 80 }))?.guests).toBe(80);
  });

  it('goes with the booking when the mode changes', () => {
    const left = setServiceMode(asking, ServiceMode.Pickup);
    expect(left.reservedFor).toBeUndefined();
    expect(left.guests).toBeUndefined();
  });

  it('survives a mode change that stays dine-in', () => {
    const still = setServiceMode(asking, ServiceMode.DineIn);
    expect(still.reservedFor).toBe(asking.reservedFor);
    expect(still.guests).toBe(4);
  });
});

describe('toBasket', () => {
  it('sends ids and quantities and nothing else', () => {
    const basket = toBasket({
      ...BASE,
      couponCode: 'SAVE',
      readyAt: '2026-08-03T10:00:00.000Z',
      reservedFor: '2026-08-08T15:30:00.000Z',
      guests: 4,
    });
    expect(basket).toEqual({
      branchId: 'branch-1',
      serviceMode: ServiceMode.Pickup,
      items: [{ menuItemId: 'dish-1', qty: 2 }],
      couponCode: 'SAVE',
    });
    // `readyAt` belongs to the order, not the quote, and no price is ever sent.
    expect(basket).not.toHaveProperty('readyAt');
    // The other two belong to `POST /reservations`, and only once somebody has
    // pressed the button that books — a quote must never create a booking.
    expect(basket).not.toHaveProperty('reservedFor');
    expect(basket).not.toHaveProperty('guests');
    expect(JSON.stringify(basket)).not.toMatch(/Amd/i);
  });
});

describe('itemCount and removeItem', () => {
  it('counts dishes, not lines', () => {
    expect(
      itemCount({
        ...BASE,
        items: [
          { menuItemId: 'a', qty: 2 },
          { menuItemId: 'b', qty: 3 },
        ],
      }),
    ).toBe(5);
  });

  it('removes a line by id', () => {
    expect(removeItem(BASE, 'dish-1').items).toEqual([]);
  });
});
