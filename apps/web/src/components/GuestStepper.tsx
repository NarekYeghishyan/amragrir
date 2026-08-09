'use client';

import { useEffect, useOptimistic, useRef, useTransition } from 'react';

/**
 * The checkout's party-size stepper — the web artifact's `− [count] +`.
 *
 * **Its two buttons are still submit buttons in the checkout form**, carrying
 * the number they would produce, so a browser with JavaScript off changes the
 * party exactly as it did when this was a row of chips: a POST, a redirect and
 * a redrawn page. Nothing below is required for it to work, which is the whole
 * reason the fallback is the markup rather than something bolted beside it.
 *
 * With JavaScript on the press is intercepted instead. `preventDefault` stops
 * the navigation, the count moves at once (`useOptimistic`), and `changeGuests`
 * stores the new party and revalidates — so React patches the count and the
 * deposit in place rather than the router replacing the page. The old behaviour
 * was a full navigation per press, which meant the whole checkout blinked and
 * the viewport jumped while two API calls re-priced a single digit.
 *
 * **The deposit is not moved optimistically, only the count.** It is money, and
 * this client does no arithmetic on money (DEVELOPMENT_GUIDE.md) — `depositAmd`
 * is sized by the server for the party. So the number answers immediately and
 * the amount follows a moment later, which is honest: showing a total this page
 * guessed and then correcting it is worse than showing the old one briefly.
 */
export function GuestStepper({
  guests,
  max,
  fewerLabel,
  moreLabel,
  maxLabel,
  onChange,
}: {
  guests: number;
  /** The largest party this branch can seat — the server's number, not a guess. */
  max: number;
  fewerLabel: string;
  moreLabel: string;
  maxLabel: string;
  /**
   * What a press calls instead of submitting, when there is something cheaper
   * to call. Omit it and the buttons simply submit their form — which is what
   * `/book` wants, since a press there has no basket to re-price and the form
   * it sits in creates a booking, so intercepting would be all cost.
   */
  onChange?: (formData: FormData) => Promise<void>;
}) {
  const [shown, showOptimistically] = useOptimistic(guests);
  const [, startTransition] = useTransition();

  // What the last press asked for, which is not what is on screen: a second
  // press landing before the first has come back must count from the first's
  // number, or holding `+` down would post the same party twice.
  const asked = useRef(guests);
  useEffect(() => {
    asked.current = guests;
  }, [guests]);

  function press(event: React.MouseEvent<HTMLButtonElement>, by: 1 | -1) {
    const form = event.currentTarget.form;
    // No form, or nothing cheaper to call: let the button be the submit button
    // it already is. This is the whole no-JavaScript path as well.
    if (!form || !onChange) {
      return;
    }
    event.preventDefault();

    const next = Math.min(max, Math.max(1, asked.current + by));
    if (next === asked.current) {
      return;
    }
    asked.current = next;

    // The whole form, so a time typed above and not yet posted travels with the
    // press — `rememberTiming` reads it back out on the server.
    const data = new FormData(form);
    data.set('guests', String(next));

    startTransition(async () => {
      showOptimistically(next);
      await onChange(data);
    });
  }

  return (
    <div className="guest-stepper">
      <button
        type="submit"
        name="guests"
        value={shown - 1}
        className="guest-step"
        disabled={shown <= 1}
        aria-label={fewerLabel}
        onClick={(event) => press(event, -1)}
      >
        −
      </button>
      <div className="count">
        {/* `aria-live`, because the count is the only thing a press changes and
            the page no longer reloads to announce itself. */}
        <span className="value" aria-live="polite">
          {shown}
        </span>
        {/* Says why `+` stopped working, and only then. */}
        {shown >= max && <span className="suffix">{maxLabel}</span>}
      </div>
      <button
        type="submit"
        name="guests"
        value={shown + 1}
        className="guest-step accent"
        disabled={shown >= max}
        aria-label={moreLabel}
        onClick={(event) => press(event, 1)}
      >
        +
      </button>
    </div>
  );
}
