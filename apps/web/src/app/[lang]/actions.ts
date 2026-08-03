'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PaymentMethod, ServiceMode, phoneCountry, toE164 } from '@amragrir/shared';
import { api, ApiError } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { clearCart, readCart, writeCart } from '@/lib/cart-store';
import { addItem, removeItem, setQty, setServiceMode, toBasket, type Cart } from '@/lib/cart';
import { ensureSession, readSession, writeSession } from '@/lib/session';
import { cartPath, checkoutPath, orderPath, preorderPath, routePath, signinPath } from '@/lib/site';

/**
 * Every write this app can perform.
 *
 * All of them are Server Actions driven by `<form action={…}>`, which is what
 * lets the whole order flow work with JavaScript off — the browser posts the
 * form, the server acts, the browser follows the redirect. It is also what
 * keeps the API's address and the visitor's tokens on the server: the page
 * never holds either.
 *
 * Failures come back as a `?error=` on the page that submitted, rather than as
 * a thrown error. A basket that has gone stale is an ordinary thing to happen
 * to somebody, and it should read as a message on the screen they are on, not
 * as an error page that loses their basket.
 */

/** Refuses anything that is not a path on this site. Every redirect below ends
 *  up here, so a crafted `returnTo` cannot bounce a visitor off-site. */
function safePath(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') ? path : fallback;
}

function languageOf(formData: FormData) {
  const language = parseLanguage(String(formData.get('lang') ?? ''));
  if (!language) {
    throw new Error('missing language');
  }
  return language;
}

