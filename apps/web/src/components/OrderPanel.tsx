'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { ServiceMode } from '@amragrir/shared';
import type { BasketPanel } from '@/lib/basket-panel';
import { changeLineQty, changeLineQtyLive, chooseServiceMode } from '@/app/[lang]/actions';
import { applyQtyLocally, bookTableState } from '@/lib/order-panel';
import { alreadyPublished, lastBasket, publishBasket, subscribeBasket } from '@/lib/basket-live';
import { useScripted } from '@/lib/scripted';
import { useBasketCount } from './BasketButton';

interface Props {
  language: string;
  /** The branch this page is for; the panel shows a basket only if it matches. */
  branchId: string;
  /** Where to ask for the priced basket. Built on the server, because the
   *  language-prefix rule lives there and this component runs in the browser. */
  endpoint: string;
  /** Where the stepper forms come back to — this restaurant page. */
  returnTo: string;
  basketHref: string;
  /** This restaurant's slug, sent with "Book a Table" so an empty basket can be
   *  opened against it — see the form below. */
  slug: string;
  /** True where this restaurant takes bookings, so the design's "Book a Table"
   *  button is offered. Known on the server, so it arrives as a prop. */
  canBook: boolean;
  labels: {
    yourOrder: string;
    bookTable: string;
    subtotal: string;
    serviceFee: string;
    total: string;
    checkout: string;
    empty: string;
    elsewhere: string;
    viewBasket: string;
    closed: string;
    increase: string;
    decrease: string;
  };
}

/**
 * The design's sticky order panel on a restaurant page.
 *
 * Drawn in the browser, and that is the whole design of it. This page is
 * pre-rendered HTML for 69 restaurants × 3 languages — it is the page discovery
 * traffic lands on — and a single `cookies()` call in it would turn every one of
 * them into a render per request. So the page ships without a basket in it and
 * this component asks `GET /[lang]/basket` for one, the same trade the header
 * badge already makes.
 *
 * **It computes no money.** Every amount arrives as a string the server has
 * already formatted from `POST /cart/quote`; there is no arithmetic here to get
 * wrong, and no price the browser could edit into something cheaper.
 *
 * The quantity buttons are `<form>`s posting the same Server Actions the basket
 * page uses, so pressing one is a normal navigation and the panel re-reads the
 * basket when the page comes back. With JavaScript off the panel is absent, and
 * nothing is lost: the block above the menu links to the basket in plain HTML.
 */
