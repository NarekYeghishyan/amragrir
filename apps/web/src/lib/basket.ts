import { redirect } from 'next/navigation';
import { ServiceMode, type Language } from '@amragrir/shared';
import { api, ApiError, type Quote } from './api';
import { readCart } from './cart-store';
import { toBasket, type Cart } from './cart';
import { readSession, type Session } from './session';
import { sessionPath } from './site';

/**
 * The basket, priced, for the screens that show one.
 *
 * Every screen in the flow needs the same three things and must agree on all
 * of them, so they load them the same way. The price is always the server's:
 * this calls `POST /cart/quote` on every render rather than caching a total,
 * because a dish can sell out or a branch can close between two page views and
 * the number on the Pay button has to be the number that gets charged.
 */
export interface PricedBasket {
  cart: Cart;
  quote: Quote;
  session: Session;
}

/**
 * What the basket screens actually get.
 *
 * Three outcomes rather than two, because "there is nothing in the basket" and
 * "there is a basket and the API will not price it" are different things to
 * show somebody, and the second one used to be neither — it was an exception
 * that reached the page and rendered an error screen.
 */
export type LoadedBasket =
  | { kind: 'empty' }
  /**
   * A basket with no food in it that still names a restaurant, in `dine_in` —
   * somebody booking a table and nothing else.
   *
   * It carries no quote, and cannot: `POST /cart/quote` refuses a basket with no
   * lines, and rightly, since there is nothing to price. That is the whole
   * reason this is a kind of its own rather than `empty` — the checkout can draw
   * a booking around it, and only the order summary is missing.
   */
  | { kind: 'booking'; cart: Cart; session: Session }
  | ({ kind: 'priced' } & PricedBasket)
  /** The status is carried so the screen can log it and a developer can see
   *  which refusal it was without reading the server's terminal. */
  | { kind: 'stale'; cart: Cart; status: number };

/**
 * `{ kind: 'empty' }` when there is nothing in the basket — the caller renders
 * its own empty state, which differs per screen.
 *
 * A missing or rejected session is not an error here. It redirects through
 * `/[lang]/session`, which mints or refreshes and comes back, because a page
 * render cannot write the cookie itself.
 *
 * **A basket the API refuses to price is not an error either.** The cookie
 * outlives the things it names: a branch can be withdrawn, a table booking
 * cancelled, and the basket then points at something that is no longer there.
 * Both answer `404`, and both used to throw out of the page render — so a
 * customer whose booking had been cancelled met an error screen on `/cart` and
 * had no way back, because the cookie that caused it is httpOnly and the screen
 * that could clear it is the one that was failing. It comes back as `stale`
 * instead, which is the same rule the Server Actions already follow: a basket
 * that has gone stale reads as a message on the screen somebody is on.
 *
 * A `5xx` still throws. That is the API breaking rather than the basket going
 * out of date, and dressing it up as "start a new basket" would send somebody
 * to rebuild a basket that was never the problem.
 */
export async function loadBasket(
  language: Language,
  returnTo: string,
): Promise<LoadedBasket> {
  const cart = await readCart();
  const bookingOnly =
    cart !== null &&
    cart.items.length === 0 &&
    cart.branchId !== '' &&
    cart.serviceMode === ServiceMode.DineIn;

  if (!cart || (cart.items.length === 0 && !bookingOnly)) {
    return { kind: 'empty' };
  }

  const session = await readSession();
  if (!session) {
    redirect(sessionPath(language, returnTo));
  }

  // Nothing to price, so nothing is asked. The booking itself is priced by
  // `GET /restaurants/{id}/availability`, which sizes the deposit for the party.
  if (bookingOnly) {
    return { kind: 'booking', cart, session };
  }

  try {
    const quote = await api.quote(toBasket(cart), session.accessToken, language);
    return { kind: 'priced', cart, quote, session };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) {
      throw error;
    }
    if (error.status === 401) {
      redirect(sessionPath(language, returnTo));
    }
    // Onto the server's terminal, never onto the page: which dish or which
    // booking went missing is a developer's question, and the screen says only
    // that the basket has to be started again.
    console.error(`basket: POST /cart/quote responded ${error.status} — ${error.message}`);
    return { kind: 'stale', cart, status: error.status };
  }
}
