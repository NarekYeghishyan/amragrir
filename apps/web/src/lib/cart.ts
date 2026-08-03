import { ORDER_MAX_ITEM_QTY, ORDER_MAX_LINES, ServiceMode } from '@amragrir/shared';

/**
 * The basket, and the rules about what may be in one.
 *
 * Deliberately free of `next/headers` so it can be tested without a request:
 * the cookie itself is read and written in `cart-store.ts`. This is the same
 * split `theme.ts` uses, and for the same reason — a module the server and the
 * tests can both import plainly.
 *
 * **No money is stored here.** The basket holds ids and quantities; every total
 * on every screen comes from `POST /cart/quote`. That is not a stylistic
 * choice: a price in a cookie is a price the customer can edit.
 */

export const CART_COOKIE = 'amr_cart';

/** Readable by the page, unlike the basket itself — see `cart-store.ts`. */
export const COUNT_COOKIE = 'amr_n';

export interface CartLine {
  menuItemId: string;
  qty: number;
}

export interface Cart {
  /** A basket belongs to exactly one branch — items from two restaurants must
   *  never mix (AI_CONTEXT.md). Switching branch replaces the basket. */
  branchId: string;
  /** The restaurant's slug, so the basket can link back to where it came from
   *  without a lookup. */
  slug: string;
  serviceMode: ServiceMode;
  items: CartLine[];
  /** Set once a table is booked; `dine_in` is refused without it. */
  reservationId?: string;
  couponCode?: string;
  /** Chosen ready time, ISO. Absent means "as soon as possible". */
  readyAt?: string;
  /**
   * Identifies this basket for the life of one order.
   *
   * It becomes the `Idempotency-Key` on `POST /orders` and `POST /payments`, so
   * a double-clicked Pay button — or a browser retrying a POST — produces one
   * order and one charge instead of two. Minted when a basket starts and
   * discarded with it, which is what makes the key unique per attempt rather
   * than per session.
   */
  nonce: string;
}

export const EMPTY: Cart = {
  branchId: '',
  slug: '',
  serviceMode: ServiceMode.Pickup,
  items: [],
  nonce: '',
};

export function isEmpty(cart: Cart): boolean {
  return cart.items.length === 0;
}

/** How many dishes are in the basket — the number on the header button. */
export function itemCount(cart: Cart): number {
  return cart.items.reduce((sum, line) => sum + line.qty, 0);
}

export function qtyOf(cart: Cart, menuItemId: string): number {
  return cart.items.find((line) => line.menuItemId === menuItemId)?.qty ?? 0;
}

/**
 * Parses a cookie value into a basket, or returns null.
 *
 * Every field is re-checked rather than trusted. The cookie is httpOnly, so a
 * page cannot write it — but a person with devtools can, and the bounds below
 * are the same ones `apps/api/src/orders/dto.ts` enforces. A basket that
 * violates them would be refused at `POST /orders` anyway; catching it here
 * means the refusal is not a surprise three screens later.
 */
export function parseCart(raw: string | undefined): Cart | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const candidate = parsed as Partial<Cart> | null;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof candidate.branchId !== 'string' ||
    typeof candidate.slug !== 'string' ||
    !Object.values(ServiceMode).includes(candidate.serviceMode as ServiceMode) ||
    !Array.isArray(candidate.items)
  ) {
    return null;
  }

  const items: CartLine[] = [];
  for (const line of candidate.items) {
    const { menuItemId, qty } = (line ?? {}) as Partial<CartLine>;
    if (typeof menuItemId !== 'string' || typeof qty !== 'number') {
      return null;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > ORDER_MAX_ITEM_QTY) {
      return null;
    }
    items.push({ menuItemId, qty });
  }
  if (items.length > ORDER_MAX_LINES) {
    return null;
  }

  return {
    branchId: candidate.branchId,
    slug: candidate.slug,
    serviceMode: candidate.serviceMode as ServiceMode,
    items,
    nonce: typeof candidate.nonce === 'string' ? candidate.nonce : newNonce(),
    ...(typeof candidate.reservationId === 'string'
      ? { reservationId: candidate.reservationId }
      : {}),
    ...(typeof candidate.couponCode === 'string' ? { couponCode: candidate.couponCode } : {}),
    ...(typeof candidate.readyAt === 'string' ? { readyAt: candidate.readyAt } : {}),
  };
}

export function serialiseCart(cart: Cart): string {
  return JSON.stringify(cart);
}

/**
 * Adds one dish.
 *
 * A dish from another branch replaces the basket rather than joining it —
 * the caller is expected to have confirmed that first (see the basket-switch
 * form on the restaurant page). Returning a new object rather than mutating
 * keeps this usable straight from a Server Action.
 */
export function newNonce(): string {
  return globalThis.crypto.randomUUID();
}

export function addItem(
  cart: Cart | null,
  input: { branchId: string; slug: string; menuItemId: string },
): Cart {
  const base =
    cart && cart.branchId === input.branchId
      ? cart
      : { ...EMPTY, branchId: input.branchId, slug: input.slug, nonce: newNonce() };

  const existing = base.items.find((line) => line.menuItemId === input.menuItemId);
  if (existing) {
    return setQty(base, input.menuItemId, existing.qty + 1);
  }
  if (base.items.length >= ORDER_MAX_LINES) {
    return base;
  }
  return { ...base, items: [...base.items, { menuItemId: input.menuItemId, qty: 1 }] };
}

/** Sets a line's quantity; zero or less removes the line. Clamped rather than
 *  rejected, so holding down `＋` stops at the limit instead of erroring. */
export function setQty(cart: Cart, menuItemId: string, qty: number): Cart {
  if (qty < 1) {
    return removeItem(cart, menuItemId);
  }
  const capped = Math.min(Math.trunc(qty), ORDER_MAX_ITEM_QTY);
  return {
    ...cart,
    items: cart.items.map((line) =>
      line.menuItemId === menuItemId ? { ...line, qty: capped } : line,
    ),
  };
}

export function removeItem(cart: Cart, menuItemId: string): Cart {
  return { ...cart, items: cart.items.filter((line) => line.menuItemId !== menuItemId) };
}

/**
 * Drops what a change of mode invalidates.
 *
 * Switching away from dine-in must forget the booking: leaving a stale
 * `reservationId` on a pickup basket would attach the order to a table nobody
 * is sitting at, and `POST /orders` rejects the pair anyway.
 */
export function setServiceMode(cart: Cart, serviceMode: ServiceMode): Cart {
  if (serviceMode === ServiceMode.DineIn) {
    return { ...cart, serviceMode };
  }
  const { reservationId: _dropped, ...rest } = cart;
  return { ...rest, serviceMode };
}

/** The shape `POST /cart/quote` and `POST /orders` both take. */
export function toBasket(cart: Cart): {
  branchId: string;
  serviceMode: ServiceMode;
  items: CartLine[];
  reservationId?: string;
  couponCode?: string;
} {
  return {
    branchId: cart.branchId,
    serviceMode: cart.serviceMode,
    items: cart.items.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty })),
    ...(cart.reservationId ? { reservationId: cart.reservationId } : {}),
    ...(cart.couponCode ? { couponCode: cart.couponCode } : {}),
  };
}
