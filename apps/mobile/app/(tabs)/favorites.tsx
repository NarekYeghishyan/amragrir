import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { favorites as favoritesApi } from '../../src/api/endpoints';
import type { FavoriteDish, FavoriteItem } from '../../src/api/types';
import { Photo } from '../../src/components/Photo';
import {
  readGuestFavoriteDishes,
  readGuestFavorites,
  removeGuestFavorite,
  removeGuestFavoriteDish,
} from '../../src/guest-favorites';
import { formatAmd, formatDistance, formatPriceLevel } from '../../src/format';
import { useTranslate } from '../../src/language';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme/useTheme';
import { spot } from '../../src/theme/tokens';

/** Which half of the screen is showing. Restaurants first: it is the older list
 *  and usually the longer one. */
type Tab = 'branches' | 'dishes';

/**
 * Favorites — the artifact's FAVORITES screen, in two halves.
 *
 * **A heart means two different things in this app**, so this screen shows two
 * lists: the addresses somebody saved (the heart on a cover) and the dishes they
 * saved (the heart over a plate — a filtered card's slider, a row on a menu).
 * Merging them into one list was the other option and it is the wrong one: they
 * are different cards with different actions, one opens a menu at the top and
 * the other opens it at a dish, and a mixed list would have to explain which is
 * which on every row.
 *
 * Both are refetched on focus: the hearts that fill these lists live on the
 * other screens, so either is stale the moment one of them is used.
 */
