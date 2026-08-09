import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Path, Svg } from 'react-native-svg';
import { favorites as favoritesApi } from '../../src/api/endpoints';
import type { FavoriteItem } from '../../src/api/types';
import { Photo } from '../../src/components/Photo';
import { formatDistance, formatPriceLevel } from '../../src/format';
import { useTranslate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';
import { spot } from '../../src/theme/tokens';

/**
 * Favorites — the artifact's FAVORITES screen.
 *
 * Refetched on focus: the heart that adds a restaurant here lives on the other
 * screens, so this list is stale the moment one of them is used.
 */
export default function FavoritesScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();

  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      favoritesApi
        .list()
        .then((result) => {
          if (!cancelled) {
            setItems(result.items);
          }
        })
        .catch(() => {
          // A guest has none and the endpoint says so with a 401; the empty
          // state is the honest rendering either way.
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  /**
   * Gives a restaurant back.
   *
   * The row leaves the list on the press rather than on the answer: it is the
   * only thing a filled heart can mean on a screen where everything is
   * favourited, and waiting a round trip to remove it leaves somebody pressing
   * a heart that stays put. A refusal puts the row back where it was.
   */
  const remove = useCallback((restaurantId: string) => {
    const removed = items;
    setItems((current) => current.filter((item) => item.restaurantId !== restaurantId));
    favoritesApi.remove(restaurantId).catch(() => {
      setItems(removed);
    });
  }, [items]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.ink }]}>{t('favoritesTitle')}</Text>

      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyGlyph}>🤍</Text>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>{t('noResults')}</Text>
          <Pressable
            onPress={() => router.push('/')}
            style={[styles.browse, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.browseText}>{t('browseRestaurants')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.list}>
        {items.map((item) => {
          const meta = [
            item.cuisine,
            formatPriceLevel(item.priceLevel),
            formatDistance(null),
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <Pressable
              key={item.restaurantId}
              onPress={() => router.push(`/restaurant/${item.slug}`)}
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
                onPress={() => remove(item.restaurantId)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${t('removeFavorite')} — ${item.name}`}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 110 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  spinner: { marginTop: 28 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyGlyph: { fontSize: 56 },
  emptyTitle: { fontSize: 19, fontWeight: '800', marginTop: 6 },
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
  badges: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  prep: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  prepText: { fontSize: 12, fontWeight: '700' },
  rating: { fontSize: 13, fontWeight: '700' },
  star: { color: '#F5A623' },
  heart: { alignSelf: 'flex-start', paddingLeft: 2, paddingTop: 2 },
});
