import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { RESERVATION_STATUS_LABEL } from '@amragrir/i18n';
import { reservations as reservationsApi } from '../src/api/endpoints';
import type { Reservation } from '../src/api/types';
import { useTranslate } from '../src/language';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';

/**
 * This account's own tables.
 *
 * The phone could take a booking and then never mention it again:
 * `GET /reservations` and `POST /reservations/{id}/cancel` were written into
 * the client months ago and nothing called either, so a table booked here could
 * not be checked, and could only be given back by ringing the restaurant. The
 * browser has had both screens since August.
 *
 * **Two lists, and the API decides which is which** — `upcoming` is every
 * active status and `past` every terminal one. Splitting them here from a
 * status would be this screen and the back office disagreeing about whether a
 * booking is over.
 *
 * Refetched on focus rather than once on mount, because the way back here is
 * usually from cancelling one.
 */
export default function BookingsScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { user } = useSession();

  const [upcoming, setUpcoming] = useState<Reservation[]>([]);
  const [past, setPast] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // A table belongs to a verified account, so a guest has none and the endpoint
  // says so rather than returning an empty list. Asking anyway would spend two
  // round trips to be told what the session already knows.
  const signedIn = user?.phoneVerified === true;

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setUpcoming([]);
        setPast([]);
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);
      Promise.all([reservationsApi.list('upcoming'), reservationsApi.list('past')])
        .then(([next, done]) => {
          if (!cancelled) {
            setUpcoming(next.items);
            setPast(done.items);
          }
        })
        .catch(() => {
          // Nothing booked yet is the common case and not an error worth a
          // banner; the empty state below says the same thing more usefully.
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [signedIn]),
  );

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

        <Text style={[styles.title, { color: colors.ink }]}>{t('myReservations')}</Text>

        {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {!loading && !signedIn ? (
          <Pressable
            onPress={() => router.push('/auth')}
            style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Text style={styles.emptyGlyph}>🪑</Text>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>
              {t('noUpcomingReservations')}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.accent }]}>{t('signIn')}</Text>
          </Pressable>
        ) : null}

        {signedIn ? (
          <>
            <Text style={[styles.section, { color: colors.ink2 }]}>
              {t('reservationsUpcoming')}
            </Text>
            {upcoming.length === 0 ? (
              !loading ? (
                <View
                  style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}
                >
                  <Text style={styles.emptyGlyph}>🪑</Text>
                  <Text style={[styles.emptyTitle, { color: colors.ink }]}>
                    {t('noUpcomingReservations')}
                  </Text>
                  <Text style={[styles.emptyHint, { color: colors.ink2 }]}>
                    {t('bookTableAloneHint')}
                  </Text>
                </View>
              ) : null
            ) : (
              upcoming.map((reservation) => (
                <BookingRow
                  key={reservation.id}
                  reservation={reservation}
                  onPress={() => router.push(`/booking/${reservation.id}`)}
                />
              ))
            )}

            {past.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.ink2 }]}>
                  {t('reservationsPast')}
                </Text>
                {past.map((reservation) => (
                  <BookingRow
                    key={reservation.id}
                    reservation={reservation}
                    onPress={() => router.push(`/booking/${reservation.id}`)}
                    faded
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * One table in the list.
 *
 * The day, the hour and the party — which is what somebody scanning for "the
 * one on Saturday" is looking for. The day and time arrive already formatted by
 * the API, in Yerevan's clock: the restaurant's day, not the reader's.
 */
function BookingRow({
  reservation,
  onPress,
  faded = false,
}: {
  reservation: Reservation;
  onPress: () => void;
  faded?: boolean;
}) {
  const { colors } = useTheme();
  const t = useTranslate();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.line,
          opacity: faded ? 0.72 : 1,
        },
      ]}
    >
      <View style={[styles.when, { backgroundColor: colors.chip }]}>
        <Text style={[styles.whenTime, { color: colors.ink }]}>{reservation.localTime}</Text>
        <Text style={[styles.whenDate, { color: colors.ink2 }]}>{reservation.localDate}</Text>
      </View>

      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: colors.ink }]} numberOfLines={1}>
          {reservation.restaurantName}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.ink2 }]} numberOfLines={1}>
          {reservation.guests} {t('guestsWord')}
          {reservation.tableNo ? ` · ${t('atTable')} ${reservation.tableNo}` : ''}
        </Text>
        <Text style={[styles.rowStatus, { color: colors.accent }]}>
          {t(RESERVATION_STATUS_LABEL[reservation.status])}
        </Text>
      </View>

      <Svg width={9} height={15} viewBox="0 0 12 20" fill="none">
        <Path
          d="M3 2l7 8-7 8"
          stroke={colors.ink3}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 40 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6, marginTop: 16 },
  spinner: { marginTop: 28 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 24,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 12,
    padding: 13,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  when: { width: 64, borderRadius: 15, paddingVertical: 10, alignItems: 'center' },
  whenTime: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  whenDate: { fontSize: 10, marginTop: 2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15.5, fontWeight: '700' },
  rowMeta: { fontSize: 12.5, marginTop: 2 },
  rowStatus: { fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  empty: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  emptyGlyph: { fontSize: 34 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
