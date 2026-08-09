'use client';

import { useOptimistic, useTransition } from 'react';
import type { Language, PickupOption, ServiceMode } from '@amragrir/shared';

/**
 * The checkout's "how is this order fulfilled" block — the Pre-Order / Table
 * booking tiles, the take-away / eat-in choice under them, and everything below
 * that the answer changes.
 *
 * **Every tile is still a submit button in its own `<form>`**, posting the same
 * Server Action it always did. Switching mode is a server change — the basket
 * lives in an httpOnly cookie — so with JavaScript off the browser posts, the
 * cookie moves, the redirect follows and the page is drawn again, exactly as
 * before. That is what `modeAction` and `pickupAction` are: the redirecting
 * actions, on the forms themselves. Nothing below is required for the screen to
 * work, which is why the fallback is the markup rather than something bolted
 * beside it.
 *
 * With JavaScript on the press is intercepted, as `GuestStepper` intercepts its
 * own. `preventDefault` stops the navigation, the tile moves at once
 * (`useOptimistic`) and the `…Live` action writes the cookie and revalidates —
 * so React swaps the parts of the tree that differ instead of the router
 * replacing the whole page. This is the control that changes the most on the
 * checkout, so it was the one whose redirect was felt worst: the entire screen
 * blinked and the viewport jumped while the API re-priced the basket.
 *
 * **Only the tile is optimistic.** What sits below it — the booking calendar,
 * the deposit, the totals, the CTA — is the server's answer to a basket that
 * has changed mode, and this client neither prices baskets nor decides whether
 * a table can be had. So the pressed tile answers on the frame it is pressed and
 * the rest is dimmed until the real answer lands (`.settling`, the same
 * treatment the order panel gives money it is re-pricing). Guessing at that
 * content and correcting it a moment later would be worse than briefly showing
 * the old one and saying that it is being worked out.
 */
interface ModeOption {
  mode: ServiceMode;
  icon: string;
  name: string;
  hint: string;
}

interface PickupTile {
  option: PickupOption;
  icon: string;
  name: string;
  hint: string;
  chosen: boolean;
}

/**
 * The dead "Eat at the Restaurant" tile, where eating in exists but is reached
 * by booking a table. It selects no ending — it switches the basket to dine-in,
 * which is why it travels the mode path rather than the pickup one.
 */
interface BookingDoor {
  mode: ServiceMode;
  name: string;
  hint: string;
  badge: string;
}

