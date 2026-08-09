'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ORDER_MAX_ITEM_QTY,
  ORDER_MAX_LINES,
  PaymentMethod,
  PickupOption,
  BOOKING_POLICY_LIMITS,
  ServiceMode,
  phoneCountry,
  toE164,
} from '@amragrir/shared';
import { api, ApiError } from '@/lib/api';
import { parseLanguage } from '@/lib/language';
import { pricedPanel, type BasketPanel } from '@/lib/basket-panel';
import { instantOfYerevan, instantOfYerevanTime } from '@/lib/format';
import { LOCATION_COOKIE, encodePlace, parsePlace } from '@/lib/locations';
import { clearCart, readCart, writeCart } from '@/lib/cart-store';
import {
  DEFAULT_GUESTS,
  EMPTY,
  addItem,
  newNonce,
  removeItem,
  setPickupOption,
  setQty,
  setServiceMode,
  toBasket,
  type Cart,
} from '@/lib/cart';
import {
  clearSession,
  ensureSession,
  readSession,
  writeSession,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/session';
import {
  cartPath,
  checkoutPath,
  favoritesPath,
  homePath,
  orderPath,
  ordersPath,
  profilePath,
  reservationPath,
  reservationsPath,
  routePath,
  sessionPath,
  signinPath,
} from '@/lib/site';

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
  if (
    cart &&
    cart.items.length > 0 &&
    cart.branchId !== branchId &&
    formData.get('replace') !== '1'
  ) {
    const language = languageOf(formData);
    redirect(
      `${cartPath(language)}?switch=${encodeURIComponent(`${branchId}|${slug}|${menuItemId}`)}`,
    );
  }

  await writeCart(addItem(cart, { branchId, slug, menuItemId }));
  revalidatePath(routePath(returnTo));
  redirect(returnTo);
}

/**
 * What a live basket write answers with.
 *
 * `panel` is the same shape `GET /[lang]/basket` returns, priced by the same
 * function — so the browser gets the new basket back from the write that
 * changed it and never asks a second question.
 */
export type LiveBasket =
  | { ok: true; panel: BasketPanel }
  /** The one outcome a panel cannot draw: this dish belongs to another
   *  restaurant, and the basket page is where that gets asked about. */
  | { ok: false; go: string };

/**
 * The basket writes again, for a browser that has JavaScript.
 *
 * The forms below them still post `addToBasket` and `changeLineQty`, and those
 * still answer with `revalidatePath` + `redirect` — that is the whole no-script
 * path and it is not going anywhere. But a redirect is a **route rebuild**, and
 * on a restaurant page that is a sledgehammer for a `＋`: nothing the server
 * rendered there depends on the basket (that is exactly why the page can be
 * pre-rendered), so the only thing that had to change was two numbers drawn in
 * the browser. Every press rebuilt the page, remounted the panel and blanked
 * it instead.
 *
 * These do the same write and **neither revalidate nor redirect**, so Next
 * sends back no new RSC payload and the page is not rebuilt at all. What comes
 * back is the priced basket, which the caller puts straight on the screen.
 *
 * They are not a second implementation of anything: the mutation is `lib/cart`
 * as before, and the answer is `pricedPanel`, which the route handler uses too.
 */
export async function addToBasketLive(input: {
  lang: string;
  branchId: string;
  slug: string;
  menuItemId: string;
}): Promise<LiveBasket> {
  const language = parseLanguage(input.lang);
  if (!language) {
    throw new Error('missing language');
  }

  await ensureSession();

  const cart = await readCart();
  // Same rule as the form path: two kitchens in one basket is never allowed,
  // and the asking happens on the basket page. The caller navigates there.
  if (cart && cart.items.length > 0 && cart.branchId !== input.branchId) {
    const pending = `${input.branchId}|${input.slug}|${input.menuItemId}`;
    return { ok: false, go: `${cartPath(language)}?switch=${encodeURIComponent(pending)}` };
  }

  await writeCart(
    addItem(cart, {
      branchId: input.branchId,
      slug: input.slug,
      menuItemId: input.menuItemId,
    }),
  );
  return { ok: true, panel: await pricedPanel(language, input.branchId) };
}

