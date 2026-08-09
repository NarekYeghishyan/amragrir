import type { BasketPanel } from './basket-panel';

/**
 * Moves one line's quantity, and nothing else.
 *
 * The optimistic half of a press on the order panel: the number has to change
 * on the frame it is pressed, or the `＋` feels broken. Kept out of the
 * component because of the rule it has to obey, which is easy to break by
 * accident and worth stating in a test — **it touches no amount**. Every string
 * of money on that panel came from `POST /cart/quote` and the next one will
 * too (BUSINESS_LOGIC.md §money); this client does not compute money, and an
 * optimistic subtotal is exactly how it would start.
 *
 * A line taken to zero goes, and a basket with no lines left is `empty` — the
 * one thing that can be said for certain without asking the server.
 */
export function applyQtyLocally(
  current: BasketPanel | null,
  change: { menuItemId: string; qty: number },
): BasketPanel | null {
  if (current?.state !== 'filled') {
    return current;
  }
  const lines = current.lines
    .map((line) => (line.menuItemId === change.menuItemId ? { ...line, qty: change.qty } : line))
    .filter((line) => line.qty > 0);

  return lines.length === 0 ? { state: 'empty' } : { ...current, lines };
}

/**
 * Whether the restaurant page offers a table.
 *
 * A rule rather than a condition inside the panel's JSX, because it is the kind
 * of thing that gets quietly tightened: the button was once gated on the basket
 * having something in it, which made it invisible at exactly the moment
 * somebody is deciding where to eat — and the artifact draws it above the empty
 * basket, not only above a full one.
 */
export type BookTableState =
  /** This restaurant does not take bookings. */
  | 'hidden'
  /** Offered, and it goes to the checkout — with a basket or without one. */
  | 'ready';

/**
 * **A table is bookable with nothing in the basket.**
 *
 * There used to be a third state, `waiting`, in which the button was drawn and
 * dead until this restaurant's basket had a dish in it — because the checkout
 * prices a basket and `POST /cart/quote` refuses one with no lines. That made
 * "we take bookings" and "you cannot book" the same control, for a reason that
 * was about our screens rather than about the restaurant: `POST /reservations`
 * has never wanted an order, and a guest booking a table for Saturday should
 * not have to put a burger in a basket to ask for one.
 *
 * The checkout draws a booking without a quote now — `loadBasket` answers
 * `booking` for an empty basket in `dine_in`, and the order summary simply has
 * nothing in it — so the dead state has nothing left to mean, and the only
 * question is whether this address takes bookings at all.
 *
 * The basket is therefore no longer read here. It is still taken as an argument
 * because the panel has one to hand and a future rule may want it; nothing about
 * the button depends on it today.
 */
export function bookTableState(canBook: boolean): BookTableState {
  return canBook ? 'ready' : 'hidden';
}
