import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { catalog } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import type { Category, RestaurantListItem } from '../src/api/types';
import { RestaurantCard } from '../src/components/RestaurantCard';
import { useTheme } from '../src/theme/useTheme';
import { radius, spacing, typography } from '../src/theme/tokens';
import { useSession } from '../src/session';

/** Republic Square — stands in for device geolocation until permissions land. */
const DEFAULT_ORIGIN = { lat: 40.1776, lng: 44.5126 };

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useSession();

  const [categories, setCategories] = useState<Category[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (category: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [categoryResult, restaurantResult] = await Promise.all([
        catalog.categories(),
        catalog.restaurants({
          ...DEFAULT_ORIGIN,
          sort: 'nearest',
          ...(category ? { category } : {}),
        }),
      ]);
      setCategories(categoryResult.items);
      setRestaurants(restaurantResult.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeCategory);
  }, [load, activeCategory]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.greeting, { color: colors.ink2 }]}>
              {user?.name ? `Hi, ${user.name}` : 'Hello'}
            </Text>
            <Text style={[styles.title, { color: colors.ink }]}>What to eat today?</Text>

            <Link href="/auth" asChild>
              <Pressable style={[styles.signIn, { borderColor: colors.line }]}>
                <Text style={[styles.signInText, { color: colors.accent }]}>
                  {user?.phoneVerified ? 'Signed in' : 'Sign in with your phone'}
                </Text>
              </Pressable>
            </Link>

            <CategoryRail
              categories={categories}
              active={activeCategory}
              onSelect={(key) => setActiveCategory((current) => (current === key ? null : key))}
            />

            <Text style={[styles.section, { color: colors.ink }]}>Nearby restaurants</Text>
          </View>
        }
        renderItem={({ item }) => (
          <RestaurantCard
            restaurant={item}
            onPress={() => router.push(`/restaurant/${item.slug}`)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : (
            <Text style={[styles.empty, { color: colors.ink2 }]}>
              {error ?? 'No restaurants match this filter'}
            </Text>
          )
        }
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
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={categories}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.rail}
      renderItem={({ item }) => {
        const selected = item.key === active;
        return (
          <Pressable
            onPress={() => onSelect(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.accent : colors.chip,
                borderColor: colors.line,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink }]}>
              {item.icon} {item.name}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.lg },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  greeting: { ...typography.caption },
  title: { ...typography.title },
  signIn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  signInText: { ...typography.label },
  rail: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { ...typography.label },
  section: { ...typography.heading, marginTop: spacing.sm },
  spinner: { marginTop: spacing.xxl },
  empty: { ...typography.body, textAlign: 'center', marginTop: spacing.xxl },
});
