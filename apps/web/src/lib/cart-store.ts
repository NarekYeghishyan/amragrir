import { cookies } from 'next/headers';
import { CART_COOKIE, COUNT_COOKIE, itemCount, parseCart, serialiseCart, type Cart } from './cart';
import { SESSION_MAX_AGE_SECONDS } from './session';

/**
 * The basket's cookie. Kept apart from `cart.ts` so the rules in that file can
 * be tested without a request context.
 *
 * httpOnly like the session, and for a related reason: the basket decides what
 * gets charged, so nothing on the page should be able to rewrite it. The same
 * lifetime as the session, so the two never outlive one another — a basket
 * whose session has expired is a basket nobody can price.
 */

export async function readCart(): Promise<Cart | null> {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

export async function writeCart(cart: Cart): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, serialiseCart(cart), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  writeCount(store, itemCount(cart));
}

export async function clearCart(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
  store.delete(COUNT_COOKIE);
}

/**
 * The item count, and *only* the count, in a cookie the page can read.
 *
 * This exists to keep the catalogue static. Reading the basket on the server
 * needs `cookies()`, and one call to that in the layout would opt every page —
 * including every restaurant page — out of pre-rendering, which is the decision
 * `apps/web/README.md` calls "pre-rendered, not rendered per request".
 *
 * So the badge is drawn in the browser from this number instead. It is safe to
 * expose because it is not the basket: no ids, no prices, nothing that decides
 * what gets charged. Those stay in the httpOnly cookie beside it.
 */
function writeCount(store: Awaited<ReturnType<typeof cookies>>, count: number): void {
  store.set(COUNT_COOKIE, String(count), {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}
