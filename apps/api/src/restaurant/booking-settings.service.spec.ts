import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  PLATFORM_BOOKING_POLICY,
  ReservationStatus,
  StaffRole,
} from '@amragrir/shared';
import { BookingSettingsService } from './booking-settings.service';
import { instantOf } from '../reservations/slots';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const RESTAURANT_ID = '22222222-2222-4222-8222-222222222222';

const TABLES = [
  { id: 'table-2', branchId: BRANCH_ID, tableNo: '2', seats: 2, zone: 'hall', isActive: true },
  { id: 'table-6', branchId: BRANCH_ID, tableNo: '10', seats: 6, zone: 'terrace', isActive: true },
];

const STAFF: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantAdmin, restaurantId: RESTAURANT_ID, branchId: null }],
};

function branch(over: Record<string, unknown> = {}) {
  return {
    id: BRANCH_ID,
    restaurantId: RESTAURANT_ID,
    openHours: null,
    bookingHours: null,
    bookingPolicy: null,
    tables: TABLES,
    services: [],
    servicesOverridden: false,
    reservationsEnabled: null,
    coverUrl: null,
    restaurant: {
      id: RESTAURANT_ID,
      coverUrl: null,
      services: ['pickup', 'reserve'],
      reservationsEnabled: true,
      bookingPolicy: null,
    },
    ...over,
  };
}

function build(
  options: {
    branch?: unknown;
    restaurant?: unknown;
    table?: unknown;
    bookings?: unknown[];
    closures?: unknown[];
    closure?: unknown;
    createRejects?: unknown;
  } = {},
) {
  const record = jest.fn().mockResolvedValue(undefined);
  const policyUpsert = jest
    .fn()
    .mockImplementation(({ create, update }: { create: object; update: object }) =>
      Promise.resolve({ id: 'policy-1', ...create, ...update }),
    );
  const tableCreate = options.createRejects
    ? jest.fn().mockRejectedValue(options.createRejects)
    : jest.fn().mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 'table-new', zone: null, isActive: true, ...data }),
      );
  const tableUpdate = jest.fn().mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ ...TABLES[0], ...data }),
  );
  const closureCreate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'closure-1', opensMinutes: null, closesMinutes: null, ...data }),
    );
  const branchUpdate = jest.fn().mockResolvedValue({});

  const client = {
    table: { create: tableCreate, update: tableUpdate },
    branchClosure: { create: closureCreate, delete: jest.fn().mockResolvedValue({}) },
    bookingPolicy: { upsert: policyUpsert },
    restaurantBranch: { update: branchUpdate },
    auditLog: { create: jest.fn() },
  };

  const prisma = {
    ...client,
    restaurantBranch: {
      ...client.restaurantBranch,
      findFirst: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? branch() : options.branch),
    },
    restaurant: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.restaurant === undefined
            ? { id: RESTAURANT_ID, bookingPolicy: null }
            : options.restaurant,
        ),
    },
    table: {
      ...client.table,
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.table === undefined
            ? { ...TABLES[0], branch: branch() }
            : options.table,
        ),
    },
    branchClosure: {
      ...client.branchClosure,
      findMany: jest.fn().mockResolvedValue(options.closures ?? []),
      findUnique: jest.fn().mockResolvedValue(options.closure ?? null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    reservation: {
      findMany: jest.fn().mockResolvedValue(options.bookings ?? []),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(client))),
  } as unknown as PrismaService;

  const audit = { record } as unknown as AuditService;
  return { service: new BookingSettingsService(prisma, audit), prisma, record, policyUpsert };
}

/** A live booking as `futureBookings` shapes it. */
function futureBooking(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    reservedFor: instantOf('2099-09-01', 19 * 60),
    guests: 2,
    tableId: 'table-2',
    table: { tableNo: '2' },
    user: { name: 'Ani' },
    status: ReservationStatus.Confirmed,
    ...over,
  };
}

