import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Path, Svg } from 'react-native-svg';
import { RestaurantService } from '@amragrir/shared';
import { useTheme } from '../theme/useTheme';
import { spot } from '../theme/tokens';
import { formatDistance, formatPriceLevel } from '../format';
import { useTranslate } from '../language';
import { Photo } from './Photo';
import type { RestaurantListItem } from '../api/types';

interface Props {
  restaurant: RestaurantListItem;
  onPress: () => void;
  /** Whether this account has saved it — the heart is filled when it has. */
  isFavorite?: boolean;
  /**
   * Saves the restaurant, or gives it back.
   *
   * Optional because not every screen that shows a card can act on one; where
   * it is absent the heart is not drawn at all, rather than drawn dead. It was
   * drawn dead for a while, which is worse than either: a control that looks
   * pressable and answers nothing.
   */
  onToggleFavorite?: () => void;
}

/**
 * Card on the home feed — see docs/COMPONENTS.md `RestaurantCard`.
 *
 * Measurements are the mobile artifact's own: a 162px photo, a 22px corner, the
 * open/closed badge floating on glass over the image, and the prep time in
 * accent while the service badges stay quiet in `chip`.
 */
export function RestaurantCard({ restaurant, onPress, isFavorite, onToggleFavorite }: Props) {
  const { colors } = useTheme();
  const t = useTranslate();

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
      <View style={styles.photo}>
        <Photo uri={restaurant.coverUrl} style={StyleSheet.absoluteFill} />
        <BlurView intensity={8} tint="systemChromeMaterial" style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {restaurant.isOpen ? t('open') : t('closed')}
          </Text>
        </BlurView>

        {/* Its own Pressable, over the card's — a press here saves the
            restaurant and must not also open it. `hitSlop` widens the 34px
            circle to a comfortable target without growing the glass disc the
            artifact draws. */}
        {onToggleFavorite ? (
          <Pressable
            onPress={onToggleFavorite}
            hitSlop={8}
            accessibilityRole="button"
            // The label names the action and changes with the state, which is
            // what the filled heart shows — so no `selected` beside it. One or
            // the other: both announces "remove from favourites, selected".
            accessibilityLabel={`${t(isFavorite ? 'removeFavorite' : 'addFavorite')} — ${restaurant.name}`}
            style={({ pressed }) => [styles.heart, { opacity: pressed ? 0.6 : 1 }]}
          >
            <BlurView intensity={8} tint="systemChromeMaterial" style={styles.heartGlass}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                  fill={isFavorite ? spot.destructive : 'none'}
                  stroke={isFavorite ? spot.destructive : colors.ink2}
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
