import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Circle, Path, Svg } from 'react-native-svg';
import { catalog } from '../../src/api/endpoints';
import type { Category } from '../../src/api/types';
import { useTranslate, type Translate } from '../../src/language';
import { useTheme } from '../../src/theme/useTheme';

/**
 * Search — the artifact's SEARCH screen.
 *
 * The field is a button, not an input: tapping it opens the results screen,
 * which is where typing belongs. That is what the artifact draws (its field has
 * no caret and no keyboard) and it keeps this screen a set of shortcuts rather
 * than a second place that queries the API.
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const t = useTranslate();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    catalog
      .categories()
      .then((result) => {
        if (!cancelled) {
          setCategories(result.items);
        }
      })
      .catch(() => {
        // The shortcuts below are the whole screen; without them it is empty,
        // but an error banner over a browse screen helps nobody.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const popular = ([1, 2, 3, 4, 5, 6] as const).map((n) =>
    t(`popular${n}` as Parameters<Translate>[0]),
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.ink }]}>{t('search')}</Text>

      <Pressable
        onPress={() => router.push('/')}
        style={[styles.field, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={7} stroke={colors.accent} strokeWidth={2} />
          <Path d="M20 20l-3.2-3.2" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <Text style={[styles.fieldText, { color: colors.ink2 }]}>{t('searchPlaceholder')}</Text>
      </Pressable>

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('browseByCuisine')}</Text>
      <View style={styles.grid}>
        {categories.slice(0, 6).map((category) => (
          <Pressable
            key={category.id}
            onPress={() => router.push({ pathname: '/', params: { category: category.key } })}
            style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Text style={styles.tileEmoji}>{category.icon}</Text>
            <Text style={[styles.tileName, { color: colors.ink }]} numberOfLines={1}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('popularNearYou')}</Text>
      <View style={styles.chips}>
        {popular.map((term) => (
          <Pressable
            key={term}
            onPress={() => router.push({ pathname: '/', params: { q: term } })}
            style={[styles.chip, { backgroundColor: colors.chip }]}
          >
            <Text style={[styles.chipText, { color: colors.ink }]}>{term}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// Measurements are the artifact's own, in the units it wrote them in.
const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 58, paddingBottom: 110 },
  title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.6 },
  field: {
    marginTop: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
  },
  fieldText: { fontSize: 15.5 },
  section: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 24,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  tile: {
    // Two per row with a 12px gutter.
    width: '47.5%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 15,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileEmoji: { fontSize: 24 },
  tileName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  chipText: { fontSize: 13.5, fontWeight: '600' },
});
