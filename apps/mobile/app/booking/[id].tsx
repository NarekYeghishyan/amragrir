import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { ReservationStatus, isReservationCancellable } from '@amragrir/shared';
import { RESERVATION_STATUS_LABEL, depositLabelFor } from '@amragrir/i18n';
import { ApiError } from '../../src/api/client';
import { reservations as reservationsApi } from '../../src/api/endpoints';
import type { Reservation } from '../../src/api/types';
import { formatAmd, formatTime } from '../../src/format';
import { useTranslate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';

/**
 * One table, and the button that gives it back.
 *
 * **What the deposit did is reported, not computed.** `depositCredited` and the
 * status both arrive settled — the API decided with `depositOutcomeFor` in
 * `shared`, the same function the back office's no-show path calls. Working it
 * out here would be a second copy of a rule about somebody's money, and the two
 * would eventually disagree about a no-show.
 *
 * A booking made with a basket links to its order; one booked on its own says
 * so and offers nothing, because there is nothing to link to.
 */
export default function BookingScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the button has been pressed, so a second press confirms rather
   *  than firing again. A table is money, and a stray tap should not spend it. */
  const [confirming, setConfirming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      reservationsApi
        .get(id)
        .then((result) => {
          if (!cancelled) {
            setReservation(result);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [id, t]),
  );

  const cancel = async (): Promise<void> => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      // The API answers with the booking as it now stands, so the screen is
      // redrawn from the server's word rather than from an assumption about
      // what cancelling did to the deposit.
      setReservation(await reservationsApi.cancel(id));
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('cancelFailed'));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (reservation === null) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>{t('somethingWentWrong')}</Text>
        <Pressable onPress={() => router.replace('/bookings')}>
          <Text style={[styles.link, { color: colors.accent }]}>{t('myReservations')}</Text>
        </Pressable>
      </View>
    );
  }

  const cancellable = isReservationCancellable(reservation.status);
  const stillFree =
    reservation.freeCancellationUntil !== null &&
    new Date(reservation.freeCancellationUntil).getTime() > Date.now();
  const depositLine = depositLabelFor(reservation.status, reservation.depositCredited);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* `replace` to the list rather than `back`: the way here is often from
            the calendar that has just taken a deposit, and going back to it
            would offer to take a second one. */}
        <Pressable
          onPress={() => router.replace('/bookings')}
          accessibilityLabel={t('myReservations')}
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

        <Text style={[styles.title, { color: colors.ink }]}>{reservation.restaurantName}</Text>
        <Text style={[styles.lede, { color: colors.accent }]}>
          {reservation.localDate} · {reservation.localTime}
        </Text>

        {reservation.status === ReservationStatus.Cancelled ? (
          <Text style={[styles.notice, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>
            {t('reservationCancelled')}
          </Text>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Row label={t('reservationFor')} value={`${reservation.guests} ${t('guestsWord')}`} />
          {reservation.tableNo ? (
            <Row label={t('atTable')} value={reservation.tableNo} />
          ) : null}
          <Row label={t(depositLine)} value={formatAmd(reservation.depositAmd)} accent />
          <Row
            label={t(RESERVATION_STATUS_LABEL[reservation.status])}
            value={t(reservation.orderId ? 'reservationWith' : 'reservationAlone')}
          />
        </View>

        {reservation.branch.address ? (
          <Text style={[styles.address, { color: colors.ink2 }]}>{reservation.branch.address}</Text>
        ) : null}

        {reservation.orderId ? (
          <Pressable
            onPress={() => router.push(`/tracking/${reservation.orderId}`)}
            style={[styles.ghost, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <Text style={[styles.ghostText, { color: colors.ink }]}>{t('reservationNumber')} →</Text>
          </Pressable>
        ) : null}

        {error !== null ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}

        {cancellable ? (
          <>
            {/* Says what cancelling costs before it is pressed. The window comes
                from the API (`freeCancellationUntil`); after it the deposit is
                kept, which is the whole reason a deposit exists. */}
            <Text style={[styles.hint, { color: colors.ink2 }]}>
              {stillFree && reservation.freeCancellationUntil
                ? `${t('cancelFree')} ${formatTime(reservation.freeCancellationUntil) ?? ''}`
                : t('cancelCostsDeposit')}
            </Text>
            <Pressable
              disabled={cancelling}
              onPress={() => void cancel()}
              style={[
                styles.cancel,
                {
                  borderColor: colors.danger,
                  backgroundColor: confirming ? colors.danger : 'transparent',
                  opacity: cancelling ? 0.6 : 1,
                },
              ]}
            >
              {cancelling ? (
                <ActivityIndicator color={confirming ? '#fff' : colors.danger} />
              ) : (
                <Text
                  style={[styles.cancelText, { color: confirming ? '#fff' : colors.danger }]}
                >
                  {confirming ? t('confirm') : t('cancelReservation')}
                </Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.ink2 }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: accent ? colors.accent : colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  body: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 50 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6, marginTop: 16 },
  lede: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  notice: {
    marginTop: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13.5,
    fontWeight: '600',
  },
  card: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 13.5, flexShrink: 1 },
  rowValue: { fontSize: 15, fontWeight: '700' },
  address: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  ghost: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontSize: 14.5, fontWeight: '700' },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 24 },
  cancel: {
    marginTop: 10,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '800' },
  error: { fontSize: 13, marginTop: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '700' },
});
