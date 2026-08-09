import { describe, expect, it } from 'vitest';
// `readyTimeOptions` moved to `@amragrir/shared` when mobile grew the same
// grid; the test stayed here, where a runner already exists, because the
// package has none of its own.
import { readyTimeOptions } from '@amragrir/shared';
import {
  formatCountdown,
  formatTime,
  instantOfYerevan,
  instantOfYerevanTime,
  yerevanDate,
  yerevanDateTime,
  yerevanStepUp,
} from './format';

describe('readyTimeOptions', () => {
  const earliest = '2026-08-03T09:07:00.000Z';

  it('offers the earliest from the server first, marked as such', () => {
    const [first] = readyTimeOptions(earliest, 4);
    expect(first).toEqual({ at: earliest, earliest: true });
  });

  // A grid reading 12:47 / 12:57 / 13:07 looks like a bug; the design draws
  // clean times, and landing on the step is what makes them clean.
  // `READY_STEP_MINUTES` went 15 → 10 on 2026-08-08, so these are tens.
  it('rounds every later option up onto the step', () => {
    const [, ...later] = readyTimeOptions(earliest, 4);
    expect(later.map((option) => option.at)).toEqual([
      '2026-08-03T09:10:00.000Z',
      '2026-08-03T09:20:00.000Z',
      '2026-08-03T09:30:00.000Z',
    ]);
  });

  it('does not repeat the earliest when it already sits on the step', () => {
    const onTheDot = '2026-08-03T09:20:00.000Z';
    const times = readyTimeOptions(onTheDot, 3).map((option) => option.at);
    expect(new Set(times).size).toBe(times.length);
    expect(times[1]).toBe('2026-08-03T09:30:00.000Z');
  });

  // The count is a span in disguise, which is why it was raised to 12 when the
  // step went to 10: the first entry is the earliest itself, so twelve options
  // are eleven steps, and the grid still reaches most of two hours. Left at
  // eight it would have reached seventy minutes.
  it('still reaches nearly two hours ahead on its default count', () => {
    const from = '2026-08-03T09:00:00.000Z';
    const times = readyTimeOptions(from);

    expect(times).toHaveLength(12);
    const last = new Date(times[times.length - 1]!.at).getTime();
    expect(last - Date.parse(from)).toBe(110 * 60_000);
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

/**
 * The checkout draws the artifact's native clock fields, which speak wall-clock
 * readings with no zone on them while everything either side of them speaks
 * instants. Getting this pair wrong is how somebody books a table four hours
 * out from the one they picked.
 */
describe('the checkout clock fields', () => {
  it('fills a datetime-local from an instant, and reads it back', () => {
    expect(yerevanDateTime('2026-08-03T09:07:00.000Z')).toBe('2026-08-03T13:07');
    expect(instantOfYerevan('2026-08-03T13:07')).toBe('2026-08-03T09:07:00.000Z');
  });

  it('refuses a reading it cannot parse rather than inventing a date', () => {
    expect(instantOfYerevan('')).toBeNull();
    expect(instantOfYerevan('tomorrow at eight')).toBeNull();
    expect(instantOfYerevanTime('', '2026-08-03T09:07:00.000Z')).toBeNull();
  });

  // A `time` field carries no date at all, so the day has to come from the
  // instant the field's floor was drawn from — and that day is Yerevan's, which
  // can already be tomorrow while UTC is still on today.
  it('puts a bare HH:mm on the Yerevan day of the instant it is given', () => {
    expect(instantOfYerevanTime('19:30', '2026-08-03T21:30:00.000Z')).toBe(
      '2026-08-04T15:30:00.000Z',
    );
  });

  // `min` and `step` are read together — the browser counts steps *from* `min` —
  // so an unrounded floor turns a half-hourly field into 14:07 / 14:37.
  it('rounds a floor up onto the clock', () => {
    expect(yerevanDateTime(yerevanStepUp('2026-08-03T09:07:00.000Z', 30))).toBe('2026-08-03T13:30');
    expect(yerevanDateTime(yerevanStepUp('2026-08-03T09:07:00.000Z', 15))).toBe('2026-08-03T13:15');
  });

  it('leaves a floor already on the grain where it is', () => {
    expect(yerevanDateTime(yerevanStepUp('2026-08-03T09:15:00.000Z', 15))).toBe('2026-08-03T13:15');
  });

  it('carries a late floor into the next day, not to a 24:00 no field accepts', () => {
    expect(yerevanDateTime(yerevanStepUp('2026-08-03T19:50:00.000Z', 30))).toBe('2026-08-04T00:00');
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