export async function changeLineQtyLive(input: {
  lang: string;
  branchId: string;
  menuItemId: string;
  qty: number;
}): Promise<LiveBasket> {
  const language = parseLanguage(input.lang);
  if (!language) {
    throw new Error('missing language');
  }

  const cart = await readCart();
  if (cart) {
    await writeCart(setQty(cart, input.menuItemId, input.qty));
  }
  return { ok: true, panel: await pricedPanel(language, input.branchId) };
}

export async function changeLineQty(formData: FormData): Promise<void> {
  await storeLineQty(formData);
  redirect(safePath(formData.get('returnTo'), '/'));
}

/**
 * The basket page's own stepper, when JavaScript is on.
 *
 * `changeLineQty` minus the `redirect`, and — as on the checkout's stepper —
 * that one line is the difference between patching the screen and replacing it.
 * Redirecting to the page you are already on is a navigation: the router throws
 * the tree away and builds a new one, so pressing `＋` on the basket scrolled
 * the screen back to the top and blanked it for as long as `POST /cart/quote`
 * took to answer, to move one digit.
 *
 * It is **not** the restaurant page's `changeLineQtyLive`, which neither
 * revalidates nor redirects and answers with a panel. That is right there,
 * where nothing the server rendered depends on the basket. Here everything
 * does — the line totals, the discount, the fee, the total, whether the dish is
 * still available and whether the order can be placed at all are the server's
 * answer to a basket that just changed. So the revalidation stays, and the
 * action returns the rebuilt tree for React to patch in place.
 */
export async function changeLineQtyInPlace(formData: FormData): Promise<void> {
  await storeLineQty(formData);
}

async function storeLineQty(formData: FormData): Promise<void> {
  const cart = await readCart();
  if (cart) {
    await writeCart(
      setQty(cart, String(formData.get('menuItemId') ?? ''), Number(formData.get('qty') ?? 0)),
    );
  }
  revalidatePath(routePath(safePath(formData.get('returnTo'), '/')));
}

export async function removeLine(formData: FormData): Promise<void> {
  await storeLineRemoval(formData);
  redirect(safePath(formData.get('returnTo'), '/'));
}

/** The basket page's ✕, when JavaScript is on — see `changeLineQtyInPlace`.
 *  Taking a line to zero on the stepper goes through that one and arrives at
 *  the same place, so the two presses must not behave differently. */
export async function removeLineInPlace(formData: FormData): Promise<void> {
  await storeLineRemoval(formData);
}

