import { PLATFORM_BOOKING_POLICY, resolveBookingPolicy } from '@amragrir/shared';
import { instantOf } from '../reservations/slots';
import {
  ConflictReason,
  bookingConflicts,
  type BookingSetup,
  type BookingUnderReview,
} from './booking-conflicts';

/**
 * What counts as a conflict, and — just as much — what does not.
 *
 * The second half is the one worth guarding. A check that flags every booking a
 * narrowed setting would no longer *sell* produces a warning on every save, and
 * a warning that is always there is a warning nobody reads.
 */

const TABLES = [
  { id: 'table-2', tableNo: '1', seats: 2, isActive: true },
  { id: 'table-6', tableNo: '2', seats: 6, isActive: true },
];

function setup(over: Partial<BookingSetup> = {}): BookingSetup {
  return {
    openHours: { default: { open: '10:00', close: '23:00' } },
    bookingHours: null,
    policy: PLATFORM_BOOKING_POLICY,
    tables: TABLES,
    closureFor: () => null,
    ...over,
  };
}

function booking(over: Partial<BookingUnderReview> = {}): BookingUnderReview {
  return {
    id: 'res-1',
    reservedFor: instantOf('2026-09-01', 19 * 60),
    guests: 2,
    tableId: 'table-2',
    tableNo: '1',
    customerName: 'Ani',
    ...over,
  };
}

describe('what breaks a booking', () => {
  it('flags a table that has been switched off', () => {
    const tables = TABLES.map((table) =>
      table.id === 'table-2' ? { ...table, isActive: false } : table,
    );
    const [conflict] = bookingConflicts(setup({ tables }), [booking()]);

    expect(conflict?.reason).toBe(ConflictReason.TableGone);
    // Named by table and time rather than by id: somebody has to ring these
    // people, and a UUID is no help doing it.
    expect(conflict?.tableNo).toBe('1');
    expect(conflict?.localTime).toBe('19:00');
    expect(conflict?.customerName).toBe('Ani');
  });

  it('flags a table shrunk below the party', () => {
    const tables = TABLES.map((table) =>
      table.id === 'table-6' ? { ...table, seats: 4 } : table,
    );
    const conflicts = bookingConflicts(setup({ tables }), [
      booking({ tableId: 'table-6', guests: 6 }),
    ]);

    expect(conflicts[0]?.reason).toBe(ConflictReason.TableTooSmall);
  });

  it('flags a day that has been closed', () => {
    const conflicts = bookingConflicts(
      setup({ closureFor: () => ({ kind: 'closed', opensMinutes: null, closesMinutes: null }) }),
      [booking()],
    );

    expect(conflicts[0]?.reason).toBe(ConflictReason.DayClosed);
  });

  it('flags a sitting that falls outside the new hours', () => {
    const conflicts = bookingConflicts(
      setup({ bookingHours: { default: { open: '10:00', close: '17:00' } } }),
      [booking()],
    );

    expect(conflicts[0]?.reason).toBe(ConflictReason.OutsideHours);
  });

  it('flags a sitting outside hours a dated exception imposed', () => {
    const conflicts = bookingConflicts(
      setup({
        closureFor: () => ({ kind: 'custom_hours', opensMinutes: 600, closesMinutes: 900 }),
      }),
      [booking()],
    );

    expect(conflicts[0]?.reason).toBe(ConflictReason.OutsideHours);
  });

  it('reports the earliest first, because that is the one to ring about', () => {
    const conflicts = bookingConflicts(setup({ tables: [] }), [
      booking({ id: 'late', reservedFor: instantOf('2026-09-03', 20 * 60) }),
      booking({ id: 'early', reservedFor: instantOf('2026-09-01', 20 * 60) }),
    ]);

    expect(conflicts.map((entry) => entry.reservationId)).toEqual(['early', 'late']);
  });
});

describe('what deliberately does not break a booking', () => {
  it('says nothing when the setup still honours everything', () => {
    expect(bookingConflicts(setup(), [booking()])).toEqual([]);
  });

  it('ignores a slot grid the booking no longer lands on', () => {
    // Narrowing the grid from ten minutes to thirty would otherwise report
    // every 19:10 and 19:20 in the book. The table is there, the door is open,
    // the guest is coming: nothing is broken.
    const policy = resolveBookingPolicy({ slotMinutes: 30 }, null);
    const offGrid = booking({ reservedFor: instantOf('2026-09-01', 19 * 60 + 10) });

    expect(bookingConflicts(setup({ policy }), [offGrid])).toEqual([]);
  });

  it('ignores a party over a cap that has since been lowered', () => {
    // The branch will not *sell* a six from tomorrow. It can still seat this
    // one, which is the only question here.
    const policy = resolveBookingPolicy({ maxGuests: 4 }, null);

    expect(
      bookingConflicts(setup({ policy }), [booking({ tableId: 'table-6', guests: 6 })]),
    ).toEqual([]);
  });

  it('ignores a booking beyond a shortened horizon', () => {
    const policy = resolveBookingPolicy({ maxLeadDays: 1 }, null);
    const distant = booking({ reservedFor: instantOf('2027-01-01', 19 * 60) });

    expect(bookingConflicts(setup({ policy }), [distant])).toEqual([]);
  });

  it('ignores a lengthened seating, which the booking’s own snapshot survives', () => {
    const policy = resolveBookingPolicy({ seatingMinutes: 240 }, null);
    expect(bookingConflicts(setup({ policy }), [booking()])).toEqual([]);
  });
});

describe('a night that runs past midnight', () => {
  const late = setup({ bookingHours: { default: { open: '18:00', close: '02:00' } } });

  it('keeps a 01:00 sitting inside the evening it belongs to', () => {
    // Measured against the day the shift started. Compared with the calendar
    // day it falls on, 01:00 is seven hours before opening and would read as a
    // conflict on every single save.
    const smallHours = booking({ reservedFor: instantOf('2026-09-02', 60) });
    expect(bookingConflicts(late, [smallHours])).toEqual([]);
  });

  it('still flags an hour the branch is genuinely shut', () => {
    const midMorning = booking({ reservedFor: instantOf('2026-09-02', 11 * 60) });
    expect(bookingConflicts(late, [midMorning])[0]?.reason).toBe(ConflictReason.OutsideHours);
  });
});
