import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ServiceMode, type Language } from '@amragrir/shared';
import { api } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd } from '@/lib/format';
import { loadBasket } from '@/lib/basket';
import { favoriteIds } from '@/lib/favorites';
import { ORDER_ROBOTS, cartPath, checkoutPath, homePath, restaurantPath } from '@/lib/site';
import { BranchCard } from '@/components/BranchCard';
import { BasketEditor, BasketLine, BasketMoney } from '@/components/BasketEditor';
import { addToBasket, applyCoupon, emptyBasket } from '../actions';

export const metadata: Metadata = { title: 'Basket', robots: ORDER_ROBOTS };

/** A basket is per-visitor, so there is nothing to pre-render or revalidate. */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CartPage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);
  const basket = await loadBasket(language, cartPath(language));

  // `booking` is a basket holding a table and no food, which on this screen is
  // the same nothing: there is no line to draw and no total to price. The way on
  // is the restaurant it names, where dishes are — not the home page, since a
  // table has already been chosen somewhere.
  if (basket.kind === 'empty' || basket.kind === 'booking') {
    const onwards =
      basket.kind === 'booking'
        ? restaurantPath(language, basket.cart.slug)
        : homePath(language);
    return (
      <div className="empty-state">
        <div className="glyph" aria-hidden="true">
          🧺
        </div>
        <h1>{label('emptyBasket')}</h1>
        <p>{label('emptyBasketHint')}</p>
        <Link className="cta-action" href={onwards}>
          {basket.kind === 'booking' ? label('addFoodToBooking') : label('browseRestaurants')}
        </Link>
      </div>
    );
  }

  // A basket naming something that is no longer there — a withdrawn branch, a
  // cancelled table booking. The way out is a form rather than a link, because
  // the basket lives in an httpOnly cookie and only a Server Action can clear
  // it; without one this screen would state the problem and offer nothing.
  if (basket.kind === 'stale') {
    return (
      <div className="empty-state">
        <div className="glyph" aria-hidden="true">
          🧺
        </div>
        <h1>{label('basketUnpriceable')}</h1>
        <p>{label('basketUnpriceableHint')}</p>
        <form action={emptyBasket}>
          <input type="hidden" name="returnTo" value={homePath(language)} />
          <button className="cta-action" type="submit">
            {label('basketReplace')}
          </button>
        </form>
      </div>
    );
  }

  const { cart, quote } = basket;
  const unavailable = new Set(quote.unavailable.map((line) => line.menuItemId));
  const couponRejected = quote.coupon !== null && !quote.coupon.applied;

  // Who the food is being bought from, and what it looks like.
  //
  // Both are asked for **by branch id**, not by the basket's slug. A slug
  // resolves to one branch of a restaurant that may have several — `dolmama` is
  // always the Saryan kitchen — so a screen that prints an address has to name
  // the branch the quote was priced against or it will confidently give the
  // wrong street.
  //
  // Neither is allowed to take the screen down with it. They are ordinary
  // cached catalogue GETs, and the basket is the one screen where "the API is
  // having a moment" must still show somebody what they collected and what it
  // costs: the card is dropped, the photos fall back to the hatch, and the
  // prices — which come from the quote — are untouched.
  // The favourites go in the same batch and are just as expendable: they only
  // decide which way the card's heart is drawn, and `favoriteIds` already
  // answers with an empty set for a guest or a refusal.
  const [branch, menu, favorites] = await Promise.all([
    api.restaurant(cart.branchId, language).catch(() => null),
    api.menu(cart.branchId, language).catch(() => ({ items: [] })),
    favoriteIds(language),
  ]);

  // The quote prices dishes; it does not carry their pictures. The menu does,
  // and it is the same list the restaurant page has already cached, so the
  // photographs cost this render nothing and a basket line finally looks like
  // the dish that was pressed.
  const photos = new Map(menu.items.map((item) => [item.id, item.photoUrl]));

  const mode = cart.serviceMode === ServiceMode.DineIn ? 'modeDineIn' : 'modePickup';

  return (
    // The artifact draws the basket on a narrower column than the catalogue and
    // centres it — see `.screen` in globals.css.
    <div className="screen screen--basket">
      <h1>{label('basket')}</h1>
      {/* What is in it and how it is being collected. The restaurant used to be
          said here, in the same grey, which put the name of the place third in
          a line that is really about the basket — it has the card below to
          itself now. */}
      <p className="lede">
        {quote.items.reduce((count, line) => count + line.qty, 0)}{' '}
        {label('dishes').toLowerCase()} · {label(mode)}
      </p>

      {/* Replaces the back button the artifact draws here, which said the
          restaurant's name and nothing else — this says it, shows it, and is
          still the way back to the menu. */}
      {branch && (
        <BranchCard
          restaurant={branch}
          language={language}
          href={restaurantPath(language, cart.slug)}
          prepMin={quote.prepMin}
          // The basket carries a heart; the checkout does not — see the prop.
          favorite={{
            restaurantId: branch.restaurantId,
            isFavorite: favorites.has(branch.restaurantId),
            returnTo: cartPath(language),
          }}
        />
      )}

      {!quote.branchIsOpen && <p className="notice warn">{label('branchClosed')}</p>}

      {/* Somebody tried to add a dish from another restaurant. The basket is
          still theirs until they say otherwise — this asks rather than
          silently discarding what they collected. */}
      {typeof sp.switch === 'string' && <SwitchPrompt pending={sp.switch} language={language} />}

      {/* Lines on the left, the money on the right — the artifact's `1fr 340px`.
          The summary is `position: sticky`, so a long basket keeps the total and
          the way out of it on screen instead of at the bottom of a scroll.

          `BasketEditor` draws that grid and owns the one transition every
          control inside it writes through, so a press moves the quantity here
          and dims the amounts over there without reloading the page — see the
          component. */}
      <BasketEditor>
        <div>
          <ul className="lines">
            {quote.items.map((line) => {
              // The quote's own `photoUrl` first, for the day the pricing
              // response starts carrying one; the menu's otherwise. A dish that
              // has since left the menu matches neither and keeps the hatch.
              const photo = line.photoUrl ?? photos.get(line.menuItemId) ?? null;

              return (
              <li className={unavailable.has(line.menuItemId) ? 'line gone' : 'line'} key={line.menuItemId}>
                {/* The artifact gives every basket line its dish back — the
                    photo, or the hatch it draws where there is none. */}
                <div className={photo ? 'media' : 'media ph'}>
                  {photo && <img src={photo} alt="" loading="lazy" />}
                </div>

                <div className="text">
                  <div className="name">{line.name}</div>
                  <div className="each">{formatAmd(line.unitPriceAmd)}</div>
                  {unavailable.has(line.menuItemId) && (
                    <div className="gone-why">
                      {quote.unavailable.find((entry) => entry.menuItemId === line.menuItemId)
                        ?.reason === 'sold_out'
                        ? label('lineSoldOut')
                        : label('lineNotOnMenu')}
                    </div>
                  )}
                </div>

                {/* The stepper, the line total and the ✕ — the three things a
                    press changes, so they are drawn in the browser and the
                    press no longer costs a page load. Still forms posting the
                    same Server Actions underneath. */}
                <BasketLine
                  menuItemId={line.menuItemId}
                  qty={line.qty}
                  lineTotal={formatAmd(line.lineTotalAmd)}
                  returnTo={cartPath(language)}
                  labels={{
                    increase: label('increase'),
                    decrease: label('decrease'),
                    remove: label('removeLine'),
                  }}
                />
              </li>
              );
            })}
          </ul>

          <Link className="add-more" href={restaurantPath(language, cart.slug)}>
            ＋ {label('addMore')}
          </Link>
        </div>

        <aside className="order-summary">
          <h2>{label('yourOrder')}</h2>

          <form className="coupon" action={applyCoupon}>
            <input type="hidden" name="lang" value={language} />
            <input
              type="text"
              name="couponCode"
              defaultValue={cart.couponCode ?? ''}
              placeholder={label('coupon')}
              aria-label={label('coupon')}
              maxLength={20}
            />
            <button type="submit">{label('couponApply')}</button>
          </form>
          {couponRejected && <p className="notice warn">{label('couponRejected')}</p>}

          {/* Every figure here is the server's answer to whatever the stepper
              last did, so it is dimmed rather than guessed at while that answer
              is on its way — this client computes no money. */}
          <BasketMoney tag="dl" className="summary">
            <div>
              <dt>{label('subtotal')}</dt>
              <dd>{formatAmd(quote.subtotalAmd)}</dd>
            </div>
            {quote.discountAmd > 0 && (
              <div className="good">
                <dt>{label('discount')}</dt>
                <dd>−{formatAmd(quote.discountAmd)}</dd>
              </div>
            )}
            <div>
              <dt>{label('serviceFee')}</dt>
              <dd>{formatAmd(quote.serviceFeeAmd)}</dd>
            </div>
            <div className="grand">
              <dt>{label('total')}</dt>
              <dd>{formatAmd(quote.totalAmd)}</dd>
            </div>
          </BasketMoney>

          {/* `canOrder` is the server's verdict on the basket's *contents* — a
              closed branch or a sold-out line. Following it here means the CTA
              is never offered for a basket the API would refuse to price.

              It deliberately does not cover "dine-in with no table booked yet".
              That is a step in the flow rather than a fault in the basket, and
              it is blocked on `/preorder`, which is the screen that books the
              table — hiding this CTA for it would strand the customer on a
              basket with no route to the booking form. */}
          {quote.canOrder ? (
            <Link className="summary-cta" href={checkoutPath(language)}>
              {label('continueToCheckout')}
            </Link>
          ) : (
            <p className="notice warn">
              {sp.error === 'stale' ? label('orderFailed') : label('branchClosed')}
            </p>
          )}
        </aside>
      </BasketEditor>
    </div>
  );
}

/** The "start a new basket?" question, carrying the dish that raised it so
 *  answering yes adds it rather than merely emptying the old basket. */
function SwitchPrompt({ pending, language }: { pending: string; language: Language }) {
  const label = t(language);
  const [branchId, slug, menuItemId] = pending.split('|');
  if (!branchId || !slug || !menuItemId) {
    return null;
  }

  return (
    <div className="notice warn switch-prompt">
      <span>{label('basketOtherRestaurant')}</span>
      <form action={addToBasket}>
        <input type="hidden" name="lang" value={language} />
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="menuItemId" value={menuItemId} />
        <input type="hidden" name="replace" value="1" />
        <input type="hidden" name="returnTo" value={cartPath(language)} />
        <button type="submit">{label('basketReplace')}</button>
      </form>
    </div>
  );
}
