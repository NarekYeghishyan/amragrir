import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { PaymentMethod } from '@amragrir/shared';
import { ApiError, newIdempotencyKey } from '../src/api/client';
import { cart as cartApi, orders, payments } from '../src/api/endpoints';
import type { Quote } from '../src/api/types';
import { useCart } from '../src/cart';
import { useTranslate, type Translate } from '../src/language';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';
import { formatAmd, formatTime } from '../src/format';

/** The artifact draws a glyph beside each method and names all three. Cash is
 *  deliberately absent from `PaymentMethod`: an order is paid for before the
 *  kitchen sees it, so nothing can owe money at the counter. */
const METHODS: { value: PaymentMethod; glyph: string; key: Parameters<Translate>[0] }[] = [
  { value: PaymentMethod.ApplePay, glyph: '', key: 'payApple' },
  { value: PaymentMethod.GooglePay, glyph: 'G', key: 'payGoogle' },
  { value: PaymentMethod.Card, glyph: '💳', key: 'payCard' },
];

export default function CheckoutScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { user } = useSession();
  const { toPayload, clear, restaurantName, readyAt } = useCart();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.Card);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One key per checkout attempt, held across retries.
   *
   * This is the whole point of idempotency: if "Place order" fails on a flaky
   * connection and the customer taps again, the same key replays the first
   * response instead of creating a second order. Generating it inside the
   * request would defeat that entirely.
   */
  const orderKey = useRef(newIdempotencyKey());
  const paymentKey = useRef(newIdempotencyKey());

  const payload = useMemo(() => toPayload(), [toPayload]);

  // Priced once, on entry. The basket is not editable from here, and re-pricing
  // mid-checkout would change the total under a customer about to confirm it.
  useEffect(() => {
    if (!payload) {
      router.replace('/basket');
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
  }, []);

  // Ordering needs a verified phone (ROLES_AND_PERMISSIONS.md §1). Better to
  // say so here than to let the customer choose a card and then get a 403.
  const needsVerification = user === null || !user.phoneVerified;

  const placeOrder = async (): Promise<void> => {
    if (!payload) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      // `readyAt` rides on the order and not on the quote: only `POST /orders`
      // takes it. Omitted entirely when nothing was chosen, which the API
      // reads as "as soon as the kitchen can".
      const order = await orders.create(
        { ...payload, ...(readyAt === null ? {} : { readyAt }) },
        orderKey.current,
      );
      await payments.pay(order.id, method, paymentKey.current);

      clear();
      router.replace(`/tracking/${order.id}`);
    } catch (err) {
      // The keys are *not* regenerated here: a retry of this same attempt must
      // reuse them, which is what makes tapping again safe.
      setError(err instanceof ApiError ? err.message : t('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
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

        <Text style={[styles.title, { color: colors.ink }]}>{t('checkout')}</Text>
        <Text style={[styles.restaurant, { color: colors.ink2 }]} numberOfLines={1}>
          {restaurantName}
        </Text>

        {quote === null ? (
          <ActivityIndicator color={colors.accent} style={styles.spinner} />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {quote.items.map((item) => (
                <View
                  key={item.menuItemId}
                  style={[styles.lineRow, { borderBottomColor: colors.line }]}
                >
                  <View style={[styles.qtyChip, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.qtyText, { color: colors.accent }]}>{item.qty}</Text>
                  </View>
                  <Text style={[styles.lineName, { color: colors.ink }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.lineTotal, { color: colors.ink }]}>
                    {formatAmd(item.lineTotalAmd)}
                  </Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('subtotal')}</Text>
                <Text style={[styles.totalValue, { color: colors.ink }]}>
                  {formatAmd(quote.subtotalAmd)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('serviceFee')}</Text>
                <Text style={[styles.totalValue, { color: colors.ink }]}>
                  {formatAmd(quote.serviceFeeAmd)}
                </Text>
              </View>
              {quote.depositAmd > 0 ? (
                <>
                  <View style={[styles.totalRow, styles.depositRow, { borderTopColor: colors.line }]}>
                    <Text style={[styles.totalLabel, { color: colors.ink2 }]}>
                      🪑 {t('deposit')}
                    </Text>
                    <Text style={[styles.totalValue, { color: colors.ink }]}>
                      {formatAmd(quote.depositAmd)}
                    </Text>
                  </View>
                  <Text style={[styles.credited, { color: colors.good }]}>
                    ✓ {t('depositCredited')}
                  </Text>
                </>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.readyRow}>
                <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('readyAtLabel')}</Text>
                {/* The time the customer chose on the pre-order screen, or the
                    kitchen's own estimate when they left it as soon as
                    possible. */}
                <Text style={[styles.readyValue, { color: colors.accent }]}>
                  {readyAt === null
                    ? `⚡ ${quote.prepMin} ${t('minutes')}`
                    : formatTime(readyAt)}
                </Text>
              </View>
              {quote.tableNo !== null ? (
                <View style={styles.readyRow}>
                  <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('atTable')}</Text>
                  <Text style={[styles.readyValue, { color: colors.ink }]}>🪑 {quote.tableNo}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.section, { color: colors.ink2 }]}>{t('payment')}</Text>
            <View style={styles.methods}>
              {METHODS.map(({ value, glyph, key }) => {
                const selected = value === method;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setMethod(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.method,
                      {
                        backgroundColor: colors.card,
                        borderColor: selected ? colors.accent : colors.line,
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Text style={styles.methodGlyph}>{glyph}</Text>
                    <Text style={[styles.methodLabel, { color: colors.ink }]}>{t(key)}</Text>
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: selected ? colors.accent : colors.line,
                          backgroundColor: selected ? colors.accent : 'transparent',
                        },
                      ]}
                    >
                      {selected ? (
                        <View style={[styles.radioInner, { backgroundColor: colors.card }]} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.finalNote, { color: colors.ink3 }]}>{t('payingIsFinal')}</Text>
          </>
        )}

        {error !== null ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {needsVerification ? (
          <Pressable
            onPress={() => router.push('/auth')}
            style={[styles.cta, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.ctaText}>{t('signIn')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={placeOrder}
            disabled={busy || quote === null || !quote.canOrder}
            style={[
              styles.cta,
              {
                backgroundColor: colors.accent,
                opacity: busy || quote === null || !quote.canOrder ? 0.5 : 1,
              },
            ]}
          >
            {/* `dueNowAmd`, not `totalAmd`: a table deposit was taken at
                booking and is credited against the bill, so charging the total
                here would take it twice. The server does that subtraction —
                this only prints its answer. */}
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {t('placeOrder')}
                {quote !== null ? ` · ${formatAmd(quote.dueNowAmd)}` : ''}
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
  restaurant: { fontSize: 13.5, marginTop: 4 },
  spinner: { marginTop: 40 },
  card: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qtyChip: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 12, fontWeight: '800' },
  lineName: { flex: 1, fontSize: 15, fontWeight: '600' },
  lineTotal: { fontSize: 15, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  depositRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 12 },
  credited: { fontSize: 11.5, fontWeight: '600', paddingBottom: 10 },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 14, fontWeight: '600' },
  readyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  readyValue: { fontSize: 15, fontWeight: '700' },
  section: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 24,
  },
  methods: { gap: 10, marginTop: 12 },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 16,
  },
  methodGlyph: { fontSize: 22, width: 26, textAlign: 'center' },
  methodLabel: { flex: 1, fontSize: 15.5, fontWeight: '600' },
  radio: { width: 22, height: 22, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  finalNote: { fontSize: 12, marginTop: 16, lineHeight: 17 },
  error: { fontSize: 13.5, fontWeight: '600', marginTop: 14 },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 30 },
  cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
