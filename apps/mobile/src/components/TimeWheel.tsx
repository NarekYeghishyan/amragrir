import { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';
import { useTheme } from '../theme/useTheme';

/**
 * The artifact's hour:minute wheel — two snapping columns behind a lens.
 *
 * **Both time questions on "When & how" are asked with this control**, which is
 * why it is a component rather than markup in one screen: the booking's
 * "Reservation time" and the pre-order's "Exact time" are the same picker over
 * different instants, and the artifact draws them from one set of measurements.
 *
 * **It scrolls where a grid had to be paged.** The grid it replaces could hold
 * about twelve times before it ran off the screen, which is why the booking
 * side grew morning/afternoon/evening tabs — a control invented to divide a
 * list the grid could not show. A wheel has no such limit: seventy starts are
 * seventy rows, and the tabs go with the grid that needed them.
 *
 * **The columns are the branch's answer, not a clock.** The artifact runs a
 * free cross product — every hour from 11 to 22 against every five minutes —
 * because it has no server to contradict it. Here the hours are the hours that
 * hold an offerable time and the minutes are the minutes free *within the hour
 * being shown*, so the wheel cannot be scrolled onto a table somebody else has
 * or an hour the kitchen is shut. A picker that offers a time the server
 * refuses is a bug in the picker (SCREENS.md §5), and a wheel makes that
 * mistake easier than a grid does: a grid can grey a slot out, while a wheel
 * that snaps onto one has already chosen it.
 */

/** Row height, the lens height, and the unit every scroll offset is a multiple of. */
const ROW = 46;
/** The artifact's window: three rows, with the middle one under the lens. */
const WINDOW = 184;
/** What it takes to centre the first row — `(WINDOW - ROW) / 2`, and the same
 *  padding closes the list so the last row can reach the middle too. */
const PAD = (WINDOW - ROW) / 2;
/** The fade over each end, from the trough's own colour to nothing. */
const FADE = 56;

export interface WheelTime {
  /** ISO instant — the value the API takes. */
  at: string;
  /** `HH:MM` in Yerevan, already resolved by the caller's formatter. */
  time: string;
}

/** `HH:MM` split for the two columns. Bad input is dropped rather than guessed. */
function parts(time: string): { hour: string; minute: string } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match ? { hour: match[1], minute: match[2] } : null;
}

