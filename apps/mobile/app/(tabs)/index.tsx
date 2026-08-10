import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Circle, Path, Svg } from 'react-native-svg';
import { RestaurantSort } from '@amragrir/shared';
import { catalog, favorites as favoritesApi } from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import type { Category, RestaurantListItem } from '../../src/api/types';
import { RestaurantCard } from '../../src/components/RestaurantCard';
import { NotificationBell } from '../../src/components/NotificationBell';
import { FilterSheet } from '../../src/components/FilterSheet';
import { NO_FILTERS, activeFilterCount, filterQuery, type Filters } from '../../src/filters';
import { useTranslate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';
import { useSession } from '../../src/session';

/** Republic Square — stands in for device geolocation until permissions land. */
const DEFAULT_ORIGIN = { lat: 40.1776, lng: 44.5126 };

export default function HomeScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { user } = useSession();
  // Set by the Search tab's shortcuts, which navigate here rather than keeping
  // a second list of restaurants of their own.
  const { category: categoryParam, q } = useLocalSearchParams<{ category?: string; q?: string }>();

  const [categories, setCategories] = useState<Category[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(categoryParam ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Restaurant ids this account has saved — what fills the hearts. */
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  // What the sheet has narrowed the feed to, and whether it is open. Held here
  // rather than in the sheet because it is the *feed's* state — the sheet edits
  // a copy and hands one back on Apply.
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (categoryParam) {
      setActiveCategory(categoryParam);
    }
  }, [categoryParam]);

  const load = useCallback(
    async (category: string | null, query: string | undefined, applied: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const [categoryResult, restaurantResult] = await Promise.all([
        catalog.categories(),
        catalog.restaurants({
          ...DEFAULT_ORIGIN,
          // The sheet's sort, with the feed's own default underneath it: this
          // is a list of what is *near*, and `NO_FILTERS` carries the API's
          // `recommended` so that "reset" means the API's order rather than
          // this screen's.
          ...filterQuery(applied, true),
          ...(applied.sort === NO_FILTERS.sort ? { sort: RestaurantSort.Nearest } : {}),
          ...(category ? { category } : {}),
          ...(query ? { q: query } : {}),
        }),
      ]);
      setCategories(categoryResult.items);
      setRestaurants(restaurantResult.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : null);
    } finally {
      setLoading(false);
    }
  },
    [],
  );

  useEffect(() => {
    void load(activeCategory, q, filters);
  }, [load, activeCategory, q, filters]);

  // Favourites belong to an account, so a guest has none and the endpoint says
  // so with a 403 (ROLES_AND_PERMISSIONS.md §1). Their hearts stay hollow and a
  // press sends them to sign in.
  const canFavorite = user?.phoneVerified === true;
  const filterCount = activeFilterCount(filters);

  // Refetched on focus rather than once: the Favorites tab can remove a
  // restaurant, and coming back to a filled heart for something no longer saved
  // would be the card lying about the account.
  useFocusEffect(
    useCallback(() => {
      if (!canFavorite) {
        setSaved(new Set());
        return;
      }

      let cancelled = false;
      favoritesApi
        .list()
        .then((result) => {
          if (!cancelled) {
            setSaved(new Set(result.items.map((item) => item.restaurantId)));
          }
        })
        .catch(() => {
          // Nothing to show for it — the feed is still the feed without hearts.
        });

      return () => {
        cancelled = true;
      };
    }, [canFavorite]),
  );

  /**
   * Saves a restaurant, or gives it back.
   *
   * The heart fills before the request is sent. This is a one-bit change the
   * server accepts for any signed-in account, and a heart that waits a round
   * trip to fill reads as a control that did not work — the same reason the
   * basket's stepper moves first. A refusal puts it back where it was.
   *
   * **The restaurant, not the branch.** A card is a branch, but a favourite is
   * stored against the business (DATABASE.md §13) — so this sends
   * `restaurantId` and the set is keyed by it.
   */
  const toggleFavorite = useCallback(
    (restaurantId: string) => {
      if (!canFavorite) {
        router.push('/auth');
        return;
      }

      const wasSaved = saved.has(restaurantId);
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) {
          next.delete(restaurantId);
        } else {
          next.add(restaurantId);
        }
        return next;
      });

      const call = wasSaved
        ? favoritesApi.remove(restaurantId)
        : favoritesApi.add(restaurantId);

      call.catch(() => {
        setSaved((current) => {
          const next = new Set(current);
          if (wasSaved) {
            next.add(restaurantId);
          } else {
            next.delete(restaurantId);
          }
          return next;
        });
      });
    },
    [canFavorite, router, saved],
  );

  const greeting = user?.name?.trim() ? `${t('greeting')}, ${user.name.trim()}` : t('greeting');

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <FlatList
        data={loading ? [] : restaurants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* The bell sits beside the greeting rather than over the question,
                so the headline keeps the full width it was drawn at. It renders
                nothing for a guest — see the component. */}
            <View style={styles.topRow}>
              <View style={styles.topText}>
                <Text style={[styles.greeting, { color: colors.ink2 }]}>{greeting}</Text>
                <Text style={[styles.question, { color: colors.ink }]}>{t('homeQuestion')}</Text>
              </View>
              <NotificationBell />
            </View>

            <Pressable
              onPress={() => router.push('/search')}
              style={[styles.field, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                <Circle cx={11} cy={11} r={7} stroke={colors.ink3} strokeWidth={2} />
                <Path
                  d="M20 20l-3.2-3.2"
                  stroke={colors.ink3}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={[styles.fieldText, { color: colors.ink2 }]}>
                {t('searchPlaceholder')}
              </Text>
            </Pressable>

            <CategoryRail
              categories={categories}
              active={activeCategory}
              onSelect={(key) => setActiveCategory((current) => (current === key ? null : key))}
            />

            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: colors.ink }]}>{t('nearbyRestaurants')}</Text>
              {/* The count answers "why am I seeing so few restaurants" without
                  making somebody open the sheet to find out. The sort is not in
                  it — every list is sorted somehow, so counting it would put a
                  badge on a feed nobody has narrowed. */}
              <View style={styles.sectionActions}>
              <Pressable onPress={() => router.push('/search')}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>{t('seeAll')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setSheetOpen(true)}
                accessibilityLabel={t('fltTitle')}
                style={[
                  styles.filterButton,
                  {
                    borderColor: filterCount > 0 ? colors.accent : colors.line,
                    backgroundColor: filterCount > 0 ? colors.accentSoft : colors.card,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: filterCount > 0 ? colors.accent : colors.ink },
                  ]}
                >
                  {t('fltTitle')}
                  {filterCount > 0 ? ` · ${filterCount}` : ''}
                </Text>
              </Pressable>
              </View>
            </View>

            {loading ? <SkeletonList /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <RestaurantCard
            restaurant={item}
            onPress={() => router.push(`/restaurant/${item.slug}`)}
            isFavorite={saved.has(item.restaurantId)}
            onToggleFavorite={() => toggleFavorite(item.restaurantId)}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.empty, { color: colors.ink2 }]}>{error ?? t('noResults')}</Text>
          )
        }
      />

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        // The feed always sends coordinates (`DEFAULT_ORIGIN`), so a distance
        // is always a filter the API will honour.
        hasOrigin
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

