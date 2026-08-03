import Link from 'next/link';
import { PaymentMethod, ServiceMode, type Language } from '@amragrir/shared';
import type { Quote } from '@/lib/api';
import type { Cart } from '@/lib/cart';
import { t } from '@/lib/language';
import { formatAmd, formatTime } from '@/lib/format';
import { cartPath, preorderPath } from '@/lib/site';
import { placeOrder } from '@/app/[lang]/actions';

/**
 * Checkout, transcribed from the `CHECKOUT SLIDE-OVER` in
 * `docs/design/web-landing.html`.
 *
 * One component for two presentations: the intercepted route renders it as the
 * design's right-hand drawer, and `/[lang]/checkout` renders the same thing as
 * a page when it is opened directly or when there is no JavaScript to
 * intercept with. The markup is identical, so the two cannot drift.
 *
 * Two deliberate departures from the artifact, each a rule the design cannot
 * see. Its fourth payment method, *cash at the counter*, is not here: every
 * order is paid online before the kitchen receives it (BUSINESS_LOGIC.md §5).
 * And Apple Pay and Google Pay are shown but not selectable — they need a
 * browser payment SDK this app does not have, and a live-looking button that
 * cannot pay is the dead end this design pass exists to remove.
 */

const WALLETS = [
  { method: PaymentMethod.ApplePay, icon: '', labelKey: 'payApple' },
  { method: PaymentMethod.GooglePay, icon: 'G', labelKey: 'payGoogle' },
] as const;

interface Props {
  language: Language;
  cart: Cart;
  quote: Quote;
  /** Which failure to explain, from the `?error=` a failed action redirects with. */
  error?: string;
  /** Rendered as the drawer's ✕ target; a page uses the same path for "back". */
  closeHref: string;
}

export function CheckoutPanel({ language, cart, quote, error, closeHref }: Props) {
  const label = t(language);

  return (
    <div className="checkout-panel">
      <header className="panel-head">
        <h1>{label('checkout')}</h1>
        <Link className="panel-close" href={closeHref} aria-label={label('backHome')}>
          ✕
        </Link>
      </header>

      <div className="panel-body">
        {error && (
          <p className="notice warn">
            {error === 'stale' ? label('branchClosed') : label('orderFailed')}
          </p>
        )}

        <div className="order-lines">
          {quote.items.map((line) => (
            <div className="order-line" key={line.menuItemId}>
              <span className="qty-chip">{line.qty}</span>
              <span className="name">{line.name}</span>
              <span className="amount">{formatAmd(line.lineTotalAmd)}</span>
            </div>
          ))}

          <div className="order-sum">
            <span>{label('subtotal')}</span>
            <span>{formatAmd(quote.subtotalAmd)}</span>
          </div>
          {quote.discountAmd > 0 && (
            <div className="order-sum good">
              <span>{label('discount')}</span>
              <span>−{formatAmd(quote.discountAmd)}</span>
            </div>
          )}
          <div className="order-sum">
            <span>{label('serviceFee')}</span>
            <span>{formatAmd(quote.serviceFeeAmd)}</span>
          </div>
          {quote.depositAmd > 0 && (
            <div className="order-sum">
              <span>{label('deposit')}</span>
              <span>{formatAmd(quote.depositAmd)}</span>
            </div>
          )}
        </div>

        {quote.depositAmd > 0 && <p className="fineprint">{label('depositCredited')}</p>}

        <h2 className="section-label">{label('readyAtLabel')}</h2>
        <div className="ready-row">
          <span className="ready-value">
            ⚡ {cart.readyAt ? formatTime(cart.readyAt) : label('asSoonAsPossible')}
          </span>
          <span className="ready-mode">
            {cart.serviceMode === ServiceMode.DineIn
              ? `${label('modeDineIn')}${quote.tableNo ? ` · ${label('atTable')} ${quote.tableNo}` : ''}`
              : label('modePickup')}
          </span>
          <Link className="ready-change" href={preorderPath(language)}>
            {label('whenAndHow')}
          </Link>
        </div>

        <h2 className="section-label">{label('payment')}</h2>
        {/* The radios and the submit share one form, so choosing a method and
            paying is a single native POST — no JavaScript in the path. */}
        <form className="pay-form" action={placeOrder}>
          <input type="hidden" name="lang" value={language} />

          <label className="pay-row">
            <input type="radio" name="method" value={PaymentMethod.Card} defaultChecked />
            <span className="pay-icon" aria-hidden="true">
              💳
            </span>
            <span className="pay-label">{label('payCard')}</span>
            <span className="pay-dot" aria-hidden="true" />
          </label>

          {WALLETS.map((wallet) => (
            <span className="pay-row disabled" key={wallet.method}>
              <input type="radio" name="method" value={wallet.method} disabled />
              <span className="pay-icon" aria-hidden="true">
                {wallet.icon}
              </span>
              <span className="pay-label">
                {label(wallet.labelKey)}
                <small>{label('walletInApp')}</small>
              </span>
              <span className="pay-dot" aria-hidden="true" />
            </span>
          ))}

          <p className="fineprint">{label('payingIsFinal')}</p>

          <button className="pay-cta" type="submit" disabled={!quote.canOrder}>
            {label('placeOrder')} · {formatAmd(quote.dueNowAmd)}
          </button>
        </form>

        <Link className="panel-back" href={cartPath(language)}>
          ← {label('basket')}
        </Link>
      </div>
    </div>
  );
}
