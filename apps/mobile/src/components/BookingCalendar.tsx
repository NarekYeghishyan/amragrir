import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { RESERVATION_MAX_GUESTS, monthGrid, monthHasBookableDay } from '@amragrir/shared';
import type { Availability } from '../api/types';
import { formatAmd, formatMonth, weekdayHeads } from '../format';
import { useLanguage } from '../language';
import { useTheme } from '../theme/useTheme';

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
 * **One calendar, two screens.** A table is booked from the pre-order flow —
 * where it comes with food — and on its own from a restaurant's page, and the
 * rules about which days are offered, which slots are dead and how large a
 * party a branch takes are the same rules in both. Drawn twice they would be
 * two readings of one availability answer, and the way that fails is silent: a
 * screen offering a slot the API then refuses.
 *
 * Fully controlled. It owns no state, fetches nothing and decides nothing —
 * every bound it draws comes off the `availability` answer, which is the branch
 * talking about itself, and never off a constant here.
 */
export function BookingCalendar({
  availability,
  date,
  month,
  guests,
  today,
  horizonDays,
  busySlot,
  onDate,
  onMonth,
  onGuests,
  onSlot,
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
  /** The slot currently being booked, so only that chip spins. */
  busySlot: string | null;
  onDate: (date: string) => void;
  onMonth: (month: BookingMonth) => void;
  onGuests: (guests: number) => void;
  onSlot: (at: string) => void;
}) {
  const { colors } = useTheme();
  const { language, t } = useLanguage();

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

      <Text style={[styles.section, { color: colors.ink2 }]}>{t('reservationTime')}</Text>
      {availability.slots.length === 0 ? (
        <Text style={[styles.notice, { color: colors.ink2, backgroundColor: colors.chip }]}>
          {t('noSlots')}
        </Text>
      ) : (
        <View style={styles.slots}>
          {availability.slots.map((slot) => (
            <Pressable
              key={slot.at}
              disabled={!slot.available || busySlot !== null}
              onPress={() => onSlot(slot.at)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !slot.available }}
              style={[
                styles.slot,
                {
                  borderColor: colors.line,
                  backgroundColor: colors.card,
                  opacity: slot.available ? 1 : 0.35,
                },
              ]}
            >
              {busySlot === slot.at ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[styles.slotText, { color: colors.ink }]}>{slot.time}</Text>
              )}
            </Pressable>
          ))}
        </View>
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
  slot: {
    minWidth: '22%',
    flexGrow: 1,
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
