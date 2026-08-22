import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Circle, Path, Svg } from 'react-native-svg';
import { roundCoord, type Place } from '@amragrir/shared';
import {
  areaKeyFor,
  canGeocode,
  nameOf,
  readRecentPlaces,
  rememberPlace,
  searchPlaces,
} from '../place';
import { useLanguage } from '../language';
import { useTheme } from '../theme/useTheme';
import { YandexMap } from './YandexMap';

/** Long enough that typing a street name is one search rather than twelve —
 *  and here that matters twice over, since every result costs a second
 *  geocoder round trip to name. */
const TYPING_PAUSE_MS = 350;

/**
 * The artifact's `LOCATION PICKER` sheet, and the phone's half of a feature the
 * website has had since the header grew a pin.
 *
 * The same five ways to answer "where are you" as
 * `apps/web/src/components/LocationPicker.tsx`: **the map** (any point on it,
 * by tapping), **address search**, **recently chosen places**, **the device's
 * own position**, and — on the badge that names the choice — **the ✕ that takes
 * it back**.
 *
 * **The choice is pending until Confirm**, as the artifact draws it: tapping
 * the map moves the pin and nothing is stored until the accent button at the
 * bottom. That is one refetch of the feed per visit to this sheet rather than
 * one per point tried.
 *
 * **What the ✕ on the badge means here is not what it means on the web.** There
 * a cleared choice is the whole city, because a browser that has not been asked
 * has no position at all; a phone has one, so clearing hands the feed back to
 * the GPS — see `src/place.ts`.
 *
 * The map is built with the sheet and torn down with it. A `WebView` that
 * stayed mounted behind the home screen would be a page of yandex.ru loaded on
 * every launch for the great majority of sessions that never open this.
 */
