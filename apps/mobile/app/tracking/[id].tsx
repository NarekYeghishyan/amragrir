import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OrderStatus, TERMINAL_ORDER_STATUSES } from '@amragrir/shared';
import { ApiError } from '../../src/api/client';
import { orders } from '../../src/api/endpoints';
import type { Order } from '../../src/api/types';
import { subscribeToOrder } from '../../src/order-stream';
import { useTheme } from '../../src/theme/useTheme';
import { HIT_TARGET, radius, spacing, spot, typography } from '../../src/theme/tokens';
import { formatAmd, formatCountdown, formatOrderStatus, formatTime } from '../../src/format';

/** The steps the design's tracking screen shows (SCREENS.md §7). */
const STEPS = [
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
] as const;

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);

  // Load over REST first: the screen must render even if the socket never
  // connects. The stream is an optimisation, not the source of truth.
  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;

    orders
      .get(id)
      .then((result) => {
        if (!cancelled) {
          setOrder(result);
          setSeconds(result.secondsLeft);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load the order');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }
    return subscribeToOrder(id, {
      onUpdate: (update) => {
        setOrder((current) =>
          current === null
            ? current
            : { ...current, status: update.status, readyAt: update.readyAt },
        );
        setSeconds(update.secondsLeft);
      },
      onConnectionChange: setLive,
    });
  }, [id]);

  // Ticks between server updates so the countdown moves every second rather
  // than jumping only when a status changes. Display only — the server's
  // value replaces it whenever one arrives.
  useEffect(() => {
    if (seconds === null) {
      return;
    }
    const timer = setInterval(() => {
      setSeconds((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds === null]);

  if (error !== null) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Text style={[styles.meta, { color: spot.destructive }]}>{error}</Text>
      </View>
    );
  }

  if (order === null) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const countdown = formatCountdown(seconds);
  const arrives = formatTime(order.readyAt);
  const done = TERMINAL_ORDER_STATUSES.includes(order.status);
  const reachedIndex = STEPS.indexOf(order.status as (typeof STEPS)[number]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.status, { color: colors.ink }]}>
          {formatOrderStatus(order.status)}
        </Text>
        <Text style={[styles.meta, { color: colors.ink2 }]}>{order.restaurantName}</Text>

        {countdown !== null && (
          <View style={[styles.timer, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.timerValue, { color: colors.accent }]}>{countdown}</Text>
            <Text style={[styles.meta, { color: colors.ink2 }]}>
              {arrives === null ? 'until ready' : `ready around ${arrives}`}
            </Text>
          </View>
        )}

        {/* Honest about liveness: a countdown that quietly stopped updating
            looks exactly like an order that stopped moving. */}
        <Text style={[styles.meta, { color: live ? colors.good : colors.ink3 }]}>
          {live ? '● live' : '○ reconnecting…'}
        </Text>

        <View style={styles.steps}>
          {STEPS.map((step, index) => {
            const reached = !done && reachedIndex >= index;
            return (
              <View key={step} style={styles.step}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: reached ? colors.accent : colors.chip },
                  ]}
                />
                <Text style={[styles.stepText, { color: reached ? colors.ink : colors.ink3 }]}>
                  {formatOrderStatus(step)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.meta, { color: colors.ink2 }]}>Pickup code</Text>
          <Text style={[styles.pickup, { color: colors.ink }]}>{order.pickupCode}</Text>
          <Text style={[styles.meta, { color: colors.ink3 }]}>
            {order.tableNo === null
              ? 'Show this at the express counter'
              : `Table ${order.tableNo}`}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {order.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={[styles.meta, { color: colors.ink }]}>
                {item.qty} × {item.name}
              </Text>
              <Text style={[styles.meta, { color: colors.ink2 }]}>
                {formatAmd(item.lineTotalAmd)}
              </Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={[styles.strong, { color: colors.ink }]}>Total</Text>
            <Text style={[styles.strong, { color: colors.ink }]}>{formatAmd(order.totalAmd)}</Text>
          </View>
        </View>

        <Text style={[styles.meta, { color: colors.ink3 }]}>Order {order.code}</Text>
      </ScrollView>

      <View style={[styles.footer, { borderColor: colors.line }]}>
        <Pressable
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          style={[styles.cta, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.ctaText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, gap: spacing.sm },
  status: { ...typography.title },
  meta: { ...typography.caption },
  strong: { ...typography.body, fontWeight: '700' },
  timer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: radius.lg,
    marginVertical: spacing.md,
    gap: spacing.xs,
  },
  timerValue: { fontSize: 44, fontWeight: '700' },
  steps: { gap: spacing.md, marginVertical: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 12, height: 12, borderRadius: radius.pill },
  stepText: { ...typography.body },
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pickup: { fontSize: 34, fontWeight: '700', letterSpacing: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  cta: {
    minHeight: HIT_TARGET + 6,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typography.body, fontWeight: '700', color: '#fff' },
});
