import { describe, expect, it } from 'vitest';
import { readyTimeOptions } from './ready-times';
import { formatCountdown, formatTime, yerevanDate } from './format';

describe('readyTimeOptions', () => {
  const earliest = '2026-08-03T09:07:00.000Z';

  it('offers the earliest from the server first, marked as such', () => {
    const [first] = readyTimeOptions(earliest, 4);
    expect(first).toEqual({ at: earliest, earliest: true });
  });

  // A grid reading 12:47 / 13:02 / 13:17 looks like a bug; the design draws
  // clean times, and the quarter-hour is what makes them clean.
  it('rounds every later option up to a quarter hour', () => {
    const [, ...later] = readyTimeOptions(earliest, 4);
    expect(later.map((option) => option.at)).toEqual([
      '2026-08-03T09:15:00.000Z',
      '2026-08-03T09:30:00.000Z',
      '2026-08-03T09:45:00.000Z',
    ]);
  });

  it('does not repeat the earliest when it already sits on a quarter hour', () => {
    const onTheDot = '2026-08-03T09:15:00.000Z';
    const times = readyTimeOptions(onTheDot, 3).map((option) => option.at);
    expect(new Set(times).size).toBe(times.length);
    expect(times[1]).toBe('2026-08-03T09:30:00.000Z');
  });

  it('returns nothing for a time it cannot read, rather than throwing', () => {
    expect(readyTimeOptions('not a date')).toEqual([]);
  });
});

describe('times belong to the restaurant, not the reader', () => {
  // Yerevan is UTC+4 all year. Formatting in the visitor's zone would tell
  // someone in London to collect their food four hours early.
  it('formats in Yerevan time', () => {
    expect(formatTime('2026-08-03T09:07:00.000Z')).toBe('13:07');
  });

  it('gives the Yerevan calendar date, which can differ from UTC', () => {
    expect(yerevanDate(new Date('2026-08-03T21:30:00.000Z'))).toBe('2026-08-04');
  });
});

describe('formatCountdown', () => {
  it('pads the seconds', () => {
    expect(formatCountdown(485)).toBe('8:05');
  });

  it('never counts below zero', () => {
    expect(formatCountdown(-30)).toBe('0:00');
  });
});