export default function FavoritesScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();

  const { user } = useSession();
  const signedIn = user?.phoneVerified === true;

  const [tab, setTab] = useState<Tab>('branches');
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [dishes, setDishes] = useState<FavoriteDish[]>([]);
  const [loading, setLoading] = useState(true);

  /** Cleared the moment the session changes — the same reason as the orders
   *  tab: this screen stays mounted through a log-out, and the read below
   *  landing a beat later would leave the last account's list on screen in the
   *  meantime. */
  useEffect(() => {
    setItems([]);
    setDishes([]);
  }, [signedIn]);

  /**
   * The account's lists, or the phone's.
   *
   * A guest's favourites are kept on the device (`src/guest-favorites.ts`), and
   * this screen renders them from the same rows — which is why that store keeps
   * whole cards rather than ids: there is no `GET /favorites` behind a guest to
   * redraw them from.
   *
   * Both lists are read on every focus rather than the one on screen, so the
   * counts on the two pills are true and switching between them costs nothing.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const readBranches = signedIn
        ? favoritesApi.list().then((result) => result.items)
        : readGuestFavorites();
      const readDishes = signedIn
        ? favoritesApi.dishes().then((result) => result.items)
        : readGuestFavoriteDishes();

      // Settled rather than `all`: one list failing must not blank the other.
      void Promise.allSettled([readBranches, readDishes])
        .then(([branches, saved]) => {
          if (cancelled) {
            return;
          }
          if (branches.status === 'fulfilled') {
            setItems(branches.value);
          }
          if (saved.status === 'fulfilled') {
            setDishes(saved.value);
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
    }, [signedIn]),
  );

  /**
   * Gives a branch back.
   *
   * The row leaves the list on the press rather than on the answer: it is the
   * only thing a filled heart can mean on a screen where everything is
   * favourited, and waiting a round trip to remove it leaves somebody pressing
   * a heart that stays put. A refusal puts the row back where it was.
   */
  const remove = useCallback((branchId: string) => {
    const removed = items;
    setItems((current) => current.filter((item) => item.branchId !== branchId));
    const write = signedIn ? favoritesApi.remove(branchId) : removeGuestFavorite(branchId);
    write.catch(() => {
      setItems(removed);
    });
  }, [items, signedIn]);

  /** The same for a dish, against the dish list and the dish endpoint. */
  const removeDish = useCallback((menuItemId: string) => {
    const removed = dishes;
    setDishes((current) => current.filter((dish) => dish.menuItemId !== menuItemId));
    const write = signedIn
      ? favoritesApi.removeDish(menuItemId)
      : removeGuestFavoriteDish(menuItemId);
    write.catch(() => {
      setDishes(removed);
    });
  }, [dishes, signedIn]);

  const showing = tab === 'branches' ? items.length : dishes.length;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.ink }]}>{t('favoritesTitle')}</Text>

      {/* The two halves. Drawn as the same pills the menu's headings use, with
          the count on each — a pill that leads to an empty list should say so
          before it is pressed. */}
      <View style={styles.tabs}>
        {(['branches', 'dishes'] as const).map((entry) => {
          const selected = entry === tab;
          const count = entry === 'branches' ? items.length : dishes.length;
          return (
            <Pressable
              key={entry}
              onPress={() => setTab(entry)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, { backgroundColor: selected ? colors.ink : colors.chip }]}
            >
              <Text
                numberOfLines={1}
                style={[styles.tabText, { color: selected ? colors.bg : colors.ink2 }]}
              >
                {t(entry === 'branches' ? 'favTabRestaurants' : 'favTabDishes')}
                {count > 0 ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

      {!loading && showing === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyGlyph}>{tab === 'branches' ? '🤍' : '🍽️'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            {t(tab === 'branches' ? 'noFavorites' : 'noFavoriteDishes')}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.ink2 }]}>
            {t(tab === 'branches' ? 'noFavoritesHint' : 'noFavoriteDishesHint')}
          </Text>
          <Pressable
            onPress={() => router.push('/')}
            style={[styles.browse, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.browseText}>{t('browseRestaurants')}</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === 'branches' ? (
        <View style={styles.list}>
          {items.map((item) => {
            const meta = [
              item.cuisine,
              formatPriceLevel(item.priceLevel),
              formatDistance(null),
            ]
              .filter(Boolean)
              .join(' · ');

            // Which kitchen this is. A row is a branch now, so a chain saved
            // twice is two streets rather than the same name printed twice —
            // the address is the useful one, with the branch's own name and its
            // city standing in where there is none. A guest's row saved from the
            // feed carries no address at all (`/restaurants` reports none), and
            // then there is nothing to draw rather than something empty.
            const where = item.address ?? item.branchName ?? (item.city || null);

            return (
              <Pressable
                key={item.branchId}
                // The branch, not the slug: a slug resolves to the oldest branch
                // of the business, which is not necessarily the one that was
                // saved.
                onPress={() => router.push(`/restaurant/${item.branchId}`)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <Photo uri={item.coverUrl} style={styles.thumb} />
                <View style={styles.body}>
                  <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.meta, { color: colors.ink2 }]} numberOfLines={1}>
                    {meta}
                  </Text>
                  {where !== null ? (
                    <Text style={[styles.where, { color: colors.ink2 }]} numberOfLines={1}>
                      📍 {where}
                    </Text>
                  ) : null}
                  <View style={styles.badges}>
                    {item.prepMin !== null ? (
                      <View style={[styles.prep, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.prepText, { color: colors.accent }]}>
                          ⏱ {item.prepMin} {t('minutes')}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.rating, { color: colors.ink }]}>
                      <Text style={styles.star}>★</Text> {item.rating.toFixed(1)}
                    </Text>
                  </View>
                </View>

                {/* Always filled: everything on this screen is saved, so the
                    heart's one job here is to give it back. Its own Pressable
                    over the row's, so removing does not also open the menu. */}
                <Pressable
                  onPress={() => remove(item.branchId)}
                  hitSlop={10}
                  accessibilityRole="button"
                  // The address is in the label as well as on the card: two
                  // branches of one chain are two rows, and a name alone would
                  // announce both of them identically.
                  accessibilityLabel={
                    where === null
                      ? `${t('removeFavorite')} — ${item.name}`
                      : `${t('removeFavorite')} — ${item.name}, ${where}`
                  }
                  style={({ pressed }) => [styles.heart, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                      fill={spot.destructive}
                      stroke={spot.destructive}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.list}>
          {dishes.map((dish) => {
            // Whose kitchen, and where. The dish is the headline here, so the
            // restaurant is the line under it — with the street where there is
            // one, since two branches of a chain cook the same dish.
            const where = dish.address ?? dish.branchName ?? (dish.city || null);
            const kitchen = where === null ? dish.restaurantName : `${dish.restaurantName} · ${where}`;

            return (
              <Pressable
                key={dish.menuItemId}
                // The menu, opened *at this dish*: the same link a filtered
                // card's slider follows, so the row lands on the dish's heading
                // and scrolls to it rather than at the top of a long menu.
                onPress={() =>
                  router.push({
                    pathname: '/restaurant/[id]',
                    params: { id: dish.branchId, item: dish.menuItemId },
                  })
                }
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <Photo uri={dish.photoUrl} style={styles.thumb} />
                <View style={styles.body}>
                  <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                    {dish.name}
                  </Text>
                  <Text style={[styles.where, { color: colors.ink2 }]} numberOfLines={1}>
                    {kitchen}
                  </Text>
                  <View style={styles.badges}>
                    <Text style={[styles.price, { color: colors.ink }]}>
                      {formatAmd(dish.priceAmd)}
                    </Text>
                    {/* Two different absences, said differently: the dish is off
                        tonight, or the kitchen is shut. Either one means it
                        cannot be ordered right now, and neither is a reason to
                        drop the row — it is still saved. */}
                    {!dish.isAvailable ? (
                      <Text style={[styles.state, { color: colors.ink3 }]}>{t('soldOut')}</Text>
                    ) : !dish.isOpen ? (
                      <Text style={[styles.state, { color: colors.ink3 }]}>{t('closed')}</Text>
                    ) : null}
                  </View>
                </View>

                <Pressable
                  onPress={() => removeDish(dish.menuItemId)}
                  hitSlop={10}
                  accessibilityRole="button"
                  // The kitchen is in the label as well: one dish saved at two
                  // branches is two rows with the same name.
                  accessibilityLabel={`${t('removeFavoriteDish')} — ${dish.name}, ${kitchen}`}
                  style={({ pressed }) => [styles.heart, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                      fill={spot.destructive}
                      stroke={spot.destructive}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 110 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  tabs: { flexDirection: 'row', gap: 9, marginTop: 16 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  tabText: { fontSize: 14, fontWeight: '700' },
  spinner: { marginTop: 28 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyGlyph: { fontSize: 56 },
  emptyTitle: { fontSize: 19, fontWeight: '800', marginTop: 6 },
  emptyHint: { fontSize: 13.5, textAlign: 'center', paddingHorizontal: 24 },
  browse: {
    marginTop: 14,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  list: { gap: 16, marginTop: 18 },
  card: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  thumb: { width: 88, height: 88, borderRadius: 14 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 3 },
  where: { fontSize: 12.5, marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  prep: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  prepText: { fontSize: 12, fontWeight: '700' },
  rating: { fontSize: 13, fontWeight: '700' },
  price: { fontSize: 15, fontWeight: '800' },
  state: { fontSize: 12 },
  star: { color: '#F5A623' },
  heart: { alignSelf: 'flex-start', paddingLeft: 2, paddingTop: 2 },
});
