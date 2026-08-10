import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DietaryTag,
  RestaurantService,
  RestaurantSort,
  SPEND_FILTER_MAX_AMD,
  SPEND_FILTER_MIN_AMD,
  SPEND_FILTER_STEP_AMD,
} from '@amragrir/shared';
import {
  DISTANCE_CHOICES,
  NO_FILTERS,
  RATING_CHOICES,
  isUncapped,
  sliderFromSpend,
  spendFromSlider,
  toggleDietary,
  toggleService,
  type Filters,
} from '../filters';
import { formatAmd } from '../format';
import { useTranslate, type Translate } from '../language';
import { useTheme } from '../theme/useTheme';

const SORT_KEYS = {
  [RestaurantSort.Recommended]: 'sortRecommended',
  [RestaurantSort.Nearest]: 'sortNearest',
  [RestaurantSort.Fastest]: 'sortFastest',
  [RestaurantSort.TopRated]: 'sortTopRated',
} as const satisfies Record<RestaurantSort, Parameters<Translate>[0]>;

const DIETARY_KEYS = {
  [DietaryTag.Vegetarian]: 'dietVegetarian',
  [DietaryTag.Vegan]: 'dietVegan',
  [DietaryTag.Halal]: 'dietHalal',
  [DietaryTag.GlutenFree]: 'dietGlutenFree',
} as const satisfies Record<DietaryTag, Parameters<Translate>[0]>;

const SERVICE_KEYS = {
  [RestaurantService.Pickup]: 'svcPickup',
  [RestaurantService.DineIn]: 'svcDineIn',
  [RestaurantService.Reserve]: 'svcReserve',
} as const satisfies Record<RestaurantService, Parameters<Translate>[0]>;

const SERVICE_GLYPHS: Record<RestaurantService, string> = {
  [RestaurantService.Pickup]: '🥡',
  [RestaurantService.DineIn]: '🍴',
  [RestaurantService.Reserve]: '🪑',
};

const DIETARY_GLYPHS: Record<DietaryTag, string> = {
  [DietaryTag.Vegetarian]: '🥗',
  [DietaryTag.Vegan]: '🌱',
  [DietaryTag.Halal]: '🕌',
  [DietaryTag.GlutenFree]: '🌾',
};

/**
 * The last screen of the design's mobile artifact.
 *
 * It went unbuilt for a year over one number: the sheet draws a "price per
 * person" slider from 4 000 to 24 000֏ and the API measured a branch's *average
 * dish price*, which puts every restaurant on the platform between 1 480 and
 * 3 900. The two ranges do not overlap, so the control as drawn matched
 * everything or nothing, and building it would have meant shipping a slider
 * that does nothing. The model is fixed in `SPEND_ITEMS_PER_PERSON` — a person
 * orders about two things — and both ends of the slider now come from the same
 * module the server reads.
 *
 * **Edits are local until Apply.** A sheet that filtered as each chip was
 * pressed would refetch the feed four times behind an overlay covering it, and
 * "Reset" would have no meaning distinct from "clear one at a time".
 *
 * A stepped row of prices rather than a real slider: React Native ships no
 * `Slider` — it is a separate package — and a row of taps is the same choice on
 * a phone, with the advantage that it says the numbers out loud.
 */
