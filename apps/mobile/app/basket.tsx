import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { ApiError } from '../src/api/client';
import { cart as cartApi } from '../src/api/endpoints';
import type { Quote } from '../src/api/types';
import { useCart } from '../src/cart';
import { Photo } from '../src/components/Photo';
import { useTranslate } from '../src/language';
import { useTheme } from '../src/theme/useTheme';
import { formatAmd } from '../src/format';

export default function BasketScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
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
  //
  // The chosen ending is part of the key because the server validates it: a
  // restaurant that has withdrawn eating in refuses the quote, and that refusal
  // belongs on this screen rather than at the payment.
  const basketKey =
    payload === null
      ? ''
      : `${payload.branchId}:${payload.pickupOption ?? ''}:${JSON.stringify(payload.items)}`;

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
  }, [basketKey]);

  if (lines.length === 0) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.emptyGlyph}>🧺</Text>
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>{t('emptyBasket')}</Text>
        <Text style={[styles.emptyHint, { color: colors.ink2 }]}>{t('emptyBasketHint')}</Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={[styles.browse, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.browseText}>{t('browseRestaurants')}</Text>
        </Pressable>
      </View>
    );
  }

  const unavailable = new Set(quote?.unavailable.map((entry) => entry.menuItemId) ?? []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
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
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.ink }]}>{t('basket')}</Text>
            <Text style={[styles.restaurant, { color: colors.ink2 }]} numberOfLines={1}>
              {restaurantName}
            </Text>
          </View>
        </View>

        <View style={styles.lines}>
          {lines.map((line) => {
            const soldOut = unavailable.has(line.menuItemId);
            return (
              <View
                key={line.menuItemId}
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <Photo uri={line.photoUrl} style={styles.thumb} />
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.dish, { color: soldOut ? colors.ink3 : colors.ink }]}
                    numberOfLines={2}
                  >
                    {line.name}
                  </Text>
                  <Text style={[styles.each, { color: colors.ink2 }]}>
                    {formatAmd(line.priceAmd)} {t('each')}
                  </Text>
                  {soldOut ? (
                    <Text style={[styles.each, { color: colors.danger }]}>{t('lineSoldOut')}</Text>
                  ) : null}
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.lineTotal, { color: colors.ink }]}>
                    {formatAmd(line.priceAmd * line.qty)}
                  </Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => setQty(line.menuItemId, line.qty - 1)}
                      accessibilityLabel={t('decrease')}
                      style={[
                        styles.stepMinus,
                        { backgroundColor: colors.chip, borderColor: colors.line },
                      ]}
                    >
                      <Text style={[styles.stepText, { color: colors.ink }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.qty, { color: colors.ink }]}>{line.qty}</Text>
                    <Pressable
                      onPress={() => setQty(line.menuItemId, line.qty + 1)}
                      accessibilityLabel={t('increase')}
                      style={[styles.stepPlus, { backgroundColor: colors.accent }]}
                    >
                      <Text style={styles.stepPlusText}>＋</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.back()}
          style={[styles.addMore, { borderColor: colors.line }]}
        >
          <Text style={[styles.addMoreText, { color: colors.accent }]}>{t('addMore')}</Text>
        </Pressable>

        {/* The choice inside pickup — take it away, or eat it here — used to be
            drawn on this screen and now lives on the pre-order one, directly
            under Pickup / Dine-in. It belongs there: at a restaurant, eating in
            *is* the dine-in mode, and the dead "eat at the restaurant" button
            that says so has to sit beside the booking calendar it sends people
            to, not a screen away from it. */}

        {quote !== null ? (
          <View
            style={[styles.totals, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('subtotal')}</Text>
              <Text style={[styles.totalValue, { color: colors.ink }]}>
                {formatAmd(quote.subtotalAmd)}
              </Text>
            </View>
            <View style={[styles.totalRow, styles.totalRule, { borderBottomColor: colors.line }]}>
              <Text style={[styles.totalLabel, { color: colors.ink2 }]}>{t('serviceFee')}</Text>
              <Text style={[styles.totalValue, { color: colors.ink }]}>
                {formatAmd(quote.serviceFeeAmd)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.grandLabel, { color: colors.ink }]}>{t('total')}</Text>
              <Text style={[styles.grandValue, { color: colors.ink }]}>
                {formatAmd(quote.totalAmd)}
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable onPress={clear} style={styles.clear}>
          <Text style={[styles.clearText, { color: colors.ink3 }]}>{t('removeLine')}</Text>
        </Pressable>

        {error !== null ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {quote === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable
            disabled={!quote.canOrder || loading}
            // The basket no longer leads straight to payment: when and how the
            // order is collected is settled first, and for dine-in that is
            // where the table gets booked.
            onPress={() => router.push('/preorder')}
            accessibilityRole="button"
            style={[styles.cta, { backgroundColor: quote.canOrder ? colors.accent : colors.chip }]}
          >
            <Text style={[styles.ctaText, { color: quote.canOrder ? '#fff' : colors.ink3 }]}>
              {quote.branchIsOpen
                ? `${t('chooseTime')} · ${formatAmd(quote.totalAmd)}`
                : t('branchClosed')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  emptyGlyph: { fontSize: 56 },
  emptyTitle: { fontSize: 19, fontWeight: '800', marginTop: 6 },
  emptyHint: { fontSize: 14, textAlign: 'center', maxWidth: 230 },
  browse: {
    marginTop: 14,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 130 },
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
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  restaurant: { fontSize: 13.5, marginTop: 1 },
  lines: { gap: 12, marginTop: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
  },
  thumb: { width: 66, height: 66, borderRadius: 13 },
  rowBody: { flex: 1, minWidth: 0 },
  dish: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  each: { fontSize: 12.5, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  lineTotal: { fontSize: 15, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepMinus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPlus: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 19, lineHeight: 22 },
  stepPlusText: { color: '#fff', fontSize: 17, lineHeight: 20 },
  qty: { minWidth: 16, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  addMore: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: { fontSize: 14, fontWeight: '700' },
  totals: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 },
  totalRule: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12, marginBottom: 12 },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 14, fontWeight: '600' },
  grandLabel: { fontSize: 15, fontWeight: '700' },
  grandValue: { fontSize: 16, fontWeight: '800' },
  clear: { paddingVertical: 14, alignSelf: 'center' },
  clearText: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 30 },
  cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
