import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  type Language,
  ORDER_MAX_LEAD_DAYS,
  PaymentMethod,
  PickupOption,
  READY_STEP_MINUTES,
  RESERVATION_MAX_GUESTS,
  RESERVATION_SLOT_MINUTES,
  ServiceMode,
} from '@amragrir/shared';
import { api } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd, formatTime, yerevanDate, yerevanDateTime, yerevanStepUp } from '@/lib/format';
import { loadBasket } from '@/lib/basket';
import { DEFAULT_GUESTS, type Cart } from '@/lib/cart';
import {
  ORDER_ROBOTS,
  availabilityApiPath,
  cartPath,
  checkoutPath,
  restaurantPath,
} from '@/lib/site';
import { BranchCard } from '@/components/BranchCard';
import { DateTimeField } from '@/components/DateTimeField';
import { GuestStepper } from '@/components/GuestStepper';
import { ModeSwitch } from '@/components/ModeSwitch';
import { ReadyAtField } from '@/components/ReadyAtField';
import {
  changeGuests,
  changePickupOptionLive,
  changeServiceModeLive,
  choosePickupOption,
  chooseServiceMode,
  submitCheckout,
} from '../actions';

export const metadata: Metadata = { title: 'Checkout', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

/**
 * The id of the form that holds everything below the mode tiles, so the CTA can
 * sit in the other column.
 *
 * The artifact puts the timing and the payment methods on the left and the one
 * button on the right, which HTML has an answer for: a submit button outside a
 * form owns it by `form="…"`, and its own `name`/`value` go along with the rest.
 * That keeps choosing a time, a party, a method and pressing the button a single
 * native POST with no JavaScript in the path — the same property the two-column
 * layout would otherwise have cost, and the reason `submitCheckout` reads
 * `intent` rather than there being a form per verb.
 */
const CHECKOUT_FORM = 'checkout-form';


/** Shown but not selectable: the wallets need a browser payment SDK this app
 *  does not have, and a live-looking button that cannot pay is a dead end. */
const WALLETS = [
  { method: PaymentMethod.ApplePay, icon: '', labelKey: 'payApple' },
  { method: PaymentMethod.GooglePay, icon: 'G', labelKey: 'payGoogle' },
] as const;

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Checkout — mode, timing and payment on one page, from the refreshed web
 * artifact.
 *
 * It used to be two screens: `/preorder` chose the mode and the time, and
 * `/checkout` was the design's slide-over drawer with the payment in it. The
 * refresh draws a single page, two columns, with the order summary sticky on
 * the right — so `/preorder` now redirects here and the drawer is gone.
 *
 * **Nobody is asked to sign in on arrival any more.** That made sense when this
 * page was only the payment; now that it is also where somebody picks take-away
 * and a time, demanding a phone number to look at it would be a toll gate in
 * front of the whole screen. Booking and paying each redirect to `/signin` and
 * come back, and everything chosen is written to the basket cookie before they
 * do, so nothing is lost on the way.
 *
 * **Its two times are the artifact's native fields**, not grids of links: a
 * `datetime-local` for the table and a `time` for the food. That is the trade
 * this screen used to refuse — a grid could only ever offer times the API had
 * already agreed to, and a field can name one it will not — so the refusal is
 * caught in `submitCheckout` and drawn at the top of the page, and the party
 * size, the ready time and the payment method all travel in one form so that
 * touching any of them does not empty the others.
 */
export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  // An empty basket and one the API will not price both belong on `/cart`: the
  // first has nothing to check out, and the second is explained there, next to
  // the button that starts a new one.
  const basket = await loadBasket(language, checkoutPath(language));

  // A table and nothing to eat. The same screen, minus everything that needs a
  // quote — `POST /cart/quote` refuses a basket with no lines, and rightly,
  // since there is no food to price. Only the order summary is empty; the
  // booking below it is the whole point of the visit.
  if (basket.kind === 'booking') {
    return <BookingOnly language={language} cart={basket.cart} sp={sp} />;
  }

  if (basket.kind !== 'priced') {
    redirect(cartPath(language));
  }
  const { cart, quote } = basket;

  const dineIn = cart.serviceMode === ServiceMode.DineIn;
  const guests = cart.guests ?? DEFAULT_GUESTS;
  const now = new Date();

  // `branch` — who the food is being bought from, and what it looks like. The
  // same card the basket draws, fetched the same way, because this screen said
  // less about the restaurant than the one before it: a name and a prep time in
  // one grey line, which is enough to recognise a restaurant and not enough to
  // *check* one. Nothing here named the address being collected from or said
  // whether the kitchen was open — on the screen where the money is committed.
  //
  // **By branch id, not by the basket's slug.** A slug resolves to one branch of
  // a restaurant that may have several — `dolmama` is always the Saryan kitchen
  // — so a screen that prints an address has to name the branch the quote was
  // priced against or it will confidently give the wrong street.
  //
  // It is not allowed to take the checkout down with it. This is an ordinary
  // cached catalogue GET, and a screen holding somebody's payment must not 500
  // because the catalogue had a moment: the card is dropped, the lede names the
  // restaurant in its place, and everything that decides money — the quote —
  // is untouched.
  //
  // `availability` is fetched for dine-in only, and only for what a clock field
  // cannot answer for itself: whether this branch takes bookings at all, the
  // largest party any one table seats, and the deposit the API has sized for the
  // party asked for. The day it is asked about is the one the field is showing,
  // so the deposit and the limits describe the booking being made.
  //
  // Both go out together — the card is not worth a second round trip in front of
  // the booking block.
  const [branch, availability] = await Promise.all([
    api.restaurant(cart.branchId, language).catch(() => null),
    dineIn
      ? api.availability(
          cart.branchId,
          yerevanDate(cart.reservedFor ? new Date(cart.reservedFor) : now),
          guests,
        )
      : null,
  ]);
  const canBook = Boolean(availability?.reservationsEnabled);

  /**
   * The modes worth offering.
   *
   * Dine-in is drawn only where a table can actually be booked. It used to be
   * drawn always, so a restaurant that takes no bookings offered a tile whose
   * only destination was "this restaurant does not take bookings" — a door
   * drawn on a wall. `quote.reservationsEnabled` answers on every render,
   * including pickup ones, which is why it is on the quote rather than read off
   * the availability call this page only makes for dine-in.
   *
   * **A basket that is already dine-in keeps the tile** even when the answer is
   * no, because that basket has to have a way back: a restaurant can pause its
   * bookings while somebody is mid-checkout, and hiding the mode they are in
   * would leave them looking at the refusal with nothing to press.
   */
  const modes = [
    { mode: ServiceMode.Pickup, name: 'modePickup', hint: 'modePickupHint', icon: '🥡' } as const,
    ...(quote.reservationsEnabled || dineIn
      ? [
          {
            mode: ServiceMode.DineIn,
            name: 'modeDineIn',
            hint: 'modeDineInHint',
            icon: '🍽️',
          } as const,
        ]
      : []),
  ];
  // The largest party the stepper will count to: what this branch says it
  // takes, or its biggest table when that is smaller. Both come from the
  // availability answer rather than from a constant, so a branch that runs a
  // hall counts to a hundred and a wine bar with four tables counts to six.
  const maxGuests = Math.min(
    availability?.maxGuests || RESERVATION_MAX_GUESTS,
    availability?.maxSeats || 8,
  );
  const error = typeof sp.error === 'string' ? sp.error : undefined;

  // The floor and the grain of each field. `min` is rounded onto the clock
  // because a native field counts its steps *from* `min`: left at "14:07" a
  // half-hourly field would offer 14:07 and 14:37 rather than the clean times
  // the design draws.
  const tableFloor = yerevanDateTime(yerevanStepUp(now.toISOString(), RESERVATION_SLOT_MINUTES));
  // Bookings are taken 30 days ahead and orders only 7 — and this books a table
  // *for a basket*, so the table always carries food and the shorter limit is
  // the real one. Offering day eight would take a deposit for a meal the same
  // press cannot sell.
  const tableCeiling = yerevanDateTime(
    new Date(now.getTime() + ORDER_MAX_LEAD_DAYS * 86_400_000).toISOString(),
  );
  const readyFloor = formatTime(yerevanStepUp(quote.earliestReadyAt, READY_STEP_MINUTES));

  return (
    // The artifact draws the checkout on a narrower column than the catalogue
    // and centres it — see `.screen` in globals.css.
    <div className="screen screen--checkout">
      <Link className="back" href={cartPath(language)}>
        ← {label('basket')}
      </Link>

      <h1>{label('checkout')}</h1>
      {/* The subline is the order, not the restaurant — the dish count and the
          service mode, exactly as the basket says it. The restaurant used to be
          here, in this grey, and now has the card below to itself; saying the
          name twice, once faintly and once in the card immediately under it, is
          the duplication the basket had cleaned out of the same spot.

          When the card could not be fetched this is the only line left that
          names the place being bought from, so it takes the name back. */}
      <p className="lede">
        {quote.items.reduce((count, line) => count + line.qty, 0)}{' '}
        {label('dishes').toLowerCase()} · {label(dineIn ? 'modeDineIn' : 'modePickup')}
        {!branch && ` · ${quote.restaurantName}`}
      </p>

      {/* The route back to the menu, and the answer to "which of these kitchens
          am I about to pay?" — address, opening state, rating and the prep time
          for this basket. The back chip above goes to the basket, a different
          screen, so both links stay. */}
      {branch && (
        <BranchCard
          restaurant={branch}
          language={language}
          href={restaurantPath(language, cart.slug)}
          prepMin={quote.prepMin}
        />
      )}

      {error && (
        <p className="notice warn">
          {error === 'slot_taken'
            ? label('slotUnavailable')
            : error === 'stale'
              ? label('branchClosed')
              : label('orderFailed')}
        </p>
      )}

      <div className="checkout-grid">
        <div>
          {/* The mode, the pickup ending under it, and everything the pair
              decides — one component, because pressing a tile used to redirect
              to this same page and the whole screen blinked for it. `ModeSwitch`
              says how that works and what is still a plain form underneath.

              **What is drawn is decided here, not in there.** The tiles carry
              already-translated strings and the sections are chosen by the
              server, so the client component holds no i18n and no rules about
              what this restaurant offers — the same contract `GuestStepper`
              has. All three pickup inputs come from the quote
              (`pickupOptions`, `eatInRequiresBooking`, `reservationsEnabled`)
              rather than being worked out here, so the screen and the API
              cannot disagree about what this restaurant does. */}
          <ModeSwitch
            language={language}
            current={cart.serviceMode}
            modes={modes.map((option) => ({
              mode: option.mode,
              icon: option.icon,
              name: label(option.name as 'modePickup'),
              hint: label(option.hint as 'modePickupHint'),
            }))}
            modeAction={chooseServiceMode}
            onModeChange={changeServiceModeLive}
            /* What happens to a pickup order after it is collected.

               A counter offers both endings and both are live. A restaurant
               offers one — eating in there is a booked table, not a checkbox on
               a pickup order — and the other is still drawn, leading to the
               calendar. Hiding it would leave the guest to discover the rule by
               not finding it; this way the rule explains itself at the moment
               somebody reaches for it.

               **A lone ending is shown, not hidden.** The artifact's own rule is
               `subKeys.length > 1`, so a take-away-only restaurant drew no
               section at all and the screen went from the mode straight to the
               clock — leaving "what happens to this food" answered nowhere, when
               it is the one thing this block exists to say. One tile reads as a
               statement rather than a choice, which is what it is, and it
               matches the lone mode tile above it. */
            pickup={
              !dineIn && quote.pickupOptions.length > 0
                ? quote.pickupOptions.map((option) => ({
                    option,
                    chosen: quote.pickupOption === option,
                    icon: option === PickupOption.EatIn ? '🍴' : '🥡',
                    name: label(
                      option === PickupOption.EatIn ? 'pickupEatIn' : 'pickupTakeAway',
                    ),
                    hint: label(
                      option === PickupOption.EatIn ? 'pickupEatInHint' : 'pickupTakeAwayHint',
                    ),
                  }))
                : null
            }
            pickupLabel={label('pickupChoice')}
            pickupAction={choosePickupOption}
            onPickupChange={changePickupOptionLive}
            /* The dead "eat in" tile needs `reservationsEnabled` beside
               `eatInRequiresBooking`: the second is the *declaration*
               (`reserve`), so a restaurant that has paused its bookings still
               satisfies it, and this door would open onto the same refusal the
               mode tile was hidden to avoid. Both entrances to the calendar are
               gated on bookings actually being taken. */
            bookingDoor={
              quote.eatInRequiresBooking && quote.reservationsEnabled
                ? {
                    mode: ServiceMode.DineIn,
                    name: label('pickupEatIn'),
                    hint: label('pickupEatInBooking'),
                    badge: label('needsBooking'),
                  }
                : null
            }
          >
          {/* Everything from here down is one form — see `CHECKOUT_FORM`. The
              two clock fields hold their value nowhere but the page, so a
              submit that left one of them behind would lose it. */}
          <form id={CHECKOUT_FORM} action={submitCheckout}>
            <input type="hidden" name="lang" value={language} />

            {/* `rise` because this block *arrives*: a press on "Table booking"
                no longer redraws the page, so nothing else would mark the
                moment a calendar and a deposit appear where a row of pickup
                tiles was. It plays on the first paint of a dine-in checkout
                too, which is the same entrance the artifact gives its own
                sections. Opted out of under `prefers-reduced-motion`. */}
            {dineIn && availability && (
              <section className="booking rise">
                {!canBook ? (
                  <p className="notice warn">{label('reservationsOff')}</p>
                ) : (
                  <>
                    <h2 className="section-label">{label('reservationWhen')}</h2>
                    {/* The design's month calendar and slot grid, back on the
                        web (2026-08-08). The bare `datetime-local` that stood
                        here could name a time the restaurant would not take —
                        a closed Monday, a quarter past the hour, an evening
                        with every table gone — so the refusal arrived after the
                        press. The grid offers only what the API has agreed to.
                        The field itself is still what a browser with no
                        JavaScript gets; see `DateTimeField`. */}
                    <DateTimeField
                      language={language}
                      name="reservedFor"
                      value={cart.reservedFor ? yerevanDateTime(cart.reservedFor) : tableFloor}
                      min={tableFloor}
                      max={tableCeiling}
                      step={RESERVATION_SLOT_MINUTES * 60}
                      today={yerevanDate(now)}
                      /* The page's ceiling, not the calendar's: a table booked
                         here always carries food, and orders are taken seven
                         days out where bookings alone run to thirty. */
                      horizonDays={ORDER_MAX_LEAD_DAYS}
                      branchId={cart.branchId}
                      guests={guests}
                      endpoint={availabilityApiPath(language)}
                      label={label('reservationWhen')}
                      noSlotsLabel={label('noSlots')}
                      closeLabel={label('locClose')}
                      chooseLabel={label('chooseTime')}
                    />

                    <h2 className="section-label">{label('guests')}</h2>
                    {/* The artifact's stepper, not a row of numbered chips. A
                        chip per seat drew twelve targets to answer a question
                        whose answer is nearly always two or four, and it grew
                        with `maxSeats` — a branch seating twelve wrapped onto
                        two lines of buttons that all look alike.

                        Its buttons submit this form, and inside it on purpose:
                        the party size changes what the server must price, and a
                        GET to a new URL would redraw the page with the field
                        above it empty again. Each carries the number it would
                        produce rather than a direction, so the arithmetic stays
                        in the component and `submitCheckout` keeps taking one
                        `guests` value from anything that sends one — neither
                        carries an `intent`, since it stores and redraws for
                        anything it does not recognise.

                        The component is a client one only to *stop* that submit
                        when it can: pressing a button was a whole navigation,
                        and the checkout blinked while two API calls re-priced
                        one digit. See `GuestStepper` — the submit is the
                        fallback, not the mechanism. */}
                    <GuestStepper
                      guests={guests}
                      max={maxGuests}
                      fewerLabel={label('guestsFewer')}
                      moreLabel={label('guestsMore')}
                      maxLabel={label('guestsMax')}
                      onChange={changeGuests}
                    />

                    <div className="deposit-card">
                      <div className="row">
                        <span>{label('deposit')}</span>
                        <strong>{formatAmd(availability.depositAmd)}</strong>
                      </div>
                      <p>{label('depositCredited')}</p>
                    </div>

                    {cart.reservationId && (
                      <p className="notice good">
                        ✓ {label('tableBooked')}
                        {quote.tableNo ? ` · ${label('atTable')} ${quote.tableNo}` : ''}
                      </p>
                    )}
                  </>
                )}
              </section>
            )}

            <h2 className="section-label">{label('readyAtLabel')}</h2>
            {/* Left empty it means "as soon as possible" — the absence of a time
                rather than a time of its own, which is what `POST /orders`
                defaults to. A clock field says that with `--:--`, which says
                nothing, so the grid says it in words and starts on it. Every
                other option comes from the quote's own `earliestReadyAt`, so
                the kitchen has already agreed to all of them. `readyOn` carries
                the day, since an `HH:mm` has none: without it "13:15" on a page
                left open overnight would resolve to a time already past. */}
            <ReadyAtField
              language={language}
              name="readyAt"
              value={cart.readyAt ? formatTime(cart.readyAt) : ''}
              min={readyFloor}
              step={READY_STEP_MINUTES * 60}
              earliestReadyAt={quote.earliestReadyAt}
              label={label('readyAtLabel')}
              asapLabel={label('asSoonAsPossible')}
              hintLabel={`${label('readyAtHint')} · ${readyFloor}`}
              closeLabel={label('locClose')}
            />
            <input type="hidden" name="readyOn" value={quote.earliestReadyAt} />

            <h2 className="section-label">{label('payment')}</h2>
            <div className="pay-form">
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
            </div>
          </form>
          <p className="fineprint">{label('payingIsFinal')}</p>
          </ModeSwitch>
        </div>

        <aside className="order-summary">
          <h2>{label('yourOrder')}</h2>

          <div className="order-lines">
            {quote.items.map((line) => (
              <div className="order-line" key={line.menuItemId}>
                <span className="qty-chip">{line.qty}</span>
                <span className="name">{line.name}</span>
                <span className="amount">{formatAmd(line.lineTotalAmd)}</span>
              </div>
            ))}
          </div>

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
            {quote.depositAmd > 0 && (
              <div>
                <dt>{label('deposit')}</dt>
                <dd>{formatAmd(quote.depositAmd)}</dd>
              </div>
            )}
            <div className="grand">
              <dt>{label('total')}</dt>
              <dd>{formatAmd(quote.totalAmd)}</dd>
            </div>
          </dl>

          {quote.depositAmd > 0 && <p className="fineprint">{label('depositCredited')}</p>}

          {/* One button, two meanings, exactly as the artifact draws it: "book
              the table" while a dine-in basket has none, and the payment once it
              has. Dine-in without a table is the one combination `POST /orders`
              refuses outright, so the booking is what this press does first
              rather than something to go and find further up the page. */}
          {dineIn && !cart.reservationId ? (
            // Disabled rather than replaced by a notice where the restaurant
            // takes no bookings: the left column already says why, in the place
            // the field would have been, and repeating the sentence here would
            // be the summary answering a question nobody asked it. What belongs
            // in this corner is the action, visibly unavailable.
            <button
              className="summary-cta"
              type="submit"
              form={CHECKOUT_FORM}
              name="intent"
              value="book"
              disabled={!canBook}
            >
              {label('bookTable')}
            </button>
          ) : (
            <button
              className="summary-cta"
              type="submit"
              form={CHECKOUT_FORM}
              name="intent"
              value="pay"
              disabled={!quote.canOrder}
            >
              {label('placeOrder')} · {formatAmd(quote.dueNowAmd)}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * The checkout when the basket holds a table and no food.
 *
 * **The same screen, not a second one.** It was briefly a page of its own
 * (`/book/{slug}`), on the reasoning that checkout is built around a quote and a
 * booking has none. That was true of the code and wrong for the visitor: this is
 * still the screen where you settle when you are coming and what it costs, and
 * splitting it left two places that had to agree about the calendar, the guest
 * stepper and the deposit.
 *
 * So the quote is simply absent. What needed it — the lines, the totals, the
 * payment methods, the ready-time field — is what a booking does not have; the
 * restaurant's own record supplies the name, and `availability` sizes the
 * deposit, exactly as it does on the priced page.
 */
async function BookingOnly({
  language,
  cart,
  sp,
}: {
  language: Language;
  cart: Cart;
  sp: Record<string, string | string[] | undefined>;
}) {
  const label = t(language);
  const guests = cart.guests ?? DEFAULT_GUESTS;
  const now = new Date();

  // **By branch id, not by the slug this used to ask for.** The two agree only
  // where a restaurant has one branch: a slug always resolves to one particular
  // kitchen, so a booking made against another one of them was drawn under the
  // wrong restaurant record. That was invisible while this screen printed only a
  // name — every branch of `dolmama` is called Dolmama — and stops being
  // invisible the moment the card below prints a street.
  //
  // Fetched with the availability rather than before it: neither needs the
  // other's answer, and a booking screen should not pay for two round trips in
  // sequence to draw one header.
  const [restaurant, availability] = await Promise.all([
    api.restaurant(cart.branchId, language),
    api.availability(
      cart.branchId,
      yerevanDate(cart.reservedFor ? new Date(cart.reservedFor) : now),
      guests,
    ),
  ]);
  if (!restaurant) {
    notFound();
  }
  const canBook = availability.reservationsEnabled;
  const maxGuests = Math.min(
    availability.maxGuests || RESERVATION_MAX_GUESTS,
    availability.maxSeats || 8,
  );
  const tableFloor = yerevanDateTime(yerevanStepUp(now.toISOString(), RESERVATION_SLOT_MINUTES));
  const tableCeiling = yerevanDateTime(
    new Date(now.getTime() + ORDER_MAX_LEAD_DAYS * 86_400_000).toISOString(),
  );
  const error = typeof sp.error === 'string' ? sp.error : undefined;
  const menu = restaurantPath(language, restaurant.slug);

  return (
    <div className="screen screen--checkout">
      <h1>{label('checkout')}</h1>
      {/* What kind of order this is. The restaurant is not said here — the card
          below carries it, and this variant has no dishes to count. */}
      <p className="lede">{label('modeDineIn')}</p>

      {/* Replaces the back chip, which said this restaurant's name and led to
          this same menu — the card says it, shows it, and is still the way
          there. No prep time: there is no basket to time, and the branch's
          general figure would promise a wait for food nobody has ordered. */}
      <BranchCard restaurant={restaurant} language={language} href={menu} />

      {error && (
        <p className="notice warn">
          {error === 'slot_taken' ? label('slotUnavailable') : label('orderFailed')}
        </p>
      )}

      <div className="checkout-grid">
        <div>
          {/* Both modes, as on the priced page — but "Pre-Order" here has
              nothing to pre-order, so it goes to the menu rather than switching
              a basket with no lines in it to pickup and stranding the visitor on
              a checkout with nothing to check out. */}
          <div className="modes">
            <Link className="mode" href={menu}>
              <span className="emoji" aria-hidden="true">
                🥡
              </span>
              <span className="name">{label('modePickup')}</span>
              <span className="hint">{label('modePickupHint')}</span>
            </Link>
            <span className="mode on" aria-current="true">
              <span className="emoji" aria-hidden="true">
                🍽️
              </span>
              <span className="name">{label('modeDineIn')}</span>
              <span className="hint">{label('modeDineInHint')}</span>
            </span>
          </div>

          <form id={CHECKOUT_FORM} action={submitCheckout}>
            <input type="hidden" name="lang" value={language} />

            <section className="booking">
              {!canBook ? (
                <p className="notice warn">{label('reservationsOff')}</p>
              ) : (
                <>
                  <h2 className="section-label">{label('reservationWhen')}</h2>
                  {/* The same calendar as the priced page — this variant books
                      the same tables through the same endpoint, and two ways to
                      pick a time would be two places to keep in step. */}
                  <DateTimeField
                    language={language}
                    name="reservedFor"
                    value={cart.reservedFor ? yerevanDateTime(cart.reservedFor) : tableFloor}
                    min={tableFloor}
                    max={tableCeiling}
                    step={RESERVATION_SLOT_MINUTES * 60}
                    today={yerevanDate(now)}
                    horizonDays={ORDER_MAX_LEAD_DAYS}
                    branchId={cart.branchId}
                    guests={guests}
                    endpoint={availabilityApiPath(language)}
                    label={label('reservationWhen')}
                    noSlotsLabel={label('noSlots')}
                    closeLabel={label('locClose')}
                    chooseLabel={label('chooseTime')}
                  />

                  <h2 className="section-label">{label('guests')}</h2>
                  <GuestStepper
                    guests={guests}
                    max={maxGuests}
                    fewerLabel={label('guestsFewer')}
                    moreLabel={label('guestsMore')}
                    maxLabel={label('guestsMax')}
                    onChange={changeGuests}
                  />

                  <div className="deposit-card">
                    <div className="row">
                      <span>{label('deposit')}</span>
                      <strong>{formatAmd(availability.depositAmd)}</strong>
                    </div>
                    <p>{label('depositCredited')}</p>
                  </div>

                  {cart.reservationId && (
                    <p className="notice good">✓ {label('tableBooked')}</p>
                  )}
                </>
              )}
            </section>
          </form>
        </div>

        <aside className="order-summary">
          <h2>{label('yourOrder')}</h2>

          {/* Empty on purpose, and it says so rather than showing a zero total:
              nothing has been ordered, and "0 ֏" would read as a price. */}
          <div className="panel-empty">
            <div className="glyph" aria-hidden="true">
              🧺
            </div>
            <p>{label('emptyPanelHint')}</p>
          </div>

          {/* The way to add food: back to the menu. Drawn where the payment
              would be, because with no lines there is nothing to pay for — the
              table is booked with the button below it. */}
          <Link className="summary-cta ghost" href={menu}>
            {label('addFoodToBooking')}
          </Link>

          {!cart.reservationId && (
            <button
              className="summary-cta"
              type="submit"
              form={CHECKOUT_FORM}
              name="intent"
              value="book"
              disabled={!canBook}
            >
              {label('bookTable')}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
