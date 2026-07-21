import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { radius, spacing, spot, typography } from '../theme/tokens';
import { formatDistance, formatPriceLevel } from '../format';
import type { RestaurantListItem } from '../api/types';

interface Props {
  restaurant: RestaurantListItem;
  onPress: () => void;
}

/** Card on the home feed — see docs/COMPONENTS.md `RestaurantCard`. */
export function RestaurantCard({ restaurant, onPress }: Props) {
  const { colors } = useTheme();

  const meta = [
    restaurant.cuisine,
    formatPriceLevel(restaurant.priceLevel),
    formatDistance(restaurant.distanceKm),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name}, rating ${restaurant.rating}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.line,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.photo, { backgroundColor: colors.placeholder }]} />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
            {restaurant.name}
          </Text>
          <Text style={[styles.rating, { color: colors.ink }]}>
            <Text style={{ color: spot.star }}>★ </Text>
            {restaurant.rating}
          </Text>
        </View>

        <Text style={[styles.meta, { color: colors.ink2 }]} numberOfLines={1}>
          {meta}
        </Text>

        <View style={styles.badges}>
          {restaurant.prepMin !== null && (
            <Badge label={`⏱ ${restaurant.prepMin} min`} tone={colors.chip} ink={colors.ink2} />
          )}
          <Badge
            label={restaurant.isOpen ? 'Open now' : 'Closed'}
            tone={restaurant.isOpen ? colors.accentSoft : colors.chip}
            ink={restaurant.isOpen ? colors.good : colors.ink3}
          />
          {restaurant.reservationsEnabled && (
            <Badge label="Reserve" tone={colors.chip} ink={colors.ink2} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Badge({ label, tone, ink }: { label: string; tone: string; ink: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: tone }]}>
      <Text style={[styles.badgeText, { color: ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  photo: { height: 132, width: '100%' },
  body: { padding: spacing.lg, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...typography.heading, flex: 1, marginRight: spacing.sm },
  rating: { ...typography.label },
  meta: { ...typography.caption },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { ...typography.caption },
});
