import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Path, Svg } from 'react-native-svg';
import { POPULAR_SECTION_ID, RestaurantService } from '@amragrir/shared';
import { catalog, favorites as favoritesApi } from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import type { MenuItem, MenuSection, RestaurantDetail } from '../../src/api/types';
import { Photo } from '../../src/components/Photo';
import {
  addGuestFavorite,
  addGuestFavoriteDish,
  favoriteDishFromMenuItem,
  favoriteFromDetail,
  readGuestFavoriteDishes,
  readGuestFavorites,
  removeGuestFavorite,
  removeGuestFavoriteDish,
} from '../../src/guest-favorites';
import { useCart } from '../../src/cart';
import { useSession } from '../../src/session';
import { useTranslate, type Translate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';
import { spot } from '../../src/theme/tokens';
import { formatAmd, formatPriceLevel } from '../../src/format';

/**
 * The pills above the menu: the branch's own headings, with its Popular shelf
 * in front of them when it has one.
 *
 * Popular is not a heading and never was — a dish is popular *as well as* being
 * pizza — so it is prepended rather than stored, and it is the only pill whose
 * name the platform supplies. A heading with nothing under it is left out: a
 * pill that empties the list when tapped is worse than one fewer division.
 */
function tabsFor(
  sections: MenuSection[],
  items: MenuItem[],
  t: Translate,
): { id: string; label: string }[] {
  const tabs: { id: string; label: string }[] = [];
  if (items.some((item) => item.isPopular)) {
    tabs.push({ id: POPULAR_SECTION_ID, label: t('menuTabPopular') });
  }
  for (const section of sections) {
    if (items.some((item) => item.sectionId === section.id)) {
      tabs.push({ id: section.id, label: section.name });
    }
  }
  return tabs;
}

export default function RestaurantScreen() {
  // `item` is set by a filtered card's dish slider on the home screen: which
  // dish somebody tapped, so this screen can open on its heading and scroll to
  // its row rather than dropping them at the top of a menu to hunt for it.
  const { id, item: wantedItemId } = useLocalSearchParams<{ id: string; item?: string }>();
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();
  const cart = useCart();
  const { user } = useSession();

  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [sections, setSections] = useState<MenuSection[]>([]);
  /** `null` until the menu lands, because which pill to open on depends on it —
   *  a linked dish's heading, or the first the branch has. */
  const [tab, setTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Which dishes on this menu are saved — the hearts on the rows. Kept as a
   *  set of ids because that is the one bit a row needs about itself. */
  const [savedDishes, setSavedDishes] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<FlatList<MenuItem>>(null);
  const scrolledTo = useRef<string | null>(null);

  // Fetched once, not once per tab. The headings are the branch's own, so their
  // ids are unknown until the first response; the Popular shelf cuts across all
  // of them; and switching pills now costs nothing where it used to be a round
  // trip and a spinner per tap.
  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;

    setLoading(true);
    Promise.all([catalog.restaurant(id), catalog.menu(id)])
      .then(([detail, menu]) => {
        if (cancelled) {
          return;
        }
        setRestaurant(detail);
        setItems(menu.items);
        setSections(menu.sections);
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
    // Not `tab`: the whole menu is here, and re-fetching it because somebody
    // tapped a pill is the round trip this change removes.
  }, [id]);

  const tabs = tabsFor(sections, items, t);

  // Which pill to open on, decided once the menu has landed: the heading of the
  // dish a link named, or the first the branch has. Its own effect rather than
  // part of the fetch, because `tabs` is derived and a linked dish may be under
  // a heading the branch reorders later.
  useEffect(() => {
    if (tabs.length === 0 || tab !== null) {
      return;
    }
    const linked = items.find((item) => item.id === wantedItemId);
    // The dish's section, never Popular: a link is to a place on the menu, and
    // the showcase is not one.
    setTab(linked?.sectionId ?? tabs[0]!.id);
  }, [tabs, tab, items, wantedItemId]);

  // `POST /favorites` needs a verified phone, so a guest's hearts live on the
  // phone until sign-in hands them over (`src/guest-favorites.ts`). The heart
  // works either way — it used to bounce a guest to the auth screen, which
  // asked for an account before letting anybody express the preference that
  // would give them a reason to open one.
  const signedIn = user?.phoneVerified === true;

  /**
   * Whether this branch is saved.
   *
   * Read from the favourites list rather than from the restaurant itself,
   * because the detail endpoint does not report it — it is the same list the
   * feed and the Favorites tab already read, filtered to the one address on
   * screen, and for a guest the same list read off the phone.
   *
   * **Keyed by `branch.id`, not by the route's `{id}`.** That parameter is
   * whatever the previous screen held — a slug, a branch id or a restaurant id
   * — and only the loaded detail knows which branch it resolved to. It is the
   * branch that is saved, because the branch is what this page is: this menu,
   * these hours, this address (DATABASE.md §13).
   */
  useEffect(() => {
    if (!restaurant) {
      setSaved(false);
      setSavedDishes(new Set());
      return;
    }

    let cancelled = false;
    const read = signedIn
      ? favoritesApi.list().then((result) => result.items)
      : readGuestFavorites();

    read
      .then((items) => {
        if (!cancelled) {
          setSaved(items.some((item) => item.branchId === restaurant.branch.id));
        }
      })
      .catch(() => {
        // A hollow heart is the honest drawing when the list cannot be read.
      });

    // The dishes' hearts, narrowed to this branch: an account may have saved
    // half of Yerevan, and this menu only draws its own rows.
    const readDishes = signedIn
      ? favoritesApi.dishIds(restaurant.branch.id).then((result) => result.ids)
      : readGuestFavoriteDishes().then((items) =>
          items
            .filter((item) => item.branchId === restaurant.branch.id)
            .map((item) => item.menuItemId),
        );

    readDishes
      .then((ids) => {
        if (!cancelled) {
          setSavedDishes(new Set(ids));
        }
      })
      .catch(() => {
        // As above — hollow hearts rather than a menu that will not draw.
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn, restaurant]);

  /** Saves this branch, or gives it back — optimistic, as on the feed. */
  const toggleFavorite = useCallback(() => {
    if (!restaurant) {
      return;
    }

    const wasSaved = saved;
    setSaved(!wasSaved);

    const write = wasSaved
      ? signedIn
        ? favoritesApi.remove(restaurant.branch.id)
        : removeGuestFavorite(restaurant.branch.id)
      : signedIn
        ? favoritesApi.add(restaurant.branch.id)
        : addGuestFavorite(favoriteFromDetail(restaurant));

    write.catch(() => {
      setSaved(wasSaved);
    });
  }, [restaurant, saved, signedIn]);

  /**
   * Saves one dish off this menu, or gives it back.
   *
   * The heart on a row is about the row: the khinkali, not the restaurant that
   * cooks them. Both are savable from this screen now — the cover's heart is
   * still the address — and the Favourites tab keeps them under two tabs
   * because they are two different things to come back for.
   */
  const toggleDishFavorite = useCallback(
    (item: MenuItem) => {
      if (!restaurant) {
        return;
      }

      const wasSaved = savedDishes.has(item.id);
      const flip = (add: boolean) =>
        setSavedDishes((current) => {
          const next = new Set(current);
          if (add) {
            next.add(item.id);
          } else {
            next.delete(item.id);
          }
          return next;
        });

      flip(!wasSaved);

      const write = wasSaved
        ? signedIn
          ? favoritesApi.removeDish(item.id)
          : removeGuestFavoriteDish(item.id)
        : signedIn
          ? favoritesApi.addDish(item.id)
          : addGuestFavoriteDish(favoriteDishFromMenuItem(item, restaurant));

      write.catch(() => {
        flip(wasSaved);
      });
    },
    [restaurant, savedDishes, signedIn],
  );

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

  /**
   * Whether this restaurant has a calendar worth opening.
   *
   * Both halves are checked because they mean different things: one that does
   * not declare `reserve` takes no bookings at all, and one that does but has
   * `reservationsEnabled` off has paused them. Neither gets a door.
   *
   * The press opens **"When & how"** (`/preorder`) in Table booking mode — the
   * same screen the basket's "Choose time" opens, and what the artifact does
   * with this button. It carries the branch, because an empty basket names no
   * restaurant.
   */
  const canBook =
    restaurant?.services.includes(RestaurantService.Reserve) === true &&
    restaurant.reservationsEnabled;

  /** The dishes under the chosen pill. Popular draws from the whole menu, which
   *  is what makes it a showcase rather than a division of one. */
  const shown =
    tab === null
      ? []
      : tab === POPULAR_SECTION_ID
        ? items.filter((item) => item.isPopular)
        : items.filter((item) => item.sectionId === tab);

  /**
   * Brings a linked dish into view, once.
   *
   * Held as the id rather than a boolean so a second link followed without
   * leaving the screen is answered too — and so a later render (a quantity
   * changed, the heart flipped) does not drag the list back to a row somebody
   * has since scrolled away from.
   */
  useEffect(() => {
    if (wantedItemId === undefined || scrolledTo.current === wantedItemId) {
      return;
    }
    const index = shown.findIndex((item) => item.id === wantedItemId);
    if (index === -1) {
      return;
    }
    scrolledTo.current = wantedItemId;
    // `viewPosition: 0.3` rather than the top: a row pinned under the header is
    // harder to recognise as "the one you tapped" than one sitting a third of
    // the way down with its neighbours visible.
    listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
  }, [wantedItemId, shown]);

  /** How many of this dish the basket holds. Nothing while the basket belongs
   *  to another restaurant — those quantities are not this menu's to draw. */
  const qtyOf = (menuItemId: string): number =>
    cart.branchId !== null && cart.branchId === restaurant?.branch.id
      ? (cart.lines.find((line) => line.menuItemId === menuItemId)?.qty ?? 0)
      : 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        // A linked dish can be below everything rendered so far, and a row's
        // height varies with how far its name wraps — so there is no honest
        // `getItemLayout` to give. This is the documented way out: scroll to
        // where the list thinks it is, let it render, then ask again.
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({
            offset: index * averageItemLength,
            animated: true,
          });
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
          }, 320);
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.cover}>
              <Photo uri={restaurant?.coverUrl ?? null} style={StyleSheet.absoluteFill} />
              <Pressable onPress={() => router.back()} style={styles.backWrap}>
                <BlurView
                  intensity={10}
                  tint="systemChromeMaterial"
                  style={[styles.glassCircle, { backgroundColor: colors.glass }]}
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
                  <BlurView
                    intensity={10}
                    tint="systemChromeMaterial"
                    style={[styles.glassCircle, { backgroundColor: colors.glass }]}
                  >
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

              {/* One row that scrolls, not a block that wraps.
                  Four pills fit across a phone in English and do not in
                  Armenian — "Հանրաճանաչ" alone is most of a line — so wrapping
                  dropped the last tab onto a second row and pushed the menu
                  down. It scrolls sideways instead, the way the home screen's
                  category and filter rails already do, which also holds if the
                  tab list ever grows past four. The rail is pulled out to the
                  sheet's edges so the row it scrolls along is the full width;
                  the padding moves inside, keeping the first pill where it
                  was. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabs}
                style={styles.tabsOuter}
              >
                {tabs.map((entry) => {
                  const selected = entry.id === tab;
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => setTab(entry.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      style={[
                        styles.tab,
                        { backgroundColor: selected ? colors.ink : colors.chip },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.tabText, { color: selected ? colors.bg : colors.ink2 }]}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        }
        // The rows draw the basket's quantities and their own hearts, and
        // neither is part of `items` — without this the steppers would go on
        // showing the count they were built with, and a pressed heart would not
        // fill until something else redrew the list.
        extraData={[cart.lines, savedDishes]}
        renderItem={({ item }) => (
          <MenuRow
            item={item}
            qty={qtyOf(item.id)}
            isFavorite={savedDishes.has(item.id)}
            onToggleFavorite={() => toggleDishFavorite(item)}
            // A list scrolled somewhere by itself has to say what it scrolled
            // to: twenty rows of similar text, and an unmarked one leaves
            // somebody checking each in turn.
            highlighted={item.id === wantedItemId}
            onAdd={() => addToBasket(item)}
            onLess={() => cart.setQty(item.id, qtyOf(item.id) - 1)}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={[styles.error, { color: colors.ink3 }]}>{t('emptyMenuTab')}</Text>
          )
        }
      />

      {/* The artifact's sticky bar: the table above the basket, each drawn only
          where it has something to do — so a restaurant that takes no bookings
          and a basket with nothing in it leave the menu with no bar at all. */}
      {canBook || cart.itemCount > 0 ? (
        <View style={styles.bar}>
          {canBook && restaurant ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/preorder',
                  params: { branchId: restaurant.branch.id, name: restaurant.name },
                })
              }
              accessibilityRole="button"
              // Filled while there is nothing to collect, outlined once there
              // is: with a basket on screen the table is the second thing this
              // menu can do, and two solid orange buttons name no first one.
              style={[
                cart.itemCount > 0 ? styles.bookSecond : styles.bookFirst,
                cart.itemCount > 0
                  ? { borderColor: colors.accent, backgroundColor: colors.card }
                  : { backgroundColor: colors.accent },
              ]}
            >
              <Text
                style={[
                  cart.itemCount > 0 ? styles.bookSecondText : styles.bookFirstText,
                  { color: cart.itemCount > 0 ? colors.accent : '#fff' },
                ]}
              >
                🪑 {t('bookTableAlone')}
              </Text>
            </Pressable>
          ) : null}

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
      ) : null}
    </View>
  );
}