export function LocationSheet({
  open,
  chosen,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** What the feed is measuring from now — where the sheet opens. */
  chosen: Place | null;
  onClose: () => void;
  onConfirm: (place: Place | null) => void;
}) {
  const { colors } = useTheme();
  const { language, t } = useLanguage();

  const [pending, setPending] = useState<Place | null>(chosen);
  /** Whether the API has a geocoder key. Null until it has been asked, and the
   *  search box waits for the answer rather than flickering in and out. */
  const [searchable, setSearchable] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  /** The search itself broke, as opposed to answering nothing. */
  const [searchFailed, setSearchFailed] = useState(false);
  const [recents, setRecents] = useState<Place[]>([]);
  const [geoFailed, setGeoFailed] = useState(false);
  /** True while the device is being asked where it is, so the button can say
   *  it is working — a GPS fix is seconds, not milliseconds. */
  const [locating, setLocating] = useState(false);

  // Opening starts from what is stored, so the sheet always opens on the place
  // the home row is showing rather than on whatever was tried and abandoned
  // last time.
  useEffect(() => {
    if (open) {
      setPending(chosen);
      setQuery('');
      setResults(null);
      setSearchFailed(false);
      setGeoFailed(false);
      setLocating(false);
      void readRecentPlaces().then(setRecents);
      // Answered once per session by `canGeocode`; this is the ask that fills
      // it in the first time the sheet is opened.
      void canGeocode(language).then(setSearchable);
    }
  }, [open, chosen, language]);

  const choose = useCallback((place: Place | null) => {
    setPending(place);
    setGeoFailed(false);
  }, []);

  /**
   * A point off the map, named.
   *
   * The pin moves at once under the finger and carries the nearest district's
   * name; the geocoder's answer replaces it when it arrives. Waiting for the
   * round trip before moving the pin would make a tap feel ignored, and a point
   * with no name at all cannot be shown in the home row afterwards.
   */
  const pickPoint = useCallback(
    (rawLat: number, rawLng: number) => {
      // To the precision a place is stored at, so the pin, the badge, the
      // recents and what the feed is asked are all the same point — a GPS fix
      // arrives with fifteen digits of it.
      const lat = roundCoord(rawLat);
      const lng = roundCoord(rawLng);
      choose({ lat, lng, label: t(areaKeyFor(lat, lng)) });
      void nameOf(lat, lng, language).then((label) => {
        if (label === null) {
          // The pin keeps the district name it was given. Nothing is lost that
          // the customer can act on.
          return;
        }
        // Only if the pin is still where it was put: a second tap while this
        // was in flight must not be overwritten by the first tap's name.
        setPending((current) =>
          current?.lat === lat && current?.lng === lng ? { lat, lng, label } : current,
        );
      });
    },
    [choose, t, language],
  );

  // Address search, one request per pause in typing.
  const live = useRef(0);
  useEffect(() => {
    if (!open) {
      return;
    }
    const text = query.trim();
    if (text === '') {
      setResults(null);
      setSearchFailed(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const attempt = live.current + 1;
    live.current = attempt;
    const timer = setTimeout(() => {
      void searchPlaces(text, language).then(({ items, failed }) => {
        // A later keystroke has already asked something else.
        if (live.current !== attempt) {
          return;
        }
        setResults(items);
        setSearchFailed(failed);
        setSearching(false);
      });
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query, open, language]);

  /**
   * The device's own position, which is a permission prompt and so cannot be
   * anything but a button.
   *
   * Refused, unavailable or timed out all leave the map and the search box as
   * the way to answer, so this says so and gets out of the way.
   */
  const useCurrent = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setGeoFailed(true);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      setQuery('');
      pickPoint(position.coords.latitude, position.coords.longitude);
    } catch {
      setGeoFailed(true);
    } finally {
      setLocating(false);
    }
  };

  const confirm = () => {
    if (pending) {
      void rememberPlace(pending);
    }
    onConfirm(pending);
  };

  const searchingNow = query.trim() !== '';

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityLabel={t('locClose')}
        />

        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={styles.head}>
            <View style={[styles.grab, { backgroundColor: colors.line }]} />
            <View style={styles.headRow}>
              <View style={styles.headText}>
                <Text style={[styles.title, { color: colors.ink }]}>{t('chooseLocation')}</Text>
                <Text style={[styles.sub, { color: colors.ink2 }]}>{t('locPickOnMap')}</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityLabel={t('locClose')}
                style={[styles.close, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Text style={[styles.closeText, { color: colors.ink }]}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Only where something can answer it: a deployment with no geocoder
              key draws no search box rather than one that says "nothing found"
              to every address in Yerevan. */}
          {searchable === true ? (
          <View style={styles.search}>
            <View
              style={[styles.field, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Circle cx={11} cy={11} r={7} stroke={colors.ink3} strokeWidth={2} />
                <Path d="M20 20l-3.2-3.2" stroke={colors.ink3} strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('locSearchAddress')}
                placeholderTextColor={colors.ink3}
                accessibilityLabel={t('locSearchAddress')}
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.fieldInput, { color: colors.ink }]}
              />
              {query !== '' ? (
                <Pressable
                  onPress={() => setQuery('')}
                  accessibilityLabel={t('locClose')}
                  style={[styles.clear, { backgroundColor: colors.chip }]}
                >
                  <Text style={[styles.clearText, { color: colors.ink2 }]}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          ) : null}

          {/* Recently chosen points. Hidden while a search is on screen, which
              is the row the results take the place of. */}
          {!searchingNow && recents.length > 0 ? (
            <View style={styles.recents}>
              <Text style={[styles.recentsLabel, { color: colors.ink3 }]}>{t('locRecent')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentsRow}
              >
                {recents.map((place) => {
                  const on = samePoint(pending, place);
                  return (
                    <Pressable
                      key={`${place.lat},${place.lng},${place.label}`}
                      onPress={() => choose(place)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.recent,
                        {
                          backgroundColor: on ? colors.accent : colors.card,
                          borderColor: on ? colors.accent : colors.line,
                        },
                      ]}
                    >
                      <PinGlyph tint={on ? '#fff' : colors.accent} />
                      <Text
                        numberOfLines={1}
                        style={[styles.recentText, { color: on ? '#fff' : colors.ink }]}
                      >
                        {place.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.mapWrap}>
            <YandexMap
              value={pending}
              onPick={pickPoint}
              labels={{
                map: t('locMap'),
                credit: t('locMapCredit'),
                zoomIn: t('locZoomIn'),
                zoomOut: t('locZoomOut'),
              }}
            />

            {/* The badge the artifact draws over the map: what is chosen right
                now, and the only way back to no choice at all. */}
            <View
              pointerEvents="box-none"
              style={[styles.badge, { backgroundColor: colors.glass, borderColor: colors.line }]}
            >
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text numberOfLines={1} style={[styles.badgeText, { color: colors.ink }]}>
                {pending?.label ?? t('locNearYou')}
              </Text>
              {pending !== null ? (
                <Pressable
                  onPress={() => choose(null)}
                  accessibilityLabel={t('locNearYou')}
                  style={[styles.unset, { backgroundColor: colors.chip }]}
                >
                  <Text style={[styles.clearText, { color: colors.ink2 }]}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Results sit *over* the map rather than pushing it down: a list
                that shortened the map every time somebody typed would move the
                pin they were aiming at. */}
            {searchingNow ? (
              <View
                style={[styles.results, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                {searching ? (
                  <View style={styles.note}>
                    <ActivityIndicator size="small" color={colors.ink3} />
                    <Text style={[styles.noteText, { color: colors.ink2 }]}>{t('locSearching')}</Text>
                  </View>
                ) : null}
                {!searching && results?.length === 0 ? (
                  <View style={styles.note}>
                    <Text style={[styles.noteText, { color: colors.ink2 }]}>
                      {t(searchFailed ? 'locSearchFailed' : 'locNoMatches')}
                    </Text>
                  </View>
                ) : null}
                {!searching
                  ? results?.map((place) => (
                      <Pressable
                        key={`${place.lat},${place.lng},${place.label}`}
                        onPress={() => {
                          choose(place);
                          setQuery('');
                          // The keyboard covers the map this pin has just been
                          // put on, and Confirm with it.
                          Keyboard.dismiss();
                        }}
                        style={styles.result}
                      >
                        <PinGlyph tint={colors.ink3} size={14} />
                        <Text numberOfLines={1} style={[styles.resultText, { color: colors.ink }]}>
                          {place.label}
                        </Text>
                      </Pressable>
                    ))
                  : null}
              </View>
            ) : null}
          </View>

          <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.bg }]}>
            <Pressable
              onPress={() => void useCurrent()}
              disabled={locating}
              accessibilityRole="button"
              style={[styles.here, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={12} r={4} stroke={colors.accent} strokeWidth={2} />
                  <Path
                    d="M12 2v3M12 19v3M2 12h3M19 12h3"
                    stroke={colors.accent}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              )}
              <Text style={[styles.hereText, { color: colors.ink }]}>{t('locUseCurrent')}</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              accessibilityRole="button"
              style={[styles.confirm, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.confirmText}>{t('locConfirm')}</Text>
            </Pressable>
          </View>

          {geoFailed ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: colors.danger, backgroundColor: colors.bg }]}
            >
              {t('locGeoFailed')}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PinGlyph({ tint, size = 16 }: { tint: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-5.7 7-11a7 7 0 10-14 0c0 5.3 7 11 7 11z" stroke={tint} strokeWidth={2} />
      <Circle cx={12} cy={10} r={2.4} stroke={tint} strokeWidth={2} />
    </Svg>
  );
}

/** Two places are the same choice when they are the same point. Names differ —
 *  the geocoder's answer for a district centre is a street, not "Kentron" — and
 *  a chip must still light up when the point behind it is the pending one. */
function samePoint(a: Place | null, b: Place | null): boolean {
  return a !== null && b !== null && a.lat === b.lat && a.lng === b.lng;
}

// The artifact's own measurements, in the units it wrote them in.
const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill },
  sheet: { height: '93%', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  head: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headText: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: 13, marginTop: 3 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 17 },
  search: { paddingHorizontal: 20, paddingTop: 14 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 15,
  },
  fieldInput: { flex: 1, minWidth: 0, fontSize: 15, padding: 0 },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 13 },
  recents: { paddingTop: 14 },
  recentsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingBottom: 9,
  },
  recentsRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 4 },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: 230,
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recentText: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  mapWrap: { flex: 1, minHeight: 180, margin: 20, marginBottom: 0, position: 'relative' },
  badge: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  badgeText: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  unset: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  results: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  noteText: { fontSize: 13.5 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  resultText: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  here: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hereText: { fontSize: 14, fontWeight: '700' },
  confirm: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  error: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 16 },
});
