import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
import { useCart } from '../src/cart';
import { formatAmd, formatTime, yerevanDate } from '../src/format';
import { useLanguage } from '../src/language';
import { useTheme } from '../src/theme/useTheme';

/**
 * How far ahead this calendar goes.
 *
 * Bookings are taken `RESERVATION_MAX_LEAD_DAYS` ahead and orders only
 * `ORDER_MAX_LEAD_DAYS`, and **this screen books a table for a basket** — the
 * table always carries food. Offering a day the food cannot be ordered on would
 * take a deposit for a meal that is then refused at the payment, so the shorter
 * of the two wins here. The reservations flow proper, which books a table on its
 * own, is not bound by this.
 */
const BOOKING_HORIZON_DAYS = Math.min(RESERVATION_MAX_LEAD_DAYS, ORDER_MAX_LEAD_DAYS);

export default function PreorderScreen() {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const router = useRouter();
  const {
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
    if (payload === null) {
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
  }, [basketKey]);

  /** Drops a chosen time the fresh answer no longer offers — a bigger party or
   *  a table taken while the screen sat open both invalidate it. */
  const keepSelection = (fresh: Availability): void => {
    setSelected((current) =>
      current !== null && fresh.slots.some((slot) => slot.at === current && slot.available)
        ? current
        : null,
    );
  };

  // Only fetched for dine-in: a pickup basket has no use for table times, and
  // the call would be a round trip spent on a section nobody sees.
  useEffect(() => {
    if (!dineIn || payload === null) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);

    reservations
      .availability(payload.branchId, date, guests)
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
  }, [dineIn, payload?.branchId, date, guests]);

  /**
   * One key per slot, held across retries of that slot.
   *
   * Retrying the *same* time must replay the first booking rather than hold a
   * second table; choosing a different time is a different attempt and needs
   * its own key, or the server would replay the old slot back at us.
   */
  const bookingKey = useRef<{ at: string; key: string } | null>(null);

  const book = async (at: string): Promise<void> => {
    if (payload === null) {
      return;
    }
    if (bookingKey.current?.at !== at) {
      bookingKey.current = { at, key: newIdempotencyKey() };
    }
    setBooking(true);
    setError(null);

    try {
      const reservation = await reservations.create(
        { branchId: payload.branchId, reservedFor: at, guests },
        bookingKey.current.key,
      );
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
        .availability(payload.branchId, date, guests)
        .then((fresh) => {
          setAvailability(fresh);
          keepSelection(fresh);
        })
        .catch(() => undefined);
    } finally {
      setBooking(false);
    }
  };

  const readyTimes = quote === null ? [] : readyTimeOptions(quote.earliestReadyAt);
  // Dine-in without a table is the one combination `POST /orders` refuses
  // outright, so the step is blocked here rather than at the payment.
  const needsTable = dineIn && reservationId === null;
  // While a table is still owed, the button books it and needs a chosen time —
  // one the *current* day's answer has vetted, hence `loadingSlots`. Afterwards
  // it is the ordinary "on to checkout" and needs a priceable basket.
  const ctaBlocked = needsTable
    ? selected === null || loadingSlots
    : quote === null || !quote.canOrder;

  if (lines.length === 0) {
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
          accessibilityLabel={t('basket')}
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
        <Text style={[styles.lede, { color: colors.ink2 }]} numberOfLines={1}>
          {quote === null
            ? ''
            : `${quote.restaurantName} · ${quote.prepMin} ${t('minutes')} ${t('prepWord')}`}
        </Text>

        <Text style={[styles.section, { color: colors.ink2 }]}>{t('howLikeIt')}</Text>
        <View style={styles.modes}>
          {[
            { mode: ServiceMode.Pickup, glyph: '🥡', name: 'modePickup', hint: 'modePickupHint' },
            { mode: ServiceMode.DineIn, glyph: '🍽️', name: 'modeDineIn', hint: 'modeDineInHint' },
          ].map((option) => {
            const chosen = serviceMode === option.mode;
            return (
              <Pressable
                key={option.mode}
                onPress={() => setServiceMode(option.mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                style={[
                  styles.mode,
                  {
                    borderColor: chosen ? colors.accent : colors.line,
                    backgroundColor: chosen ? colors.accentSoft : colors.card,
                  },
                ]}
              >
                <Text style={styles.modeGlyph}>{option.glyph}</Text>
                <Text style={[styles.modeName, { color: colors.ink }]}>
                  {t(option.name as 'modePickup')}
                </Text>
                <Text style={[styles.modeHint, { color: colors.ink2 }]}>
                  {t(option.hint as 'modePickupHint')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* The choice *inside* pickup, indented under the pair above so it
            reads as one question and then another rather than four options of
            equal weight.

            A counter offers both endings and both are live. A restaurant offers
            one — eating in there is a booked table, not a checkbox on a pickup
            order — and the other is still drawn, dimmed and dashed, and tapping
            it switches to Dine-in so the calendar below opens. Hiding it would
            leave the guest to discover the rule by not finding it.

            Both halves come from the quote (`pickupOptions`,
            `eatInRequiresBooking`) rather than being worked out here, so the
            screen and the API cannot disagree about what this restaurant
            does. */}
        {!dineIn && quote !== null && (quote.pickupOptions.length > 1 || quote.eatInRequiresBooking)
          ? (
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
                        borderColor: chosen ? colors.accent : colors.line,
                        backgroundColor: chosen ? colors.accentSoft : colors.card,
                      },
                    ]}
                  >
                    <Text style={styles.endingGlyph}>{eatIn ? '🍴' : '🥡'}</Text>
                    <Text style={[styles.endingName, { color: colors.ink }]}>
                      {t(eatIn ? 'pickupEatIn' : 'pickupTakeAway')}
                    </Text>
                    <Text style={[styles.endingHint, { color: colors.ink2 }]}>
                      {t(eatIn ? 'pickupEatInHint' : 'pickupTakeAwayHint')}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Not `disabled`: a disabled control says "not for you" and then
                  does nothing, and this one has somewhere to send them. It sets
                  the *mode* rather than an ending, which is the whole point —
                  it selects nothing under pickup. */}
              {quote.eatInRequiresBooking ? (
                <Pressable
                  onPress={() => setServiceMode(ServiceMode.DineIn)}
                  accessibilityRole="button"
                  accessibilityHint={t('pickupEatInBooking')}
                  style={[styles.ending, styles.endingBooking, { borderColor: colors.line }]}
                >
                  <Text style={styles.endingGlyph}>🍴</Text>
                  <Text style={[styles.endingName, styles.endingNameMuted, { color: colors.ink2 }]}>
                    {t('pickupEatIn')}
                  </Text>
                  <Text style={[styles.endingHint, { color: colors.ink3 }]}>
                    {t('pickupEatInBooking')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
          : null}

        {dineIn && availability !== null && !availability.reservationsEnabled ? (
          <Text style={[styles.notice, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>
            {t('reservationsOff')}
          </Text>
        ) : null}

        {dineIn && availability?.reservationsEnabled ? (
          <>
            <BookingCalendar
              availability={availability}
              date={date}
              month={month}
              guests={guests}
              today={today}
              horizonDays={BOOKING_HORIZON_DAYS}
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

            {reservationId !== null ? (
              <Text style={[styles.notice, { color: colors.good, backgroundColor: colors.chip }]}>
                ✓ {t('tableBooked')}
                {quote?.tableNo ? ` · ${t('atTable')} ${quote.tableNo}` : ''}
              </Text>
            ) : null}
          </>
        ) : null}

        {/* Pickup only. A dine-in basket has already answered this question by
            booking a table — asking again would let somebody order food for
            15:00 and a table for 19:30. */}
        {dineIn ? null : (
          <>
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('foodReadyAt')}</Text>
            <View style={styles.slots}>
              <Pressable
                onPress={() => setReadyAt(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: readyAt === null }}
                style={[
                  styles.slot,
                  styles.slotWide,
                  {
                    borderColor: readyAt === null ? colors.accent : colors.line,
                    backgroundColor: readyAt === null ? colors.accentSoft : colors.card,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.slotText,
                    { color: readyAt === null ? colors.accent : colors.ink },
                  ]}
                  numberOfLines={1}
                >
                  ⚡ {t('asSoonAsPossible')}
                </Text>
              </Pressable>
              {/* The first option *is* "as soon as possible" — the button above
                  — so the grid starts at the one after it. */}
              {readyTimes.slice(1).map((time) => {
                const chosen = readyAt === time.at;
                return (
                  <Pressable
                    key={time.at}
                    onPress={() => setReadyAt(time.at)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    style={[
                      styles.slot,
                      {
                        borderColor: chosen ? colors.accent : colors.line,
                        backgroundColor: chosen ? colors.accentSoft : colors.card,
                      },
                    ]}
                  >
                    <Text style={[styles.slotText, { color: chosen ? colors.accent : colors.ink }]}>
                      {formatTime(time.at)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
        {quote === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
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
                {!quote.branchIsOpen
                  ? t('branchClosed')
                  : needsTable
                    ? selected === null
                      ? t('chooseTime')
                      : `${t('bookTable')}${
                          availability === null ? '' : ` · ${formatAmd(availability.depositAmd)}`
                        }`
                    : `${t('continueToCheckout')} · ${formatAmd(quote.dueNowAmd)}`}
              </Text>
            )}
          </Pressable>
        )}
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
    gap: 5,
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeGlyph: { fontSize: 26 },
  modeName: { fontSize: 16, fontWeight: '700' },
  modeHint: { fontSize: 12, textAlign: 'center' },
  // Indented and tightened against the modes above, so the pair reads as a
  // choice made *inside* pickup rather than a second question of equal weight.
  endings: { flexDirection: 'row', gap: 10, marginTop: 10, marginLeft: 16 },
  ending: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  endingBooking: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  endingGlyph: { fontSize: 21 },
  endingName: { fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  endingNameMuted: { fontWeight: '600' },
  endingHint: { fontSize: 11.5, textAlign: 'center' },
  notice: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13.5,
    fontWeight: '600',
  },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  slot: {
    minWidth: '22%',
    flexGrow: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotWide: { minWidth: '47%' },
  slotText: { fontSize: 14, fontWeight: '700' },
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
  error: { fontSize: 13.5, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 30 },
  cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