function withError(path: string, code: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}error=${encodeURIComponent(code)}`;
}

// ── basket ──────────────────────────────────────────────────────────────────

export async function addToBasket(formData: FormData): Promise<void> {
  const branchId = String(formData.get('branchId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const menuItemId = String(formData.get('menuItemId') ?? '');
  const returnTo = safePath(formData.get('returnTo'), '/');

  // The first deliberate act is what creates the guest account — not the page
  // view that led to it.
  await ensureSession();

  const cart = await readCart();
  // A dish from a different restaurant would mean two kitchens in one basket,
  // which is never allowed (AI_CONTEXT.md). Asking happens on the basket page
  // rather than here: a restaurant page reads no cookies and takes no query
  // string, which is what keeps it pre-rendered.
  if (cart && cart.items.length > 0 && cart.branchId !== branchId && formData.get('replace') !== '1') {
    const language = languageOf(formData);
    redirect(
      `${cartPath(language)}?switch=${encodeURIComponent(`${branchId}|${slug}|${menuItemId}`)}`,
    );
  }

  await writeCart(addItem(cart, { branchId, slug, menuItemId }));
  revalidatePath(routePath(returnTo));
  redirect(returnTo);
}

export async function changeLineQty(formData: FormData): Promise<void> {
  const cart = await readCart();
  const returnTo = safePath(formData.get('returnTo'), '/');
  if (!cart) {
    redirect(returnTo);
  }

  const menuItemId = String(formData.get('menuItemId') ?? '');
  const qty = Number(formData.get('qty') ?? 0);
  await writeCart(setQty(cart, menuItemId, qty));
  revalidatePath(routePath(returnTo));
  redirect(returnTo);
}

export async function removeLine(formData: FormData): Promise<void> {
  const cart = await readCart();
  const returnTo = safePath(formData.get('returnTo'), '/');
  if (cart) {
    await writeCart(removeItem(cart, String(formData.get('menuItemId') ?? '')));
  }
  revalidatePath(routePath(returnTo));
  redirect(returnTo);
}

export async function emptyBasket(formData: FormData): Promise<void> {
  await clearCart();
  const returnTo = safePath(formData.get('returnTo'), '/');
  revalidatePath(routePath(returnTo));
  redirect(returnTo);
}

/**
 * Attaches a coupon.
 *
 * The code is stored, never priced here: `POST /cart/quote` decides whether it
 * applies and what it is worth, and reports `applied: false` when it does not.
 * A discount the client calculated would be a discount the client could choose.
 */
export async function applyCoupon(formData: FormData): Promise<void> {
  const cart = await readCart();
  const language = languageOf(formData);
  if (cart) {
    const code = String(formData.get('couponCode') ?? '').trim();
    await writeCart(code ? { ...cart, couponCode: code } : stripCoupon(cart));
  }
  revalidatePath(routePath(cartPath(language)));
  redirect(cartPath(language));
}

function stripCoupon(cart: Cart): Cart {
  const { couponCode: _dropped, ...rest } = cart;
  return rest;
}

// ── pre-order ───────────────────────────────────────────────────────────────

export async function chooseServiceMode(formData: FormData): Promise<void> {
  const cart = await readCart();
  const language = languageOf(formData);
  const mode = String(formData.get('serviceMode') ?? '');
  if (cart && Object.values(ServiceMode).includes(mode as ServiceMode)) {
    await writeCart(setServiceMode(cart, mode as ServiceMode));
  }
  revalidatePath(routePath(preorderPath(language)));
  redirect(preorderPath(language));
}

export async function chooseReadyAt(formData: FormData): Promise<void> {
  const cart = await readCart();
  const language = languageOf(formData);
  if (cart) {
    const readyAt = String(formData.get('readyAt') ?? '');
    // Empty means "as soon as possible", which is the absence of a time rather
    // than a time of its own — `POST /orders` defaults to the prep estimate.
    const { readyAt: _dropped, ...rest } = cart;
    await writeCart(readyAt ? { ...rest, readyAt } : rest);
  }
  revalidatePath(routePath(preorderPath(language)));
  redirect(preorderPath(language));
}

/**
 * Books the table a dine-in order needs.
 *
 * Requires a verified phone, so an unverified visitor is sent to sign in and
 * comes back here. The deposit is charged by the API from the party size; this
 * never sends an amount.
 */
export async function bookTable(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const cart = await readCart();
  if (!cart) {
    redirect(cartPath(language));
  }

  const session = await ensureSession();
  if (!session.verified) {
    redirect(signinPath(language, preorderPath(language)));
  }

  const reservedFor = String(formData.get('reservedFor') ?? '');
  const guests = Number(formData.get('guests') ?? 2);

  let reservationId: string;
  try {
    const reservation = await api.createReservation(
      { branchId: cart.branchId, reservedFor, guests },
      session.accessToken,
      language,
      `res:${cart.nonce}:${reservedFor}:${guests}`,
    );
    reservationId = reservation.id;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(preorderPath(language), 'slot_taken'));
  }

  await writeCart({ ...cart, serviceMode: ServiceMode.DineIn, reservationId });
  revalidatePath(routePath(preorderPath(language)));
  redirect(preorderPath(language));
}

// ── sign in ─────────────────────────────────────────────────────────────────

export async function requestCode(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const next = safePath(formData.get('next'), checkoutPath(language));

  // The country is chosen, not inferred: `0…` means different numbers in
  // different places, and a picked country removes the ambiguity before the
  // number ever reaches the API. An unknown code is a broken form, not a
  // reason to assume Armenia and sign somebody in as a number they did not
  // type — so it fails here rather than guessing.
  const country = phoneCountry(String(formData.get('country') ?? ''));
  const phone = country ? toE164(country, String(formData.get('phone') ?? '')) : null;
  if (!phone) {
    redirect(withError(signinPath(language, next), 'phone'));
  }

  try {
    await api.sendCode(phone, language);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(signinPath(language, next), 'phone'));
  }

  redirect(
    `${signinPath(language, next)}&step=code&phone=${encodeURIComponent(phone)}`,
  );
}

/**
 * Confirms the code, upgrading the guest account rather than replacing it.
 *
 * The guest's own token is handed to `verify-code` on purpose: without it the
 * API would create a second account and everything collected while browsing
 * would belong to the first one.
 */
export async function confirmCode(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const phone = String(formData.get('phone') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const next = safePath(formData.get('next'), checkoutPath(language));
  const session = await ensureSession();

  try {
    const result = await api.verifyCode(phone, code, session.accessToken, language);
    await writeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      verified: result.user.phoneVerified,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(
      `${withError(signinPath(language, next), 'code')}&step=code&phone=${encodeURIComponent(phone)}`,
    );
  }

  redirect(next);
}

// ── ordering and paying ─────────────────────────────────────────────────────

/**
 * Creates the order and pays for it, in that order, then empties the basket.
 *
 * Two calls rather than one because that is what the API offers, and the split
 * is meaningful: an order exists unpaid for as long as the payment takes, which
 * is the state the customer can still cancel from. Both carry an
 * `Idempotency-Key` derived from the basket, so a resubmitted form joins the
 * first attempt instead of starting a second.
 */
export async function placeOrder(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const cart = await readCart();
  if (!cart || cart.items.length === 0) {
    redirect(cartPath(language));
  }

  const session = await ensureSession();
  if (!session.verified) {
    redirect(signinPath(language, checkoutPath(language)));
  }

  const method = String(formData.get('method') ?? PaymentMethod.Card);
  // Only card is live on the web; the wallets need a browser payment SDK that
  // does not exist here and are rendered disabled. Anything else is refused
  // rather than quietly downgraded.
  if (method !== PaymentMethod.Card) {
    redirect(withError(checkoutPath(language), 'method'));
  }

  let orderId: string;
  try {
    const order = await api.createOrder(
      {
        ...toBasket(cart),
        ...(cart.readyAt ? { readyAt: cart.readyAt } : {}),
      },
      session.accessToken,
      language,
      `order:${cart.nonce}`,
    );
    orderId = order.id;
    await api.pay(
      order.id,
      PaymentMethod.Card,
      session.accessToken,
      language,
      `pay:${cart.nonce}`,
    );
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    // The basket is kept. Whatever went wrong — a dish sold out, the branch
    // closed, the card declined — the customer's next move is to fix it and
    // try again, and an emptied basket would make that impossible.
    redirect(withError(checkoutPath(language), error.status === 422 ? 'stale' : 'failed'));
  }

  await clearCart();
  revalidatePath(routePath(orderPath(language, orderId)));
  redirect(orderPath(language, orderId));
}

export async function cancelOrder(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const id = String(formData.get('orderId') ?? '');
  const session = await readSession();
  if (!session) {
    redirect(signinPath(language, orderPath(language, id)));
  }

  try {
    await api.cancelOrder(id, session.accessToken, language);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(orderPath(language, id), 'cancel'));
  }

  revalidatePath(routePath(orderPath(language, id)));
  redirect(orderPath(language, id));
}
