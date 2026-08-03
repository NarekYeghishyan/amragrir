import { redirect } from 'next/navigation';
import type { Language } from '@amragrir/shared';
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
 * Returns null when there is nothing in the basket — the caller renders its
 * own empty state, which differs per screen.
 *
 * A missing or rejected session is not an error here. It redirects through
 * `/[lang]/session`, which mints or refreshes and comes back, because a page
 * render cannot write the cookie itself.
 */
export async function loadBasket(
  language: Language,
  returnTo: string,
): Promise<PricedBasket | null> {
  const cart = await readCart();
  if (!cart || cart.items.length === 0) {
    return null;
  }

  const session = await readSession();
  if (!session) {
    redirect(sessionPath(language, returnTo));
  }

  try {
    const quote = await api.quote(toBasket(cart), session.accessToken, language);
    return { cart, quote, session };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, returnTo));
    }
    throw error;
  }
}
