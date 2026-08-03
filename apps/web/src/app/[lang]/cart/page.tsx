import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Language } from '@amragrir/shared';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd } from '@/lib/format';
import { loadBasket } from '@/lib/basket';
import { ORDER_ROBOTS, cartPath, homePath, preorderPath, restaurantPath } from '@/lib/site';
import { addToBasket, applyCoupon, changeLineQty, removeLine } from '../actions';

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

  if (!basket) {
    return (
      <div className="empty-state">
        <div className="glyph" aria-hidden="true">
          🧺
        </div>
        <h1>{label('emptyBasket')}</h1>
        <p>{label('emptyBasketHint')}</p>
        <Link className="cta-action" href={homePath(language)}>
          {label('browseRestaurants')}
        </Link>
      </div>
    );
  }

  const { cart, quote } = basket;
  const unavailable = new Set(quote.unavailable.map((line) => line.menuItemId));
  const couponRejected = quote.coupon !== null && !quote.coupon.applied;

  return (
    <>
      <Link className="back" href={restaurantPath(language, cart.slug)}>
        ← {quote.restaurantName}
      </Link>

      <div className="section-head">
        <h1>{label('yourOrder')}</h1>
        <span className="count">{quote.items.length}</span>
      </div>

      {!quote.branchIsOpen && <p className="notice warn">{label('branchClosed')}</p>}

      {/* Somebody tried to add a dish from another restaurant. The basket is
          still theirs until they say otherwise — this asks rather than
          silently discarding what they collected. */}
      {typeof sp.switch === 'string' && <SwitchPrompt pending={sp.switch} language={language} />}

      <ul className="lines">
        {quote.items.map((line) => (
          <li className={unavailable.has(line.menuItemId) ? 'line gone' : 'line'} key={line.menuItemId}>
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

            {/* A stepper made of two forms rather than one input: it has to
                work without JavaScript, and a number field with no submit
                button would do nothing when typed into. */}
            <div className="stepper">
              <form action={changeLineQty}>
                <input type="hidden" name="menuItemId" value={line.menuItemId} />
                <input type="hidden" name="qty" value={line.qty - 1} />
                <input type="hidden" name="returnTo" value={cartPath(language)} />
                <button type="submit" aria-label={label('decrease')}>
                  −
                </button>
              </form>
              <span className="qty">{line.qty}</span>
              <form action={changeLineQty}>
                <input type="hidden" name="menuItemId" value={line.menuItemId} />
                <input type="hidden" name="qty" value={line.qty + 1} />
                <input type="hidden" name="returnTo" value={cartPath(language)} />
                <button type="submit" aria-label={label('increase')}>
                  +
                </button>
              </form>
            </div>

            <div className="line-total">{formatAmd(line.lineTotalAmd)}</div>

            <form action={removeLine}>
              <input type="hidden" name="menuItemId" value={line.menuItemId} />
              <input type="hidden" name="returnTo" value={cartPath(language)} />
              <button className="line-remove" type="submit" aria-label={label('removeLine')}>
                ✕
              </button>
            </form>
          </li>
        ))}
      </ul>

      <Link className="add-more" href={restaurantPath(language, cart.slug)}>
        ＋ {label('addMore')}
      </Link>

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

      <dl className="summary">
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
      </dl>

      {/* `canOrder` is the server's verdict on the basket's *contents* — a
          closed branch or a sold-out line. Following it here means the CTA is
          never offered for a basket the API would refuse to price.

          It deliberately does not cover "dine-in with no table booked yet".
          That is a step in the flow rather than a fault in the basket, and it
          is blocked on `/preorder`, which is the screen that books the table —
          hiding this CTA for it would strand the customer on a basket with no
          route to the booking form. */}
      {quote.canOrder ? (
        <Link className="sticky-cta" href={preorderPath(language)}>
          <span>{label('continueToCheckout')}</span>
          <span>{formatAmd(quote.totalAmd)}</span>
        </Link>
      ) : (
        <p className="notice warn">{sp.error === 'stale' ? label('orderFailed') : label('branchClosed')}</p>
      )}
    </>
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
