import {
  DEPOSIT_PER_GUEST_AMD,
  PLATFORM_BOOKING_POLICY,
  RESERVATION_SEATING_MINUTES,
  RESERVATION_SLOT_MINUTES,
  resolveBookingPolicy,
} from '@amragrir/shared';
import {
  bookingWindowFor,
  depositFor,
  instantOf,
  isSlotBoundary,
  localDateOf,
  localMinutesOf,
  localTimeLabel,
  openWindowFor,
  seatingsOverlap,
  serviceDateOf,
  slotsFor,
  windowContains,
} from './slots';

const WINDOW = { opensMinutes: 10 * 60, closesMinutes: 23 * 60 };

/**
 * The platform's own numbers, passed explicitly.
 *
 * These functions used to read the constants themselves; they now take a
 * resolved policy, and the parameter is required rather than defaulted so that
 * no call site can quietly fall back to the platform's answers where a branch
 * has its own. The assertions below are unchanged — passing this is what makes
 * them go on describing the same behaviour.
 */
const PLATFORM = PLATFORM_BOOKING_POLICY;

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

  it('carries a minute past midnight into the next calendar day', () => {
    // How the 01:00 slot of a night that began on the 3rd is addressed: from
    // the 3rd, at 1500 minutes, rather than from the 4th.
    expect(localTimeLabel(instantOf('2026-08-03', 25 * 60))).toBe('01:00');
    expect(localDateOf(instantOf('2026-08-03', 25 * 60))).toBe('2026-08-04');
  });
});

describe('slotsFor', () => {
  it('spaces slots by the booking interval', () => {
    const slots = slotsFor('2026-08-01', WINDOW, PLATFORM);
    const gap = slots[1]!.getTime() - slots[0]!.getTime();
    expect(gap).toBe(RESERVATION_SLOT_MINUTES * 60_000);
    expect(localTimeLabel(slots[0]!)).toBe('10:00');
  });

  it('stops a whole seating before closing', () => {
    // Offering 22:30 when the kitchen shuts at 23:00 sells a table the guest
    // cannot actually use.
    const slots = slotsFor('2026-08-01', WINDOW, PLATFORM);
    const last = slots[slots.length - 1]!;
    expect(localTimeLabel(last)).toBe('21:30');
    expect(localMinutesOf(last) + RESERVATION_SEATING_MINUTES).toBe(WINDOW.closesMinutes);
  });

  it('offers nothing when the window is shorter than a seating', () => {
    expect(slotsFor('2026-08-01', { opensMinutes: 600, closesMinutes: 660 }, PLATFORM)).toEqual([]);
  });

  it('takes its spacing and its seating from the branch, not the platform', () => {
    // The point of the whole policy chain: a branch that seats parties for two
    // hours on the half-hour gets exactly that, and neither number is read from
    // a constant any more.
    const policy = resolveBookingPolicy({ slotMinutes: 30, seatingMinutes: 120 }, null);
    const slots = slotsFor('2026-08-01', WINDOW, policy);

    expect(slots[1]!.getTime() - slots[0]!.getTime()).toBe(30 * 60_000);
    expect(localTimeLabel(slots[slots.length - 1]!)).toBe('21:00');
  });
});

describe('a night that runs past midnight', () => {
  // 12:00 to 02:00. Before closing times were allowed past 1440 this produced
  // an empty list and no explanation — a late-night restaurant simply could not
  // take bookings, and nothing on screen said why.
  const LATE = { mon: { open: '12:00', close: '02:00' } };
  const monday = instantOf('2026-08-03', 12 * 60);

  it('reads the closing time onto the opening day’s number line', () => {
    expect(openWindowFor(LATE, monday)).toEqual({ opensMinutes: 720, closesMinutes: 1560 });
  });

  it('offers slots right up to a seating before the real closing time', () => {
    const window = openWindowFor(LATE, monday)!;
    const slots = slotsFor('2026-08-03', window, PLATFORM);

    expect(slots.length).toBeGreaterThan(0);
    const last = slots[slots.length - 1]!;
    // 02:00 less a 90-minute seating is 00:30 — on the 4th, in the small hours
    // of Monday's night.
    expect(localTimeLabel(last)).toBe('00:30');
    expect(localDateOf(last)).toBe('2026-08-04');
  });

  it('counts an hour after midnight as inside the window', () => {
    const window = openWindowFor(LATE, monday)!;
    expect(windowContains(window, localMinutesOf(instantOf('2026-08-03', 25 * 60)))).toBe(true);
    expect(windowContains(window, 3 * 60)).toBe(false);
  });

  it('treats 00:00–00:00 as the whole day rather than an instant', () => {
    expect(openWindowFor({ default: { open: '00:00', close: '00:00' } }, monday)).toEqual({
      opensMinutes: 0,
      closesMinutes: 1440,
    });
  });
});

describe('serviceDateOf', () => {
  const branch = { openHours: { default: { open: '12:00', close: '02:00' } } };
  const early = { openHours: { default: { open: '10:00', close: '23:00' } } };

  it('puts the small hours on the day the shift started', () => {
    // 01:00 on Tuesday is the tail of Monday's service. Answering "Tuesday"
    // would file the booking under the wrong day and gate it against a Tuesday
    // the kitchen might be shut for.
    expect(serviceDateOf(branch, instantOf('2026-08-04', 60))).toBe('2026-08-03');
  });

  it('leaves an ordinary evening on its own date', () => {
    expect(serviceDateOf(branch, instantOf('2026-08-04', 20 * 60))).toBe('2026-08-04');
  });

  it('does not re-date the morning of a branch that shuts at a sensible hour', () => {
    // A branch closing at 23:00 has no claim on 01:00, and its bookings must
    // not be quietly moved to yesterday because somewhere else works late.
    expect(serviceDateOf(early, instantOf('2026-08-04', 60))).toBe('2026-08-04');
  });
});

