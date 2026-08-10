import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { ServiceMode, type PickupOption } from '@amragrir/shared';
import type { BasketPayload } from './api/endpoints';

/**
 * The basket.
 *
 * It lives here and nowhere on the server: it is per-device, throwaway state
 * (see API_DOCUMENTATION.md "Cart"). Prices are carried only so a line can be
 * *displayed* before the quote comes back — **every total shown to the user
 * comes from `POST /cart/quote`**, never from adding these up here.
 */
export interface CartLine {
  menuItemId: string;
  name: string;
  /** Menu price as the server gave it, for display of a single line only. */
  priceAmd: number;
  /** The dish's photograph, carried so the basket can show what was added
   *  rather than a grey block. Never sent to the API — the order payload names
   *  the menu item, and the server owns everything about it. */
  photoUrl: string | null;
  qty: number;
}

export interface CartState {
  branchId: string | null;
  restaurantName: string | null;
  lines: CartLine[];
  /**
   * Collected, or eaten at a booked table.
   *
   * Pickup until the pre-order screen says otherwise. It is state rather than a
   * constant because it decides two things the API validates: whether a
   * `pickupOption` is allowed at all, and whether a booking is required.
   */
  serviceMode: ServiceMode;
  /**
   * Where this pickup order ends up — taken away, or eaten in the dining room.
   *
   * `null` means nothing was chosen, which the API reads as take-away: every
   * pickup restaurant hands food over, and only a place that takes no table
   * bookings offers the other ending (BUSINESS_LOGIC.md §2). Kept out of the
   * payload while it is null so the request stays the one this app always sent.
   */
  pickupOption: PickupOption | null;
  /**
   * The table this basket will be eaten at, once one has been booked.
   *
   * Dine-in without it is the one combination `POST /orders` refuses outright,
   * so the pre-order screen blocks on it rather than letting the payment fail.
   */
  reservationId: string | null;
  /**
   * When the customer wants the food, or `null` for "as soon as you can".
   *
   * Not part of `toPayload()`: the quote does not take it, and only `POST
   * /orders` does — sending it to both would mean inventing a field on one of
   * them.
   */
  readyAt: string | null;
}

type CartAction =
  | { type: 'add'; branchId: string; restaurantName: string; line: Omit<CartLine, 'qty'> }
  | { type: 'refill'; branchId: string; restaurantName: string; lines: CartLine[] }
  | { type: 'setQty'; menuItemId: string; qty: number }
  | { type: 'setPickupOption'; pickupOption: PickupOption }
  | { type: 'setServiceMode'; serviceMode: ServiceMode }
  | { type: 'setReservation'; reservationId: string }
  | { type: 'setReadyAt'; readyAt: string | null }
  | { type: 'clear' };

const EMPTY: CartState = {
  branchId: null,
  restaurantName: null,
  lines: [],
  serviceMode: ServiceMode.Pickup,
  pickupOption: null,
  reservationId: null,
  readyAt: null,
};

/** Exported for tests: the rules live here, not in a screen. */
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      // A basket belongs to one restaurant (BUSINESS_LOGIC.md §4). Adding from
      // another one starts a new basket rather than mixing — the screen asks
      // first, this just carries the decision out.
      const base = state.branchId === action.branchId ? state : EMPTY;
      const existing = base.lines.find((line) => line.menuItemId === action.line.menuItemId);

      return {
        branchId: action.branchId,
        restaurantName: action.restaurantName,
        // Starting a basket at another restaurant forgets the ending with it:
        // the new one may not offer eating in, and carrying the choice across
        // would send an order the API refuses. The same goes for the booking —
        // a table at the old branch is not a table at this one — and for the
        // chosen time, which was a slot in the old kitchen's queue.
        serviceMode: base.serviceMode,
        pickupOption: base.pickupOption,
        reservationId: base.reservationId,
        readyAt: base.readyAt,
        lines: existing
          ? base.lines.map((line) =>
              line.menuItemId === action.line.menuItemId ? { ...line, qty: line.qty + 1 } : line,
            )
          : [...base.lines, { ...action.line, qty: 1 }],
      };
    }

    case 'refill':
      // A past order, put back in the basket. It **replaces** whatever was
      // there, exactly as adding a dish from another restaurant does — one
      // basket, one kitchen — and it starts from `EMPTY` rather than from the
      // current state so the mode, the ending, the table and the chosen time
      // all reset. Every one of those was an answer about a different order.
      return {
        ...EMPTY,
        branchId: action.branchId,
        restaurantName: action.restaurantName,
        lines: action.lines,
      };

    case 'setQty': {
      // Quantity zero removes the line, so the caller has one operation for
      // "fewer" instead of a decrement that has to check for the last one.
      const lines = state.lines
        .map((line) => (line.menuItemId === action.menuItemId ? { ...line, qty: action.qty } : line))
        .filter((line) => line.qty > 0);

      return lines.length === 0 ? EMPTY : { ...state, lines };
    }

    case 'setPickupOption':
      return { ...state, pickupOption: action.pickupOption };

    case 'setServiceMode':
      // Leaving dine-in drops the table with it. Keeping the id would send a
      // pickup order pointing at a booking, which the API refuses — and, worse,
      // would leave a table held for somebody who has decided not to sit at it.
      //
      // The chosen time goes either way, because it means something different
      // in each mode: on a dine-in basket it is the table's time, on a pickup
      // one it is a slot the customer picked off the grid. Carrying one across
      // would cook food for a table nobody booked, or vice versa.
      return {
        ...state,
        serviceMode: action.serviceMode,
        reservationId: action.serviceMode === ServiceMode.DineIn ? state.reservationId : null,
        readyAt: null,
      };

    case 'setReservation':
      return { ...state, reservationId: action.reservationId };

    case 'setReadyAt':
      return { ...state, readyAt: action.readyAt };

    case 'clear':
      return EMPTY;
  }
}

