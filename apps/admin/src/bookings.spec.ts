import { describe, expect, it } from 'vitest';
import type { StaffReservation, StaffTable } from './api';
import {
  actionsFor,
  barStyle,
  bookingsPartial,
  clockLabel,
  coversOf,
  gridRows,
  gridSpan,
  hasBookingFilters,
  hourMarks,
  inStage,
  isLive,
  minutesFromServiceMidnight,
  shiftDate,
  stageCounts,
  statusTone,
  todayInYerevan,
} from './bookings';

const TABLES: StaffTable[] = [
  { id: 't1', tableNo: '1', seats: 2, zone: 'hall', isActive: true, upcomingBookings: 0 },
  { id: 't2', tableNo: '2', seats: 4, zone: 'hall', isActive: true, upcomingBookings: 0 },
];

function booking(over: Partial<StaffReservation> = {}): StaffReservation {
  return {
    id: 'r1',
    status: 'confirmed',
    branch: { id: 'b1', name: 'Northern Ave', address: null },
    restaurantName: 'Sunny Table',
    reservedFor: '2026-09-01T15:00:00.000Z',
    localTime: '19:00',
    localDate: '2026-09-01',
    guests: 2,
    tableNo: '1',
    depositAmd: 4000,
    depositStatus: 'authorized',
    depositCredited: false,
    freeCancellationUntil: null,
    orderId: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    customerName: 'Ani',
    customerPhone: '+37411223344',
    ...over,
  };
}

describe('which buttons a booking offers', () => {
  it('offers only moves the API would accept', () => {
    // Read off the same transition table the server enforces, so the panel
    // cannot draw a button that is about to be refused.
    expect(actionsFor('pending')).toEqual(['confirmed', 'cancelled']);
    expect(actionsFor('confirmed')).toEqual(['seated', 'no_show', 'cancelled']);
    expect(actionsFor('seated')).toEqual(['completed']);
  });

  it('offers nothing on a booking that is over', () => {
    expect(actionsFor('completed')).toEqual([]);
    expect(actionsFor('cancelled')).toEqual([]);
    expect(actionsFor('no_show')).toEqual([]);
  });

  it('keeps no-show reachable only from confirmed', () => {
    // A table nobody promised to hold cannot be a no-show, and the deposit rule
    // depends on that distinction.
    expect(actionsFor('confirmed')).toContain('no_show');
    expect(actionsFor('pending')).not.toContain('no_show');
  });

  it('knows which bookings are still the branch’s problem', () => {
    expect(isLive('pending')).toBe(true);
    expect(isLive('seated')).toBe(true);
    expect(isLive('completed')).toBe(false);
  });

  it('gives a status a colour, so the state reads before the word', () => {
    expect(statusTone('seated')).toBe('good');
    expect(statusTone('pending')).toBe('warn');
    expect(statusTone('no_show')).toBe('danger');
  });
});

describe('placing bookings on the grid', () => {
  it('gives every table a row, including the empty ones', () => {
    // A grid showing only busy tables answers "who is coming" while hiding
    // "what is free", and the second is what somebody at the door is asking.
    const { rows } = gridRows(TABLES, [booking()], 90, '2026-09-01');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.bookings).toHaveLength(1);
    expect(rows[1]?.bookings).toEqual([]);
  });

  it('orders a table’s bookings by when they start', () => {
    const { rows } = gridRows(
      TABLES,
      [booking({ id: 'late', localTime: '21:00' }), booking({ id: 'early', localTime: '18:00' })],
      90,
      '2026-09-01',
    );

    expect(rows[0]?.bookings.map((entry) => entry.reservation.id)).toEqual(['early', 'late']);
  });

  it('sets a booking aside rather than dropping it when its table is gone', () => {
    // Still a guest arriving. A grid that silently omitted them would be worse
    // than one with an awkward row at the bottom.
    const { rows, unplaced } = gridRows(TABLES, [booking({ tableNo: null })], 90, '2026-09-01');

    expect(unplaced).toHaveLength(1);
    expect(rows.every((row) => row.bookings.length === 0)).toBe(true);
  });

  it('carries a sitting after midnight past the end of the row', () => {
    // 01:00 on the night of the 1st is 1500, not 60 — to the right of the
    // evening it belongs to, which is where a host looks for it.
    const smallHours = booking({ localTime: '01:00', localDate: '2026-09-02' });
    expect(minutesFromServiceMidnight(smallHours, '2026-09-01')).toBe(25 * 60);

    const { rows } = gridRows(TABLES, [smallHours], 90, '2026-09-01');
    expect(rows[0]?.bookings[0]?.startMinutes).toBe(1500);
  });
});