export function FilterSheet({
  open,
  filters,
  hasOrigin,
  onClose,
  onApply,
}: {
  open: boolean;
  /** What the feed is currently showing, which is what the sheet opens on. */
  filters: Filters;
  /** Whether the feed has coordinates. Without them the API ignores a distance,
   *  so offering one would be the sheet claiming to narrow something it does
   *  not. */
  hasOrigin: boolean;
  onClose: () => void;
  onApply: (filters: Filters) => void;
}) {
  const { colors } = useTheme();
  const t = useTranslate();
  const [draft, setDraft] = useState(filters);

  // Reopened on whatever the feed is showing now, not on whatever was last
  // abandoned here: a sheet that reopened on a discarded draft would tell
  // somebody the feed is narrowed in ways it is not.
  useEffect(() => {
    if (open) {
      setDraft(filters);
    }
  }, [open, filters]);

  const spend = sliderFromSpend(draft.spendMaxAmd);
  const steps: number[] = [];
  for (let value = SPEND_FILTER_MIN_AMD; value <= SPEND_FILTER_MAX_AMD; value += SPEND_FILTER_STEP_AMD * 2) {
    steps.push(value);
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('fltTitle')} />

        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={styles.head}>
            <View style={[styles.grab, { backgroundColor: colors.line }]} />
            <View style={styles.headRow}>
              <Text style={[styles.title, { color: colors.ink }]}>{t('fltTitle')}</Text>
              <Pressable
                onPress={onClose}
                accessibilityLabel={t('fltTitle')}
                style={[styles.close, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Text style={[styles.closeText, { color: colors.ink }]}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('fltSortBy')}</Text>
            <View style={styles.chips}>
              {Object.values(RestaurantSort).map((value) => (
                <Chip
                  key={value}
                  label={t(SORT_KEYS[value])}
                  selected={draft.sort === value}
                  onPress={() => setDraft((current) => ({ ...current, sort: value }))}
                />
              ))}
            </View>

            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: colors.ink2 }]}>{t('fltPrice')}</Text>
              <Text style={[styles.readout, { color: colors.accent }]}>
                {isUncapped(spend) ? t('fltAny') : `≤ ${formatAmd(spend)}`}
              </Text>
            </View>
            <View style={styles.chips}>
              {steps.map((value) => (
                <Chip
                  key={value}
                  label={value >= SPEND_FILTER_MAX_AMD ? t('fltAny') : formatAmd(value)}
                  selected={spend === value}
                  onPress={() =>
                    setDraft((current) => ({ ...current, spendMaxAmd: spendFromSlider(value) }))
                  }
                />
              ))}
            </View>

            {hasOrigin ? (
              <>
                <View style={styles.sectionRow}>
                  <Text style={[styles.section, { color: colors.ink2 }]}>{t('fltDistance')}</Text>
                  <Text style={[styles.readout, { color: colors.accent }]}>
                    {draft.distMaxKm === null ? t('fltAny') : `≤ ${draft.distMaxKm} km`}
                  </Text>
                </View>
                <View style={styles.chips}>
                  {DISTANCE_CHOICES.map((km) => (
                    <Chip
                      key={km}
                      label={`${km} km`}
                      selected={draft.distMaxKm === km}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          distMaxKm: current.distMaxKm === km ? null : km,
                        }))
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.section, { color: colors.ink2 }]}>{t('fltRating')}</Text>
            <View style={styles.chips}>
              {RATING_CHOICES.map((rating) => (
                <Chip
                  key={rating}
                  label={`★ ${rating}+`}
                  selected={draft.minRating === rating}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      minRating: current.minRating === rating ? null : rating,
                    }))
                  }
                />
              ))}
            </View>

            <Text style={[styles.section, { color: colors.ink2 }]}>{t('fltDietary')}</Text>
            <View style={styles.chips}>
              {Object.values(DietaryTag).map((tag) => (
                <Chip
                  key={tag}
                  label={`${DIETARY_GLYPHS[tag]} ${t(DIETARY_KEYS[tag])}`}
                  selected={draft.dietary.includes(tag)}
                  onPress={() => setDraft((current) => toggleDietary(current, tag))}
                />
              ))}
            </View>

            {/* The design's sixth section. `openNow` exists in the DTO and is
                deliberately not offered: the artifact does not draw it, and a
                filter for "serving right now" on a screen whose whole purpose
                is ordering *ahead* answers a question nobody came here with. */}
            <Text style={[styles.section, { color: colors.ink2 }]}>{t('fltService')}</Text>
            <View style={styles.chips}>
              {Object.values(RestaurantService).map((service) => (
                <Chip
                  key={service}
                  label={`${SERVICE_GLYPHS[service]} ${t(SERVICE_KEYS[service])}`}
                  selected={draft.service.includes(service)}
                  onPress={() => setDraft((current) => toggleService(current, service))}
                />
              ))}
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.bg }]}>
            <Pressable
              onPress={() => setDraft(NO_FILTERS)}
              style={[styles.reset, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Text style={[styles.resetText, { color: colors.ink }]}>{t('fltReset')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(draft)}
              style={[styles.apply, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.applyText}>{t('fltShow')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.accent : colors.line,
          backgroundColor: selected ? colors.accentSoft : colors.card,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.accent : colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// The artifact's own measurements, in the units it wrote them in.
const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  head: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 17 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 22,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  readout: { fontSize: 14, fontWeight: '800', marginTop: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13.5, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reset: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: { fontSize: 15, fontWeight: '700' },
  apply: { flex: 2, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