describe('reading a policy', () => {
  it('answers with what was decided, what is inherited, and what is in force', async () => {
    // Three sets rather than one number, so a form can grey out an inherited
    // value instead of showing a figure a manager cannot tell from a decision.
    const { service } = build({
      branch: branch({
        bookingPolicy: { seatingMinutes: 120 },
        restaurant: { ...branch().restaurant, bookingPolicy: { maxGuests: 40 } },
      }),
    });

    const view = await service.branchPolicy(STAFF, BRANCH_ID);

    expect(view.own.seatingMinutes).toBe(120);
    expect(view.own.maxGuests).toBeNull();
    expect(view.inherited.seatingMinutes).toBe(PLATFORM_BOOKING_POLICY.seatingMinutes);
    expect(view.inherited.maxGuests).toBe(40);
    expect(view.effective.seatingMinutes).toBe(120);
    expect(view.effective.maxGuests).toBe(40);
    expect(view.sources.seatingMinutes).toBe('branch');
    expect(view.sources.maxGuests).toBe('restaurant');
    expect(view.sources.slotMinutes).toBe('platform');
  });

  it('ships the bounds the form must obey, so the two cannot disagree', async () => {
    const { service } = build();
    const view = await service.branchPolicy(STAFF, BRANCH_ID);
    expect(view.limits.maxGuests.max).toBeGreaterThanOrEqual(100);
  });

  it('404s a branch outside the caller’s reach', async () => {
    // The scope filter is part of the query, so a branch somebody may not touch
    // is a branch that does not exist — a 403 would confirm it does.
    const { service } = build({ branch: null });
    await expect(service.branchPolicy(STAFF, BRANCH_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('writing a policy', () => {
  it('writes only the fields the request carried', async () => {
    const { service, policyUpsert } = build();
    await service.setBranchPolicy(STAFF, BRANCH_ID, { seatingMinutes: 120 });

    expect(policyUpsert.mock.calls[0][0].update).toEqual({ seatingMinutes: 120 });
  });

  it('carries an explicit null through, because that is how an override is undone', async () => {
    const { service, policyUpsert } = build({
      branch: branch({ bookingPolicy: { seatingMinutes: 120 } }),
    });
    await service.setBranchPolicy(STAFF, BRANCH_ID, { seatingMinutes: null });

    expect(policyUpsert.mock.calls[0][0].update).toEqual({ seatingMinutes: null });
  });

  it('writes no audit entry for a request that moved nothing', async () => {
    // A form that submits every field re-sends the numbers nobody touched, and
    // "changed the seating from 90 to 90" is the noise that hides real changes.
    const { service, record } = build({
      branch: branch({ bookingPolicy: { seatingMinutes: 120 } }),
    });
    await service.setBranchPolicy(STAFF, BRANCH_ID, { seatingMinutes: 120 });

    expect(record).not.toHaveBeenCalled();
  });

  it('never checks for conflicts, because no number here can strand a booking', async () => {
    // The seating, the deposit and the cancellation window are snapshotted onto
    // each booking; the rest describe what is offered next. Nothing to break,
    // so nothing to warn about — and no warning to train people to click past.
    const { service, prisma } = build({ bookings: [futureBooking()] });
    await service.setBranchPolicy(STAFF, BRANCH_ID, { maxGuests: 1, seatingMinutes: 480 });

    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });

  it('records a restaurant-level change against the restaurant, not one address', async () => {
    const { service, record } = build();
    await service.setRestaurantPolicy(STAFF, RESTAURANT_ID, { depositPerGuestAmd: 5000 });

    expect(record.mock.calls[0][2]).toMatchObject({
      action: AuditAction.BookingPolicy,
      scope: { restaurantId: RESTAURANT_ID },
    });
    expect(record.mock.calls[0][2].scope.branchId).toBeUndefined();
  });
});

describe('tables', () => {
  it('refuses a second table with the same number in one room', async () => {
    // The real driver's error, so the service's `instanceof` check is the thing
    // under test rather than a lookalike.
    const duplicate = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '6.3.0',
    });

    const { service } = build({ createRejects: duplicate });

    await expect(
      service.createTable(STAFF, BRANCH_ID, { tableNo: '2', seats: 4 }),
    ).rejects.toThrow(ConflictException);
  });

  it('warns before a table is switched off under a live booking', async () => {
    const { service } = build({ bookings: [futureBooking()] });

    await expect(
      service.updateTable(STAFF, 'table-2', { isActive: false }),
    ).rejects.toThrow(ConflictException);
  });

  it('goes ahead once told to, and still cancels nothing', async () => {
    const { service, prisma } = build({ bookings: [futureBooking()] });

    await service.updateTable(STAFF, 'table-2', { isActive: false }, true);

    // The table moved; not one booking was touched.
    expect(prisma.table.update).toHaveBeenCalled();
    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });

  it('does not ask about a rename, which cannot strand anybody', async () => {
    const { service, prisma } = build({ bookings: [futureBooking()] });
    await service.updateTable(STAFF, 'table-2', { tableNo: '7' });

    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });

  it('records switching a table off as a deletion, which is what it is', async () => {
    const { service, record } = build();
    await service.updateTable(STAFF, 'table-2', { isActive: false }, true);

    expect(record.mock.calls[0][2].action).toBe(AuditAction.TableDelete);
  });
});

describe('booking hours', () => {
  it('refuses a document it could not read back', async () => {
    // `open_hours` is parsed forgivingly because nothing validates that column.
    // A form is a different matter: somebody who types 10:0 is told, rather than
    // silently given the platform default at dinner time.
    const { service } = build();

    await expect(
      service.setBookingHours(STAFF, BRANCH_ID, { mon: { open: '10:0', close: '23:00' } }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('accepts a shut day as an answer', async () => {
    const { service } = build();
    await expect(
      service.setBookingHours(STAFF, BRANCH_ID, { sun: { closed: true } }),
    ).resolves.toMatchObject({ bookingHours: { sun: { closed: true } } });
  });

  it('warns when narrowing the hours would strand a sitting', async () => {
    const { service } = build({ bookings: [futureBooking()] });

    await expect(
      service.setBookingHours(STAFF, BRANCH_ID, { default: { open: '10:00', close: '17:00' } }),
    ).rejects.toThrow(ConflictException);
  });

  it('hands the question back to the kitchen’s hours on null', async () => {
    const { service } = build();
    await expect(service.setBookingHours(STAFF, BRANCH_ID, null)).resolves.toEqual({
      bookingHours: null,
    });
  });
});

describe('closed days', () => {
  it('warns before closing a day that already has bookings on it', async () => {
    const { service } = build({ bookings: [futureBooking()] });

    await expect(
      service.createClosure(STAFF, BRANCH_ID, { date: '2099-09-01', kind: 'closed' }),
    ).rejects.toThrow(ConflictException);
  });

  it('closes a day nobody has booked without a word', async () => {
    const { service } = build({ bookings: [futureBooking()] });

    await expect(
      service.createClosure(STAFF, BRANCH_ID, {
        date: '2099-09-02',
        kind: 'closed',
        reason: 'Private hire',
      }),
    ).resolves.toMatchObject({ date: '2099-09-02', reason: 'Private hire' });
  });
});

describe('preview', () => {
  it('says what the settings would actually offer', async () => {
    const { service } = build();
    const preview = await service.preview(STAFF, BRANCH_ID, { date: '2099-09-01', guests: 4 });

    expect(preview.opens).toBe('10:00');
    expect(preview.closes).toBe('23:00');
    expect(preview.firstSlot).toBe('10:00');
    expect(preview.lastSlot).toBe('21:30');
    expect(preview.slotCount).toBeGreaterThan(0);
    expect(preview.maxSeats).toBe(6);
  });

  it('says a closed day is closed, and why', async () => {
    const { service } = build({
      closure: { kind: 'closed', opensMinutes: null, closesMinutes: null, reason: 'Renovation' },
    });
    const preview = await service.preview(STAFF, BRANCH_ID, { date: '2099-09-01', guests: 2 });

    expect(preview.opens).toBeNull();
    expect(preview.slotCount).toBe(0);
    expect(preview.closureReason).toBe('Renovation');
  });

  it('shows an evening too short for a seating as no times at all', async () => {
    // The mistake this screen exists to catch: a two-hour seating in a
    // ninety-minute window produces an empty calendar and no error anywhere.
    const { service } = build({
      branch: branch({
        bookingHours: { default: { open: '18:00', close: '19:30' } },
        bookingPolicy: { seatingMinutes: 120 },
      }),
    });
    const preview = await service.preview(STAFF, BRANCH_ID, { date: '2099-09-01', guests: 2 });

    expect(preview.slotCount).toBe(0);
    expect(preview.opens).toBe('18:00');
  });
});