describe('the grid’s span', () => {
  it('is taken from the book, rounded out to whole hours', () => {
    // A day with two bookings at eight should not be drawn as thirteen empty
    // hours with a mark in it.
    const { rows } = gridRows(TABLES, [booking({ localTime: '19:30' })], 90, '2026-09-01');
    const span = gridSpan(rows.flatMap((row) => row.bookings));

    expect(span).toEqual({ from: 19 * 60, to: 21 * 60 });
  });

  it('has a shape to be empty in', () => {
    expect(gridSpan([])).toEqual({ from: 12 * 60, to: 24 * 60 });
  });

  it('stretches to cover a night that runs past midnight', () => {
    const { rows } = gridRows(
      TABLES,
      [booking({ localTime: '23:30' }), booking({ id: 'r2', localTime: '00:30', localDate: '2026-09-02' })],
      90,
      '2026-09-01',
    );
    const span = gridSpan(rows.flatMap((row) => row.bookings));

    expect(span.to).toBe(26 * 60);
  });

  it('marks every hour across the span', () => {
    expect(hourMarks({ from: 18 * 60, to: 21 * 60 })).toEqual([1080, 1140, 1200, 1260]);
  });

  it('reads a mark past midnight as the hour everybody means', () => {
    expect(clockLabel(25 * 60 + 30)).toBe('01:30');
    expect(clockLabel(19 * 60)).toBe('19:00');
  });
});

describe('drawing a bar', () => {
  const span = { from: 18 * 60, to: 22 * 60 };

  it('places it as a share of the span, not in pixels', () => {
    // So the grid scales with its container rather than with a constant that
    // would need a second copy in the stylesheet.
    const bar = barStyle(
      { reservation: booking(), startMinutes: 19 * 60, endMinutes: 20 * 60 + 30 },
      span,
    );

    expect(bar.left).toBe('25%');
    expect(bar.width).toBe('37.5%');
  });

  it('keeps a bar that overruns the span inside it', () => {
    const bar = barStyle(
      { reservation: booking(), startMinutes: 21 * 60, endMinutes: 25 * 60 },
      span,
    );

    expect(bar.left).toBe('75%');
    expect(Number.parseFloat(bar.width)).toBeLessThanOrEqual(25);
  });
});

describe('moving through the days', () => {
  it('opens on the restaurant’s today, not the browser’s', () => {
    expect(todayInYerevan(new Date('2026-08-10T22:00:00.000Z'))).toBe('2026-08-11');
  });

  it('steps a day either way without falling off a month', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

/**
 * The stage strip, which is the order board's and is counted here rather than
 * by the API — a book is one day and arrives whole, where the board pages
 * through hundreds and has to ask.
 */
describe('the stage strip', () => {
  const day = [
    booking({ id: 'a', status: 'pending', guests: 2 }),
    booking({ id: 'b', status: 'confirmed', guests: 4 }),
    booking({ id: 'c', status: 'confirmed', guests: 6 }),
    booking({ id: 'd', status: 'seated', guests: 3 }),
  ];

  it('counts every stage, and counts all of them under All', () => {
    expect(stageCounts(day)).toEqual({ all: 4, pending: 1, confirmed: 2, seated: 1 });
  });

  it('holds everything under All and only its own under a stage', () => {
    expect(inStage('pending', 'all')).toBe(true);
    expect(inStage('pending', 'pending')).toBe(true);
    expect(inStage('confirmed', 'pending')).toBe(false);
  });

  it('counts an empty book as zero rather than refusing to answer', () => {
    expect(stageCounts([])).toEqual({ all: 0, pending: 0, confirmed: 0, seated: 0 });
  });

  it('admits when the day is bigger than the page it counted', () => {
    // The one thing that makes client-side counts dishonest, so it is said out
    // loud: a tab reading "4" over five bookings is worse than a screen that
    // owns up to showing part of the day.
    expect(bookingsPartial(4, 4)).toBe(false);
    expect(bookingsPartial(50, 63)).toBe(true);
  });
});

describe('what the header and the toolbar say', () => {
  it('counts covers, not bookings — that is what a kitchen preps for', () => {
    expect(
      coversOf([booking({ guests: 2 }), booking({ guests: 6 }), booking({ guests: 1 })]),
    ).toBe(9);
    expect(coversOf([])).toBe(0);
  });

  it('treats the day as context rather than as a filter to clear', () => {
    // Every book is a book of some day, so a "clear" that dropped the date
    // would land on nothing. Only the two pickers narrow.
    expect(hasBookingFilters('', '')).toBe(false);
    expect(hasBookingFilters('r1', '')).toBe(true);
    expect(hasBookingFilters('', 'b1')).toBe(true);
  });
});
