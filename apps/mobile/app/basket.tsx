import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '../src/api/client';
import { cart as cartApi } from '../src/api/endpoints';
import type { Quote } from '../src/api/types';
import { useCart } from '../src/cart';
import { useTheme } from '../src/theme/useTheme';
import { HIT_TARGET, radius, spacing, spot, typography } from '../src/theme/tokens';
import { formatAmd } from '../src/format';

export default function BasketScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { lines, restaurantName, setQty, clear, toPayload } = useCart();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = toPayload();
  // Keyed on the basket's *contents*, not the payload object — that is rebuilt
  // on every render, and depending on it would re-price in a loop. Re-pricing
  // runs when a quantity actually changes; the server owns the arithmetic, so
  // the totals below are always its answer, never a sum computed on the phone.
  const basketKey = payload === null ? '' : `${payload.branchId}:${JSON.stringify(payload.items)}`;

  useEffect(() => {
    if (payload === null) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    cartApi
      .quote(payload)
      .then((result) => {
        if (!cancelled) {
          setQuote(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not price the basket');
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
  }, [basketKey]);

  if (lines.length === 0) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Text style={[styles.empty, { color: colors.ink2 }]}>Your basket is empty</Text>
        <Pressable onPress={() => router.replace('/')} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.accent }]}>Find something to eat</Text>
        </Pressable>
      </View>
    );
  }

  const unavailable = new Set(quote?.unavailable.map((entry) => entry.menuItemId) ?? []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={[styles.restaurant, { color: colors.ink }]}>{restaurantName}</Text>

        {lines.map((line) => {
          const sold_out = unavailable.has(line.menuItemId);
          return (
            <View key={line.menuItemId} style={[styles.row, { borderColor: colors.line }]}>
              <View style={styles.rowBody}>
                <Text style={[styles.dish, { color: sold_out ? colors.ink3 : colors.ink }]}>
                  {line.name}
                </Text>
                <Text style={[styles.meta, { color: colors.ink2 }]}>
                  {formatAmd(line.priceAmd)} each
                </Text>
                {sold_out && (
                  <Text style={[styles.meta, { color: spot.destructive }]}>
                    Not available right now
                  </Text>
                )}
              </View>

              <View style={styles.stepper}>
                <Stepper label="−" onPress={() => setQty(line.menuItemId, line.qty - 1)} />
                <Text style={[styles.qty, { color: colors.ink }]}>{line.qty}</Text>
                <Stepper label="+" onPress={() => setQty(line.menuItemId, line.qty + 1)} />
              </View>
            </View>
          );
        })}

        <Pressable onPress={clear} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.ink3 }]}>Empty basket</Text>
        </Pressable>

        {error !== null && <Text style={[styles.meta, { color: spot.destructive }]}>{error}</Text>}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.line }]}>
        {quote === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Line label="Subtotal" value={formatAmd(quote.subtotalAmd)} />
            <Line label="Service fee" value={formatAmd(quote.serviceFeeAmd)} />
            <Line label="Total" value={formatAmd(quote.totalAmd)} strong />
            <Text style={[styles.meta, { color: colors.ink2 }]}>
              Ready in about {quote.prepMin} min
            </Text>

            <Pressable
              disabled={!quote.canOrder || loading}
              onPress={() => router.push('/checkout')}
              accessibilityRole="button"
              style={[
                styles.cta,
                { backgroundColor: quote.canOrder ? colors.accent : colors.chip },
              ]}
            >
              <Text style={[styles.ctaText, { color: quote.canOrder ? '#fff' : colors.ink3 }]}>
                {quote.branchIsOpen ? 'Go to checkout' : 'Restaurant is closed'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Add one' : 'Remove one'}
      style={[styles.stepperButton, { backgroundColor: colors.chip }]}
    >
      <Text style={[styles.stepperText, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.totalRow}>
      <Text style={[strong ? styles.totalStrong : styles.meta, { color: colors.ink2 }]}>
        {label}
      </Text>
      <Text style={[strong ? styles.totalStrong : styles.meta, { color: colors.ink }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  list: { padding: spacing.lg, gap: spacing.sm },
  restaurant: { ...typography.heading, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 2 },
  dish: { ...typography.body, fontWeight: '700' },
  meta: { ...typography.caption },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { ...typography.heading },
  qty: { ...typography.body, minWidth: 20, textAlign: 'center' },
  link: { paddingVertical: spacing.md, alignSelf: 'flex-start' },
  linkText: { ...typography.label },
  empty: { ...typography.body },
  footer: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalStrong: { ...typography.body, fontWeight: '700' },
  cta: {
    marginTop: spacing.md,
    minHeight: HIT_TARGET + 6,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typography.body, fontWeight: '700' },
});