export function OrderPanel({
  language,
  branchId,
  endpoint,
  returnTo,
  basketHref,
  slug,
  canBook,
  labels,
}: Props) {
  const [basket, setBasket] = useBasketPanel(endpoint, branchId);
  const book = bookTableState(canBook);
  const scripted = useScripted();
  const [pending, startTransition] = useTransition();

  /**
   * The quantity as pressed, before the server has confirmed the money.
   *
   * The number moves on the same frame as the press — that is the whole point
   * of this — but **no amount is touched**, because this client does not
   * compute money and must not start now. The old totals stay on screen and are
   * marked as being re-checked (`.settling` below) until the server sends the
   * new ones, which on a local network is one frame later anyway.
   */
  const [shown, showQty] = useOptimistic(basket, applyQtyLocally);

  const change = (menuItemId: string, qty: number) => {
    startTransition(async () => {
      showQty({ menuItemId, qty });
      const result = await changeLineQtyLive({ lang: language, branchId, menuItemId, qty });
      if (result.ok) {
        // Publishing is what also tells the header, whose count cookie this
        // write has just changed — see `lib/basket-live.ts`.
        setBasket(result.panel);
      }
    });
  };

  return (
    <aside className="order-summary order-panel">
      <h2>{labels.yourOrder}</h2>

      {/* Present wherever the restaurant takes bookings — the artifact's own
          `sc-if` is on `canBook` alone, above the lines and above the empty
          basket alike. A button that appears only once somebody has collected a
          dish is a button nobody knows the restaurant has. Why it can be drawn
          and still not pressable is `bookTableState`. */}
      {/* One button either way, and it always lands on the checkout. It used to
          be drawn and `disabled` until a dish was collected, because the
          checkout prices a basket and `POST /cart/quote` refuses one with no
          lines — so "we take bookings" and "you cannot book" were the same
          control. The checkout draws a booking without a quote now, so the
          dead state is gone.

          **The branch rides along when the basket is empty.** An empty basket
          names no restaurant, so without it the checkout would not know whose
          table was being asked for; `chooseServiceMode` opens a basket with no
          lines against this branch. With food in it the basket already names
          its restaurant and the fields are ignored. */}
      {book !== 'hidden' && (
        <form action={chooseServiceMode}>
          <input type="hidden" name="lang" value={language} />
          <input type="hidden" name="serviceMode" value={ServiceMode.DineIn} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" className="book-table">
            🍽️ {labels.bookTable}
          </button>
        </form>
      )}

      {/* Only once the server has actually said so. `null` is "not asked yet",
          and drawing it as "your basket is empty" — which this did — states as
          fact the one thing the panel does not know: it was wrong on the first
          paint for anybody who had a basket, and wrong again for a second after
          every press of `＋`, which remounts this component. The hook's own
          doc comment has always said null must be neither. */}
      {shown?.state === 'empty' && (
        <div className="panel-empty">
          <div className="glyph" aria-hidden="true">
            🧺
          </div>
          <p>{labels.empty}</p>
        </div>
      )}

      {shown?.state === 'elsewhere' && (
        <div className="panel-empty">
          <p>{labels.elsewhere}</p>
          <Link className="summary-cta" href={basketHref}>
            {labels.viewBasket}
          </Link>
        </div>
      )}

      {shown?.state === 'filled' && (
        <>
          <ul className="panel-lines">
            {shown.lines.map((line) => (
              <li key={line.menuItemId}>
                <div className="text">
                  <div className="name">{line.name}</div>
                  <div className="each">{line.each}</div>
                </div>
                {/* Still `<form action={…}>`, still the same Server Action, so
                    this works with JavaScript off exactly as it always did.
                    Where there *is* JavaScript the submit is taken over and the
                    write goes out without the redirect that follows it — see
                    `addToBasketLive` for why a redirect is the wrong size of
                    answer on this page. */}
                <div className="stepper">
                  <form
                    action={changeLineQty}
                    onSubmit={(event) => {
                      if (!scripted) return;
                      event.preventDefault();
                      change(line.menuItemId, line.qty - 1);
                    }}
                  >
                    <input type="hidden" name="menuItemId" value={line.menuItemId} />
                    <input type="hidden" name="qty" value={line.qty - 1} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button type="submit" aria-label={labels.decrease}>
                      −
                    </button>
                  </form>
                  <span className="qty">{line.qty}</span>
                  <form
                    action={changeLineQty}
                    onSubmit={(event) => {
                      if (!scripted) return;
                      event.preventDefault();
                      change(line.menuItemId, line.qty + 1);
                    }}
                  >
                    <input type="hidden" name="menuItemId" value={line.menuItemId} />
                    <input type="hidden" name="qty" value={line.qty + 1} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button type="submit" aria-label={labels.increase}>
                      ＋
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          {/* The amounts, and only the amounts, wait for the server. `.settling`
              is what makes an instant quantity honest: the number you pressed is
              already right, the money beside it is last second's until it has
              been priced again. */}
          <dl className={pending ? 'summary settling' : 'summary'}>
            <div>
              <dt>{labels.subtotal}</dt>
              <dd>{shown.subtotal}</dd>
            </div>
            <div>
              <dt>{labels.serviceFee}</dt>
              <dd>{shown.serviceFee}</dd>
            </div>
            <div className="grand">
              <dt>{labels.total}</dt>
              <dd>{shown.total}</dd>
            </div>
          </dl>

          {shown.canOrder ? (
            <Link className={pending ? 'summary-cta settling' : 'summary-cta'} href={basketHref}>
              {labels.checkout} · {shown.total}
            </Link>
          ) : (
            <p className="notice warn">{labels.closed}</p>
          )}
        </>
      )}
    </aside>
  );
}

/**
 * The priced basket for this branch, or null until it has been asked for, and
 * the way to put a newer one in — the live actions answer with the basket they
 * just wrote, so the panel is told rather than left to ask again.
 *
 * Starts at null rather than empty so the first paint is neither — the server
 * rendered this page once for everybody, and claiming "your basket is empty"
 * before looking would be wrong for anyone whose isn't.
 */
function useBasketPanel(
  endpoint: string,
  branchId: string,
): [BasketPanel | null, (panel: BasketPanel) => void] {
  // Whatever is already known — this panel remounts whenever something else on
  // the page runs a Server Action that does redirect, and starting from "not
  // asked yet" is what used to blank it.
  const [basket, setBasket] = useState<BasketPanel | null>(() => lastBasket(branchId));

  // A `＋` on a dish card writes the basket and publishes what came back. That
  // is the answer already priced, so this takes it rather than asking again.
  useEffect(
    () =>
      subscribeBasket((changed) => {
        if (changed === branchId) {
          setBasket(lastBasket(branchId));
        }
      }),
    [branchId],
  );

  // And for the changes nothing on this page announced — another tab, the back
  // button — the count cookie, which every basket write moves. It is the signal
  // because there is no other: a Server Action answers with a client-side
  // re-render rather than a document load, so `pageshow` and `focus`, which
  // this used to wait for, never fired. See `lib/basket-count.ts`.
  const count = useBasketCount();

  useEffect(() => {
    // A count this page produced itself has already arrived, priced, through
    // the publish above. Fetching it again would be a second answer to a
    // question nobody asked — see `alreadyPublished`.
    if (alreadyPublished(count)) {
      return;
    }
    let live = true;
    fetch(`${endpoint}?branch=${encodeURIComponent(branchId)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<BasketPanel>) : null))
      .then((data) => {
        if (live && data) {
          publishBasket(branchId, data);
          setBasket(data);
        }
      })
      .catch(() => {
        // A panel that failed to load is a panel that stays as it was. There
        // is nothing here a visitor could do about it, and the basket page
        // is one link away.
      });
    return () => {
      live = false;
    };
  }, [endpoint, branchId, count]);

  return [basket, (panel: BasketPanel) => publishBasket(branchId, panel)];
}