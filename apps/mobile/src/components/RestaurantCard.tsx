import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Path, Svg } from 'react-native-svg';
import { RestaurantService } from '@amragrir/shared';
import { useTheme } from '../theme/useTheme';
import { spot } from '../theme/tokens';
import { formatAmd, formatDistance, formatPriceLevel } from '../format';
import { useTranslate } from '../language';
import { Photo } from './Photo';
import type { CardDish, RestaurantListItem } from '../api/types';

interface Props {
  restaurant: RestaurantListItem;
  onPress: () => void;
  /**
   * Opens the restaurant at one dish from the slider.
   *
   * Only ever called when a category filter is on and the card is wearing its
   * matches instead of its cover. Optional, because a screen that cannot route
   * to a dish should not draw a strip that pretends to.
   */
  onPressDish?: (dish: CardDish) => void;
  /** Whether this account has saved this branch — the heart is filled when it
   *  has. A card is one address, and so is a favourite (DATABASE.md §13), so
   *  the other branches of a chain keep their own hollow hearts. */
  isFavorite?: boolean;
  /**
   * Saves this branch, or gives it back.
   *
   * Optional because not every screen that shows a card can act on one; where
   * it is absent the heart is not drawn at all, rather than drawn dead. It was
   * drawn dead for a while, which is worse than either: a control that looks
   * pressable and answers nothing.
   */
  onToggleFavorite?: () => void;
  /** Whether a dish in the slider is saved. Asked per dish rather than handed a
   *  set, so the caller keeps whatever shape it already holds. */
  isDishFavorite?: (menuItemId: string) => boolean;
  /**
   * Saves the dish the slider is showing, or gives it back.
   *
   * **This is what the heart means while the card is wearing dishes.** A card
   * under a category filter is not showing a dining room, it is showing the
   * plate somebody asked for — and a heart over that photograph that quietly
   * saved the restaurant instead was answering a question nobody asked. The
   * branch is still savable from its own page, where the cover is what the
   * heart sits on.
   *
   * Absent, the heart falls back to the branch even under a filter — a screen
   * that cannot save dishes should not draw a control that pretends to.
   */
  onToggleDishFavorite?: (dish: CardDish) => void;
}

/**
 * Card on the home feed — see docs/COMPONENTS.md `RestaurantCard`.
 *
 * Measurements are the mobile artifact's own: a 162px photo, a 22px corner, the
 * open/closed badge floating on glass over the image, and the prep time in
 * accent while the service badges stay quiet in `chip`.
 */
