import {
  DEPOSIT_PER_GUEST_AMD,
  RESERVATION_SEATING_MINUTES,
  RESERVATION_SLOT_MINUTES,
} from '@amragrir/shared';
import {
  depositFor,
  instantOf,
  isSlotBoundary,
  localDateOf,
  localMinutesOf,
  localTimeLabel,
  openWindowFor,
  seatingsOverlap,
  slotsFor,
} from './slots';

const WINDOW = { opensMinutes: 10 * 60, closesMinutes: 23 * 60 };

describe('local time', () => {
  it('reads a time as Yerevan, not UTC', () => {
    // The whole point: 19:00 local is 15:00Z. Generating slots in UTC would
    // offer the guest times four hours off.
    expect(instantOf('2026-08-01', 19 * 60).toISOString()).toBe('2026-08-01T15:00:00.000Z');
    expect(localTimeLabel(new Date('2026-08-01T15:00:00.000Z'))).toBe('19:00');
    expect(localMinutesOf(new Date('2026-08-01T15:30:00.000Z'))).toBe(19 * 60 + 30);
  });

  it('keeps a late-evening booking on its own local day', () => {
    // 22:00 local on 1 Aug is 18:00Z the same day, but a naive UTC read of a
    // 01:00 local booking would land on the previous date.
    expect(localDateOf(new Date('2026-08-01T21:00:00.000Z'))).toBe('2026-08-02');
    expect(localDateOf(instantOf('2026-08-01', 22 * 60))).toBe('2026-08-01');
  });

  it('round-trips a slot through both directions', () => {
    const slot = instantOf('2026-12-31', 12 * 60 + 30);
    expect(localTimeLabel(slot)).toBe('12:30');
    expect(localDateOf(slot)).toBe('2026-12-31');
  });
});

describe('slotsFor', () => {
  it('spaces slots by the booking interval', () => {
    const slots = slotsFor('2026-08-01', WINDOW);
    const gap = slots[1]!.getTime() - slots[0]!.getTime();
    expect(gap).toBe(RESERVATION_SLOT_MINUTES * 60_000);
    expect(localTimeLabel(slots[0]!)).toBe('10:00');
  });

  it('stops a whole seating before closing', () => {
    // Offering 22:30 when the kitchen shuts at 23:00 sells a table the guest
    // cannot actually use.
    const slots = slotsFor('2026-08-01', WINDOW);
    const last = slots[slots.length - 1]!;
    expect(localTimeLabel(last)).toBe('21:30');
    expect(localMinutesOf(last) + RESERVATION_SEATING_MINUTES).toBe(WINDOW.closesMinutes);
  });

  it('offers nothing when the window is shorter than a seating', () => {
    expect(slotsFor('2026-08-01', { opensMinutes: 600, closesMinutes: 660 })).toEqual([]);
  });
});

describe('isSlotBoundary', () => {
  it('accepts an offered time and rejects one between slots', () => {
    // This is what stops a client booking 19:07 and bypassing availability.
    expect(isSlotBoundary(instantOf('2026-08-01', 19 * 60), WINDOW)).toBe(true);
    expect(isSlotBoundary(instantOf('2026-08-01', 19 * 60 + 7), WINDOW)).toBe(false);
  });

  it('rejects a time outside opening hours', () => {
    expect(isSlotBoundary(instantOf('2026-08-01', 9 * 60), WINDOW)).toBe(false);
    expect(isSlotBoundary(instantOf('2026-08-01', 22 * 60 + 30), WINDOW)).toBe(false);
  });
});

describe('openWindowFor', () => {
  const monday = instantOf('2026-08-03', 12 * 60);

  it('falls back to the default window when nothing is recorded', () => {
    // Nothing writes open_hours yet, so this is the live path.
    expect(openWindowFor(null, monday)).toEqual(WINDOW);
  });

  it('reads the weekday entry', () => {
    const hours = { mon: { open: '08:00', close: '17:00' } };
    expect(openWindowFor(hours, monday)).toEqual({ opensMinutes: 480, closesMinutes: 1020 });
  });

  it('honours an explicitly closed day', () => {
    // Distinct from "no hours recorded": a closed day is an answer.
    expect(openWindowFor({ mon: { closed: true } }, monday)).toBeNull();
  });

  it('uses a default entry for days it does not name', () => {
    const hours = { default: { open: '11:00', close: '22:00' } };
    expect(openWindowFor(hours, monday)).toEqual({ opensMinutes: 660, closesMinutes: 1320 });
  });

  it('falls back rather than throwing on a malformed value', () => {
    expect(openWindowFor({ mon: { open: 'noon', close: '23:00' } }, monday)).toEqual(WINDOW);
  });
});

describe('seatingsOverlap', () => {
  const at = (minutes: number) => instantOf('2026-08-01', minutes);

  it('treats a booking as a seating, not an instant', () => {
    // 19:00 and 19:30 clash on one table because a party stays 90 minutes.
    expect(seatingsOverlap(at(19 * 60), at(19 * 60 + 30))).toBe(true);
    expect(seatingsOverlap(at(19 * 60), at(20 * 60))).toBe(true);
  });

  it('frees the table once the seating is over', () => {
    expect(seatingsOverlap(at(19 * 60), at(19 * 60 + RESERVATION_SEATING_MINUTES))).toBe(false);
  });

  it('is symmetric', () => {
    expect(seatingsOverlap(at(20 * 60), at(19 * 60))).toBe(
      seatingsOverlap(at(19 * 60), at(20 * 60)),
    );
  });
});

describe('depositFor', () => {
  it('scales with the party, because the cost of an empty table does', () => {
    expect(depositFor(1)).toBe(DEPOSIT_PER_GUEST_AMD);
    expect(depositFor(4)).toBe(4 * DEPOSIT_PER_GUEST_AMD);
  });
});
