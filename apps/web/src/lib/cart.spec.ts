import { describe, expect, it } from 'vitest';
import { ORDER_MAX_ITEM_QTY, ORDER_MAX_LINES, ServiceMode } from '@amragrir/shared';
import {
  addItem,
  itemCount,
  parseCart,
  removeItem,
  serialiseCart,
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
});

describe('toBasket', () => {
  it('sends ids and quantities and nothing else', () => {
    const basket = toBasket({ ...BASE, couponCode: 'SAVE', readyAt: '2026-08-03T10:00:00.000Z' });
    expect(basket).toEqual({
      branchId: 'branch-1',
      serviceMode: ServiceMode.Pickup,
      items: [{ menuItemId: 'dish-1', qty: 2 }],
      couponCode: 'SAVE',
    });
    // `readyAt` belongs to the order, not the quote, and no price is ever sent.
    expect(basket).not.toHaveProperty('readyAt');
    expect(JSON.stringify(basket)).not.toMatch(/Amd/i);
  });
});

describe('itemCount and removeItem', () => {
  it('counts dishes, not lines', () => {
    expect(itemCount({ ...BASE, items: [{ menuItemId: 'a', qty: 2 }, { menuItemId: 'b', qty: 3 }] })).toBe(5);
  });

  it('removes a line by id', () => {
    expect(removeItem(BASE, 'dish-1').items).toEqual([]);
  });
});
