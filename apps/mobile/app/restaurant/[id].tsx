import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MenuTab } from '@amragrir/shared';
import { catalog } from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import type { MenuItem, RestaurantDetail } from '../../src/api/types';
import { useTheme } from '../../src/theme/useTheme';
import { radius, spacing, spot, typography } from '../../src/theme/tokens';
import { formatAmd, formatPriceLevel } from '../../src/format';

const TABS = Object.values(MenuTab);

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tab, setTab] = useState<string>(MenuTab.Popular);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(err instanceof ApiError ? err.message : 'Something went wrong');
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

  const meta = [restaurant?.cuisine, formatPriceLevel(restaurant?.priceLevel ?? null)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: restaurant?.name ?? '' }} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.cover, { backgroundColor: colors.placeholder }]} />
            <Text style={[styles.name, { color: colors.ink }]}>{restaurant?.name}</Text>
            <Text style={[styles.meta, { color: colors.ink2 }]}>{meta}</Text>

            <View style={styles.badges}>
              <Text style={[styles.rating, { color: colors.ink }]}>
                <Text style={{ color: spot.star }}>★ </Text>
                {restaurant?.rating} ({restaurant?.reviewsCount})
              </Text>
              {restaurant?.branch.prepMin !== null && (
                <Text style={[styles.meta, { color: colors.ink2 }]}>
                  ⏱ {restaurant?.branch.prepMin} min
                </Text>
              )}
              <Text style={{ color: restaurant?.branch.isOpen ? colors.good : colors.ink3 }}>
                {restaurant?.branch.isOpen ? 'Open now' : 'Closed'}
              </Text>
            </View>

            {restaurant?.branch.address !== null && (
              <Text style={[styles.meta, { color: colors.ink3 }]}>
                📍 {restaurant?.branch.address}
              </Text>
            )}

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
                      { backgroundColor: selected ? colors.accent : colors.chip },
                    ]}
                  >
                    <Text
                      style={[styles.tabText, { color: selected ? '#fff' : colors.ink2 }]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => <MenuRow item={item} />}
        ListEmptyComponent={
          <Text style={[styles.error, { color: colors.ink3 }]}>Nothing on this tab yet</Text>
        }
      />
    </View>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const { colors } = useTheme();
  const facts = [
    item.caloriesKcal === null ? null : `${item.caloriesKcal} kcal`,
    item.prepMin === null ? null : `${item.prepMin} min`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, { borderColor: colors.line }]}>
      <View style={[styles.thumb, { backgroundColor: colors.placeholder }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.dish, { color: colors.ink }]}>{item.name}</Text>
        {item.desc.length > 0 && (
          <Text style={[styles.meta, { color: colors.ink2 }]} numberOfLines={2}>
            {item.desc}
          </Text>
        )}
        <Text style={[styles.meta, { color: colors.ink3 }]}>{facts}</Text>
        <Text style={[styles.price, { color: colors.ink }]}>{formatAmd(item.priceAmd)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  cover: { height: 180, borderRadius: radius.lg, marginBottom: spacing.md },
  name: { ...typography.title },
  meta: { ...typography.caption },
  rating: { ...typography.label },
  badges: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center', marginVertical: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill },
  tabText: { ...typography.label, textTransform: 'capitalize' },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  rowBody: { flex: 1, gap: 2 },
  dish: { ...typography.body, fontWeight: '700' },
  price: { ...typography.label, marginTop: spacing.xs },
  error: { ...typography.body, textAlign: 'center', marginTop: spacing.xxl },
});