interface CartValue extends CartState {
  itemCount: number;
  /** True when this dish comes from a different restaurant than the basket. */
  conflictsWith: (branchId: string) => boolean;
  add: (branchId: string, restaurantName: string, line: Omit<CartLine, 'qty'>) => void;
  /** Replaces the basket with a past order's lines — what "Reorder" does. */
  refill: (branchId: string, restaurantName: string, lines: CartLine[]) => void;
  setQty: (menuItemId: string, qty: number) => void;
  /** Take it away, or eat it here — chosen on the pre-order screen, and offered
   *  only where the restaurant does both, which the quote reports. */
  setPickupOption: (pickupOption: PickupOption) => void;
  /** Collect it, or book a table for it. Dropping dine-in drops the booking. */
  setServiceMode: (serviceMode: ServiceMode) => void;
  /** Records the table the server just booked for this basket. */
  setReservation: (reservationId: string) => void;
  /** A chosen ready time, or null for the earliest the kitchen offers. */
  setReadyAt: (readyAt: string | null) => void;
  clear: () => void;
  /** The request body for the quote and order endpoints. */
  toPayload: () => BasketPayload | null;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, EMPTY);

  const value = useMemo<CartValue>(
    () => ({
      ...state,
      itemCount: state.lines.reduce((sum, line) => sum + line.qty, 0),
      conflictsWith: (branchId) => state.branchId !== null && state.branchId !== branchId,
      add: (branchId, restaurantName, line) =>
        dispatch({ type: 'add', branchId, restaurantName, line }),
      refill: (branchId, restaurantName, lines) =>
        dispatch({ type: 'refill', branchId, restaurantName, lines }),
      setQty: (menuItemId, qty) => dispatch({ type: 'setQty', menuItemId, qty }),
      setPickupOption: (pickupOption) => dispatch({ type: 'setPickupOption', pickupOption }),
      setServiceMode: (serviceMode) => dispatch({ type: 'setServiceMode', serviceMode }),
      setReservation: (reservationId) => dispatch({ type: 'setReservation', reservationId }),
      setReadyAt: (readyAt) => dispatch({ type: 'setReadyAt', readyAt }),
      clear: () => dispatch({ type: 'clear' }),
      toPayload: () => {
        if (state.branchId === null || state.lines.length === 0) {
          return null;
        }
        const dineIn = state.serviceMode === ServiceMode.DineIn;

        return {
          branchId: state.branchId,
          serviceMode: state.serviceMode,
          items: state.lines.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty })),
          // Left out entirely when nothing was chosen, which the API reads as
          // take-away — so a basket nobody made a choice in sends the request
          // this app has always sent. Left out of a dine-in basket whatever was
          // chosen, because the API refuses the pair: a booked table is not a
          // counter to collect from.
          ...(dineIn || state.pickupOption === null ? {} : { pickupOption: state.pickupOption }),
          ...(dineIn && state.reservationId !== null
            ? { reservationId: state.reservationId }
            : {}),
        };
      },
    }),
    [state],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return value;
}