function CategoryRail({
  categories,
  active,
  onSelect,
}: {
  categories: Category[];
  active: string | null;
  onSelect: (key: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.railOuter}
    >
      {categories.map((category) => {
        const selected = category.key === active;
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.accentSoft : colors.card,
                borderColor: selected ? colors.accent : colors.line,
              },
            ]}
          >
            <Text style={styles.chipEmoji}>{category.icon}</Text>
            <Text
              style={[styles.chipText, { color: selected ? colors.accent : colors.ink }]}
              numberOfLines={1}
            >
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The artifact loads into three card-shaped placeholders rather than a
 *  spinner, so the feed does not jump when the real cards arrive. */
function SkeletonList() {
  const { colors } = useTheme();
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((n) => (
        <View
          key={n}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <View style={[styles.skeletonPhoto, { backgroundColor: colors.placeholder }]} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { backgroundColor: colors.placeholder, width: '55%' }]} />
            <View style={[styles.skeletonLine, { backgroundColor: colors.placeholder, width: '75%' }]} />
            <View
              style={[
                styles.skeletonPill,
                { backgroundColor: colors.placeholder2, width: '60%' },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 110 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  topText: { flex: 1 },
  greeting: { fontSize: 13, fontWeight: '500' },
  question: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginTop: 5,
    maxWidth: 250,
  },
  field: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
  },
  fieldText: { fontSize: 15.5 },
  // Negative margins let the rail bleed to the screen edge while the list keeps
  // its 20px gutter — the artifact's `margin:20px -20px 0`.
  railOuter: { marginHorizontal: -20, marginTop: 20 },
  rail: { gap: 10, paddingHorizontal: 20, paddingBottom: 4 },
  chip: {
    minWidth: 66,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipEmoji: { fontSize: 22 },
  chipText: { fontSize: 12.5, fontWeight: '600' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 16,
  },
  section: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  seeAll: { fontSize: 13.5, fontWeight: '600' },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filterButton: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterText: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 28 },
  skeletonList: { gap: 18 },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  skeletonPhoto: { height: 162 },
  skeletonBody: { padding: 15, gap: 10 },
  skeletonLine: { height: 14, borderRadius: 6 },
  skeletonPill: { height: 28, borderRadius: 12, marginTop: 4 },
});
