import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Circle, Path, Svg } from 'react-native-svg';
import type { Place } from '@amragrir/shared';
import { catalog, favorites as favoritesApi } from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import type { CardDish, Category, RestaurantListItem } from '../../src/api/types';
import { RestaurantCard } from '../../src/components/RestaurantCard';
import { NotificationBell } from '../../src/components/NotificationBell';
import { FilterSheet } from '../../src/components/FilterSheet';
import { LocationSheet } from '../../src/components/LocationSheet';
import { readChosenPlace, writeChosenPlace } from '../../src/place';
import {
  addGuestFavorite,
  addGuestFavoriteDish,
  favoriteDishFromCardDish,
  favoriteFromListItem,
  readGuestFavoriteDishes,
  readGuestFavorites,
  removeGuestFavorite,
  removeGuestFavoriteDish,
} from '../../src/guest-favorites';
import {
  FILTER_CHIPS,
  HOME_FILTERS,
  activeFilterCount,
  filterQuery,
  isChipActive,
  toggleChip,
  type FilterChip,
  type Filters,
} from '../../src/filters';
import { useTranslate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';
import { useSession } from '../../src/session';
import { useOrigin } from '../../src/origin';

export default function HomeScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const { user } = useSession();
  // The device's own position once it is granted, Republic Square until then —
  // see `useOrigin` for why the feed does not wait on the dialog.
  const { origin, label: locationLabel, denied: locationDenied } = useOrigin();
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
  /** Dish ids it has saved. A separate set because it answers a different
   *  heart: the one over a filtered card's slider, which is about the plate on
   *  screen rather than the address behind it. */
  const [savedDishes, setSavedDishes] = useState<ReadonlySet<string>>(new Set());
  // What the sheet has narrowed the feed to, and whether it is open. Held here
  // rather than in the sheet because it is the *feed's* state — the sheet edits
  // a copy and hands one back on Apply.
  const [filters, setFilters] = useState<Filters>(HOME_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The point the customer picked, if they have picked one. Null is "wherever
   *  this phone is" — see `src/place.ts` for why that differs from the web. */
  const [place, setPlace] = useState<Place | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);

  // Read once, after the first frame: storage is asynchronous and a feed that
  // waited on it would show nothing at launch. Until it lands the feed measures
  // from the device, which is what it did before a choice could be stored.
  useEffect(() => {
    let cancelled = false;
    void readChosenPlace().then((stored) => {
      if (!cancelled && stored) {
        setPlace(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Where the feed measures from: the chosen place, else the device.
   *
   * Memoised on the numbers rather than on the objects, because this is the
   * dependency the fetch below runs on — `useOrigin` hands back a new object
   * whenever it re-renders, and the identity of a point is its coordinates.
   */
  const from = useMemo(
    () => (place ? { lat: place.lat, lng: place.lng } : { lat: origin.lat, lng: origin.lng }),
    [place, origin.lat, origin.lng],
  );

  useEffect(() => {
    if (categoryParam) {
      setActiveCategory(categoryParam);
    }
  }, [categoryParam]);

  const load = useCallback(
    async (
      category: string | null,
      query: string | undefined,
      applied: Filters,
      from: { lat: number; lng: number },
    ) => {
    setLoading(true);
    setError(null);
    try {
      const [categoryResult, restaurantResult] = await Promise.all([
        catalog.categories(),
        catalog.restaurants({
          lat: from.lat,
          lng: from.lng,
          // The sort is whatever the chips and the sheet agree on. This screen
          // *starts* on `Nearest` (see `HOME_FILTERS`) rather than silently
          // rewriting an unset sort into it on the way out: the "Near me" chip
          // reads the same state, so a feed ordered by distance under an unlit
          // chip would be the control lying about itself.
          ...filterQuery(applied, true),
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

  // Refetched when the point moves — a fix landing, or a place confirmed in the
  // sheet: every distance on screen and the whole "Nearest" order were measured
  // from somewhere else until it did.
  useEffect(() => {
    void load(activeCategory, q, filters, from);
  }, [load, activeCategory, q, filters, from]);

  // `POST /favorites` needs a verified phone, so a guest's hearts are kept on
  // the phone instead and handed to the account at sign-in — see
  // `src/guest-favorites.ts`. Either way the heart fills, which is the point:
  // saving a place is a bookmark, not an account operation.
  const signedIn = user?.phoneVerified === true;
  const filterCount = activeFilterCount(filters);

  // Refetched on focus rather than once: the Favorites tab can remove a
  // branch, and coming back to a filled heart for something no longer saved
  // would be the card lying about the account.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const read = signedIn
        ? favoritesApi.list().then((result) => result.items)
        : readGuestFavorites();

      read
        .then((items) => {
          if (!cancelled) {
            setSaved(new Set(items.map((item) => item.branchId)));
          }
        })
        .catch(() => {
          // Nothing to show for it — the feed is still the feed without hearts.
        });

      // The dishes, read the same way and on the same focus: the hearts on a
      // filtered feed are about them, and the Favorites tab can give one back
      // while this screen is mounted. Ids only for an account — the feed has the
      // dishes already and needs one bit about each.
      const readDishes = signedIn
        ? favoritesApi.dishIds().then((result) => result.ids)
        : readGuestFavoriteDishes().then((items) => items.map((item) => item.menuItemId));

      readDishes
        .then((ids) => {
          if (!cancelled) {
            setSavedDishes(new Set(ids));
          }
        })
        .catch(() => {
          // As above.
        });

      return () => {
        cancelled = true;
      };
    }, [signedIn]),
  );

  /**
   * Saves a branch, or gives it back.
   *
   * The heart fills before the write is sent. This is a one-bit change nothing
   * can refuse on grounds worth explaining, and a heart that waits a round trip
   * to fill reads as a control that did not work — the same reason the basket's
   * stepper moves first. A refusal puts it back where it was.
   *
   * **The branch, which is what the card is.** A favourite used to be stored
   * against the business, so hearting one address of a chain filled the heart
   * on every other address of it — including the ones further away and the ones
   * that were shut. Nobody orders from "the restaurant"; they order from the
   * one on their street, so that is what is saved (DATABASE.md §13). The guest
   * store keeps the whole card, since a guest has no `GET /favorites` to redraw
   * it from.
   */
  const toggleFavorite = useCallback(
    (restaurant: RestaurantListItem) => {
      const branchId = restaurant.id;
      const wasSaved = saved.has(branchId);
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) {
          next.delete(branchId);
        } else {
          next.add(branchId);
        }
        return next;
      });

      const write = wasSaved
        ? signedIn
          ? favoritesApi.remove(branchId)
          : removeGuestFavorite(branchId)
        : signedIn
          ? favoritesApi.add(branchId)
          : addGuestFavorite(favoriteFromListItem(restaurant));

      write.catch(() => {
        setSaved((current) => {
          const next = new Set(current);
          if (wasSaved) {
            next.add(branchId);
          } else {
            next.delete(branchId);
          }
          return next;
        });
      });
    },
    [saved, signedIn],
  );

  /**
   * Saves the dish a filtered card is showing, or gives it back.
   *
   * Optimistic like the branch above, and the same rule for a guest: the write
   * goes to the phone until there is an account to keep it in. The row stored
   * there is thinner than the account's — a listing sends a name, a price and a
   * picture and no address — which is what `favoriteDishFromCardDish` documents.
   */
  const toggleDishFavorite = useCallback(
    (restaurant: RestaurantListItem, dish: CardDish) => {
      const wasSaved = savedDishes.has(dish.id);
      const flip = (add: boolean) =>
        setSavedDishes((current) => {
          const next = new Set(current);
          if (add) {
            next.add(dish.id);
          } else {
            next.delete(dish.id);
          }
          return next;
        });

      flip(!wasSaved);

      const write = wasSaved
        ? signedIn
          ? favoritesApi.removeDish(dish.id)
          : removeGuestFavoriteDish(dish.id)
        : signedIn
          ? favoritesApi.addDish(dish.id)
          : addGuestFavoriteDish(favoriteDishFromCardDish(dish, restaurant));

      write.catch(() => {
        flip(wasSaved);
      });
    },
    [savedDishes, signedIn],
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

            {/* The artifact's location line, and the way into its picker. It
                names the place the distances below are measured from — the
                point that was chosen, else the device once it is allowed, else
                the centre of Yerevan. It says which rather than printing an
                address nobody chose. */}
            <Pressable
              onPress={() => setLocationOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('chooseLocation')}
              style={styles.locationRow}
            >
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 21s7-5.7 7-11a7 7 0 10-14 0c0 5.3 7 11 7 11z"
                  stroke={colors.accent}
                  strokeWidth={2}
                />
                <Circle cx={12} cy={10} r={2.4} stroke={colors.accent} strokeWidth={2} />
              </Svg>
              <Text style={[styles.locationText, { color: colors.ink }]} numberOfLines={1}>
                {place?.label ?? locationLabel ?? t(locationDenied ? 'locEnable' : 'locNearYou')}
              </Text>
              {/* The row was only ever pressable when the permission had been
                  refused; now it always opens the picker, so the chevron is
                  always there to say so. */}
              <Text style={[styles.locationCaret, { color: colors.ink3 }]}>›</Text>
            </Pressable>

            <CategoryRail
              categories={categories}
              active={activeCategory}
              onSelect={(key) => setActiveCategory((current) => (current === key ? null : key))}
            />

            {/* The artifact's quick-filter row. It edits the same `filters` the
                sheet does, so a chip lit here shows up inside the sheet and the
                sheet's Reset puts every chip out — two views of one state, not
                two states that have to agree. */}
            <ChipRail
              filters={filters}
              onToggle={(chip) => setFilters((current) => toggleChip(current, chip))}
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
            // By branch id, not by slug. A row here is one address — that is
            // what carries the distance, the hours and the prep time on it —
            // and a slug resolves to the oldest branch of the business, so a
            // card for the Malatia kitchen opened the Abovyan St one. Its
            // heart, which saves this branch, would then be filled on a card
            // and hollow on the page behind it.
            onPress={() => router.push(`/restaurant/${item.id}`)}
            // The same branch, opened at the dish that was tapped: the menu
            // lands on that dish's heading and scrolls to its row, rather than
            // dropping somebody at the top of a menu to hunt for what the card
            // just showed them.
            onPressDish={(dish) =>
              router.push({
                pathname: '/restaurant/[id]',
                params: { id: item.id, item: dish.id },
              })
            }
            isFavorite={saved.has(item.id)}
            onToggleFavorite={() => toggleFavorite(item)}
            // While the card is wearing the dishes that matched a filter, its
            // heart is about the one on screen — see `onToggleDishFavorite`.
            isDishFavorite={(menuItemId) => savedDishes.has(menuItemId)}
            onToggleDishFavorite={(dish) => toggleDishFavorite(item, dish)}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.empty, { color: colors.ink2 }]}>{error ?? t('noResults')}</Text>
          )
        }
      />

      <LocationSheet
        open={locationOpen}
        chosen={place}
        onClose={() => setLocationOpen(false)}
        onConfirm={(next) => {
          setPlace(next);
          void writeChosenPlace(next);
          setLocationOpen(false);
        }}
      />

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        // The feed always sends coordinates — the device's own once granted,
        // Republic Square until then — so a distance is always a filter the
        // API will honour.
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

/**
 * The quick-filter row above the feed.
 *
 * Styled as the category rail is, one row down, because they are the same
 * gesture on the same screen — the difference is what they narrow, and the
 * label says which.
 */
function ChipRail({
  filters,
  onToggle,
}: {
  filters: Filters;
  onToggle: (chip: FilterChip) => void;
}) {
  const { colors } = useTheme();
  const t = useTranslate();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.railOuter}
    >
      {FILTER_CHIPS.map((chip) => {
        const selected = isChipActive(filters, chip);
        return (
          <Pressable
            key={chip.id}
            onPress={() => onToggle(chip)}
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
            <Text style={styles.chipEmoji}>{chip.icon}</Text>
            <Text
              style={[styles.chipText, { color: selected ? colors.accent : colors.ink }]}
              numberOfLines={1}
            >
              {t(chip.labelKey)}
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
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  locationText: { flexShrink: 1, fontSize: 13.5, fontWeight: '700' },
  locationCaret: { fontSize: 17, fontWeight: '700' },
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
