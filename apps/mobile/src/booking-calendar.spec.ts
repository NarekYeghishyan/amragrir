// The grid moved to `@amragrir/shared` when the web checkout grew the same
// calendar; the test stayed here, where a runner already exists, exactly as
// `readyTimeOptions`' did on the web side.
import { addDays, monthGrid, monthHasBookableDay } from '@amragrir/shared';

// August 2026 starts on a Saturday and has 31 days — enough leading blanks to
// catch a Sunday-first grid, and a length that does not divide by seven.
const AUGUST = { year: 2026, month: 7 };
const TODAY = '2026-08-04';
const LEAD_DAYS = 30;

describe('addDays', () => {
  it('moves whole days and stays a plain date', () => {
    expect(addDays('2026-08-04', 30)).toBe('2026-09-03');
  });

  it('crosses a year end', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('goes backwards too', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('monthGrid', () => {
  const august = monthGrid(AUGUST.year, AUGUST.month, TODAY, LEAD_DAYS);

  it('starts the week on Monday, not Sunday', () => {
    // 1 Aug 2026 is a Saturday, so five blanks precede it. A Sunday-first grid
    // would put six there and shift every date by a column.
    const leading = august.findIndex((cell) => cell.day !== null);

    expect(leading).toBe(5);
    expect(august[5]?.date).toBe('2026-08-01');
  });

  it('pads to whole weeks so the grid stays rectangular', () => {
    expect(august.length % 7).toBe(0);
    expect(august.filter((cell) => cell.day !== null)).toHaveLength(31);
  });

  it('draws days that are past, but does not let them be booked', () => {
    // Hiding them would leave a hole where the reader expects the 1st.
    const third = august.find((cell) => cell.date === '2026-08-03');

    expect(third).toBeDefined();
    expect(third?.bookable).toBe(false);
  });

  it('lets today be booked — a table this evening is the common case', () => {
    expect(august.find((cell) => cell.date === TODAY)?.bookable).toBe(true);
  });

  it('stops at the booking horizon', () => {
    // RESERVATION_MAX_LEAD_DAYS ahead of 4 Aug is 3 Sep, so the last day of
    // August is still open …
    expect(august.find((cell) => cell.date === '2026-08-31')?.bookable).toBe(true);

    const september = monthGrid(2026, 8, TODAY, LEAD_DAYS);
    expect(september.find((cell) => cell.date === '2026-09-03')?.bookable).toBe(true);
    expect(september.find((cell) => cell.date === '2026-09-04')?.bookable).toBe(false);
  });

  it('handles a leap February', () => {
    const february = monthGrid(2028, 1, '2028-02-01', LEAD_DAYS);

    expect(february.filter((cell) => cell.day !== null)).toHaveLength(29);
  });
});

describe('monthHasBookableDay', () => {
  it('is false for the month before this one, so the arrow is a dead end', () => {
    expect(monthHasBookableDay(2026, 6, TODAY, LEAD_DAYS)).toBe(false);
  });

  it('is true for a month the horizon reaches into', () => {
    expect(monthHasBookableDay(2026, 8, TODAY, LEAD_DAYS)).toBe(true);
  });

  it('is false past the horizon', () => {
    expect(monthHasBookableDay(2026, 9, TODAY, LEAD_DAYS)).toBe(false);
  });
});
