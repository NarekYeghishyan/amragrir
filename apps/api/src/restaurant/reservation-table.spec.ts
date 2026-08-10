import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction, ReservationStatus, StaffRole } from '@amragrir/shared';
import { RestaurantReservationsService } from './reservations.service';
import { instantOf } from '../reservations/slots';
import { ReservationsService } from '../reservations/reservations.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { DepositsService } from '../payments/deposits.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/**
 * Moving a booking to a different table by hand.
 *
 * The one place a person overrides the automatic assignment, which picks the
 * smallest table that fits — right for filling a room, and wrong about once an
 * evening.
 */

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const RESTAURANT_ID = '22222222-2222-4222-8222-222222222222';

const STAFF: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantAdmin, restaurantId: RESTAURANT_ID, branchId: null }],
};

function reservation(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    branchId: BRANCH_ID,
    status: ReservationStatus.Confirmed,
    reservedFor: instantOf('2099-09-01', 19 * 60),
    guests: 4,
    tableId: 'table-4',
    seatingMinutes: 90,
    freeCancelHours: 2,
    depositAmd: 8000,
    depositCredited: false,
    createdAt: new Date(),
    table: { tableNo: '4' },
    payment: null,
    order: null,
    branch: {
      id: BRANCH_ID,
      restaurantId: RESTAURANT_ID,
      name: 'Northern Ave',
      address: null,
      bookingPolicy: null,
      restaurant: { name: 'Sunny Table', bookingPolicy: null },
    },
    ...over,
  };
}

function build(
  options: { reservation?: unknown; table?: unknown; taken?: unknown[] } = {},
) {
  const record = jest.fn().mockResolvedValue(undefined);
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(reservation({ ...data, table: { tableNo: '11' } })),
    );

  const prisma = {
    reservation: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reservation === undefined ? reservation() : options.reservation,
        ),
      findMany: jest.fn().mockResolvedValue(options.taken ?? []),
      update,
      count: jest.fn().mockResolvedValue(0),
    },
    table: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.table === undefined
            ? { id: 'table-11', tableNo: '11', seats: 6, branchId: BRANCH_ID, isActive: true }
            : options.table,
        ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          reservation: { findMany: jest.fn().mockResolvedValue(options.taken ?? []), update },
          auditLog: { create: jest.fn() },
        }),
      ),
    ),
  } as unknown as PrismaService;

  const reservations = new ReservationsService(prisma, {} as unknown as DepositsService);
  const audit = { record } as unknown as AuditService;

  return {
    service: new RestaurantReservationsService(prisma, reservations, audit),
    prisma,
    record,
    update,
  };
}

describe('moving a booking to another table', () => {
  it('moves it when the table is free and big enough', async () => {
    const { service, update } = build();
    await service.setTable(STAFF, 'res-1', { tableId: 'table-11' });

    expect(update.mock.calls[0][0].data).toEqual({ tableId: 'table-11' });
  });

  it('leaves the guest, the time and the money exactly alone', async () => {
    // Furniture, not a renegotiation.
    const { service, update } = build();
    await service.setTable(STAFF, 'res-1', { tableId: 'table-11' });

    expect(Object.keys(update.mock.calls[0][0].data)).toEqual(['tableId']);
  });

  it('records the move by table number, not by id', async () => {
    // A year later "moved from 4 to 11" is readable and a pair of UUIDs is not.
    const { service, record } = build();
    await service.setTable(STAFF, 'res-1', { tableId: 'table-11' });

    expect(record.mock.calls[0][2]).toMatchObject({
      action: AuditAction.ReservationTable,
      before: { tableNo: '4' },
      after: { tableNo: '11' },
    });
  });

  it('refuses a table that does not seat the party', async () => {
    const { service } = build({
      table: { id: 'table-2', tableNo: '2', seats: 2, branchId: BRANCH_ID, isActive: true },
    });

    await expect(service.setTable(STAFF, 'res-1', { tableId: 'table-2' })).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses a table that is taken for that seating', async () => {
    const { service } = build({
      taken: [{ reservedFor: instantOf('2099-09-01', 19 * 60 + 30), seatingMinutes: 90 }],
    });

    await expect(service.setTable(STAFF, 'res-1', { tableId: 'table-11' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows a table whose earlier sitting has finished', async () => {
    const { service, update } = build({
      taken: [{ reservedFor: instantOf('2099-09-01', 17 * 60), seatingMinutes: 90 }],
    });

    await service.setTable(STAFF, 'res-1', { tableId: 'table-11' });
    expect(update).toHaveBeenCalled();
  });

  it('measures the table’s other bookings by their own seating', async () => {
    // The earlier one was taken when the branch held tables for three hours, so
    // it is still sitting at 19:00 even though today's seating is ninety
    // minutes. Measuring it by today's number would seat two parties at one
    // table.
    const { service } = build({
      taken: [{ reservedFor: instantOf('2099-09-01', 17 * 60), seatingMinutes: 180 }],
    });

    await expect(service.setTable(STAFF, 'res-1', { tableId: 'table-11' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('404s a table from another branch rather than admitting it exists', async () => {
    const { service } = build({ table: null });

    await expect(service.setTable(STAFF, 'res-1', { tableId: 'table-11' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to move a booking that is over', async () => {
    const { service } = build({
      reservation: reservation({ status: ReservationStatus.Cancelled }),
    });

    await expect(service.setTable(STAFF, 'res-1', { tableId: 'table-11' })).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('writes nothing when the booking is already at that table', async () => {
    // Re-saving where somebody already sits would put a line in the audit feed
    // saying nothing happened.
    const { service, update, record } = build({
      reservation: reservation({ tableId: 'table-11' }),
    });

    await service.setTable(STAFF, 'res-1', { tableId: 'table-11' });
    expect(update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

/**
 * Which day a booking is filed under.
 *
 * The book asked for `reserved_for` between local midnight and local midnight,
 * which is right for every branch that shuts before midnight and wrong in the
 * one case the whole past-midnight machinery exists for: a branch open
 * 12:00–02:00 offers 00:30 as the last start of *Tuesday's* evening, and that
 * instant's own calendar date is Wednesday. Those guests went onto Wednesday's
 * page — where the shift still working at 00:30 never looked.
 */
describe('the book for a service', () => {
  const listing = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      reservation: { findMany, count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const service = new RestaurantReservationsService(
      prisma,
      new ReservationsService(prisma, {} as unknown as DepositsService),
      { record: jest.fn() } as unknown as AuditService,
    );
    return { service, findMany };
  };

  it('asks for the service day, not a range of instants', async () => {
    const { service, findMany } = listing();
    await service.list(STAFF, { branchId: BRANCH_ID, date: '2026-08-12', page: 1, limit: 50 });

    const { where } = findMany.mock.calls[0][0];
    // A DATE column is a calendar square, addressed at midnight UTC — building
    // it any other way lands four hours off in Yerevan and reads back as the
    // 11th.
    expect(where.serviceDate).toEqual(new Date('2026-08-12T00:00:00.000Z'));
    // The old filter, gone: a 00:30 booking taken for Tuesday night has a
    // Wednesday `reserved_for` and no instant range on Tuesday can hold it.
    expect(where.reservedFor).toBeUndefined();
  });

  it('leaves the day open when none was asked for', async () => {
    const { service, findMany } = listing();
    await service.list(STAFF, { branchId: BRANCH_ID, page: 1, limit: 50 });

    expect(findMany.mock.calls[0][0].where.serviceDate).toBeUndefined();
  });
});
