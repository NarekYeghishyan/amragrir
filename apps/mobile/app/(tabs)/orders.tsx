import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { orders as ordersApi } from '../../src/api/endpoints';
import type { OrderListItem } from '../../src/api/types';
import { Photo } from '../../src/components/Photo';
import { formatAmd, formatCountdown, formatTime } from '../../src/format';
import { useTranslate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';

/**
 * Orders — the artifact's ORDERS screen: whatever is live at the top with a
 * running countdown, everything finished below it.
 *
 * Refetched on focus rather than once on mount, because the way back here is
 * usually from tracking an order whose status just moved.
 */
export default function OrdersScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();

  const [active, setActive] = useState<OrderListItem[]>([]);
  const [past, setPast] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([ordersApi.list('active'), ordersApi.list('past')])
      .then(([activeResult, pastResult]) => {
        if (cancelled) {
          return;
        }
        setActive(activeResult.items);
        setPast(pastResult.items);
      })
      .catch(() => {
        // A guest with no orders yet is the common case, not an error worth a
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
  }, []);

  useFocusEffect(load);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.ink }]}>{t('myOrders')}</Text>

      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

      {active.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.ink2 }]}>{t('activeOrders')}</Text>
          {active.map((order) => (
            <ActiveOrderCard
              key={order.id}
              order={order}
              onPress={() => router.push(`/tracking/${order.id}`)}
            />
          ))}
        </>
      ) : null}

      {!loading && active.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={styles.emptyGlyph}>🕒</Text>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>{t('noActiveOrders')}</Text>
          <Text style={[styles.emptyHint, { color: colors.ink2 }]}>
            {t('noActiveOrdersHint')}
          </Text>
        </View>
      ) : null}

      {past.length > 0 ? (
        <>
          <Text style={[styles.section, { color: colors.ink2 }]}>{t('pastOrders')}</Text>
          <View style={styles.pastList}>
            {past.map((order) => (
              <View
                key={order.id}
                style={[styles.pastRow, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <Photo uri={order.coverUrl} style={styles.pastThumb} />
                <View style={styles.pastBody}>
                  <Text style={[styles.pastName, { color: colors.ink }]} numberOfLines={1}>
                    {order.restaurantName}
                  </Text>
                  <Text style={[styles.pastMeta, { color: colors.ink2 }]}>
                    {order.date} · {order.itemsCount}{' '}
                    {t(order.itemsCount === 1 ? 'itemOne' : 'itemOther')}
                  </Text>
                  <Text style={[styles.pastTotal, { color: colors.ink }]}>
                    {formatAmd(order.totalAmd)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/tracking/${order.id}`)}
                  style={[
                    styles.reorder,
                    { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                  ]}
                >
                  <Text style={[styles.reorderText, { color: colors.accent }]}>{t('reorder')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function ActiveOrderCard({ order, onPress }: { order: OrderListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const t = useTranslate();
  const countdown = formatCountdown(order.secondsLeft);
  const arrives = formatTime(order.readyAt);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.activeCard, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <View style={styles.activeRow}>
        <Photo uri={order.coverUrl} style={styles.activeThumb} />
        <View style={styles.activeBody}>
          <View style={styles.activeStatusRow}>
            <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.activeStatus, { color: colors.accent }]}>
              {t(`status${statusKey(order.status)}` as 'statusPreparing')}
            </Text>
          </View>
          <Text style={[styles.activeName, { color: colors.ink }]} numberOfLines={1}>
            {order.restaurantName}
          </Text>
          <Text style={[styles.activeMeta, { color: colors.ink2 }]}>
            {order.itemsCount} {t(order.itemsCount === 1 ? 'itemOne' : 'itemOther')}
            {arrives ? ` · ${t('arrivesAt')} ${arrives}` : ''}
          </Text>
        </View>
        {countdown ? (
          <View style={styles.activeCountdown}>
            <Text style={[styles.countdownText, { color: colors.ink }]}>{countdown}</Text>
            <Text style={[styles.countdownLabel, { color: colors.ink2 }]}>{t('readyInShort')}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** `almost_ready` → `AlmostReady`, so the status maps onto its dictionary key
 *  without a second table that could disagree with `OrderStatus`. */
function statusKey(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 110 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  spinner: { marginTop: 28 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 22,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  activeCard: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    overflow: 'hidden',
  },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  activeThumb: { width: 62, height: 62, borderRadius: 14 },
  activeBody: { flex: 1 },
  activeStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  activeStatus: { fontSize: 12, fontWeight: '700' },
  activeName: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  activeMeta: { fontSize: 12.5, marginTop: 2 },
  activeCountdown: { alignItems: 'flex-end' },
  countdownText: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  countdownLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: {
    marginTop: 20,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyGlyph: { fontSize: 38 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 6 },
  emptyHint: { fontSize: 13, marginTop: 3, textAlign: 'center' },
  pastList: { gap: 12, marginTop: 12 },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
  },
  pastThumb: { width: 58, height: 58, borderRadius: 13 },
  pastBody: { flex: 1, minWidth: 0 },
  pastName: { fontSize: 15, fontWeight: '700' },
  pastMeta: { fontSize: 12, marginTop: 2 },
  pastTotal: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  reorder: {
    height: 36,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderText: { fontSize: 13, fontWeight: '700' },
});
