import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Path, Svg } from 'react-native-svg';
import { ApiError } from '../src/api/client';
import { cart as cartApi, catalog } from '../src/api/endpoints';
import type { Quote, RestaurantDetail } from '../src/api/types';
import { useCart } from '../src/cart';
import { Photo } from '../src/components/Photo';
import { useTranslate } from '../src/language';
import { useTheme } from '../src/theme/useTheme';
import { spot } from '../src/theme/tokens';
import { formatAmd, formatPriceLevel } from '../src/format';

export default function BasketScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { branchId, lines, restaurantName, setQty, clear, toPayload } = useCart();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [branch, setBranch] = useState<RestaurantDetail | null>(null);
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

  // Who the food is being bought from, for the banner below.
  //
  // Asked for **by branch id**, which is what the basket stores and what the
  // quote was priced against: a restaurant may be several kitchens on several
  // streets, and only the one this basket belongs to has an address worth
  // printing here.
  //
  // The quote carries the name and the prep time and nothing else about the
  // place — no cover, no rating, no cuisine — so this is a second, ordinary
  // catalogue GET. It is not allowed to take the screen down with it: a basket
  // must still show what was collected and what it costs when the catalogue is
  // having a moment, so a failure simply leaves the banner undrawn. Same
  // arrangement as the web's `/cart` (SCREENS.md §4).
  useEffect(() => {
    if (branchId === null) {
      setBranch(null);
      return;
    }
    let cancelled = false;

    catalog
      .restaurant(branchId)
      .then((detail) => {
        if (!cancelled) {
          setBranch(detail);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBranch(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [branchId]);

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

        {/* Which restaurant this basket belongs to, as the artifact draws it:
            the cover with the rating on glass, then the name, the meta line and
            the two tags. The header above says the name in 13.5px grey and
            nothing else, which is enough to *recognise* a restaurant and not
            enough to check one — a customer about to choose a time could not
            see from this screen which address the food was being collected
            from. The web answered the same complaint with `BranchCard`
            (SCREENS.md §4); this is the phone's own drawing of it. */}
        {branch ? (
          <BranchBanner
            branch={branch}
            prepMin={quote?.prepMin ?? null}
            // By branch id, not by slug: a slug resolves to one branch of a
            // restaurant that may have several, and the only branch worth
            // opening from here is the one this basket was priced against.
            // Pushed rather than `back()`, because a basket is not always
            // arrived at from the menu — the tab bar and a "reorder" both land
            // here with the restaurant nowhere in the history.
            onPress={() =>
              router.push({ pathname: '/restaurant/[id]', params: { id: branch.branch.id } })
            }
          />
        ) : null}

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

/**
 * The restaurant a basket belongs to — the artifact's card, above the lines.
 *
 * The whole card is the way to its menu, as the feed's card is and as the web's
 * `BranchCard` has always been. It was drawn unpressable at first, on the
 * argument that the back button and "＋ Add more items" were already two ways
 * back — but a card that looks exactly like the one that was pressed to get
 * here is going to be pressed again, and doing nothing is the one answer that
 * cannot be right. The chevron says so, and the target is the card rather than
 * the name, which would be the smallest thing on the screen.
 */
function BranchBanner({
  branch,
  prepMin,
  onPress,
}: {
  branch: RestaurantDetail;
  prepMin: number | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const t = useTranslate();

  // Joined from a list so a restaurant with no cuisine or no price level leaves
  // no stray separator, and a zero review count is left out rather than shown —
  // "0 reviews" reads as a verdict. Same line the restaurant screen prints.
  const meta = [
    branch.cuisine,
    formatPriceLevel(branch.priceLevel),
    branch.reviewsCount > 0 ? `${branch.reviewsCount} ${t('reviews')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // The address is the useful one; the branch's own name ("Republic Square")
  // and then the city stand in where a branch has not been given one. The
  // artifact puts a distance here, which nothing on this screen knows: distance
  // is measured from an origin the feed has and a basket does not, and the
  // detail endpoint reports none. The address is what somebody collecting food
  // actually needs, and it is what the web card settled on for the same reason.
  const where = branch.branch.address ?? branch.branch.name ?? branch.branch.city;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${branch.name} · ${t('menu')}`}
      style={({ pressed }) => [
        styles.branch,
        { backgroundColor: colors.card, borderColor: colors.line, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.branchCover}>
        <Photo uri={branch.coverUrl} style={StyleSheet.absoluteFill} />
        <BlurView
          intensity={8}
          tint="systemChromeMaterial"
          style={[styles.branchRating, { backgroundColor: colors.glass }]}
        >
          <Text style={[styles.branchRatingText, { color: colors.ink }]}>
            <Text style={{ color: spot.star }}>★ </Text>
            {branch.rating.toFixed(1)}
          </Text>
        </BlurView>
      </View>

      <View style={styles.branchBody}>
        {/* The chevron is decoration, and says nothing to a screen reader: the
            card is one accessibility element carrying the label above, so the
            children inside it are not announced one at a time. Same reasoning
            as the web card's `aria-hidden` ›. */}
        <View style={styles.branchNameRow}>
          <Text style={[styles.branchName, { color: colors.ink }]} numberOfLines={1}>
            {branch.name}
          </Text>
          <Text style={[styles.branchChev, { color: colors.ink3 }]}>›</Text>
        </View>
        {meta.length > 0 ? (
          <Text style={[styles.branchMeta, { color: colors.ink2 }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}

        <View style={styles.branchTags}>
          {/* How long *this basket* takes, from the quote — not the branch's
              general figure. The quote prices the dishes actually in it, so a
              drink and four grills report different numbers and both are true.
              Undrawn until the quote answers, rather than filled with the
              other number for a moment. */}
          {prepMin !== null ? (
            <View style={[styles.branchPrep, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.branchPrepText, { color: colors.accent }]}>
                ⏱ {prepMin} {t('minutes')}
              </Text>
            </View>
          ) : null}
          {where ? (
            <Text style={[styles.branchWhere, { color: colors.ink2 }]} numberOfLines={1}>
              📍 {where}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
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
  // The artifact's card: a 140px cover, a 20px corner, and the rating on glass
  // in the corner of the photograph.
  branch: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  branchCover: { height: 140, width: '100%' },
  branchRating: {
    position: 'absolute',
    top: 11,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  branchRatingText: { fontSize: 12.5, fontWeight: '800' },
  branchBody: { paddingHorizontal: 15, paddingTop: 13, paddingBottom: 15 },
  branchNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Flexed so the chevron stays pinned to the card's edge and a long name is
  // cut with an ellipsis instead of pushing it off.
  branchName: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  branchChev: { fontSize: 20, lineHeight: 22 },
  branchMeta: { fontSize: 12.5, marginTop: 3 },
  branchTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  branchPrep: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  branchPrepText: { fontSize: 11.5, fontWeight: '700' },
  // Flexed so a long address is cut with an ellipsis instead of pushing the
  // prep tag off the card.
  branchWhere: { flex: 1, minWidth: 0, fontSize: 12 },
  lines: { gap: 12, marginTop: 14 },
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
