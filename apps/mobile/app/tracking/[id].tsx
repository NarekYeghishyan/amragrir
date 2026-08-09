import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Circle, Path, Svg } from 'react-native-svg';
import { OrderStatus, TERMINAL_ORDER_STATUSES } from '@amragrir/shared';
import { encodeQr } from '@amragrir/ui';
import { ApiError, newIdempotencyKey } from '../../src/api/client';
import { orders, payments } from '../../src/api/endpoints';
import type { Order } from '../../src/api/types';
import { subscribeToOrder } from '../../src/order-stream';
import { useTranslate, type Translate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';
import { formatAmd, formatCountdown, formatTime } from '../../src/format';

/** The five stages the artifact's rail draws. `created`/`paid` sit before the
 *  kitchen has it, so they light nothing. */
const STAGES = [
  { status: OrderStatus.Confirmed, key: 'stageConfirmed' },
  { status: OrderStatus.Preparing, key: 'stagePreparing' },
  { status: OrderStatus.AlmostReady, key: 'stageAlmost' },
  { status: OrderStatus.Ready, key: 'stageReady' },
  { status: OrderStatus.Completed, key: 'stageDone' },
] as const;

const RING_RADIUS = 110;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** `almost_ready` → `AlmostReady`, so a status maps onto its dictionary keys
 *  without a second table that could disagree with `OrderStatus`. */
function statusKey(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const STATUS_GLYPH: Record<string, string> = {
  created: '⏳',
  paid: '✓',
  confirmed: '👨‍🍳',
  preparing: '🍳',
  almost_ready: '🔥',
  ready: '🛍️',
  completed: '✅',
  cancelled: '✕',
};

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** The first countdown we were told about — the ring's denominator, so it
   *  empties over this order's own prep window rather than a fixed guess. */
  const total = useRef<number | null>(null);

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
          if (result.secondsLeft !== null && total.current === null) {
            total.current = Math.max(1, result.secondsLeft);
          }
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
  }, [id, t]);

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
  // than jumping only when a status changes. Display only — the server's value
  // replaces it whenever one arrives.
  useEffect(() => {
    if (seconds === null) {
      return;
    }
    const timer = setInterval(() => {
      setSeconds((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds === null]);

  async function reload() {
    if (!id) {
      return;
    }
    const fresh = await orders.get(id);
    setOrder(fresh);
    setSeconds(fresh.secondsLeft);
  }

  /** Only an unpaid order can be cancelled — paying commits it, for the
   *  customer and the restaurant alike (BUSINESS_LOGIC.md §5). */
  function confirmCancel() {
    Alert.alert(t('cancelOrder'), t('cancelOnlyUnpaid'), [
      { text: t('keepBasket'), style: 'cancel' },
      {
        text: t('cancelOrder'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const cancelled = await orders.cancel(id!);
            setOrder(cancelled);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function payNow() {
    if (!order) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { default: method } = await payments.methods();
      await payments.pay(order.id, method, newIdempotencyKey());
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (error !== null && order === null) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Text style={[styles.meta, { color: colors.danger }]}>{error}</Text>
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

  const status = order.status;
  const label = t(`status${statusKey(status)}` as Parameters<Translate>[0]);
  const description = t(`status${statusKey(status)}Desc` as Parameters<Translate>[0]);

  const unpaid = status === OrderStatus.Created;
  const cancelled = status === OrderStatus.Cancelled;
  const inProgress = !unpaid && !cancelled;
  const showRing =
    (status === OrderStatus.Preparing || status === OrderStatus.AlmostReady) && seconds !== null;
  const showBadge = status === OrderStatus.Ready || status === OrderStatus.Completed;
  const done = TERMINAL_ORDER_STATUSES.includes(status);

  const statusColor = cancelled
    ? colors.danger
    : status === OrderStatus.Ready || status === OrderStatus.Completed || status === OrderStatus.Paid
      ? colors.good
      : colors.accent;

  const reached = STAGES.findIndex((stage) => stage.status === status);
  const progress = showRing && total.current ? Math.max(0, (seconds ?? 0) / total.current) : 0;
  const countdown = formatCountdown(seconds);
  const arrives = formatTime(order.readyAt);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace('/orders')}
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
          <View style={styles.headerText}>
            <View style={styles.badgeRow}>
              <View style={[styles.pulse, { backgroundColor: statusColor }]} />
              <Text style={[styles.badgeLabel, { color: statusColor }]}>{label}</Text>
            </View>
            <Text style={[styles.restaurant, { color: colors.ink }]} numberOfLines={1}>
              {order.restaurantName}
            </Text>
          </View>
          <View
            style={[
              styles.glyphWrap,
              {
                backgroundColor: cancelled
                  ? colors.dangerSoft
                  : statusColor === colors.good
                    ? colors.good
                    : colors.accentSoft,
              },
            ]}
          >
            <Text style={styles.glyph}>{STATUS_GLYPH[status] ?? '•'}</Text>
          </View>
        </View>

        <Text style={[styles.description, { color: colors.ink2 }]}>{description}</Text>

        {/* Honest about liveness: a countdown that quietly stopped updating
            looks exactly like an order that stopped moving. */}
        {inProgress && !done ? (
          <Text style={[styles.live, { color: live ? colors.good : colors.ink3 }]}>
            {live ? '●' : '○'}
          </Text>
        ) : null}

        {unpaid ? (
          <>
            <View
              style={[
                styles.stateCard,
                { backgroundColor: colors.accentSoft, borderColor: colors.accent },
              ]}
            >
              <Text style={[styles.stateTitle, { color: colors.ink }]}>{t('unpaidTitle')}</Text>
              <Text style={[styles.stateDesc, { color: colors.ink2 }]}>{t('unpaidDesc')}</Text>
              <View style={[styles.totalRow, { borderTopColor: colors.line }]}>
                <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('total')}</Text>
                <Text style={[styles.totalValue, { color: colors.ink }]}>
                  {formatAmd(order.totalAmd)}
                </Text>
              </View>
            </View>

            {error !== null ? (
              <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
            ) : null}

            <Pressable
              onPress={payNow}
              disabled={busy}
              style={[styles.primary, { backgroundColor: colors.accent, opacity: busy ? 0.5 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {t('payNow')} · {formatAmd(order.totalAmd)}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={confirmCancel}
              disabled={busy}
              style={[styles.secondary, { borderColor: colors.danger }]}
            >
              <Text style={[styles.secondaryText, { color: colors.danger }]}>
                {t('cancelOrder')}
              </Text>
            </Pressable>
          </>
        ) : null}

        {cancelled ? (
          <View style={styles.cancelled}>
            <View style={[styles.cancelledDisc, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.cancelledMark, { color: colors.danger }]}>✕</Text>
            </View>
            <Text style={[styles.cancelledTitle, { color: colors.ink }]}>{label}</Text>
            <Text style={[styles.cancelledDesc, { color: colors.ink2 }]}>{description}</Text>
          </View>
        ) : null}

        {inProgress ? (
          <>
            {showRing ? (
              <View style={styles.ringWrap}>
                <Svg width={236} height={236} style={styles.ring}>
                  <Circle
                    cx={118}
                    cy={118}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={colors.chip}
                    strokeWidth={14}
                  />
                  <Circle
                    cx={118}
                    cy={118}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={colors.accent}
                    strokeWidth={14}
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                    transform="rotate(-90 118 118)"
                  />
                </Svg>
                <View style={styles.ringCentre}>
                  <Text style={[styles.ringLabel, { color: colors.ink2 }]}>{t('readyIn')}</Text>
                  <Text style={[styles.ringValue, { color: colors.ink }]}>{countdown}</Text>
                  {arrives !== null ? (
                    <Text style={[styles.ringHint, { color: colors.ink2 }]}>
                      {t('arrivesAt')} {arrives}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {showBadge ? (
              <View style={[styles.bigBadge, { backgroundColor: colors.good }]}>
                <Text style={styles.bigBadgeGlyph}>
                  {status === OrderStatus.Ready ? '🛍️' : '✅'}
                </Text>
              </View>
            ) : null}

            <View style={styles.stages}>
              {STAGES.map((stage, index) => {
                const lit = reached >= index;
                return (
                  <View key={stage.status} style={styles.stage}>
                    <View
                      style={[styles.dot, { backgroundColor: lit ? colors.accent : colors.chip }]}
                    />
                    <Text
                      style={[
                        styles.stageText,
                        { color: lit ? colors.ink : colors.ink3, fontWeight: lit ? '700' : '500' },
                      ]}
                    >
                      {t(stage.key)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View
              style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <PickupQr code={order.pickupCode} borderColor={colors.line} label={t('pickupQrLabel')} />
              <View style={styles.codeBody}>
                <Text style={[styles.codeTitle, { color: colors.ink }]}>
                  {t('pickupCode')} · {order.pickupCode}
                </Text>
                <Text style={[styles.codeHint, { color: colors.ink2 }]}>
                  {order.tableNo === null
                    ? `${t('showAtCounter')} ${t('pickupExpress')}`
                    : `${t('atTable')} ${order.tableNo}`}
                </Text>
              </View>
            </View>

            <Text style={[styles.noRefund, { color: colors.ink3 }]}>🔒 {t('noRefundNote')}</Text>
          </>
        ) : null}

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
          <View style={[styles.row, styles.totalLine, { borderTopColor: colors.line }]}>
            <Text style={[styles.strong, { color: colors.ink }]}>{t('total')}</Text>
            <Text style={[styles.strong, { color: colors.ink }]}>{formatAmd(order.totalAmd)}</Text>
          </View>
        </View>

        <Text style={[styles.orderCode, { color: colors.ink3 }]}>{order.code}</Text>

        <Pressable
          onPress={() => router.replace(done ? '/orders' : '/')}
          style={[styles.doneButton, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <Text style={[styles.doneText, { color: colors.ink }]}>
            {done ? t('backToOrders') : t('done')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * The pickup code as something a counter can scan.
 *
 * It used to be the digits printed large on a white square — a picture of a QR
 * code rather than one. That was honest while the code was four digits read out
 * loud, and stopped being enough when the code became the thing that closes the
 * order: the counter now types it, and typing six digits off a stranger's
 * screen at a queue is where the wrong order gets handed over. A scanner reads
 * it in one gesture instead.
 *
 * The payload is the code alone — six digits, nothing else. A URL or a JSON
 * envelope would encode the same secret in a denser grid, and the panel's
 * handover box takes exactly these characters from a wedge scanner with no
 * parsing in between.
 *
 * The encoding is `@amragrir/ui`'s, shared with the back office and the web
 * tracking page: it returns path data in module units and draws nothing, so one
 * function serves an `<svg>` and this.
 */
function PickupQr({
  code,
  borderColor,
  label,
}: {
  code: string;
  borderColor: string;
  label: string;
}) {
  const qr = useMemo(() => encodeQr(code), [code]);

  return (
    <View style={[styles.qr, { backgroundColor: '#fff', borderColor }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        // What this is cannot be worked out from a path of several hundred
        // squares. A screen reader landing on it hears that it is the pickup
        // code — the digits themselves are already read out beside it.
        accessibilityRole="image"
        accessibilityLabel={label}
      >
        <Path d={qr.path} fill="#111" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulse: { width: 8, height: 8, borderRadius: 5 },
  badgeLabel: { fontSize: 13, fontWeight: '700' },
  restaurant: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  glyphWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24 },
  description: { fontSize: 13.5, lineHeight: 20, marginTop: 12 },
  live: { fontSize: 11, marginTop: 6 },
  stateCard: { marginTop: 18, borderRadius: 22, borderWidth: 1, padding: 20 },
  stateTitle: { fontSize: 17, fontWeight: '800' },
  stateDesc: { fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 22, fontWeight: '800' },
  primary: {
    marginTop: 14,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    marginTop: 10,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  cancelled: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  cancelledDisc: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  cancelledMark: { fontSize: 42, fontWeight: '800' },
  cancelledTitle: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  cancelledDesc: { fontSize: 14, textAlign: 'center', maxWidth: 250 },
  ringWrap: { width: 236, height: 236, alignSelf: 'center', marginTop: 24, marginBottom: 6 },
  ring: { position: 'absolute' },
  ringCentre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  ringValue: { fontSize: 52, fontWeight: '800', letterSpacing: -1.5, marginTop: 4 },
  ringHint: { fontSize: 13, marginTop: 6 },
  bigBadge: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    marginBottom: 12,
  },
  bigBadgeGlyph: { fontSize: 62 },
  stages: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  stage: { flex: 1, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 7, marginBottom: 7 },
  stageText: { fontSize: 10, textAlign: 'center' },
  codeCard: {
    marginTop: 24,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  /**
   * The plate the code is drawn on.
   *
   * White with `#111` modules in both themes, and not a token in sight: this is
   * the one surface in the app whose colours are chosen for a machine. A code
   * that inverted itself under the dark theme is one a counter's handheld may
   * decline to read, and the theme is not something the person holding the
   * scanner picked. The panel's `QrPlate` makes the same trade.
   */
  qr: {
    width: 96,
    height: 96,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  codeBody: { flex: 1, minWidth: 0 },
  codeTitle: { fontSize: 15, fontWeight: '800' },
  codeHint: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  noRefund: { fontSize: 12, marginTop: 14, lineHeight: 17 },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 22,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 12 },
  meta: { fontSize: 13.5 },
  strong: { fontSize: 15, fontWeight: '700' },
  orderCode: { fontSize: 12, textAlign: 'center', marginTop: 14 },
  doneButton: {
    marginTop: 22,
    height: 54,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 16, fontWeight: '700' },
  error: { fontSize: 13.5, fontWeight: '600', marginTop: 10 },
});