export function RestaurantCard({
  restaurant,
  onPress,
  onPressDish,
  isFavorite,
  onToggleFavorite,
  isDishFavorite,
  onToggleDishFavorite,
}: Props) {
  const { colors } = useTheme();
  const t = useTranslate();

  /**
   * Whether this card is answering a category filter.
   *
   * `dishes` absent means no filter is on. Empty means one is, and every match
   * at this branch is sold out tonight — a card still worth showing, and worth
   * showing with its cover, because a strip of nothing answers nothing.
   */
  const dishes = onPressDish === undefined ? [] : (restaurant.dishes ?? []);

  /**
   * Which slide is showing — held here rather than inside the strip because the
   * heart is what needs it, and the heart is the strip's sibling.
   *
   * Clamped on read instead of reset: the same card can be handed a shorter
   * `dishes` when a filter narrows, and an index left pointing past the end
   * would leave the heart with no dish to save for one render.
   */
  const [at, setAt] = useState(0);
  const shownDish = dishes.length > 0 ? (dishes[Math.min(at, dishes.length - 1)] ?? null) : null;

  /** What the heart is about: the plate on screen where there is one and the
   *  screen can save it, the address otherwise. */
  const dishHeart = shownDish !== null && onToggleDishFavorite !== undefined ? shownDish : null;
  const heartFilled =
    dishHeart !== null ? (isDishFavorite?.(dishHeart.id) ?? false) : isFavorite === true;
  const onHeart =
    dishHeart !== null ? () => onToggleDishFavorite?.(dishHeart) : onToggleFavorite;
  const heartLabel =
    dishHeart !== null
      ? `${t(heartFilled ? 'removeFavoriteDish' : 'addFavoriteDish')} — ${dishHeart.name}`
      : `${t(heartFilled ? 'removeFavorite' : 'addFavorite')} — ${restaurant.name}`;

  const meta = [
    restaurant.cuisine,
    formatPriceLevel(restaurant.priceLevel),
    formatDistance(restaurant.distanceKm),
  ]
    .filter(Boolean)
    .join(' · ');

  const statusColor = restaurant.isOpen ? colors.good : colors.ink3;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name}, ${restaurant.rating}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.line,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={dishes.length > 0 ? styles.strip : styles.photo}>
        {/* Under a category filter the cover gives way to the dishes that
            matched it. A guest who asked for sushi is not answered by a
            photograph of the dining room; the plates with their prices are what
            they are actually choosing between.

            One plate per slide at the card's full width, with dots under it —
            a strip of thumbnails with the third sliced off at the edge reads as
            a layout bug rather than as an invitation to swipe. Each plate stops
            the press from reaching the card, so a tap lands on the dish and
            opens the menu at it, while a tap anywhere else still opens the
            restaurant at the top. */}
        {dishes.length > 0 ? (
          <DishStrip dishes={dishes} onPressDish={onPressDish} at={at} onAt={setAt} />
        ) : (
          <Photo uri={restaurant.coverUrl} style={StyleSheet.absoluteFill} />
        )}

        {/* Over the frame rather than inside a slide, so it stays put while the
            photographs move under it — and it belongs on both: whether the
            kitchen is open decides whether any of these plates can be ordered
            at all. */}
        <BlurView
          intensity={8}
          tint="systemChromeMaterial"
          style={[styles.statusBadge, { backgroundColor: colors.glass }]}
        >
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {restaurant.isOpen ? t('open') : t('closed')}
          </Text>
        </BlurView>

        {/* Its own Pressable, over the card's — a press here saves and must not
            also open the restaurant. `hitSlop` widens the 34px circle to a
            comfortable target without growing the glass disc the artifact
            draws.

            What it saves depends on what is under it: the dish being shown, or
            the address. See `onToggleDishFavorite`. */}
        {onHeart ? (
          <Pressable
            onPress={onHeart}
            hitSlop={8}
            accessibilityRole="button"
            // The label names the action, the subject and the state — which is
            // what the filled heart shows — so no `selected` beside it. One or
            // the other: both announces "remove from favourites, selected".
            accessibilityLabel={heartLabel}
            style={({ pressed }) => [styles.heart, { opacity: pressed ? 0.6 : 1 }]}
          >
            <BlurView
              intensity={8}
              tint="systemChromeMaterial"
              style={[styles.heartGlass, { backgroundColor: colors.glass }]}
            >
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                  fill={heartFilled ? spot.destructive : 'none'}
                  stroke={heartFilled ? spot.destructive : colors.ink2}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              </Svg>
            </BlurView>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
            {restaurant.name}
          </Text>
          <Text style={[styles.rating, { color: colors.ink }]}>
            <Text style={{ color: spot.star }}>★ </Text>
            {restaurant.rating.toFixed(1)}
          </Text>
        </View>

        <Text style={[styles.meta, { color: colors.ink2 }]} numberOfLines={1}>
          {meta}
        </Text>

        <View style={styles.badges}>
          {restaurant.prepMin !== null ? (
            <View style={[styles.prep, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.prepText, { color: colors.accent }]}>
                ⏱ {restaurant.prepMin} {t('minutes')}
              </Text>
            </View>
          ) : null}
          {restaurant.services.map((service) => (
            <View key={service} style={[styles.badge, { backgroundColor: colors.chip }]}>
              <Text style={[styles.badgeText, { color: colors.ink2 }]}>
                {t(serviceKey(service))}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

/** What the strip stands in at until it has been measured — the cover's height,
 *  so a card never collapses to nothing for the frame before layout lands. */
const STRIP_MIN_HEIGHT = 162;

/**
 * The dishes that matched, **one square slide per dish at the card's full
 * width**.
 *
 * It was a row of small tiles first, and small tiles are the wrong shape for
 * this: the plate is the thing being chosen, and at a third of a card's width
 * it is a thumbnail beside two other thumbnails with the third sliced off at
 * the edge.
 *
 * Square, and so as tall as the card is wide. It matched the cover's 162 first,
 * to keep a card the same size filtered or not — and that was the wrong thing
 * to optimise for. A cover is a room, which a letterbox suits; this is a plate,
 * and a plate cropped to a third of its height is a photograph of a table edge.
 */
function DishStrip({
  dishes,
  onPressDish,
  at,
  onAt,
}: {
  dishes: CardDish[];
  onPressDish?: (dish: CardDish) => void;
  /** Which slide is showing. Owned by the card, because its heart acts on the
   *  dish this points at. */
  at: number;
  onAt: (index: number) => void;
}) {
  const { colors } = useTheme();
  /**
   * The card's width, measured rather than assumed.
   *
   * A slide is exactly one card wide and that depends on the screen, so the
   * page size and the slide have to come from one measurement — otherwise a
   * slide comes to rest showing two halves. Zero until the first layout, which
   * is one frame with nothing to show.
   */
  const [width, setWidth] = useState(0);

  return (
    <View
      style={{ minHeight: width || STRIP_MIN_HEIGHT }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(event) =>
          onAt(width > 0 ? Math.round(event.nativeEvent.contentOffset.x / width) : 0)
        }
      >
        {dishes.map((dish) => (
          <Pressable
            key={dish.id}
            onPress={() => onPressDish?.(dish)}
            accessibilityRole="button"
            accessibilityLabel={dish.name + ', ' + formatAmd(dish.priceAmd)}
            style={({ pressed }) => [
              { width, height: width },
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Photo uri={dish.photoUrl} style={StyleSheet.absoluteFill} />
            {/* Over the foot of the photograph rather than under it: the card
                already carries a name and a price lower down — the
                restaurant's — and two stacked name/price pairs read as one
                confused block. On the picture, this one is plainly about the
                picture. */}
            <View style={styles.cap}>
              <Text style={styles.capName} numberOfLines={1}>
                {dish.name}
              </Text>
              <Text style={styles.capPrice}>{formatAmd(dish.priceAmd)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {dishes.length > 1 ? (
        <View style={styles.dots}>
          {dishes.map((dish, index) => (
            <View
              key={dish.id}
              style={[
                styles.dot,
                index === at
                  ? // Wider rather than merely darker: on a six-pixel dot a
                    // colour change alone is not a difference anybody notices.
                    { width: 16, borderRadius: 3, backgroundColor: colors.accent }
                  : { backgroundColor: colors.line },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** `RestaurantService` → its dictionary key. Three services, three badges, and
 *  eating in has none — it is not a service any more but a consequence of
 *  taking no bookings (BUSINESS_LOGIC.md §2), so a badge for it would be the
 *  absence of the "Reserve" one said twice. */
function serviceKey(service: string): 'svcPickup' | 'svcDineIn' | 'svcReserve' {
  switch (service) {
    case RestaurantService.DineIn:
      return 'svcDineIn';
    case RestaurantService.Reserve:
      return 'svcReserve';
    default:
      return 'svcPickup';
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 18,
  },
  photo: { height: 162, width: '100%' },
  // The cover's slot, so the card is the same size filtered or not.
  strip: { width: '100%' },
  cap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 15,
    paddingTop: 26,
    paddingBottom: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  capName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  capPrice: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  heart: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  // The blur is a child of the Pressable rather than the Pressable itself: a
  // BlurView cannot take press handlers on Android, and clipping the blur to
  // the circle needs the `overflow: hidden` to sit on the parent anyway.
  //
  // Its `backgroundColor` is `colors.glass` and is not optional: the artifact's
  // disc is a *tinted* panel (78% opaque) with a blur behind it, and a blur on
  // its own is nearly nothing over a photo — which is where this always sits.
  heartGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 15, paddingTop: 14, paddingBottom: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, flex: 1 },
  rating: { fontSize: 13.5, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 3 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  prep: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  prepText: { fontSize: 12, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
