import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import {
  ORDER_STATUS_COPY,
  RESERVATION_NOTIFICATION_COPY,
  RESERVATION_REMINDER_COPY,
} from '@amragrir/i18n';
import type { OrderStatus, ReservationStatus } from '@amragrir/shared';
import { notifications as notificationsApi } from '../src/api/endpoints';
import type { NotificationItem } from '../src/api/types';
import { subscribeToMyNotifications } from '../src/order-stream';
import { useTranslate } from '../src/language';
import { useTheme } from '../src/theme/useTheme';

/**
 * The bell's contents — what has happened to this account's orders.
 *
 * **The words are this app's, not the API's.** An `order` notification arrives
 * carrying `{ orderId, code, status }` and no prose (DATABASE.md §12), and the
 * line is drawn from the same dictionary keys the tracking screen uses. So the
 * whole history follows a language change in Settings, and the bell can never
 * describe an order differently from the screen it opens.
 *
 * Opening this screen is what "I have seen these" means, so it clears the badge
 * on mount. The lines stay marked as they arrived — the dots are what somebody
 * came here to read, and clearing them under their eyes would take that away.
 */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const bell = await notificationsApi.list();
      setItems(bell.items);
      // After the read, not before: the list is drawn with the dots it arrived
      // with, and the badge behind it goes.
      if (bell.unread > 0) {
        await notificationsApi.readAll();
      }
    } catch {
      // A guest, or an API that is briefly down. The empty state below says the
      // true thing either way — there is nothing here — and pulling to refresh
      // is the way to ask again.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Anything arriving while this screen is open goes straight to the top,
  // rather than waiting for the next visit.
  useEffect(
    () =>
      subscribeToMyNotifications({
        onNotification: (item) => setItems((current) => [item, ...current]),
      }),
    [],
  );

  /**
   * The cross on a row.
   *
   * The row goes at once and the server is told afterwards, because a cross
   * that waits for a round trip does not read as a cross. A delete that fails
   * puts the row back on the next load rather than being announced — there is
   * nothing the reader could do about it, and the row reappearing says it
   * plainly enough.
   */
  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    void notificationsApi.remove(id).catch(() => {});
  }, []);

  /** Empties it. Same bargain as the cross. */
  const clear = useCallback(() => {
    setItems([]);
    void notificationsApi.clear().catch(() => {});
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={() => {
          setLoading(true);
          void load();
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
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
            <Text style={[styles.title, { color: colors.ink }]}>{t('notifications')}</Text>
            {/* Offered only when there is something to clear — a button that
                empties an empty list is a button that teaches nothing. */}
            {items.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('clearNotifications')}
                onPress={clear}
                style={styles.clear}
              >
                <Text style={[styles.clearText, { color: colors.ink2 }]}>
                  {t('clearNotifications')}
                </Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>{t('noNotifications')}</Text>
              <Text style={[styles.emptyHint, { color: colors.ink2 }]}>
                {t('notificationsHint')}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          // Keyed by kind first and status second: both kinds have a
          // `confirmed`, and they mean different things by it — a kitchen
          // accepting an order, and a restaurant accepting a table.
          const status = item.payload?.status;
          // The reminder check comes first: a reminder does not move a booking,
          // so its status is `confirmed` before and after, and looking it up
          // would say "Your table is booked" to somebody who booked it weeks ago.
          const keys =
            item.type === 'reservation' && item.payload?.reminder
              ? RESERVATION_REMINDER_COPY
              : !status
                ? undefined
                : item.type === 'reservation'
                  ? (RESERVATION_NOTIFICATION_COPY[status as ReservationStatus] ?? undefined)
                  : ORDER_STATUS_COPY[status as OrderStatus];
          // `title`/`body` are the fallback rather than the source: they are
          // only populated for the kinds this app cannot draw itself (a promo,
          // a system note), and for those the API's words are all there is.
          const title = keys ? t(keys.title) : item.title;
          const body = keys ? t(keys.body) : item.body;
          if (!title) {
            // A kind this build does not know — a newer API talking to an older
            // app. Skipped rather than rendered blank.
            return null;
          }
          const orderId = item.payload?.orderId;
          const reservationId = item.payload?.reservationId;
          // Where the row leads: the booking it is about, or the order it is
          // about. A row with neither is text and does not press.
          const goTo =
            item.type === 'reservation'
              ? reservationId && (`/booking/${reservationId}` as const)
              : orderId && (`/tracking/${orderId}` as const);
          return (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {/* The cross is a sibling of the row's own press, not nested in
                  it: one press has to open the order and the other has to throw
                  it away, and a button inside a button makes which one happened
                  a matter of geometry. */}
              <Pressable
                accessibilityRole="button"
                disabled={!goTo}
                onPress={() => goTo && router.push(goTo)}
                style={styles.rowMain}
              >
                <View style={styles.rowTop}>
                  {!item.isRead && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>
                  {item.payload?.code && (
                    <Text
                      style={[styles.code, { backgroundColor: colors.chip, color: colors.ink2 }]}
                    >
                      {item.payload.code}
                    </Text>
                  )}
                </View>
                {body && <Text style={[styles.rowBody, { color: colors.ink2 }]}>{body}</Text>}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                // Names the order, so a screen reader hears which row is going
                // rather than "delete" eight times.
                accessibilityLabel={`${t('deleteNotification')}${
                  item.payload?.code ? ` — ${item.payload.code}` : ''
                }`}
                // A 12px glyph is below every touch-target guideline; the slop
                // is what makes it pressable without making it look heavy.
                hitSlop={12}
                onPress={() => remove(item.id)}
                style={styles.remove}
              >
                <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                  <Path
                    d="M2 2l8 8M10 2l-8 8"
                    stroke={colors.ink3}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  rowMain: { flex: 1, gap: 4 },
  remove: { paddingTop: 2 },
  clear: { marginLeft: 'auto' },
  clearText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  code: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  rowBody: { fontSize: 13.5, lineHeight: 18 },
  empty: { paddingTop: 40, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyHint: { fontSize: 14, lineHeight: 19 },
});
