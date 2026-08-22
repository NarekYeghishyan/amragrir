import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import {
  ORDER_MAX_LEAD_DAYS,
  PickupOption,
  RESERVATION_MAX_LEAD_DAYS,
  ServiceMode,
  readyTimeOptions,
} from '@amragrir/shared';
import { ApiError, newIdempotencyKey } from '../src/api/client';
import { cart as cartApi, reservations } from '../src/api/endpoints';
import type { Availability, Quote } from '../src/api/types';
import { BookingCalendar } from '../src/components/BookingCalendar';
import { PickerSheet } from '../src/components/PickerSheet';
import { TimeWheel } from '../src/components/TimeWheel';
import { useCart } from '../src/cart';
import { formatAmd, formatDayShort, formatTime, yerevanDate } from '../src/format';
import { useLanguage } from '../src/language';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

/**
 * How far ahead this calendar goes **when a basket is behind it**.
 *
 * Bookings are taken `RESERVATION_MAX_LEAD_DAYS` ahead and orders only
 * `ORDER_MAX_LEAD_DAYS`, and that table carries food. Offering a day the food
 * cannot be ordered on would take a deposit for a meal that is then refused at
 * the payment, so the shorter of the two wins.
 *
 * The table-only shape of this screen cooks nothing, so it is not bound by that
 * and runs to the branch's own limit — see `tableOnly` below.
 */
const BOOKING_HORIZON_DAYS = Math.min(RESERVATION_MAX_LEAD_DAYS, ORDER_MAX_LEAD_DAYS);

/**
 * When and how — and, since 2026-08-12, where a table is booked with nothing to
 * eat as well.
 *
 * Two shapes of one screen. With a basket it settles the mode, the ending and
 * the hour, and for dine-in it books the table that basket will be eaten at.
 * With no basket — the restaurant screen's "🪑 Book a table" — everything that
 * needs a quote is simply absent and the calendar is the whole visit.
 */
