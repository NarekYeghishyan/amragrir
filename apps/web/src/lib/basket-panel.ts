import { api, ApiError } from './api';
import { formatAmd } from './format';
import { readCart } from './cart-store';
import { toBasket } from './cart';
import { readSession, writeSession } from './session';
import { refreshTokens } from './session-refresh';
import type { Language } from '@amragrir/shared';

/**
 * The visitor's basket, priced and already formatted, for the controls that are
 * drawn in the browser.
 *
 * Two callers ask for exactly this and must never disagree about it: the route
 * handler at `GET /[lang]/basket`, which the order panel reads on arrival, and
 * the live basket actions, which return the new one straight from the write
 * that caused it. It used to live inside the route handler, so the actions
 * could only have had it by fetching their own answer back.
 *
 * **Every amount here is a string the server formatted.** The client is handed
 * `"8 760 ֏"`, never `8760` — it has nothing to add up, and nothing here lets it
 * try. The totals come from `POST /cart/quote` like on every other screen
 * (BUSINESS_LOGIC.md §money).
 */

interface Line {
  menuItemId: string;
  name: string;
  each: string;
  qty: number;
}

export type BasketPanel =
  | { state: 'empty' }
  /** There is a basket, but it belongs to a different restaurant. Says so and
   *  says whose, rather than showing this page an order it cannot add to. */
  | { state: 'elsewhere'; restaurantName: string }
  | {
      state: 'filled';
      restaurantName: string;
      lines: Line[];
      subtotal: string;
      serviceFee: string;
      total: string;
      /** The server's verdict on the basket's contents — a closed branch, a
       *  sold-out line. The panel follows it rather than deciding for itself. */
      canOrder: boolean;
    };

/**
 * Prices whatever is in the basket cookie right now.
 *
 * `branchId` is the page asking "is this basket mine?" — a basket against
 * another restaurant comes back as `elsewhere` rather than as an order this
 * page cannot add to. Null asks without that question, which is what the
 * header's button wants.
 */
export async function pricedPanel(
  language: Language,
  branchId: string | null,
): Promise<BasketPanel> {
  const cart = await readCart();
  if (!cart || cart.items.length === 0) {
    return { state: 'empty' };
  }

  // No session at all means nothing to price against. Not worth minting a guest
  // here: guests are created by a deliberate act, and looking at a page is not
  // one (see `ensureSession`).
  const session = await readSession();
  if (!session) {
    return { state: 'empty' };
  }

  let quote;
  try {
    quote = await api.quote(toBasket(cart), session.accessToken, language);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    // An access token lives fifteen minutes and a catalogue page can be open
    // for longer, so this is ordinary rather than exceptional. Swallowing it
    // would leave the panel saying "your basket is empty" beside a header badge
    // reading 3 — so refresh and try once more, which a Route Handler and a
    // Server Action may both do and a page may not (`session/route.ts` exists
    // for the same reason).
    try {
      // Shared with `/session` and the tracking poll, so the header basket
      // refreshing does not race a reload into spending one token twice — see
      // `session-refresh.ts`.
      const rotated = await refreshTokens(session.refreshToken);
      await writeSession({ ...rotated, verified: session.verified });
      quote = await api.quote(toBasket(cart), rotated.accessToken, language);
    } catch (retryError) {
      if (!(retryError instanceof ApiError)) {
        throw retryError;
      }
      // A refresh token the API will not take needs a sign-in, which is not
      // this panel's job to demand. The basket page asks for one properly.
      return { state: 'empty' };
    }
  }

  if (branchId !== null && branchId !== cart.branchId) {
    return { state: 'elsewhere', restaurantName: quote.restaurantName };
  }

  return {
    state: 'filled',
    restaurantName: quote.restaurantName,
    lines: quote.items.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      each: formatAmd(line.unitPriceAmd),
      qty: line.qty,
    })),
    subtotal: formatAmd(quote.subtotalAmd),
    serviceFee: formatAmd(quote.serviceFeeAmd),
    total: formatAmd(quote.totalAmd),
    canOrder: quote.canOrder,
  };
}
