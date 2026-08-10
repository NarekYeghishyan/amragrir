import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import {
  RESERVATION_MAX_GUESTS,
  hasFreeSlot,
  monthGrid,
  monthHasBookableDay,
  slotsByPartOfDay,
  upcomingSlots,
  type PartOfDay,
} from '@amragrir/shared';
import type { Availability, Slot } from '../api/types';
import { formatAmd, formatMonth, weekdayHeads } from '../format';
import { useLanguage } from '../language';
import { useTheme } from '../theme/useTheme';
import type { TranslationKey } from '@amragrir/i18n';

/** Party sizes worth a single tap. The stepper beside them covers the rest. */
const GUEST_CHIPS = [2, 4, 6];

/** One label per stretch of the day, for the tabs over the time grid. */
const PART_LABELS: Record<PartOfDay, TranslationKey> = {
  morning: 'partMorning',
  afternoon: 'partAfternoon',
  evening: 'partEvening',
};

export interface BookingMonth {
  year: number;
  /** 0-indexed, as `Date` counts them and as `monthGrid` takes them. */
  month: number;
}

/**
 * Choosing a day, a time and a party size.
 *
 * **One calendar, two screens.** A table is booked from the pre-order flow —
 * where it comes with food — and on its own from a restaurant's page, and the
 * rules about which days are offered, which slots are dead and how large a
 * party a branch takes are the same rules in both. Drawn twice they would be
 * two readings of one availability answer, and the way that fails is silent: a
 * screen offering a slot the API then refuses.
 *
 * **A time is chosen here and booked elsewhere.** Tapping a time used to `POST`
 * a reservation on the spot, which made every mis-tap in a scrolling grid a held
 * table and a deposit, and left no way to change your mind — there was no such
 * thing as a chosen time, only a booked one. The browser has always worked the
 * other way round (pick, then submit) and so does the design. So this reports
 * the choice and the screen's own button commits it.
 *
 * **The times are the day's remaining ones, one stretch at a time.** At ten
 * minutes apart a branch answers with about seventy starts; drawn whole that was
 * twenty rows of chips, seventeen of them greyed out because they had already
 * happened. `upcomingSlots` removes what has gone and `slotsByPartOfDay` puts
 * the rest behind morning/afternoon/evening — both from `@amragrir/shared`, so
 * the phone and the browser drop and keep exactly the same times.
 *
 * Controlled apart from which stretch is open, which is where the eye is rather
 * than anything about the booking: every bound it draws comes off the
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
  /** Which stretch of the day is open. Null until somebody picks one, and then
   *  kept as the days change — somebody comparing evenings should not be sent
   *  back to breakfast by every tap on the calendar. That only holds while this
   *  component stays mounted, which is why neither screen blanks it to a
   *  spinner between days. */
  const [openPart, setOpenPart] = useState<PartOfDay | null>(null);

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
  const groups = slotsByPartOfDay(remaining);
  // Honour the tab that was pressed while it still exists; otherwise open the
  // one holding the chosen time, then the first with a free table, then the
  // first there is. A day whose only free tables are at 21:00 must not open on
  // a morning of struck-through ones.
  const group =
    groups.find((candidate) => candidate.part === openPart) ??
    groups.find((candidate) => candidate.slots.some((slot) => slot.at === selected)) ??
    groups.find((candidate) => hasFreeSlot(candidate.slots)) ??
    groups[0];
  const chosen = remaining.find((slot) => slot.at === selected) ?? null;

  return (
    <>
      <Text style={[styles.section, { color: colors.ink2 }]}>{t('reservationDate')}</Text>
      <View style={[styles.calendar, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={styles.calendarHead}>
          <Pressable
            disabled={!canGoBack}
            onPress={() => stepMonth(-1)}
            accessibilityLabel={t('reservationDate')}
            style={[styles.monthArrow, { borderColor: colors.line, opacity: canGoBack ? 1 : 0.3 }]}
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
            const chosen = cell.date !== null && cell.date === date;
            return (
              <Pressable
                key={index}
                disabled={!cell.bookable}
                onPress={() => cell.date !== null && onDate(cell.date)}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen, disabled: !cell.bookable }}
                style={[styles.day, chosen ? { backgroundColor: colors.accent } : null]}
              >
                <Text
                  style={[
                    styles.dayText,
                    {
                      color: chosen ? '#fff' : cell.bookable ? colors.ink : colors.ink3,
                      fontWeight: chosen ? '800' : '600',
                    },
                  ]}
                >
                  {cell.day ?? ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionRow}>
        <Text style={[styles.section, styles.sectionFlush, { color: colors.ink2 }]}>
          {t('reservationTime')}
        </Text>
        {/* What has been picked, where the browser puts it: on the control
            itself. Without it the only sign of a choice is one highlighted chip,
            which is off screen as soon as the guest picker is reached. */}
        {chosen !== null ? (
          <Text style={[styles.sectionValue, { color: colors.accent }]}>{chosen.time}</Text>
        ) : null}
      </View>

      {group === undefined ? (
        <Text style={[styles.notice, { color: colors.ink2, backgroundColor: colors.chip }]}>
          {/* A day the branch never opens on and a day already spent read
              differently, and only the second is worth trying tomorrow for. */}
          {availability.slots.length === 0 ? t('noSlots') : t('noSlotsLeft')}
        </Text>
      ) : (
        <>
          {/* One tab per stretch the day actually has — never a lone tab, which
              would be a control with nothing to choose between. A stretch whose
              tables are all taken is dimmed rather than disabled: it can still
              be looked at, and being told it is full is the point. */}
          {groups.length > 1 ? (
            <View style={styles.parts}>
              {groups.map((candidate) => {
                const open = candidate.part === group.part;
                const free = hasFreeSlot(candidate.slots);
                return (
                  <Pressable
                    key={candidate.part}
                    onPress={() => setOpenPart(candidate.part)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: open }}
                    style={[
                      styles.part,
                      {
                        borderColor: open ? colors.accent : colors.line,
                        backgroundColor: open ? colors.accentSoft : colors.card,
                        opacity: free || open ? 1 : 0.5,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.partText, { color: open ? colors.accent : colors.ink2 }]}
                      numberOfLines={1}
                    >
                      {t(PART_LABELS[candidate.part])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Dimmed rather than replaced while a new day is in flight: these are
              still the last answer's times, and swapping them for a spinner is
              what used to make the whole screen jump on every tap. */}
          <View style={[styles.slots, busy ? styles.slotsSettling : null]}>
            {group.slots.map((slot: Slot) => {
              const picked = slot.at === selected;
              return (
                <Pressable
                  key={slot.at}
                  disabled={!slot.available || busy}
                  onPress={() => onSelect(slot.at)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked, disabled: !slot.available }}
                  style={[
                    styles.slot,
                    {
                      borderColor: picked ? colors.accent : colors.line,
                      backgroundColor: picked ? colors.accentSoft : colors.card,
                      opacity: slot.available ? 1 : 0.35,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.slotText,
                      { color: picked ? colors.accent : colors.ink, fontWeight: picked ? '800' : '700' },
                    ]}
                  >
                    {slot.time}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

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
                  borderColor: chosen ? colors.accent : colors.line,
                  backgroundColor: chosen ? colors.accentSoft : colors.card,
                },
              ]}
            >
              <Text style={[styles.guestChipText, { color: chosen ? colors.accent : colors.ink }]}>
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
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  /** The heading already has the row's top margin; a second one would double it. */
  sectionFlush: { marginTop: 0 },
  sectionValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  parts: { flexDirection: 'row', gap: 8, marginTop: 12 },
  part: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  partText: { fontSize: 12.5, fontWeight: '700' },
  notice: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  calendar: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
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
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 13.5 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  slotsSettling: { opacity: 0.55 },
  slot: {
    // Four to a row, and a fixed share rather than `minWidth` + `flexGrow`:
    // four 22% chips and their three 10px gaps fit any phone width, while the
    // growing version added the gaps *after* deciding four would fit and pushed
    // the fourth chip over the edge.
    width: '22%',
    height: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: { fontSize: 14, fontWeight: '700' },
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
