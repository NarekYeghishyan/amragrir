import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import {
  RESERVATION_MAX_GUESTS,
  monthGrid,
  monthHasBookableDay,
  upcomingSlots,
} from '@amragrir/shared';
import type { Availability } from '../api/types';
import { formatAmd, formatDayShort, formatMonth, weekdayHeads } from '../format';
import { useLanguage } from '../language';
import { useTheme } from '../theme/useTheme';
import { PickerSheet } from './PickerSheet';
import { TimeWheel } from './TimeWheel';

/** Party sizes worth a single tap. The stepper beside them covers the rest. */
const GUEST_CHIPS = [2, 4, 6];

export interface BookingMonth {
  year: number;
  /** 0-indexed, as `Date` counts them and as `monthGrid` takes them. */
  month: number;
}

/**
 * Choosing a day, a time and a party size.
 *
 * **One calendar, two shapes of one screen.** A table is booked with food
 * behind it and on its own, and the rules about which days are offered, which
 * slots are dead and how large a party a branch takes are the same rules in
 * both. Drawn twice they would be two readings of one availability answer, and
 * the way that fails is silent: a screen offering a slot the API then refuses.
 *
 * **The picker lives on a sheet.** The artifact keeps the chosen day and hour
 * on one row with the calendar behind it, which is what stops this section
 * filling the screen twice over; here that row opens a `PickerSheet` rather
 * than unfolding in place, so the wheel inside is the only thing on screen that
 * scrolls. See `open` below.
 *
 * **A time is chosen here and booked elsewhere.** Tapping a time used to `POST`
 * a reservation on the spot, which made every mis-tap in a scrolling grid a held
 * table and a deposit, and left no way to change your mind — there was no such
 * thing as a chosen time, only a booked one. The browser has always worked the
 * other way round (pick, then submit) and so does the design. So this reports
 * the choice and the screen's own button commits it.
 *
 * **The times are the day's remaining free ones, on a wheel** (`TimeWheel`,
 * 2026-08-12). At ten minutes apart a branch answers with about seventy starts.
 * As a grid that was twenty rows of chips, which is why this screen grew
 * morning/afternoon/evening tabs — a control invented to divide a list the grid
 * could not show. The artifact never had them: it asks the hour on a wheel, and
 * seventy rows is a scroll rather than a problem, so the wheel arrived and the
 * tabs went with the grid that needed them. `upcomingSlots` still removes what
 * has already gone, from `@amragrir/shared`, so the phone and the browser drop
 * exactly the same times. (The tabs were a phone-only control — the browser
 * draws one flat grid — so `slotsByPartOfDay` now has no caller outside its own
 * spec. See the CHANGELOG entry.)
 *
 * Fully controlled now that the tab is gone: every bound it draws comes off the
 * `availability` answer, which is the branch talking about itself, and never off
 * a constant here.
 */
