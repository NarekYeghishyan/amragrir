import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PaymentMethod } from '@amragrir/shared';
import { ApiError, newIdempotencyKey } from '../src/api/client';
import { cart as cartApi, orders, payments } from '../src/api/endpoints';
import type { Quote } from '../src/api/types';
import { useCart } from '../src/cart';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme/useTheme';
import { HIT_TARGET, radius, spacing, spot, typography } from '../src/theme/tokens';
import { formatAmd } from '../src/format';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.ApplePay]: ' Apple Pay',
  [PaymentMethod.GooglePay]: 'G Pay',
  [PaymentMethod.Card]: 'Credit card',
  [PaymentMethod.Cash]: 'Cash at the counter',
};

export default function CheckoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useSession();
  const { toPayload, clear, restaurantName } = useCart();

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
          setError(err instanceof ApiError ? err.message : 'Could not load totals');
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
      const order = await orders.create(payload, orderKey.current);
      await payments.pay(order.id, method, paymentKey.current);

      clear();
      router.replace(`/tracking/${order.id}`);
    } catch (err) {
      // The keys are *not* regenerated here: a retry of this same attempt must
      // reuse them, which is what makes tapping again safe.
      setError(err instanceof ApiError ? err.message : 'Could not place the order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.restaurant, { color: colors.ink }]}>{restaurantName}</Text>

        <Text style={[styles.section, { color: colors.ink2 }]}>Payment</Text>
        {Object.values(PaymentMethod).map((value) => {
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
                  backgroundColor: selected ? colors.accentSoft : colors.card,
                  borderColor: selected ? colors.accent : colors.line,
                },
              ]}
            >
              <Text style={[styles.methodText, { color: colors.ink }]}>{METHOD_LABEL[value]}</Text>
            </Pressable>
          );
        })}

        {method === PaymentMethod.Cash && (
          <Text style={[styles.meta, { color: colors.ink2 }]}>
            Nothing is charged now — you pay when you collect. The kitchen still starts on it.
          </Text>
        )}

        {quote !== null && (
          <View style={[styles.totals, { borderColor: colors.line }]}>
            <Row label="Subtotal" value={formatAmd(quote.subtotalAmd)} />
            <Row label="Service fee" value={formatAmd(quote.serviceFeeAmd)} />
            <Row label="Total" value={formatAmd(quote.totalAmd)} strong />
          </View>
        )}

        {error !== null && <Text style={[styles.error, { color: spot.destructive }]}>{error}</Text>}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.line }]}>
        {needsVerification ? (
          <Pressable
            onPress={() => router.push('/auth')}
            style={[styles.cta, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.ctaText}>Verify your phone to order</Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={busy || quote === null}
            onPress={placeOrder}
            accessibilityRole="button"
            style={[styles.cta, { backgroundColor: busy ? colors.chip : colors.accent }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink2} />
            ) : (
              <Text style={styles.ctaText}>
                {method === PaymentMethod.Cash ? 'Place order' : 'Pay now'}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[strong ? styles.strong : styles.meta, { color: colors.ink2 }]}>{label}</Text>
      <Text style={[strong ? styles.strong : styles.meta, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.sm },
  restaurant: { ...typography.heading },
  section: { ...typography.label, marginTop: spacing.md },
  method: {
    minHeight: HIT_TARGET + 6,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  methodText: { ...typography.body },
  meta: { ...typography.caption },
  totals: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  strong: { ...typography.body, fontWeight: '700' },
  error: { ...typography.caption, marginTop: spacing.md },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  cta: {
    minHeight: HIT_TARGET + 6,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typography.body, fontWeight: '700', color: '#fff' },
});
