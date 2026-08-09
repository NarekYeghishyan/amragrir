import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Path, Svg } from 'react-native-svg';
import { MenuTab } from '@amragrir/shared';
import { catalog, favorites as favoritesApi } from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import type { MenuItem, RestaurantDetail } from '../../src/api/types';
import { Photo } from '../../src/components/Photo';
import { useCart } from '../../src/cart';
import { useSession } from '../../src/session';
import { useTranslate, type Translate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';
import { spot } from '../../src/theme/tokens';
import { formatAmd, formatPriceLevel } from '../../src/format';

const TABS = Object.values(MenuTab);

const TAB_KEYS = {
  [MenuTab.Popular]: 'menuTabPopular',
  [MenuTab.Mains]: 'menuTabMains',
  [MenuTab.Sides]: 'menuTabSides',
  [MenuTab.Drinks]: 'menuTabDrinks',
} as const satisfies Record<string, Parameters<Translate>[0]>;

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const cart = useCart();
  const { user } = useSession();

  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tab, setTab] = useState<string>(MenuTab.Popular);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;

    setLoading(true);
    Promise.all([catalog.restaurant(id), catalog.menu(id, tab)])
      .then(([detail, menu]) => {
        if (cancelled) {
          return;
        }
        setRestaurant(detail);
        setItems(menu.items);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : null);
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
  }, [id, tab]);

  // Favourites belong to an account, so a guest has none and pressing the heart
  // opens Auth rather than failing quietly (ROLES_AND_PERMISSIONS.md §1).
  const canFavorite = user?.phoneVerified === true;

  /**
   * Whether this restaurant is saved.
   *
   * Read from `GET /favorites` rather than from the restaurant itself, because
   * the detail endpoint does not report it — it is the same list the feed and
   * the Favorites tab already read, filtered to the one business on screen.
   *
   * **Keyed by `restaurantId`, not `id`.** The route's `{id}` is whatever the
   * previous screen held — a slug, a branch id or a restaurant id — and only
   * the loaded detail knows which business it resolved to.
   */
  useEffect(() => {
    if (!canFavorite || !restaurant) {
      setSaved(false);
      return;
    }

    let cancelled = false;
    favoritesApi
      .list()
      .then((result) => {
        if (!cancelled) {
          setSaved(result.items.some((item) => item.restaurantId === restaurant.restaurantId));
        }
      })
      .catch(() => {
        // A hollow heart is the honest drawing when the list cannot be read.
      });

    return () => {
      cancelled = true;
    };
  }, [canFavorite, restaurant]);

  /** Saves the restaurant, or gives it back — optimistic, as on the feed. */
  const toggleFavorite = useCallback(() => {
    if (!restaurant) {
      return;
    }
    if (!canFavorite) {
      router.push('/auth');
      return;
    }

    const wasSaved = saved;
    setSaved(!wasSaved);

    const call = wasSaved
      ? favoritesApi.remove(restaurant.restaurantId)
      : favoritesApi.add(restaurant.restaurantId);

    call.catch(() => {
      setSaved(wasSaved);
    });
  }, [canFavorite, restaurant, router, saved]);

  if (loading && !restaurant) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error !== null && !restaurant) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.bg }]}>
        <Text style={[styles.error, { color: colors.ink2 }]}>{error}</Text>
      </View>
    );
  }

  const meta = [
    restaurant?.cuisine,
    formatPriceLevel(restaurant?.priceLevel ?? null),
    // The artifact prints the review count here and the API returns it; a zero
    // is left out rather than shown, since "0 reviews" reads as a verdict.
    restaurant && restaurant.reviewsCount > 0
      ? `${restaurant.reviewsCount} ${t('reviews')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /**
   * A basket belongs to one restaurant (BUSINESS_LOGIC.md §4). Adding from a
   * second one is a decision only the customer can make, so it is asked rather
   * than silently resolved either way.
   */
  const addToBasket = (item: MenuItem): void => {
    if (!restaurant) {
      return;
    }
    const branchId = restaurant.branch.id;
    const line = {
      menuItemId: item.id,
      name: item.name,
      priceAmd: item.priceAmd,
      photoUrl: item.photoUrl,
    };

    if (cart.conflictsWith(branchId)) {
      Alert.alert(t('basketOtherRestaurant'), restaurant.name, [
        { text: t('keepBasket'), style: 'cancel' },
        {
          text: t('basketReplace'),
          style: 'destructive',
          onPress: () => cart.add(branchId, restaurant.name, line),
        },
      ]);
      return;
    }
    cart.add(branchId, restaurant.name, line);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.cover}>
              <Photo uri={restaurant?.coverUrl ?? null} style={StyleSheet.absoluteFill} />
              <Pressable onPress={() => router.back()} style={styles.backWrap}>
                <BlurView intensity={10} tint="systemChromeMaterial" style={styles.glassCircle}>
                  <Svg width={12} height={20} viewBox="0 0 12 20" fill="none">
                    <Path
                      d="M9 2L2 10l7 8"
                      stroke={colors.ink}
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </BlurView>
              </Pressable>

              {/* The artifact's second glass circle, opposite the back button.
                  Drawn only once the restaurant has loaded, because until then
                  there is nothing to save and no state to draw it in. */}
              {restaurant && (
                <Pressable
                  onPress={toggleFavorite}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t(saved ? 'removeFavorite' : 'addFavorite')}
                  style={({ pressed }) => [styles.favWrap, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <BlurView intensity={10} tint="systemChromeMaterial" style={styles.glassCircle}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                        fill={saved ? spot.destructive : 'none'}
                        stroke={saved ? spot.destructive : colors.ink}
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </BlurView>
                </Pressable>
              )}
            </View>

            {/* Pulled up over the cover, with the top corners rounded — the
                artifact's `margin-top:-58px; border-radius:26px 26px 0 0`. */}
            <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
              <View style={styles.titleRow}>
                <View style={styles.titleText}>
                  <Text style={[styles.name, { color: colors.ink }]}>{restaurant?.name}</Text>
                  <Text style={[styles.meta, { color: colors.ink2 }]}>{meta}</Text>
                </View>
                <View
                  style={[styles.ratingCard, { backgroundColor: colors.card, borderColor: colors.line }]}
                >
                  <Text style={[styles.ratingValue, { color: colors.ink }]}>
                    <Text style={{ color: spot.star }}>★ </Text>
                    {restaurant?.rating.toFixed(1)}
                  </Text>
                  <Text style={[styles.ratingLabel, { color: colors.ink2 }]}>{t('reviews')}</Text>
                </View>
              </View>

              <View style={styles.badges}>
                {restaurant?.branch.prepMin != null ? (
                  <View style={[styles.prep, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.prepText, { color: colors.accent }]}>
                      ⏱ {restaurant.branch.prepMin} {t('minutes')}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.badge, { backgroundColor: colors.chip }]}>
                  <Text
                    style={[
                      styles.badgeText,
                      { color: restaurant?.branch.isOpen ? colors.good : colors.ink3 },
                    ]}
                  >
                    {restaurant?.branch.isOpen ? t('open') : t('closed')}
                  </Text>
                </View>
              </View>

              {restaurant?.branch.address ? (
                <Text style={[styles.address, { color: colors.ink3 }]} numberOfLines={1}>
                  📍 {restaurant.branch.address}
                </Text>
              ) : null}

              <View style={styles.tabs}>
                {TABS.map((value) => {
                  const selected = value === tab;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setTab(value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      style={[
                        styles.tab,
                        { backgroundColor: selected ? colors.ink : colors.chip },
                      ]}
                    >
                      <Text
                        style={[styles.tabText, { color: selected ? colors.bg : colors.ink2 }]}
                      >
                        {t(TAB_KEYS[value as keyof typeof TAB_KEYS])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => <MenuRow item={item} onAdd={() => addToBasket(item)} />}
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.error, { color: colors.ink3 }]}>{t('emptyMenuTab')}</Text>
          )
        }
      />

      {cart.itemCount > 0 ? (
        <Pressable
          onPress={() => router.push('/basket')}
          accessibilityRole="button"
          style={[styles.basketBar, { backgroundColor: colors.accent }]}
        >
          <View style={styles.basketCount}>
            <Text style={styles.basketCountText}>{cart.itemCount}</Text>
          </View>
          {/* The artifact also prints a running total here. It is not shown:
              every total in this app is one the server calculated, and the
              basket screen gets a real quote (BUSINESS_LOGIC.md §money). */}
          <Text style={styles.basketText}>{t('viewBasket')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MenuRow({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  const { colors } = useTheme();
  const t = useTranslate();
  const facts = [
    item.caloriesKcal === null ? null : `${item.caloriesKcal} ${t('kcal')}`,
    item.prepMin === null ? null : `${item.prepMin} ${t('minutes')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Photo uri={item.photoUrl} style={styles.thumb} />
      <View style={styles.rowBody}>
        <Text style={[styles.dish, { color: colors.ink }]}>{item.name}</Text>
        {item.desc.length > 0 ? (
          <Text style={[styles.dishDesc, { color: colors.ink2 }]} numberOfLines={2}>
            {item.desc}
          </Text>
        ) : null}
        {facts.length > 0 ? (
          <Text style={[styles.facts, { color: colors.ink3 }]}>{facts}</Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.ink }]}>{formatAmd(item.priceAmd)}</Text>
          {item.isAvailable ? (
            <Pressable
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              style={[styles.add, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.addText}>＋</Text>
            </Pressable>
          ) : (
            <Text style={[styles.facts, { color: colors.ink3 }]}>{t('soldOut')}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 120 },
  cover: { height: 270 },
  backWrap: { position: 'absolute', top: 56, left: 16 },
  favWrap: { position: 'absolute', top: 56, right: 16 },
  glassCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheet: {
    marginTop: -58,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleText: { flex: 1, minWidth: 0 },
  name: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  meta: { fontSize: 13.5, marginTop: 4 },
  ratingCard: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ratingValue: { fontSize: 16, fontWeight: '800' },
  ratingLabel: { fontSize: 10.5, marginTop: 1 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  prep: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12 },
  prepText: { fontSize: 12.5, fontWeight: '700' },
  badge: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12 },
  badgeText: { fontSize: 12.5, fontWeight: '700' },
  address: { fontSize: 12.5, marginTop: 10 },
  tabs: { flexDirection: 'row', gap: 9, marginTop: 20, marginBottom: 6, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  tabText: { fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 14,
  },
  thumb: { width: 104, height: 104, borderRadius: 15 },
  rowBody: { flex: 1, minWidth: 0 },
  dish: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  dishDesc: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  facts: { fontSize: 11, marginTop: 6 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  price: { fontSize: 16, fontWeight: '800' },
  add: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 26 },
  basketBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 30,
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  basketCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  basketCountText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  basketText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { fontSize: 15, textAlign: 'center', marginTop: 28 },
});
