'use client';

import {
  createContext,
  useContext,
  useEffect,
  useOptimistic,
  useRef,
  useTransition,
  type ReactNode,
} from 'react';
import { ORDER_MAX_ITEM_QTY } from '@amragrir/shared';
import {
  changeLineQty,
  changeLineQtyInPlace,
  removeLine,
  removeLineInPlace,
} from '@/app/[lang]/actions';
import { notifyBasketChanged } from '@/lib/basket-count';
import { useScripted } from '@/lib/scripted';

/**
 * The basket page's editing controls — the `− n +` on every line, the ✕ beside
 * it, and the dimming of the money while the server re-prices it.
 *
 * **Every button here is still a submit button in a `<form>` posting the same
 * Server Action it always did**, so the basket works with JavaScript off
 * exactly as before: the browser posts, the cookie moves, the redirect follows
 * and the page is drawn again. Nothing below is required for that, which is why
 * the fallback is the markup rather than something bolted beside it.
 *
 * With JavaScript the press is intercepted, as `GuestStepper` and `ModeSwitch`
 * intercept their own: `preventDefault` stops the navigation, the quantity
 * moves at once (`useOptimistic`), and `changeLineQtyInPlace` writes and
 * revalidates **without redirecting** — so React swaps the parts of the tree
 * that differ instead of the router replacing the page. The redirect was felt
 * badly here: pressing `＋` reloaded the whole basket, which meant the screen
 * blanked and the viewport jumped back to the top for the round trip it takes
 * to re-price a basket, every single time somebody wanted one more of something.
 *
 * **Only the quantity is optimistic.** Every amount on this screen — the line
 * total, the discount, the fee, the total — comes from `POST /cart/quote`, and
 * this client computes no money (DEVELOPMENT_GUIDE.md). So the number answers
 * on the frame it is pressed and the amounts stay last second's, wearing
 * `.settling` until the real ones land. Guessing at a price and correcting it a
 * moment later is worse than briefly showing the old one and saying so.
 */

/**
 * The one transition the whole screen shares, and whether it is still in
 * flight.
 *
 * Shared rather than per line because what a press changes is not confined to
 * the line it was pressed on: the subtotal, the discount and the total sit in
 * the summary down the side, and they are being re-priced too. Null where there
 * is no editor above — then every button is simply the submit button it already
 * is, which is the no-JavaScript path exactly.
 */
const Editing = createContext<{
  pending: boolean;
  write: (task: () => Promise<void>) => void;
} | null>(null);

/** The basket's two columns — lines on the left, money on the right — and the
 *  transition both of them read. */
export function BasketEditor({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();

  return (
    <Editing.Provider value={{ pending, write: (task) => startTransition(task) }}>
      <div className="basket-grid">{children}</div>
    </Editing.Provider>
  );
}

/**
 * Amounts that wait for the server.
 *
 * The summary is server-rendered — it has a discount row only sometimes, and
 * the rows are the quote's — so it arrives here as `children` and this adds
 * nothing but the dim.
 */
export function BasketMoney({
  tag: Tag = 'div',
  className,
  children,
}: {
  tag?: 'div' | 'dl';
  className: string;
  children: ReactNode;
}) {
  const settling = useContext(Editing)?.pending ?? false;

  return (
    <Tag className={settling ? `${className} settling` : className} aria-busy={settling}>
      {children}
    </Tag>
  );
}

/**
 * One line's controls: the stepper, the line total, and the ✕.
 *
 * A fragment rather than a wrapper, because `.line` is a grid and all three are
 * placed by `grid-area` — an element around them would take their place in it
 * and collapse the row.
 */
export function BasketLine({
  menuItemId,
  qty,
  lineTotal,
  returnTo,
  labels,
}: {
  menuItemId: string;
  /** The quantity the server has, which is the truth the stepper settles back
   *  to once a press has been answered. */
  qty: number;
  /** Already formatted by the server, like every other amount on this screen. */
  lineTotal: string;
  /** Where the fallback forms come back to — this basket page. */
  returnTo: string;
  labels: { increase: string; decrease: string; remove: string };
}) {
  const editing = useContext(Editing);
  const scripted = useScripted();
  const [shown, showOptimistically] = useOptimistic(qty);

  // What the last press asked for, which is not necessarily what is on screen:
  // a second press landing before the first has come back must count from the
  // first's number, or holding `＋` down would ask for the same quantity twice.
  const asked = useRef(qty);
  useEffect(() => {
    asked.current = qty;
  }, [qty]);

  function step(event: React.FormEvent<HTMLFormElement>, by: 1 | -1) {
    // The live path may only be taken once React is driving, and only with an
    // editor above to run it — before that the browser's own submit is the one
    // that works, and it is left alone.
    if (!scripted) return;
    if (!editing) return;
    event.preventDefault();

    // Clamped where `setQty` clamps it, so the number shown is the number the
    // server will store: past the cap a press does nothing rather than showing
    // a quantity that is about to be corrected downwards. Zero is not clamped —
    // that is a line being removed, which is a thing you may do.
    const next = Math.min(ORDER_MAX_ITEM_QTY, asked.current + by);
    if (next === asked.current) {
      return;
    }
    asked.current = next;

    const data = new FormData();
    data.set('menuItemId', menuItemId);
    data.set('qty', String(next));
    data.set('returnTo', returnTo);

    editing.write(async () => {
      // A line taken to zero is a line removed, and there is nothing honest to
      // draw in the meantime — a stepper reading 0 is a quantity nobody has.
      // The row goes when the server says it has gone.
      if (next > 0) {
        showOptimistically(next);
      }
      await changeLineQtyInPlace(data);
      // The header's badge reads the count cookie this write just moved. It
      // polls for it anyway; telling it saves the quarter-second.
      notifyBasketChanged();
    });
  }

  function drop(event: React.FormEvent<HTMLFormElement>) {
    if (!scripted) return;
    if (!editing) return;
    event.preventDefault();

    const data = new FormData();
    data.set('menuItemId', menuItemId);
    data.set('returnTo', returnTo);

    editing.write(async () => {
      await removeLineInPlace(data);
      notifyBasketChanged();
    });
  }

  return (
    <>
      {/* A stepper made of two forms rather than one input: it has to work
          without JavaScript, and a number field with no submit button would do
          nothing when typed into. */}
      <div className="stepper">
        <form action={changeLineQty} onSubmit={(event) => step(event, -1)}>
          <input type="hidden" name="menuItemId" value={menuItemId} />
          <input type="hidden" name="qty" value={qty - 1} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" aria-label={labels.decrease}>
            −
          </button>
        </form>
        {/* `aria-live`, because the count is the only thing a press changes now
            and the page no longer reloads to announce itself. */}
        <span className="qty" aria-live="polite">
          {shown}
        </span>
        <form action={changeLineQty} onSubmit={(event) => step(event, 1)}>
          <input type="hidden" name="menuItemId" value={menuItemId} />
          <input type="hidden" name="qty" value={qty + 1} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" aria-label={labels.increase}>
            +
          </button>
        </form>
      </div>

      <BasketMoney className="line-total">{lineTotal}</BasketMoney>

      <form action={removeLine} onSubmit={drop}>
        <input type="hidden" name="menuItemId" value={menuItemId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button className="line-remove" type="submit" aria-label={labels.remove}>
          ✕
        </button>
      </form>
    </>
  );
}