async function storeLineRemoval(formData: FormData): Promise<void> {
  const cart = await readCart();
  if (cart) {
    await writeCart(removeItem(cart, String(formData.get('menuItemId') ?? '')));
  }
  revalidatePath(routePath(safePath(formData.get('returnTo'), '/')));
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

// ── where the visitor is ────────────────────────────────────────────────────

/**
 * Stores the place behind the header's location control.
 *
 * A cookie rather than a query parameter: it is a standing preference, not a
 * view of the listing, and putting it in the URL would mint a second address for
 * a home page that already has one canonical form. Not httpOnly, because the
 * header reads it in the browser — see `lib/locations.ts` for why it cannot be
 * read on the server there.
 *
 * **One field.** `place` is what the browser chose — off the map, out of the
 * address search, from a recent chip or from geolocation. There used to be a
 * `preset` beside it carrying the district radio, for a page with no JavaScript;
 * the radios are gone and nothing posts that name now, so reading it would only
 * be reading something no form of ours sends.
 *
 * The value is re-parsed here rather than trusted: this arrives from a form, and
 * the same cookie is readable and editable in the browser. An empty or
 * unusable value clears it, which is the whole city — and that is what a
 * scriptless submit sends, since it has nothing to fill `place` with.
 */
export async function chooseLocation(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const place = parsePlace(String(formData.get('place') ?? ''));
  const store = await cookies();

  if (place === null) {
    store.delete(LOCATION_COOKIE);
  } else {
    store.set(LOCATION_COOKIE, encodePlace(place), {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  const returnTo = safePath(formData.get('returnTo'), homePath(language));
  revalidatePath(routePath(returnTo));
  redirect(returnTo);
}

// ── pre-order ───────────────────────────────────────────────────────────────

/**
 * Pre-Order or Table booking — the choice the whole checkout hangs off.
 *
 * The redirect is the **no-JavaScript** path: a form posts, the cookie moves,
 * the browser follows and the page is drawn again. `changeServiceModeLive`
 * below is the same write without that last line, for a browser that can do
 * better; see `ModeSwitch`.
 */
export async function chooseServiceMode(formData: FormData): Promise<void> {
  await storeServiceMode(formData);
  redirect(checkoutPath(languageOf(formData)));
}

/**
 * The mode tile's press, when JavaScript is on.
 *
 * `chooseServiceMode` minus the `redirect`, and that one line is the difference
 * between patching the screen and replacing it. Redirecting to the page you are
 * already on is a navigation: the router throws away the tree and builds a new
 * one, so the whole checkout blinks and the viewport jumps while the API
 * re-prices the basket — and this is the control that changes the most on the
 * screen, so it was also the one that blinked worst. Without it the action
 * returns the revalidated tree and React swaps only the parts that differ.
 */
export async function changeServiceModeLive(formData: FormData): Promise<void> {
  await storeServiceMode(formData);
}

async function storeServiceMode(formData: FormData): Promise<void> {
  const cart = await readCart();
  const mode = String(formData.get('serviceMode') ?? '');
  if (!Object.values(ServiceMode).includes(mode as ServiceMode)) {
    return;
  }

  // **A table can be booked with nothing to eat.** The restaurant page sends the
  // branch along when its basket is empty, and that opens a basket with no lines
  // in it — which `loadBasket` reads as `booking` and the checkout draws a
  // booking around. Without the branch there would be no way to know *which*
  // restaurant a table was being asked for, since an empty basket names none.
  //
  // Only when there is nothing collected: a basket with food in it belongs to
  // the restaurant that food came from, and switching mode must not quietly
  // move it somewhere else.
  const branchId = String(formData.get('branchId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  if (branchId && slug && (!cart || cart.items.length === 0)) {
    await writeCart({
      ...EMPTY,
      branchId,
      slug,
      serviceMode: mode as ServiceMode,
      nonce: cart?.nonce || newNonce(),
    });
  } else if (cart) {
    await writeCart(setServiceMode(cart, mode as ServiceMode));
  }

  revalidatePath(routePath(checkoutPath(languageOf(formData))));
}

/**
 * Take it away, or eat it here — the choice inside pickup.
 *
 * A form rather than a client-side toggle, for the same reason as the mode
 * above it: the basket lives in an httpOnly cookie, so the choice is a server
 * change either way, and this keeps the whole screen working with JavaScript
 * off. `changePickupOptionLive` is the scripted path.
 */
export async function choosePickupOption(formData: FormData): Promise<void> {
  await storePickupOption(formData);
  redirect(checkoutPath(languageOf(formData)));
}

/** The sub-tile's press, when JavaScript is on — see `changeServiceModeLive`. */
export async function changePickupOptionLive(formData: FormData): Promise<void> {
  await storePickupOption(formData);
}

async function storePickupOption(formData: FormData): Promise<void> {
  const cart = await readCart();
  const option = String(formData.get('pickupOption') ?? '');
  // Only on a pickup basket: the API refuses an ending on a dine-in order, and
  // a form submitted against a basket that has since changed mode should do
  // nothing rather than send one.
  if (
    cart &&
    cart.serviceMode === ServiceMode.Pickup &&
    Object.values(PickupOption).includes(option as PickupOption)
  ) {
    await writeCart(setPickupOption(cart, option as PickupOption));
  }
  revalidatePath(routePath(checkoutPath(languageOf(formData))));
}

/**
 * Reads the checkout's two clock fields off whichever form just posted.
 *
 * Both are native fields — a `datetime-local` for the table and a `time` for
 * the food — so their values exist only in the page until something submits
 * them. Every verb on that screen therefore stores them first: changing the
 * party size, booking the table and paying all pass through here, and so does
 * the sign-in each of the last two may divert through. Without that, a customer
 * sent to confirm a phone number would come back to two empty fields.
 *
 * **Only fields the form actually carried are touched.** The date-and-time
 * field is drawn for dine-in alone, and a pickup submit must not read its
 * absence as "the customer cleared it".
 *
 * The conversion is where the zone is settled: a field says `19:30` with no
 * zone on it and the API takes instants, and `lib/format.ts` reads the pair as
 * Yerevan's clock — the restaurant's, not the reader's. A value that is not one
 * clears the field rather than being passed on, so `Invalid Date` cannot reach
 * `POST /reservations`.
 */
function rememberTiming(cart: Cart, formData: FormData): Cart {
  let next = cart;

  if (formData.has('reservedFor')) {
    const at = instantOfYerevan(String(formData.get('reservedFor') ?? ''));
    const { reservedFor: _dropped, ...rest } = next;
    next = at ? { ...rest, reservedFor: at } : rest;
  }

  if (formData.has('guests')) {
    const guests = Number(formData.get('guests'));
    const { guests: _dropped, ...rest } = next;
    next =
      Number.isInteger(guests) && guests >= 1 && guests <= BOOKING_POLICY_LIMITS.maxGuests.max
        ? { ...rest, guests }
        : rest;
  }

  if (formData.has('readyAt')) {
    // An `<input type="time">` carries no date, so the day comes from the
    // earliest the quote offered — the same instant the field's `min` is drawn
    // from, which is what keeps "13:15" meaning today's 13:15 and not a time
    // in the past on a page left open overnight.
    const readyAt = instantOfYerevanTime(
      String(formData.get('readyAt') ?? ''),
      String(formData.get('readyOn') ?? ''),
    );
    // Blank is "as soon as possible": the absence of a time rather than a time
    // of its own — `POST /orders` defaults to the prep estimate.
    const { readyAt: _dropped, ...rest } = next;
    next = readyAt ? { ...rest, readyAt } : rest;
  }

  return next;
}

/**
 * The checkout's one form, and the three things pressing something on it means.
 *
 * One form because the two clock fields, the party-size chips and the payment
 * radios all have to travel together — the fields are native inputs whose value
 * lives nowhere else, so a submit that left them behind would lose them. That
 * rules out a form per control, and a `formAction` per button with it: React
 * encodes which action a `formAction` button names *in that button's own
 * `name`*, and the party-size chips need their `name` for the number they carry.
 *
 * So the buttons say what they meant in plain HTML, and this reads it. **The two
 * verbs that change something outside this browser are named explicitly**, and
 * anything else that submits the form falls through to storing what the fields
 * say and drawing the page again — which is what the chips want and the safe
 * answer to a submit nobody planned.
 */
export async function submitCheckout(formData: FormData): Promise<void> {
  switch (String(formData.get('intent') ?? '')) {
    case 'pay':
      return placeOrder(formData);
    case 'book':
      return bookTable(formData);
    default:
      return chooseTiming(formData);
  }
}

/** Stores what the clock fields say without acting on them — what the party-size
 *  stepper posts, so changing the party does not empty the fields above it. */
async function chooseTiming(formData: FormData): Promise<void> {
  await storeTiming(formData);
  // Post/Redirect/Get, so the browser's reload button does not re-post the
  // form. Only the no-JavaScript path reaches this: `changeGuests` below is
  // what a browser that can run the stepper calls.
  redirect(checkoutPath(languageOf(formData)));
}

/**
 * The party-size stepper's press, when JavaScript is on.
 *
 * Identical to `chooseTiming` but for the missing `redirect`, and that one line
 * is the whole point. A server action that redirects to the page it is already
 * on is a navigation: the route re-renders, the router replaces the tree, and
 * the customer sees the entire checkout blink for the two API round-trips it
 * takes to re-price the deposit — to change one digit. Without it the action
 * returns the revalidated tree instead and React patches the two things that
 * actually changed, in place, with the scroll position kept.
 *
 * It takes the **whole form**, not a number, so the guarantee `rememberTiming`
 * exists for survives: a time typed into the field above but not yet posted is
 * carried along by the press, exactly as it was when this was a chip that
 * submitted the form.
 */
export async function changeGuests(formData: FormData): Promise<void> {
  await storeTiming(formData);
}

async function storeTiming(formData: FormData): Promise<void> {
  const cart = await readCart();
  const language = languageOf(formData);
  if (cart) {
    await writeCart(rememberTiming(cart, formData));
  }
  revalidatePath(routePath(checkoutPath(language)));
}

/**
 * Books the table a dine-in order needs, for the time the field is showing.
 *
 * Requires a verified phone, so an unverified visitor is sent to sign in and
 * comes back here. The deposit is charged by the API from the party size; this
 * never sends an amount.
 *
 * **The time is free-form now, so this is where a bad one is caught.** It used
 * to arrive from a grid of slots the API itself had listed, and could only fail
 * by being taken in between; the checkout draws the artifact's `datetime-local`
 * instead, which will happily offer a Monday the branch is closed on or a
 * quarter past the hour that is not a slot boundary. `POST /reservations`
 * refuses all of those with a 422 — past, beyond the booking horizon, outside
 * opening hours, off the half-hour grid, no table that seats the party, or
 * every table already taken — and one message covers them, because the API
 * deliberately does not say which to a client.
 */
async function bookTable(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const stored = await readCart();
  if (!stored) {
    redirect(cartPath(language));
  }

  // Written before anything can send this screen away, so the sign-in below —
  // and the refusal at the bottom — both come back to the time already chosen.
  const cart = rememberTiming(stored, formData);
  await writeCart(cart);

  const session = await ensureSession();
  if (!session.verified) {
    redirect(signinPath(language, checkoutPath(language)));
  }

  const reservedFor = cart.reservedFor;
  const guests = cart.guests ?? DEFAULT_GUESTS;
  if (!reservedFor) {
    redirect(withError(checkoutPath(language), 'slot_taken'));
  }

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
    redirect(withError(checkoutPath(language), 'slot_taken'));
  }

  await writeCart({ ...cart, serviceMode: ServiceMode.DineIn, reservationId });
  revalidatePath(routePath(checkoutPath(language)));
  redirect(checkoutPath(language));
}

/** Gives a table back. The deposit's fate is the server's call, not this one's. */
export async function cancelReservation(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const id = String(formData.get('reservationId') ?? '');
  const session = await readSession();
  if (!session?.verified) {
    redirect(signinPath(language, reservationPath(language, id)));
  }

  try {
    await api.cancelReservation(id, session.accessToken, language);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(reservationPath(language, id), 'cancel_failed'));
  }

  revalidatePath(routePath(reservationPath(language, id)));
  revalidatePath(routePath(reservationsPath(language)));
  redirect(reservationPath(language, id));
}

// ── sign in ─────────────────────────────────────────────────────────────────

/**
 * The sign-in screen's own address, carrying the state its two steps share.
 *
 * The tab and the name have to survive both hops — the code step, and every
 * bounce back with an `?error=` — or a visitor halfway through signing up lands
 * on the log-in tab with the name they typed gone. There is nowhere else to put
 * them: this flow works with JavaScript off, so the query string *is* the state.
 *
 * The name is echoed back into a page, so it goes through `encodeURIComponent`
 * like everything else here; React escapes it again on the way out.
 */
function signinStep(
  language: string,
  next: string,
  fields: { register: boolean; name: string; phone?: string },
): string {
  const parts = [signinPath(language, next)];
  if (fields.register) {
    parts.push('&mode=register');
  }
  if (fields.name) {
    parts.push(`&name=${encodeURIComponent(fields.name)}`);
  }
  if (fields.phone) {
    parts.push(`&step=code&phone=${encodeURIComponent(fields.phone)}`);
  }
  return parts.join('');
}

export async function requestCode(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const next = safePath(formData.get('next'), checkoutPath(language));
  const register = formData.get('mode') === 'register';
  // Only on the sign-up tab: the log-in tab draws no name field, and a name
  // arriving without one would be a name nobody typed.
  const name = register ? String(formData.get('name') ?? '').trim().slice(0, 120) : '';
  const back = signinStep(language, next, { register, name });

  // The country is chosen, not inferred: `0…` means different numbers in
  // different places, and a picked country removes the ambiguity before the
  // number ever reaches the API. An unknown code is a broken form, not a
  // reason to assume Armenia and sign somebody in as a number they did not
  // type — so it fails here rather than guessing.
  const country = phoneCountry(String(formData.get('country') ?? ''));
  const phone = country ? toE164(country, String(formData.get('phone') ?? '')) : null;
  if (!phone) {
    redirect(withError(back, 'phone'));
  }

  try {
    await api.sendCode(phone, language);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(back, 'phone'));
  }

  redirect(signinStep(language, next, { register, name, phone }));
}

/**
 * Confirms the code, upgrading the guest account rather than replacing it.
 *
 * The guest's own token is handed to `verify-code` on purpose: without it the
 * API would create a second account and everything collected while browsing
 * would belong to the first one.
 *
 * The name rides along from the sign-up tab. It is a *hint*, not an
 * instruction: the API fills it in only where there is none already, so
 * confirming an existing number cannot rename that account from a form.
 */
export async function confirmCode(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const phone = String(formData.get('phone') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const register = formData.get('mode') === 'register';
  const name = register ? String(formData.get('name') ?? '').trim().slice(0, 120) : '';
  const next = safePath(formData.get('next'), checkoutPath(language));
  const session = await ensureSession();

  try {
    const result = await api.verifyCode(
      phone,
      code,
      session.accessToken,
      language,
      name || undefined,
    );
    await writeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      verified: result.user.phoneVerified,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(signinStep(language, next, { register, name, phone }), 'code'));
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
async function placeOrder(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const stored = await readCart();
  if (!stored || stored.items.length === 0) {
    redirect(cartPath(language));
  }

  // The ready-time field posts with this form, so it is stored before the
  // sign-in below can take the page away — see `rememberTiming`.
  const cart = rememberTiming(stored, formData);
  await writeCart(cart);

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
    await api.pay(order.id, PaymentMethod.Card, session.accessToken, language, `pay:${cart.nonce}`);
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

// ── the account ─────────────────────────────────────────────────────────────

/**
 * Rebuilds a basket from an order already placed — the design's "↻ Reorder".
 *
 * Copies ids and quantities only, never money: the new basket is priced by
 * `POST /cart/quote` like any other, so a dish that has changed price or come
 * off the menu is caught there rather than carried over from history. The order
 * is re-read from the API rather than trusted from the form for the same
 * reason a basket is — the browser must not be able to name what goes in it.
 *
 * The slug comes from the branch, because an order does not carry one and the
 * basket needs it to link back to where it came from.
 */
export async function reorder(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const orderId = String(formData.get('orderId') ?? '');
  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, ordersPath(language)));
  }

  let cart: Cart;
  try {
    const order = await api.order(orderId, session.accessToken, language);
    const branch = await api.restaurant(order.branch.id, language);
    if (!branch || order.items.length === 0) {
      redirect(withError(ordersPath(language), 'reorder'));
    }
    cart = {
      ...EMPTY,
      branchId: order.branch.id,
      slug: branch.slug,
      items: order.items.slice(0, ORDER_MAX_LINES).map((item) => ({
        menuItemId: item.menuItemId,
        qty: Math.min(item.qty, ORDER_MAX_ITEM_QTY),
      })),
      nonce: newNonce(),
    };
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    redirect(withError(ordersPath(language), 'reorder'));
  }

  // Replaces whatever was in the basket, exactly as adding a dish from another
  // restaurant does — one basket, one kitchen.
  await writeCart(cart);
  revalidatePath(routePath(cartPath(language)));
  redirect(cartPath(language));
}

/**
 * Saves a restaurant, or gives it back — the heart on every card.
 *
 * The web used to list favourites without setting them, on the reasoning that
 * the artifact drew the heart only in the app. It draws one on the card in both,
 * and a list a visitor cannot add to from the site that shows it is a dead end;
 * `/favorites` said so itself, in copy that told people to go and use the app.
 *
 * **The restaurant, not the branch.** A favourite is stored against the business
 * (DATABASE.md §13), so the card posts `restaurantId` — which is why the catalog
 * now sends one. Posting `id` would have saved whichever branch the row happened
 * to resolve to.
 *
 * **No redirect, deliberately.** Every other write here ends in Post/Redirect/Get
 * so a reload cannot re-post the form. This one does not need it: both directions
 * are idempotent server-side, so a re-posted heart asks for the state it already
 * asked for. Skipping it is also what keeps a press from rebuilding the route and
 * scrolling a long listing back to the top — the same reasoning as `changeGuests`.
 *
 * **A refusal is not reported, it is corrected.** The revalidation below re-reads
 * `GET /favorites`, so a press that failed leaves the heart drawn the way the
 * server actually has it. There is nowhere on a listing page to put an error that
 * would tell somebody more than the heart snapping back already does.
 */
export async function toggleFavorite(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const restaurantId = String(formData.get('restaurantId') ?? '');
  const returnTo = safePath(formData.get('returnTo'), homePath(language));

  // Favourites belong to an account, so an unverified visitor signs in first and
  // comes back to the card they pressed — the heart is what they meant to press,
  // and it is still there when they return.
  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, returnTo));
  }

  try {
    if (formData.get('favorited') === '1') {
      await api.removeFavorite(restaurantId, session.accessToken, language);
    } else {
      await api.addFavorite(restaurantId, session.accessToken, language);
    }
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    if (error.status === 401) {
      redirect(sessionPath(language, returnTo));
    }
    // Anything else falls through to the revalidation below.
  }

  // **Not from a pre-rendered page.** The listings draw their hearts on the
  // server, so revalidating is what redraws one; a restaurant page draws its
  // own in the browser and is HTML on disk, so revalidating there would evict a
  // page built at build time to change nothing on it. `FavoriteButton` says so
  // with `revalidate=0`.
  if (formData.get('revalidate') !== '0') {
    revalidatePath(routePath(returnTo));
  }
  // The two screens that count favourites rather than listing the one that
  // changed; both are stale the moment a heart is pressed anywhere else.
  revalidatePath(routePath(favoritesPath(language)));
  revalidatePath(routePath(profilePath(language)));
}

/**
 * Signs out: revokes the refresh token, then drops the cookies.
 *
 * The API call is best-effort — a token the server has already forgotten still
 * has to disappear from this browser, so a failure there must not leave somebody
 * signed in. The basket goes too: it belongs to the session that is ending, and
 * leaving it would hand the next person at this browser the last one's order.
 */
export async function signOut(formData: FormData): Promise<void> {
  const language = languageOf(formData);
  const session = await readSession();

  if (session) {
    try {
      await api.logout(session.refreshToken);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
    }
  }

  await clearSession();
  await clearCart();
  revalidatePath(routePath(homePath(language)));
  redirect(homePath(language));
}