function MenuRow({
  item,
  qty,
  isFavorite,
  onToggleFavorite,
  highlighted = false,
  onAdd,
  onLess,
}: {
  item: MenuItem;
  /** How many are already in the basket. Zero draws the ＋ alone. */
  qty: number;
  /** Whether this dish is saved — the heart beside its name is filled when it
   *  is. A dish, not the restaurant: the two are saved separately and listed
   *  separately (DATABASE.md §13a). */
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** The dish a link named, and the row the list just scrolled to. */
  highlighted?: boolean;
  onAdd: () => void;
  onLess: () => void;
}) {
  const { colors } = useTheme();
  const t = useTranslate();
  const facts = [
    item.caloriesKcal === null ? null : `${item.caloriesKcal} ${t('kcal')}`,
    item.prepMin === null ? null : `${item.prepMin} ${t('minutes')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.line },
        highlighted && { borderColor: colors.accent, borderWidth: 1.5 },
      ]}
    >
      <Photo uri={item.photoUrl} style={styles.thumb} />
      <View style={styles.rowBody}>
        {/* The name and the dish's own heart on one line. The heart belongs up
            here rather than beside the ＋ at the foot: those two do different
            things — one saves the dish for later, the other orders it now — and
            a pair of controls side by side invites the wrong one to be pressed.
            It is also where the eye already is, on the name of the thing being
            saved. */}
        <View style={styles.dishHead}>
          <Text style={[styles.dish, { color: colors.ink }]}>{item.name}</Text>
          <Pressable
            onPress={onToggleFavorite}
            hitSlop={10}
            accessibilityRole="button"
            // Names the action, the dish and the state — a menu is twenty rows
            // of near-identical controls, and "add to favourites" alone would
            // announce all of them the same way.
            accessibilityLabel={`${t(isFavorite ? 'removeFavoriteDish' : 'addFavoriteDish')} — ${item.name}`}
            style={({ pressed }) => [styles.dishHeart, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                fill={isFavorite ? spot.destructive : 'none'}
                stroke={isFavorite ? spot.destructive : colors.ink3}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>
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
          {/* The artifact's two states: a ＋ for a dish not yet taken, and the
              stepper once it is. Without the second, the only way to change
              your mind about a dish was to open the basket and change it
              there — and the menu went on offering "add" as though nothing had
              happened, which is the same button saying two different things. */}
          {!item.isAvailable ? (
            <Text style={[styles.facts, { color: colors.ink3 }]}>{t('soldOut')}</Text>
          ) : qty > 0 ? (
            <View style={styles.stepper}>
              <Pressable
                onPress={onLess}
                accessibilityRole="button"
                accessibilityLabel={t('decrease')}
                style={[styles.stepLess, { backgroundColor: colors.chip, borderColor: colors.line }]}
              >
                <Text style={[styles.stepLessText, { color: colors.ink }]}>−</Text>
              </Pressable>
              <Text style={[styles.stepQty, { color: colors.ink }]}>{qty}</Text>
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={t('increase')}
                style={[styles.stepMore, { backgroundColor: colors.accent }]}
              >
                <Text style={styles.stepMoreText}>＋</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              style={[styles.add, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.addText}>＋</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Deep enough for the bar at its tallest — the table button, the basket
  // button and the gap between them — so the last dish is never left under it.
  list: { paddingBottom: 190 },
  cover: { height: 270 },
  backWrap: { position: 'absolute', top: 56, left: 16 },
  favWrap: { position: 'absolute', top: 56, right: 16 },
  /**
   * The artifact's two 42px discs over the cover photo.
   *
   * The `backgroundColor` they are given is `colors.glass`, and it carries the
   * whole effect: the artifact's disc is a 78%-opaque tinted panel with a blur
   * *behind* it (`background: var(--glass); backdrop-filter: blur(10px)`).
   * These had the blur and no panel, which over a photo is close to nothing —
   * so the heart the design puts here was on screen and hard to see, its dark
   * `ink` stroke sitting on whatever the photo happened to be.
   */
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
  tabsOuter: { marginHorizontal: -20, marginTop: 20, marginBottom: 6 },
  tabs: { gap: 9, paddingHorizontal: 20 },
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
  dishHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  // `flex: 1` so a long name wraps inside the row rather than pushing the heart
  // off the card's edge.
  dish: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  dishHeart: { paddingTop: 1 },
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
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stepLess: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLessText: { fontSize: 20, lineHeight: 24 },
  stepQty: { minWidth: 18, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  stepMore: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepMoreText: { color: '#fff', fontSize: 20, fontWeight: '600', lineHeight: 24 },
  // The artifact's sticky bar, floated rather than backed by a gradient: it
  // holds one or two buttons and nothing else, and a solid panel behind them
  // would cover the dish they are sitting over.
  bar: { position: 'absolute', left: 20, right: 20, bottom: 30, gap: 10 },
  bookFirst: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFirstText: { fontSize: 16, fontWeight: '700' },
  bookSecond: {
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookSecondText: { fontSize: 15, fontWeight: '700' },
  basketBar: {
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
