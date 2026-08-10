// The rules moved to `@amragrir/shared` when the phone's picker needed the same
// ones; the test stayed here, where a runner already exists, exactly as
// `monthGrid`'s did on the mobile side.
import { describe, expect, it } from 'vitest';
import { hasFreeSlot, partOfDay, slotsByPartOfDay, upcomingSlots } from '@amragrir/shared';
import type { Slot } from './api';

// Yerevan is UTC+4 and has no daylight saving, so a `T06:00Z` instant is 10:00
// where the restaurant is — every time below is written UTC and read local, on
// purpose: it is the conversion the picker exists to get right.
const slot = (at: string, available = true): Slot => ({
  at,
  time: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Yerevan',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at)),
  available,
});

describe('upcomingSlots', () => {
  const now = '2026-08-15T08:30:00.000Z'; // 12:30 in Yerevan

  it('drops the times that have gone', () => {
    const left = upcomingSlots(
      [slot('2026-08-15T06:00:00.000Z'), slot('2026-08-15T10:00:00.000Z')],
      now,
    );

    expect(left.map((s) => s.time)).toEqual(['14:00']);
  });

  it('drops the slot happening exactly now — it is no longer bookable', () => {
    expect(upcomingSlots([slot(now)], now)).toEqual([]);
  });

  it('keeps a taken table, because a booked 20:00 informs a choice of 20:30', () => {
    const [only] = upcomingSlots([slot('2026-08-15T16:00:00.000Z', false)], now);

    expect(only.available).toBe(false);
    expect(only.time).toBe('20:00');
  });

  it('keeps the day’s own order', () => {
    const left = upcomingSlots(
      [
        slot('2026-08-15T16:00:00.000Z'), // 20:00
        slot('2026-08-15T09:00:00.000Z'), // 13:00
        slot('2026-08-15T13:30:00.000Z'), // 17:30
      ],
      now,
    );

    expect(left.map((s) => s.time)).toEqual(['20:00', '13:00', '17:30']);
  });

  it('survives an instant it cannot read', () => {
    // Built by hand: the helper above formats its own `time` from the instant,
    // which is exactly what an unreadable one cannot do.
    const broken: Slot = { at: 'not-a-time', time: '??:??', available: true };

    expect(upcomingSlots([broken], now)).toEqual([]);
  });

  it('keeps every slot when the clock is unreadable rather than emptying the day', () => {
    expect(upcomingSlots([slot('2026-08-15T06:00:00.000Z')], 'nonsense')).toHaveLength(1);
  });

  it('is empty for a day with nothing on it', () => {
    expect(upcomingSlots([], now)).toEqual([]);
  });
});

describe('hasFreeSlot', () => {
  it('is false for a day whose remaining tables are all taken', () => {
    expect(hasFreeSlot([slot('2026-08-15T16:00:00.000Z', false)])).toBe(false);
  });

  it('is true as soon as one is free', () => {
    expect(
      hasFreeSlot([slot('2026-08-15T16:00:00.000Z', false), slot('2026-08-15T17:00:00.000Z')]),
    ).toBe(true);
  });

  it('is false for a day with no slots at all', () => {
    expect(hasFreeSlot([])).toBe(false);
  });
});

describe('partOfDay', () => {
  it('splits the daylight at noon and five', () => {
    expect(partOfDay('11:59')).toBe('morning');
    expect(partOfDay('12:00')).toBe('afternoon');
    expect(partOfDay('16:50')).toBe('afternoon');
    expect(partOfDay('17:00')).toBe('evening');
  });

  it('calls the small hours evening — they belong to the night before', () => {
    // A branch open till 02:00 offers 00:30 as the tail of one evening, not as
    // the start of a morning nine hours before it opens again.
    expect(partOfDay('00:30')).toBe('evening');
    expect(partOfDay('04:59')).toBe('evening');
    expect(partOfDay('05:00')).toBe('morning');
  });

  it('files an unreadable label with the evening rather than throwing', () => {
    expect(partOfDay('??:??')).toBe('evening');
  });
});

describe('slotsByPartOfDay', () => {
  it('groups a plain day into the stretches it has', () => {
    const groups = slotsByPartOfDay([
      slot('2026-08-15T06:00:00.000Z'), // 10:00
      slot('2026-08-15T09:00:00.000Z'), // 13:00
      slot('2026-08-15T16:00:00.000Z'), // 20:00
      slot('2026-08-15T16:30:00.000Z'), // 20:30
    ]);

    expect(groups.map((group) => group.part)).toEqual(['morning', 'afternoon', 'evening']);
    expect(groups[2]?.slots.map((s) => s.time)).toEqual(['20:00', '20:30']);
  });

  it('leaves out a stretch the branch does not open in', () => {
    const groups = slotsByPartOfDay([slot('2026-08-15T16:00:00.000Z')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.part).toBe('evening');
  });

  it('keeps one evening together across midnight instead of splitting it', () => {
    // 19:00, 23:30 and 00:30 Yerevan — one night at a branch that closes at 02:00.
    const groups = slotsByPartOfDay([
      slot('2026-08-15T15:00:00.000Z'),
      slot('2026-08-15T19:30:00.000Z'),
      slot('2026-08-15T20:30:00.000Z'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.slots.map((s) => s.time)).toEqual(['19:00', '23:30', '00:30']);
  });

  it('orders the groups as the day meets them, not by name', () => {
    // Same night, but with lunch still on the books: the afternoon comes first
    // because that is when the day starts, and the 00:30 does not jump ahead of
    // it into a "morning" tab.
    const groups = slotsByPartOfDay([
      slot('2026-08-15T09:00:00.000Z'), // 13:00
      slot('2026-08-15T20:30:00.000Z'), // 00:30
    ]);

    expect(groups.map((group) => group.part)).toEqual(['afternoon', 'evening']);
  });

  it('is empty for a day with nothing on it', () => {
    expect(slotsByPartOfDay([])).toEqual([]);
  });
});