/** One column: a snapping list of labels with the chosen one under the lens. */
function Column({
  values,
  index,
  onIndex,
  disabled,
  highlight,
}: {
  values: string[];
  index: number;
  onIndex: (index: number) => void;
  disabled: boolean;
  /** False while nothing is chosen, so the wheel rests somewhere without
   *  claiming it as an answer — the artifact's `wheelItem(!rdyAsap && …)`. */
  highlight: boolean;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  /** What the column is already showing, so the effect below can tell a
   *  selection that arrived from outside from the echo of its own scroll. */
  const shown = useRef(index);

  // Put the chosen row under the lens whenever the choice moves for a reason
  // other than this column's own scroll — the panel opening on a time chosen
  // earlier, the hour changing the minutes beneath it, a day being repriced.
  useEffect(() => {
    if (shown.current === index) {
      return;
    }
    shown.current = index;
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index]);

  /** Pending re-centre, cancelled by every further scroll — see `align`. */
  const alignment = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (alignment.current !== null) {
        clearTimeout(alignment.current);
      }
    },
    [],
  );

  /**
   * The row under the lens, on **every** scroll event rather than on an ending.
   *
   * The artifact reads its wheels the same way, and here it is also the only
   * way that works on both targets: `onMomentumScrollEnd` and `onScrollEndDrag`
   * never arrive on react-native-web, so a wheel wired to those alone scrolled
   * with the numbers under it never changing. Reported even when the row has
   * not moved, because coming to rest on the row the wheel opened on is still
   * an answer — and while nothing is chosen it is the only way the first row is
   * ever picked.
   */
  const read = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const offset = event.nativeEvent.contentOffset.y;
    const clamped = Math.max(0, Math.min(values.length - 1, Math.round(offset / ROW)));
    shown.current = clamped;
    onIndex(clamped);
    align(offset, clamped);
  };

  /**
   * Snapping, done here because `snapToInterval` is native-only.
   *
   * On the web it leaves `scroll-snap-type: none` behind, so a column would
   * come to rest wherever the finger let go and the row under the lens would
   * sit a few pixels out of it. A short quiet period after the last scroll
   * event stands in for the snap; on native the wheel has already snapped by
   * then and this finds nothing to do.
   */
  const align = (offset: number, target: number): void => {
    if (alignment.current !== null) {
      clearTimeout(alignment.current);
    }
    if (Math.abs(offset - target * ROW) < 1) {
      return;
    }
    alignment.current = setTimeout(() => {
      ref.current?.scrollTo({ y: target * ROW, animated: true });
    }, 140);
  };

  // The initial position cannot be scrolled to before the list has a height, so
  // it is set on the first layout rather than in an effect that would fire
  // against an empty view.
  const start = (event: LayoutChangeEvent): void => {
    if (event.nativeEvent.layout.height > 0 && index > 0) {
      ref.current?.scrollTo({ y: index * ROW, animated: false });
    }
  };

  return (
    <ScrollView
      ref={ref}
      onLayout={start}
      scrollEnabled={!disabled}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      // Without a throttle react-native-web delivers no scroll events at all,
      // which is the whole bug this pair of props fixes.
      scrollEventThrottle={16}
      onScroll={read}
      contentContainerStyle={styles.columnContent}
      style={styles.column}
    >
      {values.map((value, position) => {
        const chosen = highlight && position === index;
        return (
          <Pressable
            key={value}
            onPress={() => onIndex(position)}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            style={styles.row}
          >
            <Text
              style={[
                styles.rowText,
                chosen
                  ? { color: colors.accent, fontSize: 20, fontWeight: '800' }
                  : { color: colors.ink3, fontSize: 16, fontWeight: '600' },
              ]}
            >
              {value}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TimeWheel({
  times,
  value,
  onChange,
  disabled = false,
}: {
  /** The offerable instants, in order. Anything the server would refuse must
   *  already have been dropped — see the note on the component. */
  times: WheelTime[];
  /** The chosen instant, or null while none is. */
  value: string | null;
  onChange: (at: string) => void;
  /** True while a request is in flight: the time under it must not move. */
  disabled?: boolean;
}) {
  const { colors } = useTheme();

  /** The times regrouped as the two columns read them: hours in order, and the
   *  minutes each hour actually holds. */
  const byHour = useMemo(() => {
    const map = new Map<string, { minute: string; at: string }[]>();
    for (const time of times) {
      const split = parts(time.time);
      if (split === null) {
        continue;
      }
      const found = map.get(split.hour);
      if (found) {
        found.push({ minute: split.minute, at: time.at });
      } else {
        map.set(split.hour, [{ minute: split.minute, at: time.at }]);
      }
    }
    return map;
  }, [times]);

  const hours = useMemo(() => [...byHour.keys()], [byHour]);

  // Which hour is showing. The chosen time names it; with nothing chosen the
  // wheel rests on the first offer, which is the earliest the branch has.
  const chosenParts = parts(times.find((time) => time.at === value)?.time ?? '');
  const hourIndex = Math.max(0, chosenParts ? hours.indexOf(chosenParts.hour) : 0);
  const minutes = byHour.get(hours[hourIndex] ?? '') ?? [];
  const minuteIndex = Math.max(
    0,
    chosenParts ? minutes.findIndex((entry) => entry.minute === chosenParts.minute) : 0,
  );

  if (hours.length === 0) {
    return null;
  }

  // Moving the hour keeps the minute where it can and falls to the hour's first
  // offer where it cannot: 19:40 exists and 20:40 may not, and landing on a
  // time the branch does not have is the one thing this wheel must not do.
  const pickHour = (next: number): void => {
    const entries = byHour.get(hours[next]) ?? [];
    const keep = entries.find((entry) => entry.minute === minutes[minuteIndex]?.minute);
    const target = keep ?? entries[0];
    if (target) {
      onChange(target.at);
    }
  };

  return (
    <View style={[styles.trough, { backgroundColor: colors.chip }]}>
      {/* The lens: the row under it is the chosen one, which is what lets the
          columns carry no highlight of their own. */}
      <View style={[styles.lens, { backgroundColor: colors.card }]} pointerEvents="none" />

      <Column
        values={hours}
        index={hourIndex}
        onIndex={pickHour}
        disabled={disabled}
        highlight={value !== null}
      />
      <View style={styles.divider} pointerEvents="none">
        <Text style={[styles.dividerText, { color: colors.ink }]}>:</Text>
      </View>
      <Column
        values={minutes.map((entry) => entry.minute)}
        index={minuteIndex}
        onIndex={(next) => {
          const target = minutes[next];
          if (target) {
            onChange(target.at);
          }
        }}
        disabled={disabled}
        highlight={value !== null}
      />

      {/* Drawn over both columns rather than inside them, so the rows scrolling
          out of the window dissolve into the trough instead of being cut off at
          a hard edge. SVG because the fade has to be a real gradient and this
          app carries no gradient view. */}
      <View style={styles.fades} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="wheelTop" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.chip} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.chip} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="wheelBottom" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.chip} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.chip} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={FADE} fill="url(#wheelTop)" />
          <Rect x="0" y={WINDOW - FADE} width="100%" height={FADE} fill="url(#wheelBottom)" />
        </Svg>
      </View>
    </View>
  );
}

// The artifact's own measurements, in the units it wrote them in.
const styles = StyleSheet.create({
  trough: {
    position: 'relative',
    height: WINDOW,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
  },
  lens: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: PAD,
    height: ROW,
    borderRadius: 12,
  },
  fades: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2 },
  column: { flex: 1, zIndex: 1 },
  columnContent: { paddingVertical: PAD },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontVariant: ['tabular-nums'] },
  divider: {
    width: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  dividerText: { fontSize: 20, fontWeight: '800' },
});
