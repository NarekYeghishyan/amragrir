import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
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
  qty: number;
}

export interface CartState {
  branchId: string | null;
  restaurantName: string | null;
  lines: CartLine[];
}

type CartAction =
  | { type: 'add'; branchId: string; restaurantName: string; line: Omit<CartLine, 'qty'> }
  | { type: 'setQty'; menuItemId: string; qty: number }
  | { type: 'clear' };

const EMPTY: CartState = { branchId: null, restaurantName: null, lines: [] };

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
        lines: existing
          ? base.lines.map((line) =>
              line.menuItemId === action.line.menuItemId ? { ...line, qty: line.qty + 1 } : line,
            )
          : [...base.lines, { ...action.line, qty: 1 }],
      };
    }

    case 'setQty': {
      // Quantity zero removes the line, so the caller has one operation for
      // "fewer" instead of a decrement that has to check for the last one.
      const lines = state.lines
        .map((line) => (line.menuItemId === action.menuItemId ? { ...line, qty: action.qty } : line))
        .filter((line) => line.qty > 0);

      return lines.length === 0 ? EMPTY : { ...state, lines };
    }

    case 'clear':
      return EMPTY;
  }
}

interface CartValue extends CartState {
  itemCount: number;
  /** True when this dish comes from a different restaurant than the basket. */
  conflictsWith: (branchId: string) => boolean;
  add: (branchId: string, restaurantName: string, line: Omit<CartLine, 'qty'>) => void;
  setQty: (menuItemId: string, qty: number) => void;
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
      setQty: (menuItemId, qty) => dispatch({ type: 'setQty', menuItemId, qty }),
      clear: () => dispatch({ type: 'clear' }),
      toPayload: () =>
        state.branchId === null || state.lines.length === 0
          ? null
          : {
              branchId: state.branchId,
              serviceMode: 'pickup',
              items: state.lines.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty })),
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
