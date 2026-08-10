import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { RESERVATION_MAX_LEAD_DAYS } from '@amragrir/shared';
import { ApiError, newIdempotencyKey } from '../../src/api/client';
import { reservations } from '../../src/api/endpoints';
import type { Availability } from '../../src/api/types';
import { BookingCalendar, type BookingMonth } from '../../src/components/BookingCalendar';
import { yerevanDate } from '../../src/format';
import { useLanguage } from '../../src/language';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme/useTheme';

/**
 * A table, with no food attached.
 *
 * The one thing the phone could not do that the browser could. Booking existed
 * here only as a step inside the pre-order funnel — basket, then dine-in, then
 * a slot — so a guest who wanted a table on Saturday and had not decided what
 * to eat had to put food in a basket to ask for one. `POST /reservations` has
 * never wanted an order, and the web dropped that requirement in August; this
 * is the same door on the phone.
 *
 * **The full booking horizon.** The pre-order flow shortens the calendar to the
 * *order* horizon, because there the table always carries food and offering a
 * day the kitchen will not cook on takes a deposit for a meal that is then
 * refused. Nothing is being cooked here, so the branch's own limit is the only
 * one that applies.
 */
export default function BookTableScreen() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { user } = useSession();
  const { branchId, name } = useLocalSearchParams<{ branchId: string; name?: string }>();

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [guests, setGuests] = useState(2);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Yerevan's today, not the phone's — see `formatTime` for why every clock in
  // this flow is the restaurant's.
  const today = useMemo(() => yerevanDate(new Date()), []);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState<BookingMonth>(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));

  useEffect(() => {
    let cancelled = false;
    setAvailability(null);
    reservations
      .availability(branchId, date, guests)
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
  }, [branchId, date, guests, t]);

  /**
   * One key per slot, held across retries.
   *
   * The same bargain the pre-order flow makes: a booking is money and a table,
   * so a retry of *this* slot must replay rather than take a second table —
   * and moving to another slot must not, or the server would hand back the old
   * one.
   */
  const bookingKey = useRef<{ at: string; key: string } | null>(null);

  const book = async (at: string): Promise<void> => {
    // A table is held against a verified account (BUSINESS_LOGIC.md §3), so
    // there is nothing to send a guest's booking to. Asked before the deposit
    // rather than after, which is where the API would have asked.
    if (user?.phoneVerified !== true) {
      router.push('/auth');
      return;
    }
    if (bookingKey.current?.at !== at) {
      bookingKey.current = { at, key: newIdempotencyKey() };
    }
    setBusySlot(at);
    setError(null);

    try {
      const reservation = await reservations.create({ branchId, reservedFor: at, guests }, bookingKey.current.key);
      // `replace`, not `push`: swiping back to a calendar that has already
      // taken a deposit would offer to take a second one.
      router.replace(`/booking/${reservation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
      // The slot may simply have gone while the screen was open, so redraw the
      // day rather than leaving a time on offer nobody can take.
      reservations
        .availability(branchId, date, guests)
        .then(setAvailability)
        .catch(() => undefined);
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t('back')}
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

        <Text style={[styles.title, { color: colors.ink }]}>{t('bookTableAlone')}</Text>
        <Text style={[styles.lede, { color: colors.ink2 }]} numberOfLines={2}>
          {name ?? t('bookTableAloneHint')}
        </Text>

        {availability === null ? (
          <ActivityIndicator color={colors.accent} style={styles.spinner} />
        ) : !availability.reservationsEnabled ? (
          <Text
            style={[styles.notice, { color: colors.danger, backgroundColor: colors.dangerSoft }]}
          >
            {t('reservationsOff')}
          </Text>
        ) : (
          <BookingCalendar
            availability={availability}
            date={date}
            month={month}
            guests={guests}
            today={today}
            horizonDays={RESERVATION_MAX_LEAD_DAYS}
            busySlot={busySlot}
            onDate={setDate}
            onMonth={setMonth}
            onGuests={setGuests}
            onSlot={(at) => void book(at)}
          />
        )}

        {/* Said here rather than only on the deposit card: this screen books
            the table and stops, and somebody who wanted to eat should know the
            food is a separate step rather than something they missed. */}
        {availability?.reservationsEnabled ? (
          <Text style={[styles.hint, { color: colors.ink2 }]}>{t('bookTableAloneHint')}</Text>
        ) : null}

        {error !== null ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 60 },
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
  spinner: { marginTop: 40 },
  notice: {
    marginTop: 20,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13.5,
    fontWeight: '600',
  },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 16 },
  error: { fontSize: 13, marginTop: 16 },
});