export default function PreorderScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const router = useRouter();
  const { user } = useSession();
  const {
    branchId: basketBranchId,
    lines,
    serviceMode,
    reservationId,
    readyAt,
    setServiceMode,
    setPickupOption,
    setReservation,
    setReadyAt,
    toPayload,
  } = useCart();
  /** The branch that came with the press. An empty basket names no restaurant,
   *  so "Book a table" has to say which one it means. */
  const params = useLocalSearchParams<{ branchId?: string; name?: string }>();
  const linkedBranchId =
    typeof params.branchId === 'string' && params.branchId.length > 0 ? params.branchId : null;
  const linkedName = typeof params.name === 'string' ? params.name : null;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [guests, setGuests] = useState(2);
  /** Chosen but not yet booked. The footer button is what turns it into a
   *  table — see `BookingCalendar` for why picking no longer books. */
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  /** A day or a party size is in flight, so the times on screen are the last
   *  answer's and must not be tapped. Same bargain the browser's picker makes. */
  const [loadingSlots, setLoadingSlots] = useState(false);
  /** Whether the ready-time grid is unfolded. Shut to begin with: the row above
   *  it already says what an untouched basket means. */
  const [readyOpen, setReadyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yerevan's today, not the phone's: a traveller booking at 01:00 their time
  // must not be offered a date the restaurant has already finished.
  const today = useMemo(() => yerevanDate(new Date()), []);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));

  const dineIn = serviceMode === ServiceMode.DineIn;
  /**
   * A table with nothing to eat.
   *
   * **The same screen, not a second one.** It was a second one until now
   * (`app/book/[branchId].tsx`), on the reasoning that this one is built around
   * a basket and a booking has none. True of the code and wrong for the guest:
   * this is still where you settle when you are coming and what it costs, and
   * two screens meant two places that had to agree about the calendar, the party
   * size and the deposit. The web reached the same conclusion first and folded
   * its `/book/{slug}` back into the checkout (USER_FLOW.md §3a).
   *
   * So the quote is simply absent, and everything that needed one — the lines,
   * the ready-time grid, the totals — is exactly what a booking does not have.
   *
   * **A basket belonging to another restaurant counts as none.** It must not be
   * priced under this branch's name, and nothing on this screen may move it to
   * dine-in: that basket is somebody's dinner somewhere else.
   */
  const tableOnly =
    linkedBranchId !== null && (lines.length === 0 || basketBranchId !== linkedBranchId);
  /** The one branch every request on this screen is about. */
  const branchId = tableOnly ? linkedBranchId : basketBranchId;
  /** Both shapes want table times: the dine-in basket, and the table alone. */
  const wantsTable = tableOnly || dineIn;
  const payload = toPayload();
  // The chosen ending is part of the key because the server validates it: a
  // restaurant that has started taking bookings refuses an eat-in basket, and
  // that refusal belongs on the screen the choice was made on rather than at
  // the payment.
  const basketKey =
    payload === null
      ? ''
      : `${payload.branchId}:${payload.serviceMode}:${payload.pickupOption ?? ''}:${
          payload.reservationId ?? ''
        }:${JSON.stringify(payload.items)}`;

  // Re-priced whenever the basket's shape changes, because the deposit on a
  // booked table changes what is left to pay — `dueNowAmd`, the figure on the
  // button below, is the server's answer and never a subtraction done here.
  useEffect(() => {
    // Nothing to price on the table-only shape — and where a basket does exist
    // there it belongs to another restaurant, whose totals have no business on
    // this screen.
    if (tableOnly || payload === null) {
      return;
    }
    let cancelled = false;

    cartApi
      .quote(payload)
      .then((result) => {
        if (!cancelled) {
          setQuote(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [basketKey, tableOnly]);

  /**
   * Arriving from "🪑 Book a table" with a basket at this branch: the press
   * asked for a table, so the mode it asked for is the one it gets, rather than
   * a pickup screen with the calendar two taps further on.
   *
   * Once, on arrival. Switching to Pre-Order afterwards is the guest's decision
   * and has to stick.
   */
  const modeAsked = useRef(false);
  useEffect(() => {
    if (linkedBranchId !== null && !tableOnly && !modeAsked.current) {
      modeAsked.current = true;
      setServiceMode(ServiceMode.DineIn);
    }
  }, [linkedBranchId, tableOnly]);

  /** Drops a chosen time the fresh answer no longer offers — a bigger party or
   *  a table taken while the screen sat open both invalidate it. */
  const keepSelection = (fresh: Availability): void => {
    setSelected((current) =>
      current !== null && fresh.slots.some((slot) => slot.at === current && slot.available)
        ? current
        : null,
    );
  };

  // Only fetched where a table is wanted: a pickup basket has no use for table
  // times, and the call would be a round trip spent on a section nobody sees.
  useEffect(() => {
    if (!wantsTable || branchId === null) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);

    reservations
      .availability(branchId, date, guests)
      .then((result) => {
        if (!cancelled) {
          setAvailability(result);
          keepSelection(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [wantsTable, branchId, date, guests]);

  /**
   * One key per slot, held across retries of that slot.
   *
   * Retrying the *same* time must replay the first booking rather than hold a
   * second table; choosing a different time is a different attempt and needs
   * its own key, or the server would replay the old slot back at us.
   */
  const bookingKey = useRef<{ at: string; key: string } | null>(null);

  const book = async (at: string): Promise<void> => {
    if (branchId === null) {
      return;
    }
    // A table is held against a verified account (BUSINESS_LOGIC.md §3), so a
    // guest has nothing to book with. Asked before the deposit rather than
    // after, which is where the API would have asked.
    if (user?.phoneVerified !== true) {
      router.push('/auth');
      return;
    }
    if (bookingKey.current?.at !== at) {
      bookingKey.current = { at, key: newIdempotencyKey() };
    }
    setBooking(true);
    setError(null);

    try {
      const reservation = await reservations.create(
        { branchId, reservedFor: at, guests },
        bookingKey.current.key,
      );
      if (tableOnly) {
        // Nothing is waiting behind this screen, so the booking itself is the
        // destination — and `replace`, not `push`: swiping back to a calendar
        // that has already taken a deposit would offer to take a second one.
        router.replace(`/booking/${reservation.id}`);
        return;
      }
      setReservation(reservation.id);
      // The food is wanted when the table is, not as soon as the kitchen can
      // manage: `POST /orders` takes the booked instant and starts the kitchen
      // a prep-time before it, so a table at 19:30 tomorrow is served at 19:30
      // tomorrow rather than cooked tonight.
      setReadyAt(reservation.reservedFor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
      // The slot may simply have gone while the screen was open, so redraw the
      // day rather than leaving a time on offer that nobody can take — and let
      // the fresh answer take the choice with it if it is one of them.
      reservations
        .availability(branchId, date, guests)
        .then((fresh) => {
          setAvailability(fresh);
          keepSelection(fresh);
        })
        .catch(() => undefined);
    } finally {
      setBooking(false);
    }
  };

  /**
   * The modes worth offering.
   *
   * Table booking is drawn only where a table can actually be booked —
   * `reserve` declared *and* bookings not paused, which is the one
   * `reservationsEnabled` on the quote. The phone drew it unconditionally until
   * now, so a restaurant that takes no bookings offered a tile whose only
   * destination was the "does not take bookings" notice: a door painted on a
   * wall. The web has gated it since 2026-08-07.
   *
   * **A basket that is already dine-in keeps the tile** even when the answer is
   * no, because a restaurant can pause its bookings while somebody is mid-order
   * and hiding the mode they are in would leave them looking at the refusal with
   * nothing to press. That is the one case the notice below is still reachable.
   *
   * Until the first quote lands the row is Pre-Order alone. A tile that appears
   * is honest; one drawn on a guess and then taken away is a tile that can
   * vanish under a finger.
   *
   * **The table-only shape has no quote and keeps the tile anyway**, because it
   * is the whole reason the screen was opened — the restaurant screen only
   * draws that button where a table can be booked, so the question has already
   * been answered by the time the press lands here.
   */
  const canBook = quote?.reservationsEnabled ?? false;
  const modes = [
    { mode: ServiceMode.Pickup, glyph: '🥡', name: 'modePickup', hint: 'modePickupHint' },
    ...(canBook || wantsTable
      ? [{ mode: ServiceMode.DineIn, glyph: '🍽️', name: 'modeDineIn', hint: 'modeDineInHint' }]
      : []),
  ];
  /** The dead "eat at the restaurant" door needs `reservationsEnabled` beside
   *  `eatInRequiresBooking`: the second is the *declaration*, so a restaurant
   *  that has paused its bookings still satisfies it, and this door would open
   *  onto the same refusal the mode tile was hidden to avoid. Both entrances to
   *  the calendar close together. */
  const bookingDoor = Boolean(quote?.eatInRequiresBooking) && canBook;

  const readyTimes = quote === null ? [] : readyTimeOptions(quote.earliestReadyAt);
  /** The wheel's rows. The first option is "as soon as possible", which is the
   *  button above the wheel rather than a row in it, so it is dropped here.
   *  A time the formatter cannot read is dropped rather than drawn blank — the
   *  wheel splits `HH:MM` into its two columns and has nothing to show without
   *  one. */
  const wheelTimes = readyTimes.slice(1).flatMap((option) => {
    const time = formatTime(option.at);
    return time === null ? [] : [{ at: option.at, time }];
  });
  /** When a dine-in basket's food is wanted: the booked instant once a table is
   *  held, and the slot under the finger before that. The two are the same
   *  value a moment apart — booking sets `readyAt` from `reservedFor` — so the
   *  row names the hour as soon as one is chosen rather than staying blank
   *  until the deposit is authorised. */
  const tableAt = readyAt ?? selected;
  /** How many dishes, not how many lines: three of one thing is three items.
   *  Counting, not money — the amounts beside them are all the quote's. */
  const itemCount = quote === null ? 0 : quote.items.reduce((sum, line) => sum + line.qty, 0);
  /** The hour behind "as soon as possible", which without it is a promise with
   *  no clock in it. Both halves are the server's: the prep time it quoted for
   *  these dishes, and the instant it says they can be ready. */
  const asapNote =
    quote === null
      ? ''
      : ` · ~${quote.prepMin} ${t('minutes')} · ${formatTime(quote.earliestReadyAt)}`;
  // Dine-in without a table is the one combination `POST /orders` refuses
  // outright, so the step is blocked here rather than at the payment. On the
  // table-only shape it is the only thing the screen does.
  const needsTable = tableOnly || (dineIn && reservationId === null);
  // While a table is still owed, the button books it and needs a chosen time —
  // one the *current* day's answer has vetted, hence `loadingSlots`. Afterwards
  // it is the ordinary "on to checkout" and needs a priceable basket.
  const ctaBlocked = needsTable
    ? selected === null || loadingSlots
    : quote === null || !quote.canOrder;
  /** A button with nothing behind it is worse than none: a basket has none
   *  until it is priced, and a branch that has paused its bookings has nothing
   *  to press at all — the notice above says so instead. */
  const ctaShown = tableOnly ? availability?.reservationsEnabled === true : quote !== null;
  const ctaLabel = (): string => {
    // The closed sign only where a basket asked: a kitchen shut this evening
    // still takes a table for Friday.
    if (quote !== null && !quote.branchIsOpen) {
      return t('branchClosed');
    }
    if (needsTable) {
      return selected === null
        ? t('chooseTime')
        : `${t('bookTable')}${
            availability === null ? '' : ` · ${formatAmd(availability.depositAmd)}`
          }`;
    }
    // Only reached with a priced basket — `ctaShown` draws no button without one.
    return quote === null ? '' : `${t('continueToCheckout')} · ${formatAmd(quote.dueNowAmd)}`;
  };

  // Nothing to draw: no basket, and no branch named in the link either. A
  // moment during a `clear()`, or a link with neither.
  if (!tableOnly && lines.length === 0) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={tableOnly ? t('back') : t('basket')}
          style={[styles.back, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <Svg width={12} height={20} viewBox="0 0 12 20" fill="none">
            <Path
              d="M9 2L2 10l7 8"
              stroke={colors.ink}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>

        <Text style={[styles.title, { color: colors.ink }]}>{t('whenAndHow')}</Text>
        {/* No prep time on the table-only shape: there is no basket to time,
            and the branch's general figure would promise a wait for food
            nobody has ordered. The name comes with the press, because there is
            no quote here to carry it. */}
        <Text style={[styles.lede, { color: colors.ink2 }]} numberOfLines={1}>
          {tableOnly
            ? (linkedName ?? '')
            : quote === null
              ? ''
              : `${quote.restaurantName} · ${quote.prepMin} ${t('minutes')} ${t('prepWord')}`}
        </Text>

        <Text style={[styles.section, { color: colors.ink2 }]}>{t('howLikeIt')}</Text>
        {/* One tile is still a row. It stops being a question and becomes a
            label naming the kind of order being placed — dropping it would
            leave the screen opening on "Pickup type" with nothing above it
            saying what was being picked up. */}
        <View style={styles.modes}>
          {modes.map((option) => {
            const chosen = tableOnly
              ? option.mode === ServiceMode.DineIn
              : serviceMode === option.mode;
            return (
              <Pressable
                key={option.mode}
                // With no basket, "Pre-Order" has nothing to pre-order: it goes
                // to the menu rather than switching an empty basket to pickup
                // and leaving the guest on a screen with nothing to settle —
                // and a basket that belongs to another restaurant is not this
                // screen's to move at all.
                onPress={() => {
                  if (!tableOnly) {
                    setServiceMode(option.mode);
                  } else if (option.mode === ServiceMode.Pickup && branchId !== null) {
                    router.push({ pathname: '/restaurant/[id]', params: { id: branchId } });
                  }
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                // **Filled, not tinted.** The artifact's `modeCard` fills the
                // chosen tile with the accent and writes it in white, and keeps
                // the soft tint for the ending rows below — the two are drawn
                // differently on purpose, because the mode is the louder of the
                // two questions. Copying the rows' treatment up here left the
                // chosen mode reading as a hover state. This is the same pair
                // the "as soon as possible" chip uses further down.
                style={[
                  styles.mode,
                  {
                    borderColor: chosen ? colors.accent : colors.line,
                    backgroundColor: chosen ? colors.accent : colors.card,
                  },
                ]}
              >
                <Text style={styles.modeGlyph}>{option.glyph}</Text>
                <Text style={[styles.modeName, { color: chosen ? '#fff' : colors.ink }]}>
                  {t(option.name as 'modePickup')}
                </Text>
                <Text style={[styles.modeHint, { color: chosen ? '#fff' : colors.ink2 }]}>
                  {t(option.hint as 'modePickupHint')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* The choice *inside* pickup — what happens to the food once it is
            handed over. The artifact draws it as full-width rows under their
            own heading, one per ending, with a tick on the one chosen: they are
            sentences rather than tiles, and the second half of each ("collect
            it and go") is what tells them apart.

            A counter offers both endings and both are live. A restaurant offers
            one — eating in there is a booked table, not a checkbox on a pickup
            order — and the other is still drawn, marked "needs booking", and
            tapping it switches to Table booking so the calendar opens. Hiding
            it would leave the guest to discover the rule by not finding it.

            **One ending is still the whole section.** This used to require two
            of them, so a take-away-only counter drew no heading and no row, and
            the screen went from the mode tiles straight to the time — leaving
            what happens to the food unstated rather than answered. The artifact
            draws the heading and the take-away row for every pickup basket and
            gates only the eat-in row, which is the shape below: a single option
            reads as the confirmation that there is nothing to decide.

            The count is still tested, but against *nothing to draw* rather than
            against one: `pickupOptionsFor` answers `[]` for a branch that only
            seats or only takes bookings (`service-offering.spec.ts`), and a
            heading with no rows under it is worse than no heading.

            All three come from the quote (`pickupOptions`,
            `eatInRequiresBooking`, `reservationsEnabled`) rather than being
            worked out here, so the screen and the API cannot disagree about
            what this restaurant does — and the last could not be worked out
            from `services` at all, since the pause switch is not in there. */}
        {!dineIn && quote !== null && (quote.pickupOptions.length > 0 || bookingDoor) ? (
          <>
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('pickupChoice')}</Text>
            <View style={styles.endings}>
              {quote.pickupOptions.map((option) => {
                const chosen = quote.pickupOption === option;
                const eatIn = option === PickupOption.EatIn;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPickupOption(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    style={[
                      styles.ending,
                      {
                        borderWidth: chosen ? 2 : StyleSheet.hairlineWidth,
                        borderColor: chosen ? colors.accent : colors.line,
                        backgroundColor: chosen ? colors.accentSoft : colors.card,
                      },
                    ]}
                  >
                    <Text style={styles.endingGlyph}>{eatIn ? '🍴' : '🥡'}</Text>
                    <View style={styles.endingBody}>
                      <Text style={[styles.endingName, { color: colors.ink }]}>
                        {t(eatIn ? 'pickupEatIn' : 'pickupTakeAway')}
                      </Text>
                      <Text style={[styles.endingHint, { color: colors.ink2 }]}>
                        {t(eatIn ? 'pickupEatInHint' : 'pickupTakeAwayHint')}
                      </Text>
                    </View>
                    {chosen ? (
                      <View style={[styles.endingTick, { backgroundColor: colors.accent }]}>
                        <Text style={styles.endingTickText}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              {/* Not `disabled`: a disabled control says "not for you" and then
                  does nothing, and this one has somewhere to send them. It sets
                  the *mode* rather than an ending, which is the whole point —
                  it selects nothing under pickup — so the artifact ends it with
                  an arrow rather than a tick. */}
              {bookingDoor ? (
                <Pressable
                  onPress={() => setServiceMode(ServiceMode.DineIn)}
                  accessibilityRole="button"
                  accessibilityHint={t('pickupEatInBooking')}
                  style={[
                    styles.ending,
                    { borderColor: colors.line, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={styles.endingGlyph}>🍴</Text>
                  <View style={styles.endingBody}>
                    <Text style={[styles.endingName, { color: colors.ink }]}>
                      {t('pickupEatIn')}
                    </Text>
                    <Text style={[styles.endingHint, { color: colors.ink2 }]}>
                      {t('pickupEatInHint')}
                    </Text>
                    <Text
                      style={[
                        styles.endingPill,
                        { backgroundColor: colors.accentSoft, color: colors.accent },
                      ]}
                    >
                      {t('needsBooking')}
                    </Text>
                  </View>
                  <View style={[styles.endingArrow, { backgroundColor: colors.accentSoft }]}>
                    <Svg width={15} height={13} viewBox="0 0 20 16" fill="none">
                      <Path
                        d="M12 2l6 6-6 6M18 8H2"
                        stroke={colors.accent}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        {/* The calendar is the whole screen on the table-only shape, so its
            first load gets a spinner rather than a gap where a month will be.
            A basket has its lines and its totals to look at meanwhile. */}
        {tableOnly && availability === null ? (
          <ActivityIndicator color={colors.accent} style={styles.spinner} />
        ) : null}

        {wantsTable && availability !== null && !availability.reservationsEnabled ? (
          <Text style={[styles.notice, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>
            {t('reservationsOff')}
          </Text>
        ) : null}

        {wantsTable && availability?.reservationsEnabled ? (
          <>
            <BookingCalendar
              availability={availability}
              date={date}
              month={month}
              guests={guests}
              today={today}
              horizonDays={tableOnly ? RESERVATION_MAX_LEAD_DAYS : BOOKING_HORIZON_DAYS}
              selected={selected}
              busy={booking || loadingSlots}
              // A time chosen on one day and one party size means nothing on
              // another, so the highlight goes with the question it answered.
              onDate={(next) => {
                setDate(next);
                setSelected(null);
              }}
              onMonth={setMonth}
              onGuests={(count) => {
                setGuests(count);
                setSelected(null);
              }}
              onSelect={setSelected}
            />

            {/* Said here rather than only on the booking that follows: this
                shape books the table and stops, and somebody who wanted to eat
                should know the food is a separate step rather than something
                they missed. */}
            {tableOnly ? (
              <Text style={[styles.hint, { color: colors.ink2 }]}>{t('bookTableAloneHint')}</Text>
            ) : null}

            {!tableOnly && reservationId !== null ? (
              <Text style={[styles.notice, { color: colors.good, backgroundColor: colors.chip }]}>
                ✓ {t('tableBooked')}
                {quote?.tableNo ? ` · ${t('atTable')} ${quote.tableNo}` : ''}
              </Text>
            ) : null}
          </>
        ) : null}

        {/* **A dine-in basket gets this field too, since 2026-08-13** — it says
            what the kitchen is doing rather than asking a second question.

            It was hidden here until then, on the reasoning that booking a table
            has already answered it: `readyAt` is set to the booked instant, and
            asking twice would let somebody order food for 15:00 and hold a table
            for 19:30. The reasoning was sound and the conclusion was not. The
            artifact keeps the field in both modes and swaps what it *says* —
            `asapMainLabel: isDine ? readyForTable : asap` — so dine-in reads
            "In time for your table" over the booked day and hour. Hiding it left
            the one question every guest has, *when will my food be there*,
            answered nowhere on the screen that asks about time twice.

            So the field is drawn and, on dine-in, **it is a statement**: no
            chevron, no sheet, nothing to pick. That keeps the rule the hiding
            was protecting — one time, the table's — while showing it. Offering
            the wheel here as well is the other half of the open question in
            SCREENS.md, and it is the half that lets the food and the table
            disagree.

            A table with no food behind it still gets nothing: there is no
            kitchen to ask about. */}
        {tableOnly ? null : dineIn ? (
          <>
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('readyAtLabel')}</Text>
            <View
              style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Text style={styles.pickerGlyph}>🕐</Text>
              <Text style={[styles.pickerText, { color: colors.ink }]} numberOfLines={1}>
                {t('readyForTable')}
                {tableAt === null ? '' : ` · ${formatDayShort(date, language)} · ${formatTime(tableAt)}`}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* The same key the web's heading and the checkout row use. This
                said "Food ready at" from its own mobile-only string until
                2026-08-12, which named the field one thing here and another
                on every other surface that shows it — the artifact, the web
                checkout, and the summary six rows below on this very screen. */}
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('readyAtLabel')}</Text>

            {/* The row is the whole field on the page: this question already
                has an answer — "as soon as possible" is what an untouched
                basket means — so the row states it and the hour it works out
                to, and only somebody who wants a different one opens the
                picker. Which now opens as a sheet rather than unfolding here,
                so the wheel inside it is the only thing on screen that scrolls
                (`PickerSheet`). */}
            <Pressable
              onPress={() => setReadyOpen((was) => !was)}
              accessibilityRole="button"
              accessibilityState={{ expanded: readyOpen }}
              style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Text style={styles.pickerGlyph}>🕐</Text>
              <Text style={[styles.pickerText, { color: colors.ink }]} numberOfLines={1}>
                {readyAt === null ? `${t('asSoonAsPossible')}${asapNote}` : formatTime(readyAt)}
              </Text>
              <View style={{ transform: [{ rotate: readyOpen ? '180deg' : '0deg' }] }}>
                <Svg width={12} height={8} viewBox="0 0 12 8" fill="none">
                  <Path
                    d="M1 1l5 5 5-5"
                    stroke={colors.ink2}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </Pressable>

            <PickerSheet
              open={readyOpen}
              title={t('readyAtLabel')}
              onClose={() => setReadyOpen(false)}
            >
              <>
                {/* "As soon as possible" is one press and one answer, so it
                    still closes the sheet on the way out. The wheel below it
                    cannot: it answers continuously, and a sheet that shut on the
                    first hour scrolled under the lens would close before the one
                    anybody wanted got there. The ✕ and the scrim close it either
                    way, and there is still no "Done" button — the artifact draws
                    one, and it confirms nothing the row behind does not show. */}
                <Pressable
                  onPress={() => {
                    setReadyAt(null);
                    setReadyOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: readyAt === null }}
                  style={[
                    styles.asap,
                    readyAt === null
                      ? { backgroundColor: colors.accent, borderColor: colors.accent }
                      : { backgroundColor: colors.bg, borderColor: colors.line },
                  ]}
                >
                  <Text style={styles.asapGlyph}>⚡</Text>
                  <View>
                    <Text
                      style={[
                        styles.asapName,
                        { color: readyAt === null ? '#fff' : colors.ink },
                      ]}
                    >
                      {t('asSoonAsPossible')}
                    </Text>
                    {quote === null ? null : (
                      <Text
                        style={[
                          styles.asapNote,
                          { color: readyAt === null ? '#fff' : colors.ink2 },
                        ]}
                      >
                        ~{quote.prepMin} {t('minutes')} · {formatTime(quote.earliestReadyAt)}
                      </Text>
                    )}
                  </View>
                </Pressable>

                {/* The same wheel the booking calendar asks its hour on — the
                    artifact draws one control for both questions, and this is
                    it. The first option *is* "as soon as possible", the button
                    above, so the wheel starts at the one after it. While that
                    button is the answer no row is highlighted, which is how the
                    artifact draws it too: the wheel rests somewhere without
                    claiming it. */}
                <Text style={[styles.pickerLabel, { color: colors.ink3 }]}>{t('exactTime')}</Text>
                <TimeWheel times={wheelTimes} value={readyAt} onChange={setReadyAt} />
              </>
            </PickerSheet>
          </>
        )}

        {/* Nothing to summarise for a dine-in basket with no table yet: the time
            is the booking's, and there is no booking. The CTA says so. */}
        {quote !== null && (!dineIn || readyAt !== null) ? (
          <View style={[styles.summary, { backgroundColor: colors.accentSoft }]}>
            <Text style={styles.summaryGlyph}>⚡</Text>
            <View style={styles.summaryText}>
              <Text style={[styles.summaryTitle, { color: colors.accent }]}>
                {readyAt === null
                  ? `${t('readyInShort')} ${quote.prepMin} ${t('minutes')}`
                  : `${t('readyAtLabel')} ${formatTime(readyAt)}`}
              </Text>
              <Text style={[styles.summaryHint, { color: colors.ink2 }]}>{t('kitchenNote')}</Text>
            </View>
          </View>
        ) : null}

        {/* What is being ordered, on the screen where when and how are settled.
            The artifact puts it here because this is the last screen before the
            money, and until now the phone showed nothing of the order on it —
            the basket was a screen behind and the checkout a screen ahead, and
            in between somebody was picking an hour for dishes they could not
            see. Every figure is the quote's; nothing here is added up. */}
        {quote !== null ? (
          <View style={[styles.order, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Pressable
              onPress={() => router.push('/basket')}
              accessibilityRole="button"
              style={styles.orderHead}
            >
              <Text style={[styles.orderTitle, { color: colors.ink }]}>{t('yourOrder')}</Text>
              <View style={styles.orderCount}>
                <Text style={[styles.orderCountText, { color: colors.accent }]}>
                  {itemCount} {t(itemCount === 1 ? 'itemOne' : 'itemOther')}
                </Text>
                <Svg width={8} height={13} viewBox="0 0 12 20" fill="none">
                  <Path
                    d="M3 2l7 8-7 8"
                    stroke={colors.accent}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </Pressable>

            <View style={styles.orderLines}>
              {quote.items.map((line) => (
                <View key={line.menuItemId} style={styles.orderLine}>
                  <Text
                    style={[
                      styles.orderQty,
                      { backgroundColor: colors.accentSoft, color: colors.accent },
                    ]}
                  >
                    {line.qty}
                  </Text>
                  <Text style={[styles.orderName, { color: colors.ink }]} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={[styles.orderLineTotal, { color: colors.ink }]}>
                    {formatAmd(line.lineTotalAmd)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.orderTotals, { borderTopColor: colors.line }]}>
              <View style={styles.orderRow}>
                <Text style={[styles.orderLabel, { color: colors.ink2 }]}>{t('subtotal')}</Text>
                <Text style={[styles.orderValue, { color: colors.ink }]}>
                  {formatAmd(quote.subtotalAmd)}
                </Text>
              </View>
              <View style={styles.orderRow}>
                <Text style={[styles.orderLabel, { color: colors.ink2 }]}>{t('serviceFee')}</Text>
                <Text style={[styles.orderValue, { color: colors.ink }]}>
                  {formatAmd(quote.serviceFeeAmd)}
                </Text>
              </View>
              {/* Drawn only when there is one, and never worked out here: a
                  discount the guest cannot see would make the line below look
                  like an arithmetic mistake. */}
              {quote.discountAmd > 0 ? (
                <View style={styles.orderRow}>
                  <Text style={[styles.orderLabel, { color: colors.ink2 }]}>{t('discount')}</Text>
                  <Text style={[styles.orderValue, { color: colors.good }]}>
                    −{formatAmd(quote.discountAmd)}
                  </Text>
                </View>
              ) : null}
            </View>

            {dineIn && quote.depositAmd > 0 ? (
              <View style={[styles.orderTotals, { borderTopColor: colors.line }]}>
                <View style={styles.orderRow}>
                  <Text style={[styles.orderLabel, { color: colors.ink2 }]}>
                    🪑 {t('deposit')}
                  </Text>
                  <Text style={[styles.orderValue, { color: colors.ink }]}>
                    {formatAmd(quote.depositAmd)}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* `dueNowAmd` on a dine-in basket, `totalAmd` on a pickup one —
                the same figure the button carries. Printing the total on a
                booked table would ask for the deposit a second time. */}
            <View style={[styles.orderPay, { borderTopColor: colors.line }]}>
              <Text style={[styles.orderPayLabel, { color: colors.ink }]}>
                {dineIn ? t('youPay') : t('total')}
              </Text>
              <Text style={[styles.orderPayValue, { color: colors.accent }]}>
                {formatAmd(dineIn ? quote.dueNowAmd : quote.totalAmd)}
              </Text>
            </View>
            {dineIn && quote.depositAmd > 0 ? (
              <Text style={[styles.orderNote, { color: colors.ink2 }]}>{t('depositCredited')}</Text>
            ) : null}
          </View>
        ) : null}

        {error !== null ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
      </ScrollView>

      {/* One button, two jobs, in the order the basket needs them: book the
          table first, then pay for the food. It used to say "Book the table"
          while disabled — a dead button naming the very thing it would not do,
          because booking happened up in the grid. Now it is the thing that
          books, which is also what stops a mis-tap costing a deposit. */}
      <View style={styles.footer}>
        {quote === null && !tableOnly ? <ActivityIndicator color={colors.accent} /> : null}
        {ctaShown ? (
          <Pressable
            disabled={ctaBlocked || booking}
            onPress={() => {
              if (!needsTable) {
                router.push('/checkout');
              } else if (selected !== null) {
                void book(selected);
              }
            }}
            accessibilityRole="button"
            style={[styles.cta, { backgroundColor: ctaBlocked ? colors.chip : colors.accent }]}
          >
            {booking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.ctaText, { color: ctaBlocked ? colors.ink3 : '#fff' }]}>
                {ctaLabel()}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 130 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6, marginTop: 16 },
  lede: { fontSize: 14, marginTop: 4 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 26,
  },
  modes: { flexDirection: 'row', gap: 12, marginTop: 12 },
  mode: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeGlyph: { fontSize: 26 },
  modeName: { fontSize: 16, fontWeight: '700' },
  modeHint: { fontSize: 12, textAlign: 'center' },
  // The artifact's stacked rows: full width, the glyph on the left and the
  // answer to "what happens to this food" written out beside it.
  endings: { gap: 12, marginTop: 12 },
  ending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  endingGlyph: { fontSize: 24 },
  endingBody: { flex: 1, minWidth: 0 },
  endingName: { fontSize: 15.5, fontWeight: '800' },
  endingHint: { fontSize: 12.5, marginTop: 1 },
  // `alignSelf` so the pill is as wide as its words rather than as wide as the
  // row it sits in.
  endingPill: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  endingTick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endingTickText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  endingArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13.5,
    fontWeight: '600',
  },
  // Under the calendar on the table-only shape: no food is being ordered here.
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 16 },
  spinner: { marginTop: 40 },
  // The folded row, and the card it opens — the same pair the calendar draws,
  // in the same measurements, because they answer the same kind of question.
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  pickerGlyph: { fontSize: 18 },
  pickerText: { flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2 },
  asap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  asapGlyph: { fontSize: 17 },
  asapName: { fontSize: 15, fontWeight: '700' },
  asapNote: { fontSize: 11.5, fontWeight: '600', opacity: 0.82 },
  /** Inside the panel, so smaller and quieter than the headings outside it —
   *  the booking panel's own sub-label is the same size a card deeper. */
  pickerLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 9,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 22,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  summaryGlyph: { fontSize: 26 },
  summaryText: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 14.5, fontWeight: '700' },
  summaryHint: { fontSize: 12.5, marginTop: 2 },
  // The artifact's order card: what is being bought, under the questions about
  // when it is wanted.
  order: {
    marginTop: 22,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderTitle: { fontSize: 16, fontWeight: '800' },
  orderCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderCountText: { fontSize: 13, fontWeight: '700' },
  orderLines: { gap: 9, marginTop: 14 },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderQty: {
    width: 20,
    height: 20,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 20,
    overflow: 'hidden',
  },
  orderName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600' },
  orderLineTotal: { fontSize: 14, fontWeight: '700' },
  orderTotals: {
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  orderLabel: { fontSize: 13.5 },
  orderValue: { fontSize: 13.5, fontWeight: '600' },
  orderPay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orderPayLabel: { fontSize: 15, fontWeight: '800' },
  orderPayValue: { fontSize: 19, fontWeight: '800' },
  orderNote: { fontSize: 11.5, lineHeight: 16, marginTop: 7 },
  error: { fontSize: 13.5, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 30 },
  cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