export function BookingCalendar({
  availability,
  date,
  month,
  guests,
  today,
  horizonDays,
  selected,
  busy,
  onDate,
  onMonth,
  onGuests,
  onSelect,
}: {
  availability: Availability;
  /** The chosen day, `YYYY-MM-DD` in Yerevan. */
  date: string;
  month: BookingMonth;
  guests: number;
  /** Yerevan's today, not the phone's — a traveller booking at 01:00 their own
   *  time must not be offered a day the restaurant has already finished. */
  today: string;
  /** How far ahead days may be picked. The pre-order flow shortens this to the
   *  order horizon, because there the table always carries food. */
  horizonDays: number;
  /** The chosen time as an ISO instant, or null while none is. */
  selected: string | null;
  /** True while the screen is booking, so the grid stops taking taps: the time
   *  under the request must not move while it is in flight. */
  busy: boolean;
  onDate: (date: string) => void;
  onMonth: (month: BookingMonth) => void;
  onGuests: (guests: number) => void;
  onSelect: (at: string) => void;
}) {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  /**
   * Whether the picker sheet is up.
   *
   * **Closed until asked for, since the picker became a sheet (2026-08-12).**
   * It used to start open whenever nothing was chosen, which was right for a
   * panel that unfolded in place — the row and the screen's button would
   * otherwise both read "Choose time" with no calendar behind either. An
   * overlay cannot do that: a sheet that threw itself over the screen on
   * arrival would be answering a question nobody had asked yet. The row says
   * "Choose time" and opening it is the guest's move.
   *
   * **Choosing does not close it.** Tapping a chip in the grid this replaced
   * was one press and one answer, so it closed on the tap; a wheel answers
   * continuously, and a sheet that shut on the first thing scrolled under the
   * lens would close before the hour anybody wanted got there. The ✕ and the
   * scrim close it.
   */
  const [open, setOpen] = useState(false);

  const cells = monthGrid(month.year, month.month, today, horizonDays);
  const canGoBack = monthHasBookableDay(month.year, month.month - 1, today, horizonDays);
  const canGoForward = monthHasBookableDay(month.year, month.month + 1, today, horizonDays);
  const stepMonth = (by: number): void => {
    const next = new Date(Date.UTC(month.year, month.month + by, 1));
    onMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  // What this branch says it takes, capped by what it can physically seat —
  // both from the availability answer rather than from a constant, so a branch
  // that runs a hall counts past twelve.
  const maxGuests = Math.min(
    availability.maxGuests || RESERVATION_MAX_GUESTS,
    availability.maxSeats || RESERVATION_MAX_GUESTS,
  );

  // Read at render rather than held in state: nothing here re-renders on a
  // clock, and a slot that lapses while the screen is open is refused by the
  // API anyway — this only decides what is worth drawing.
  const remaining = upcomingSlots(availability.slots, new Date().toISOString());
  // **Taken tables are dropped, not dimmed.** The grid could grey a slot and
  // refuse the tap; a wheel comes to rest on whatever is under the lens, so a
  // dead row in it would be a choice nobody made and the server would refuse.
  const free = remaining.filter((slot) => slot.available);
  const chosen = remaining.find((slot) => slot.at === selected) ?? null;

  return (
    <>
      <Text style={[styles.section, { color: colors.ink2 }]}>{t('reservationWhen')}</Text>

      {/* The artifact's folded row: the day and the hour on one line, with the
          whole picker behind it. It is what keeps this screen short enough to
          read in one go, and it is where the choice is *shown* — a highlighted
          chip is off screen by the time the guest count is reached. */}
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <Text style={styles.summaryGlyph}>📅</Text>
        <Text style={[styles.summaryText, { color: colors.ink }]} numberOfLines={1}>
          {formatDayShort(date, language)} · {chosen?.time ?? t('chooseTime')}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Svg width={12} height={8} viewBox="0 0 12 8" fill="none">
            <Path
              d="M1 1l5 5 5-5"
              stroke={colors.ink2}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </Pressable>

      <PickerSheet open={open} title={t('reservationWhen')} onClose={() => setOpen(false)}>
        <>
          <View style={styles.calendarHead}>
            <Pressable
              disabled={!canGoBack}
              onPress={() => stepMonth(-1)}
              accessibilityLabel={t('reservationDate')}
              style={[
                styles.monthArrow,
                { borderColor: colors.line, opacity: canGoBack ? 1 : 0.3 },
              ]}
            >
              <Svg width={9} height={15} viewBox="0 0 12 20" fill="none">
                <Path
                  d="M9 2L2 10l7 8"
                  stroke={colors.ink}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
            <Text style={[styles.monthLabel, { color: colors.ink }]}>
              {formatMonth(month.year, month.month, language)}
            </Text>
            <Pressable
              disabled={!canGoForward}
              onPress={() => stepMonth(1)}
              accessibilityLabel={t('reservationDate')}
              style={[
                styles.monthArrow,
                { borderColor: colors.line, opacity: canGoForward ? 1 : 0.3 },
              ]}
            >
              <Svg width={9} height={15} viewBox="0 0 12 20" fill="none">
                <Path
                  d="M3 2l7 8-7 8"
                  stroke={colors.ink}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
          </View>

          <View style={styles.week}>
            {weekdayHeads(language).map((head, index) => (
              <Text key={index} style={[styles.weekdayHead, { color: colors.ink3 }]}>
                {head}
              </Text>
            ))}
          </View>

          <View style={styles.week}>
            {cells.map((cell, index) => {
              const picked = cell.date !== null && cell.date === date;
              return (
                <Pressable
                  key={index}
                  disabled={!cell.bookable}
                  onPress={() => cell.date !== null && onDate(cell.date)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked, disabled: !cell.bookable }}
                  style={[styles.day, picked ? { backgroundColor: colors.accent } : null]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      {
                        color: picked ? '#fff' : cell.bookable ? colors.ink : colors.ink3,
                        fontWeight: picked ? '800' : '600',
                      },
                    ]}
                  >
                    {cell.day ?? ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.panelLabel, { color: colors.ink3 }]}>{t('reservationTime')}</Text>

          {free.length === 0 ? (
            <Text style={[styles.notice, { color: colors.ink2, backgroundColor: colors.chip }]}>
              {/* A day the branch never opens on and a day already spent read
                  differently, and only the second is worth trying tomorrow for. */}
              {availability.slots.length === 0 ? t('noSlots') : t('noSlotsLeft')}
            </Text>
          ) : (
            // Dimmed rather than replaced while a new day is in flight: these are
            // still the last answer's times, and swapping them for a spinner is
            // what used to make the whole screen jump on every tap.
            <View style={busy ? styles.settling : null}>
              <TimeWheel times={free} value={selected} onChange={onSelect} disabled={busy} />
            </View>
          )}
        </>
      </PickerSheet>

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('guests')}</Text>
      <View style={styles.guests}>
        {GUEST_CHIPS.filter((count) => count <= maxGuests).map((count) => {
          const chosen = count === guests;
          return (
            <Pressable
              key={count}
              onPress={() => onGuests(count)}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              style={[
                styles.guestChip,
                {
                  // `guestCircle` in the artifact, which fills and whitens on
                  // the same rule as the time pills beside it.
                  borderColor: chosen ? colors.accent : colors.line,
                  backgroundColor: chosen ? colors.accent : colors.card,
                },
              ]}
            >
              <Text style={[styles.guestChipText, { color: chosen ? '#fff' : colors.ink }]}>
                {count}
              </Text>
            </Pressable>
          );
        })}

        <View style={[styles.stepper, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Pressable
            disabled={guests <= 1}
            onPress={() => onGuests(Math.max(1, guests - 1))}
            accessibilityLabel={t('decrease')}
            style={[
              styles.stepButton,
              {
                backgroundColor: colors.chip,
                borderColor: colors.line,
                opacity: guests <= 1 ? 0.4 : 1,
              },
            ]}
          >
            <Text style={[styles.stepText, { color: colors.ink }]}>−</Text>
          </Pressable>
          <View style={styles.stepValue}>
            <Text style={[styles.guestCount, { color: colors.ink }]}>{guests}</Text>
            <Text style={[styles.guestsWord, { color: colors.ink2 }]}>{t('guestsWord')}</Text>
          </View>
          <Pressable
            disabled={guests >= maxGuests}
            onPress={() => onGuests(Math.min(maxGuests, guests + 1))}
            accessibilityLabel={t('increase')}
            style={[
              styles.stepButton,
              { backgroundColor: colors.accent, opacity: guests >= maxGuests ? 0.4 : 1 },
            ]}
          >
            <Text style={styles.stepPlusText}>＋</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.deposit, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={styles.depositRow}>
          <View style={styles.depositLeft}>
            <Text style={styles.depositGlyph}>🪑</Text>
            <View>
              <Text style={[styles.depositTitle, { color: colors.ink }]}>{t('deposit')}</Text>
              <Text style={[styles.depositSub, { color: colors.ink2 }]}>
                {guests} {t('guestsWord')}
              </Text>
            </View>
          </View>
          <View style={styles.depositRight}>
            <Text style={[styles.depositAmount, { color: colors.accent }]}>
              {formatAmd(availability.depositAmd)}
            </Text>
            <Text style={[styles.depositCredit, { color: colors.good }]}>{t('appliedToBill')}</Text>
          </View>
        </View>
        <Text style={[styles.depositNote, { color: colors.ink2, borderTopColor: colors.line }]}>
          ℹ️ {t('depositNote')}
        </Text>
      </View>
    </>
  );
}

// The artifact's own measurements, in the units it wrote them in — moved here
// with the markup rather than left behind, so the block is one thing to change.
const styles = StyleSheet.create({
  section: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 26,
  },
  // The folded row and the card it opens.
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  summaryGlyph: { fontSize: 18 },
  summaryText: { flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2 },
  /** Inside the card, so smaller and quieter than the headings outside it. */
  panelLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 9,
  },
  notice: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  calendarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  week: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayHead: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  day: {
    width: `${100 / 7}%`,
    // The artifact's fixed 38, not a square. `aspectRatio: 1` tied the row
    // height to the phone's width, which on a full-width sheet made every cell
    // 62 tall and six rows of them pushed the wheel off the bottom of the
    // screen. A day cell is a hit target, and 38 is the size the design chose
    // for it on every width.
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 14 },
  settling: { opacity: 0.55 },
  guests: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 },
  guestChip: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestChipText: { fontSize: 15, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, lineHeight: 24 },
  stepPlusText: { color: '#fff', fontSize: 18, lineHeight: 22 },
  stepValue: { alignItems: 'center', minWidth: 44 },
  guestCount: { fontSize: 18, fontWeight: '800' },
  guestsWord: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.3 },
  deposit: {
    marginTop: 22,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  depositRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  depositLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  depositGlyph: { fontSize: 20 },
  depositTitle: { fontSize: 15, fontWeight: '800' },
  depositSub: { fontSize: 11.5, marginTop: 1 },
  depositRight: { alignItems: 'flex-end' },
  depositAmount: { fontSize: 19, fontWeight: '800' },
  depositCredit: { fontSize: 10.5, fontWeight: '700' },
  depositNote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
