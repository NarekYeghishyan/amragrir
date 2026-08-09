import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import {
  ORDER_MAX_LEAD_DAYS,
  PickupOption,
  RESERVATION_MAX_GUESTS,
  RESERVATION_MAX_LEAD_DAYS,
  ServiceMode,
  readyTimeOptions,
} from '@amragrir/shared';
import { ApiError, newIdempotencyKey } from '../src/api/client';
import { cart as cartApi, reservations } from '../src/api/endpoints';
import type { Availability, Quote } from '../src/api/types';
import { monthGrid, monthHasBookableDay } from '@amragrir/shared';
import { useCart } from '../src/cart';
import { formatAmd, formatMonth, formatTime, weekdayHeads, yerevanDate } from '../src/format';
import { useLanguage } from '../src/language';
import { useTheme } from '../src/theme/useTheme';

/** Party sizes worth a single tap. The stepper beside them covers the rest. */
const GUEST_CHIPS = [2, 4, 6];

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
  const [booking, setBooking] = useState<string | null>(null);
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

  // Only fetched for dine-in: a pickup basket has no use for table times, and
  // the call would be a round trip spent on a section nobody sees.
  useEffect(() => {
    if (!dineIn || payload === null) {
      setAvailability(null);
      return;
    }
    let cancelled = false;

    reservations
      .availability(payload.branchId, date, guests)
      .then((result) => {
        if (!cancelled) {
          setAvailability(result);
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
    setBooking(at);
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
      // day rather than leaving a time on offer that nobody can take.
      reservations
        .availability(payload.branchId, date, guests)
        .then(setAvailability)
        .catch(() => undefined);
    } finally {
      setBooking(null);
    }
  };

  const cells = monthGrid(month.year, month.month, today, BOOKING_HORIZON_DAYS);
  const canGoBack = monthHasBookableDay(month.year, month.month - 1, today, BOOKING_HORIZON_DAYS);
  const canGoForward = monthHasBookableDay(month.year, month.month + 1, today, BOOKING_HORIZON_DAYS);
  const stepMonth = (by: number): void =>
    setMonth((current) => {
      const next = new Date(Date.UTC(current.year, current.month + by, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  const maxGuests = Math.min(RESERVATION_MAX_GUESTS, availability?.maxSeats || RESERVATION_MAX_GUESTS);
  const readyTimes = quote === null ? [] : readyTimeOptions(quote.earliestReadyAt);
  // Dine-in without a table is the one combination `POST /orders` refuses
  // outright, so the step is blocked here rather than at the payment.
  const needsTable = dineIn && reservationId === null;

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
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('reservationDate')}</Text>
            <View style={[styles.calendar, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.calendarHead}>
                <Pressable
                  disabled={!canGoBack}
                  onPress={() => stepMonth(-1)}
                  accessibilityLabel={t('reservationDate')}
                  style={[styles.monthArrow, { borderColor: colors.line, opacity: canGoBack ? 1 : 0.3 }]}
                >
                  <Svg width={9} height={15} viewBox="0 0 12 20" fill="none">
                    <Path
                      d="M9 2L2 10l7 8"
                      stroke={colors.ink}
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
                <Text style={[styles.monthLabel, { color: colors.ink }]}>
                  {formatMonth(month.year, month.month, language)}
                </Text>
                <Pressable
                  disabled={!canGoForward}
                  onPress={() => stepMonth(1)}
                  accessibilityLabel={t('reservationDate')}
                  style={[
                    styles.monthArrow,
                    { borderColor: colors.line, opacity: canGoForward ? 1 : 0.3 },
                  ]}
                >
                  <Svg width={9} height={15} viewBox="0 0 12 20" fill="none">
                    <Path
                      d="M3 2l7 8-7 8"
                      stroke={colors.ink}
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
              </View>

              <View style={styles.week}>
                {weekdayHeads(language).map((head, index) => (
                  <Text key={index} style={[styles.weekdayHead, { color: colors.ink3 }]}>
                    {head}
                  </Text>
                ))}
              </View>

              <View style={styles.week}>
                {cells.map((cell, index) => {
                  const chosen = cell.date !== null && cell.date === date;
                  return (
                    <Pressable
                      key={index}
                      disabled={!cell.bookable}
                      onPress={() => cell.date !== null && setDate(cell.date)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen, disabled: !cell.bookable }}
                      style={[
                        styles.day,
                        chosen ? { backgroundColor: colors.accent } : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          {
                            color: chosen ? '#fff' : cell.bookable ? colors.ink : colors.ink3,
                            fontWeight: chosen ? '800' : '600',
                          },
                        ]}
                      >
                        {cell.day ?? ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text style={[styles.section, { color: colors.ink2 }]}>{t('reservationTime')}</Text>
            {availability.slots.length === 0 ? (
              <Text style={[styles.notice, { color: colors.ink2, backgroundColor: colors.chip }]}>
                {t('noSlots')}
              </Text>
            ) : (
              <View style={styles.slots}>
                {availability.slots.map((slot) => (
                  <Pressable
                    key={slot.at}
                    disabled={!slot.available || booking !== null}
                    onPress={() => void book(slot.at)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !slot.available }}
                    style={[
                      styles.slot,
                      {
                        borderColor: colors.line,
                        backgroundColor: colors.card,
                        opacity: slot.available ? 1 : 0.35,
                      },
                    ]}
                  >
                    {booking === slot.at ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Text style={[styles.slotText, { color: colors.ink }]}>{slot.time}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={[styles.section, { color: colors.ink2 }]}>{t('guests')}</Text>
            <View style={styles.guests}>
              {GUEST_CHIPS.filter((count) => count <= maxGuests).map((count) => {
                const chosen = count === guests;
                return (
                  <Pressable
                    key={count}
                    onPress={() => setGuests(count)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    style={[
                      styles.guestChip,
                      {
                        borderColor: chosen ? colors.accent : colors.line,
                        backgroundColor: chosen ? colors.accentSoft : colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.guestChipText, { color: chosen ? colors.accent : colors.ink }]}
                    >
                      {count}
                    </Text>
                  </Pressable>
                );
              })}

              <View
                style={[styles.stepper, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <Pressable
                  disabled={guests <= 1}
                  onPress={() => setGuests((count) => Math.max(1, count - 1))}
                  accessibilityLabel={t('decrease')}
                  style={[
                    styles.stepButton,
                    { backgroundColor: colors.chip, borderColor: colors.line, opacity: guests <= 1 ? 0.4 : 1 },
                  ]}
                >
                  <Text style={[styles.stepText, { color: colors.ink }]}>−</Text>
                </Pressable>
                <View style={styles.stepValue}>
                  <Text style={[styles.guestCount, { color: colors.ink }]}>{guests}</Text>
                  <Text style={[styles.guestsWord, { color: colors.ink2 }]}>{t('guestsWord')}</Text>
                </View>
                <Pressable
                  disabled={guests >= maxGuests}
                  onPress={() => setGuests((count) => Math.min(maxGuests, count + 1))}
                  accessibilityLabel={t('increase')}
                  style={[
                    styles.stepButton,
                    { backgroundColor: colors.accent, opacity: guests >= maxGuests ? 0.4 : 1 },
                  ]}
                >
                  <Text style={styles.stepPlusText}>＋</Text>
                </Pressable>
              </View>
            </View>

            <View
              style={[styles.deposit, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <View style={styles.depositRow}>
                <View style={styles.depositLeft}>
                  <Text style={styles.depositGlyph}>🪑</Text>
                  <View>
                    <Text style={[styles.depositTitle, { color: colors.ink }]}>{t('deposit')}</Text>
                    <Text style={[styles.depositSub, { color: colors.ink2 }]}>
                      {guests} {t('guestsWord')}
                    </Text>
                  </View>
                </View>
                <View style={styles.depositRight}>
                  <Text style={[styles.depositAmount, { color: colors.accent }]}>
                    {formatAmd(availability.depositAmd)}
                  </Text>
                  <Text style={[styles.depositCredit, { color: colors.good }]}>
                    {t('appliedToBill')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.depositNote, { color: colors.ink2, borderTopColor: colors.line }]}>
                ℹ️ {t('depositNote')}
              </Text>
            </View>

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

      <View style={styles.footer}>
        {quote === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable
            disabled={needsTable || !quote.canOrder}
            onPress={() => router.push('/checkout')}
            accessibilityRole="button"
            style={[
              styles.cta,
              { backgroundColor: needsTable || !quote.canOrder ? colors.chip : colors.accent },
            ]}
          >
            <Text
              style={[
                styles.ctaText,
                { color: needsTable || !quote.canOrder ? colors.ink3 : '#fff' },
              ]}
            >
              {!quote.branchIsOpen
                ? t('branchClosed')
                : needsTable
                  ? t('bookTable')
                  : `${t('continueToCheckout')} · ${formatAmd(quote.dueNowAmd)}`}
            </Text>
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
  calendar: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  calendarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  week: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayHead: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 13.5 },
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
  guests: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 },
  guestChip: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestChipText: { fontSize: 15, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, lineHeight: 24 },
  stepPlusText: { color: '#fff', fontSize: 18, lineHeight: 22 },
  stepValue: { alignItems: 'center', minWidth: 44 },
  guestCount: { fontSize: 18, fontWeight: '800' },
  guestsWord: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.3 },
  deposit: {
    marginTop: 22,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  depositRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  depositLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  depositGlyph: { fontSize: 20 },
  depositTitle: { fontSize: 15, fontWeight: '800' },
  depositSub: { fontSize: 11.5, marginTop: 1 },
  depositRight: { alignItems: 'flex-end' },
  depositAmount: { fontSize: 19, fontWeight: '800' },
  depositCredit: { fontSize: 10.5, fontWeight: '700' },
  depositNote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  error: { fontSize: 13.5, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 30 },
  cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