describe('bookingWindowFor', () => {
  const monday = instantOf('2026-08-03', 12 * 60);
  const branch = {
    openHours: { default: { open: '10:00', close: '23:00' } },
    bookingHours: { mon: { open: '18:00', close: '22:00' } },
  };

  it('prefers booking hours to the kitchen’s hours', () => {
    // Serving from 10:00 but only holding tables for dinner is a real thing to
    // be, and used to require lying about the opening time on the public card.
    expect(bookingWindowFor(branch, monday)).toEqual({
      opensMinutes: 18 * 60,
      closesMinutes: 22 * 60,
    });
  });

  it('falls through to the kitchen’s hours on a day booking hours say nothing about', () => {
    const tuesday = instantOf('2026-08-04', 12 * 60);
    expect(bookingWindowFor(branch, tuesday)).toEqual(WINDOW);
  });

  it('lets booking hours close a day the kitchen is open', () => {
    // The fall-through only skips a level that said *nothing*. "No bookings on
    // Mondays" is an answer, not a silence.
    const closed = { openHours: branch.openHours, bookingHours: { mon: { closed: true } } };
    expect(bookingWindowFor(closed, monday)).toBeNull();
  });

  it('lets a dated closure beat both', () => {
    expect(
      bookingWindowFor(branch, monday, { kind: 'closed', opensMinutes: null, closesMinutes: null }),
    ).toBeNull();
  });

  it('lets a dated exception set its own hours', () => {
    expect(
      bookingWindowFor(branch, monday, {
        kind: 'custom_hours',
        opensMinutes: 11 * 60,
        closesMinutes: 15 * 60,
      }),
    ).toEqual({ opensMinutes: 660, closesMinutes: 900 });
  });
});

describe('isSlotBoundary', () => {
  it('accepts an offered time and rejects one between slots', () => {
    // This is what stops a client booking 19:07 and bypassing availability.
    expect(isSlotBoundary(instantOf('2026-08-01', 19 * 60), WINDOW, PLATFORM, '2026-08-01')).toBe(
      true,
    );
    expect(
      isSlotBoundary(instantOf('2026-08-01', 19 * 60 + 7), WINDOW, PLATFORM, '2026-08-01'),
    ).toBe(false);
  });

  it('rejects a time outside opening hours', () => {
    expect(isSlotBoundary(instantOf('2026-08-01', 9 * 60), WINDOW, PLATFORM, '2026-08-01')).toBe(
      false,
    );
    expect(
      isSlotBoundary(instantOf('2026-08-01', 22 * 60 + 30), WINDOW, PLATFORM, '2026-08-01'),
    ).toBe(false);
  });

  it('accepts a slot after midnight against the day its shift began', () => {
    // Open 12:00, shut 02:00, so the last start is 00:30 — a whole seating
    // before closing, exactly as it is for a branch that shuts at 23:00.
    const window = { opensMinutes: 12 * 60, closesMinutes: 26 * 60 };
    const at0030 = instantOf('2026-08-03', 24 * 60 + 30);

    expect(isSlotBoundary(at0030, window, PLATFORM, '2026-08-03')).toBe(true);
    // The same instant is not a slot of the calendar day it happens to fall on:
    // Tuesday's service has not started yet.
    expect(isSlotBoundary(at0030, window, PLATFORM, '2026-08-04')).toBe(false);
    // And 01:00 is refused even on the right day — a 90-minute seating from
    // there would run half an hour past closing.
    expect(isSlotBoundary(instantOf('2026-08-03', 25 * 60), window, PLATFORM, '2026-08-03')).toBe(
      false,
    );
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
  const seating = RESERVATION_SEATING_MINUTES;

  it('treats a booking as a seating, not an instant', () => {
    // 19:00 and 19:30 clash on one table because a party stays 90 minutes.
    expect(seatingsOverlap(at(19 * 60), at(19 * 60 + 30), seating, seating)).toBe(true);
    expect(seatingsOverlap(at(19 * 60), at(20 * 60), seating, seating)).toBe(true);
  });

  it('frees the table once the seating is over', () => {
    expect(
      seatingsOverlap(at(19 * 60), at(19 * 60 + RESERVATION_SEATING_MINUTES), seating, seating),
    ).toBe(false);
  });

  it('is symmetric', () => {
    expect(seatingsOverlap(at(20 * 60), at(19 * 60), seating, seating)).toBe(
      seatingsOverlap(at(19 * 60), at(20 * 60), seating, seating),
    );
  });

  it('measures each booking by the seating it was made under', () => {
    // A branch that has since shortened its seating still has long bookings on
    // the books. The old one at 18:00 held its table for three hours, so a new
    // 90-minute booking at 20:00 collides with it — measuring both by today's
    // 90 would have handed the same table to two parties.
    expect(seatingsOverlap(at(18 * 60), at(20 * 60), 180, 90)).toBe(true);
    expect(seatingsOverlap(at(18 * 60), at(20 * 60), 90, 90)).toBe(false);
  });
});

describe('depositFor', () => {
  it('scales with the party, because the cost of an empty table does', () => {
    expect(depositFor(1, PLATFORM)).toBe(DEPOSIT_PER_GUEST_AMD);
    expect(depositFor(4, PLATFORM)).toBe(4 * DEPOSIT_PER_GUEST_AMD);
  });

  it('uses the branch’s own deposit when it has one', () => {
    const policy = resolveBookingPolicy({ depositPerGuestAmd: 5000 }, null);
    expect(depositFor(3, policy)).toBe(15_000);
  });
});