export function ModeSwitch({
  language,
  current,
  modes,
  modeAction,
  pickup,
  pickupLabel,
  pickupAction,
  bookingDoor,
  onModeChange,
  onPickupChange,
  children,
}: {
  language: Language;
  /** The mode the server has the basket in — the truth the tiles settle back to. */
  current: ServiceMode;
  modes: ModeOption[];
  /** The form's own action: writes, then redirects. The no-JavaScript path. */
  modeAction: (formData: FormData) => Promise<void>;
  /** Null where the pickup-ending section is not drawn at all. */
  pickup: PickupTile[] | null;
  pickupLabel: string;
  pickupAction: (formData: FormData) => Promise<void>;
  bookingDoor: BookingDoor | null;
  /**
   * What a press calls instead of submitting, when there is something cheaper
   * to call. Omit either and those buttons stay the plain submit buttons they
   * already are, which is the fallback path exactly.
   */
  onModeChange?: (formData: FormData) => Promise<void>;
  onPickupChange?: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [shownMode, showMode] = useOptimistic(current);
  const [shownPickup, showPickup] = useOptimistic(
    pickup?.find((tile) => tile.chosen)?.option ?? null,
  );
  const [modePending, startModeChange] = useTransition();
  const [pickupPending, startPickupChange] = useTransition();

  function pressMode(event: React.MouseEvent<HTMLButtonElement>, mode: ServiceMode) {
    const form = event.currentTarget.form;
    // No form, or nothing cheaper to call: let the button be the submit button
    // it already is. This is the whole no-JavaScript path as well.
    if (!form || !onModeChange) {
      return;
    }
    event.preventDefault();
    // A radio, not a toggle: pressing the mode already chosen is not a change,
    // and posting it would re-price the basket to say what it already says.
    if (mode === shownMode) {
      return;
    }

    const data = new FormData(form);
    startModeChange(async () => {
      showMode(mode);
      await onModeChange(data);
    });
  }

  function pressPickup(event: React.MouseEvent<HTMLButtonElement>, option: PickupOption) {
    const form = event.currentTarget.form;
    if (!form || !onPickupChange) {
      return;
    }
    event.preventDefault();
    if (option === shownPickup) {
      return;
    }

    const data = new FormData(form);
    startPickupChange(async () => {
      showPickup(option);
      await onPickupChange(data);
    });
  }

  return (
    <>
      {/* A form each rather than one toggle, because switching mode is a
          server-side change — it drops any table booking that no longer applies
          — and must survive JavaScript being off.

          A lone tile is drawn rather than hidden: a restaurant offering only
          pre-order shows one, which stops being a question and becomes a label
          saying what kind of order this is. Hiding the row left the screen
          opening on "Pickup type" with nothing above it naming what was being
          picked up. */}
      <div className="modes">
        {modes.map((option) => (
          <form action={modeAction} key={option.mode}>
            <input type="hidden" name="lang" value={language} />
            <input type="hidden" name="serviceMode" value={option.mode} />
            <button
              type="submit"
              className={option.mode === shownMode ? 'mode on' : 'mode'}
              aria-pressed={option.mode === shownMode}
              onClick={(event) => pressMode(event, option.mode)}
            >
              <span className="emoji" aria-hidden="true">
                {option.icon}
              </span>
              <span className="name">{option.name}</span>
              <span className="hint">{option.hint}</span>
            </button>
          </form>
        ))}
      </div>

      {/* Everything the mode decides. Dimmed while the server works out what it
          now says, and sealed off with it: a stale "Book the table" is not
          something to let somebody press on the way past. */}
      <div className={modePending ? 'mode-swap settling' : 'mode-swap'} aria-busy={modePending}>
        {pickup && (
          // `rise` sits out here rather than on `.subtiles`, and has to: it
          // fills `both`, so its final frame would pin opacity at 1 and the
          // `.settling` dim below could never take. On separate elements the
          // two compose instead of fighting.
          <div className="rise">
            <h2 className="section-label">{pickupLabel}</h2>
            {/* A press here moves a tick and nothing else, so only this block
                waits on it — dimming the payment section to answer "bag it or
                plate it" would be the screen shouting about a small thing. */}
            <div
              className={pickupPending ? 'subtiles settling' : 'subtiles'}
              aria-busy={pickupPending}
            >
              {pickup.map((tile) => {
                const chosen = tile.option === shownPickup;
                return (
                  <form action={pickupAction} key={tile.option}>
                    <input type="hidden" name="lang" value={language} />
                    <input type="hidden" name="pickupOption" value={tile.option} />
                    <button
                      type="submit"
                      className={chosen ? 'subtile on' : 'subtile'}
                      aria-pressed={chosen}
                      onClick={(event) => pressPickup(event, tile.option)}
                    >
                      <span className="emoji" aria-hidden="true">
                        {tile.icon}
                      </span>
                      <span className="text">
                        <span className="name">{tile.name}</span>
                        <span className="hint">{tile.hint}</span>
                      </span>
                      <span className={chosen ? 'mark chosen' : 'mark'} aria-hidden="true">
                        {chosen ? '✓' : ''}
                      </span>
                    </button>
                  </form>
                );
              })}

              {/* Posts the *mode*, which is the whole point: it selects nothing
                  under pickup, it moves the basket to dine-in so the calendar
                  below opens. Not `disabled` — a disabled button says "not for
                  you" and then does nothing, and this one has somewhere to send
                  them. */}
              {bookingDoor && (
                <form action={modeAction}>
                  <input type="hidden" name="lang" value={language} />
                  <input type="hidden" name="serviceMode" value={bookingDoor.mode} />
                  <button
                    type="submit"
                    className="subtile subtile--booking"
                    onClick={(event) => pressMode(event, bookingDoor.mode)}
                  >
                    <span className="emoji" aria-hidden="true">
                      🍴
                    </span>
                    <span className="text">
                      <span className="name">{bookingDoor.name}</span>
                      <span className="hint">{bookingDoor.hint}</span>
                      <span className="badge-pill">{bookingDoor.badge}</span>
                    </span>
                    <span className="mark door" aria-hidden="true">
                      →
                    </span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {children}
      </div>
    </>
  );
}
