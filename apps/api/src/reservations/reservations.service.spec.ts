import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DEPOSIT_PER_GUEST_AMD,
  DepositOutcome,
  PaymentStatus,
  ReservationStatus,
} from '@amragrir/shared';
import { ReservationsService } from './reservations.service';
import { instantOf, localTimeLabel } from './slots';
import { AvailabilityQueryDto, CreateReservationDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { DepositsService } from '../payments/deposits.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';

/** A date far enough ahead that "in the past" never interferes. */
const DATE = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
const at = (minutes: number) => instantOf(DATE, minutes);

const TABLES = [
  { id: 'table-2', tableNo: '1', seats: 2, isActive: true },
  { id: 'table-4', tableNo: '2', seats: 4, isActive: true },
  { id: 'table-6', tableNo: '4', seats: 6, isActive: true },
];

function branch(over: Record<string, unknown> = {}) {
  return {
    id: BRANCH_ID,
    name: 'Northern Ave',
    address: 'Northern Ave 5',
    openHours: null,
    bookingHours: null,
    tables: TABLES,
    // No stored policy at either level, which is the state every branch is in
    // until somebody opens the settings — so these tests go on describing the
    // platform's numbers, and say so by resolving from nothing.
    bookingPolicy: null,
    restaurant: {
      name: 'Sunny Table',
      reservationsEnabled: true,
      services: ['pickup', 'dinein', 'reserve'],
      bookingPolicy: null,
    },
    ...over,
  };
}

function reservationRow(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    status: ReservationStatus.Confirmed,
    reservedFor: at(19 * 60),
    guests: 2,
    depositAmd: 2 * DEPOSIT_PER_GUEST_AMD,
    depositCredited: false,
    createdAt: new Date(),
    branch: branch(),
    table: { tableNo: '2' },
    payment: {
      id: 'pay-1',
      status: PaymentStatus.Authorized,
      amountAmd: 2 * DEPOSIT_PER_GUEST_AMD,
      providerRef: 'dev_auth_1',
    },
    order: null,
    ...over,
  };
}

function build(
  options: {
    branch?: unknown;
    taken?: unknown[];
    reservation?: unknown;
    closure?: unknown;
  } = {},
) {
  const created = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(reservationRow({ ...data, status: ReservationStatus.Pending })),
  );
  const updated = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(reservationRow(data)),
  );
  const paymentUpdate = jest.fn().mockResolvedValue({});

  const prisma = {
    restaurantBranch: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? branch() : options.branch),
      findUnique: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? branch() : options.branch),
    },
    reservation: {
      findMany: jest.fn().mockResolvedValue(options.taken ?? []),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reservation === undefined ? reservationRow() : options.reservation,
        ),
      count: jest.fn().mockResolvedValue(0),
      create: created,
      update: updated,
    },
    payment: { update: paymentUpdate },
    // No dated exception on the day being asked about — the ordinary case, and
    // the one that leaves the weekly hours in charge.
    branchClosure: { findUnique: jest.fn().mockResolvedValue(options.closure ?? null) },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          reservation: { findMany: jest.fn().mockResolvedValue(options.taken ?? []), create: created, update: updated },
          payment: { update: paymentUpdate },
        }),
      ),
    ),
  } as unknown as PrismaService;

  const deposits = {
    authorize: jest.fn().mockResolvedValue({ providerRef: 'dev_auth_1' }),
    release: jest.fn().mockResolvedValue(undefined),
    settle: jest.fn().mockResolvedValue(PaymentStatus.Cancelled),
  };

  return {
    service: new ReservationsService(prisma, deposits as unknown as DepositsService),
    prisma,
    deposits,
    created,
    updated,
  };
}

const availabilityQuery = (guests: number): AvailabilityQueryDto =>
  Object.assign(new AvailabilityQueryDto(), { date: DATE, guests });

const createDto = (over: Partial<CreateReservationDto> = {}): CreateReservationDto =>
  Object.assign(new CreateReservationDto(), {
    branchId: BRANCH_ID,
    reservedFor: at(19 * 60).toISOString(),
    guests: 2,
    depositMethod: 'card',
    ...over,
  });

describe('availability', () => {
  it('answers per party size, not in the abstract', async () => {
    // Only the six-seater fits a party of six, so a booking on it removes the
    // slot for six while two can still be seated elsewhere.
    const { service } = build({
      taken: [{ tableId: 'table-6', reservedFor: at(19 * 60) }],
    });

    const forSix = await service.availability(BRANCH_ID, availabilityQuery(6));
    const forTwo = await service.availability(BRANCH_ID, availabilityQuery(2));

    expect(forSix.slots.find((slot) => slot.time === '19:00')?.available).toBe(false);
    expect(forTwo.slots.find((slot) => slot.time === '19:00')?.available).toBe(true);
  });

  it('blocks the slots a seating overlaps, not only its start', async () => {
    const { service } = build({
      taken: TABLES.map((table) => ({ tableId: table.id, reservedFor: at(19 * 60) })),
    });

    const result = await service.availability(BRANCH_ID, availabilityQuery(2));
    const busy = (time: string) => result.slots.find((slot) => slot.time === time)?.available;

    expect(busy('19:00')).toBe(false);
    expect(busy('19:30')).toBe(false);
    expect(busy('20:00')).toBe(false);
    // 90 minutes after 19:00 the table is free again.
    expect(busy('20:30')).toBe(true);
  });

  it('quotes the deposit for the party being asked about', async () => {
    const { service } = build();
    const result = await service.availability(BRANCH_ID, availabilityQuery(4));
    expect(result.depositAmd).toBe(4 * DEPOSIT_PER_GUEST_AMD);
  });

  it('returns no times when the restaurant does not take bookings', async () => {
    const { service } = build({
      branch: branch({
        restaurant: { name: 'Greenhouse', reservationsEnabled: false, services: ['pickup'] },
      }),
    });

    const result = await service.availability(BRANCH_ID, availabilityQuery(2));
    expect(result.slots).toEqual([]);
    expect(result.reservationsEnabled).toBe(false);
  });

  it('returns no times for a party larger than any table', async () => {
    const { service } = build();
    const result = await service.availability(BRANCH_ID, availabilityQuery(10));

    expect(result.slots).toEqual([]);
    expect(result.maxSeats).toBe(6);
  });

  it('never offers a slot in the past', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { service } = build();

    const result = await service.availability(
      BRANCH_ID,
      Object.assign(new AvailabilityQueryDto(), { date: today, guests: 2 }),
    );

    result.slots
      .filter((slot) => new Date(slot.at).getTime() < Date.now())
      .forEach((slot) => expect(slot.available).toBe(false));
  });
});

describe('create', () => {
  it('picks the smallest table that fits, so a pair does not take the six-seater', async () => {
    const { service, created } = build();
    await service.create('user-1', createDto({ guests: 2 }));

    expect(created.mock.calls[0][0].data.tableId).toBe('table-2');
  });

  it('computes the deposit itself — the request carries no amount', async () => {
    const { service, created, deposits } = build();
    await service.create('user-1', createDto({ guests: 4 }));

    expect(deposits.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ amountAmd: 4 * DEPOSIT_PER_GUEST_AMD }),
    );
    expect(created.mock.calls[0][0].data.depositAmd).toBe(4 * DEPOSIT_PER_GUEST_AMD);
  });

  it('holds the deposit rather than charging it', async () => {
    // A guest who cancels in time must never have had the money taken.
    const { service, deposits } = build();
    await service.create('user-1', createDto());

    expect(deposits.authorize).toHaveBeenCalled();
  });

  it('sets activeSlot so the table is exclusive', async () => {
    const { service, created } = build();
    await service.create('user-1', createDto());

    const data = created.mock.calls[0][0].data;
    expect(data.activeSlot).toEqual(data.reservedFor);
  });

  it('releases the hold when the table turns out to be gone', async () => {
    // Otherwise a failed booking would leave money held against nothing.
    const { service, deposits } = build({
      taken: TABLES.map((table) => ({ tableId: table.id, reservedFor: at(19 * 60) })),
    });

    await expect(service.create('user-1', createDto())).rejects.toThrow(ConflictException);
    expect(deposits.release).toHaveBeenCalledWith('dev_auth_1');
  });

  it('rejects a time between slots', async () => {
    const { service, deposits } = build();

    await expect(
      service.create('user-1', createDto({ reservedFor: at(19 * 60 + 7).toISOString() })),
    ).rejects.toThrow(UnprocessableEntityException);
    // Nothing was held for a booking that was never legal.
    expect(deposits.authorize).not.toHaveBeenCalled();
  });

  it('rejects a time in the past', async () => {
    const { service } = build();
    const past = new Date(Date.now() - 86_400_000);
    past.setUTCMinutes(0, 0, 0);

    await expect(
      service.create('user-1', createDto({ reservedFor: past.toISOString() })),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a restaurant that does not take bookings', async () => {
    const { service } = build({
      branch: branch({
        restaurant: { name: 'Greenhouse', reservationsEnabled: false, services: ['pickup'] },
      }),
    });

    await expect(service.create('user-1', createDto())).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects a party no table can seat', async () => {
    const { service } = build();
    await expect(service.create('user-1', createDto({ guests: 10 }))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('404s for an unknown branch', async () => {
    const { service } = build({ branch: null });
    await expect(service.create('user-1', createDto())).rejects.toThrow(NotFoundException);
  });

  it('snapshots the seating it was made under', async () => {
    // So that lengthening the branch's seating tomorrow cannot retrospectively
    // stretch a booking somebody already has, and cannot make two that fitted
    // an hour apart start overlapping on the same table.
    const { service, created } = build({
      branch: branch({ bookingPolicy: { seatingMinutes: 120 } }),
    });
    await service.create('user-1', createDto());

    expect(created.mock.calls[0][0].data.seatingMinutes).toBe(120);
  });

  it('confirms itself once the deposit is held', async () => {
    // The guest has had money held and the server has already picked their
    // table; `pending` would mean "we have your money and have not said yes".
    const { service, created } = build();
    await service.create('user-1', createDto());

    expect(created.mock.calls[0][0].data.status).toBe(ReservationStatus.Confirmed);
  });

  it('waits for a human where the branch asked to read every booking', async () => {
    const { service, created } = build({
      branch: branch({ bookingPolicy: { autoConfirm: false } }),
    });
    await service.create('user-1', createDto());

    expect(created.mock.calls[0][0].data.status).toBe(ReservationStatus.Pending);
  });

  it('honours the branch’s party cap, which is not the size of its tables', async () => {
    // Six people fit the six-seater, so the furniture is not the objection —
    // the house is. The two refusals say different things for that reason.
    const { service } = build({ branch: branch({ bookingPolicy: { maxGuests: 4 } }) });

    await expect(service.create('user-1', createDto({ guests: 6 }))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lets a branch take a party far larger than the platform’s default', async () => {
    // The banquet hall: one "table" seating a hundred, and a cap raised to
    // match. Nothing else about the booking path changes.
    const { service, created } = build({
      branch: branch({
        bookingPolicy: { maxGuests: 120 },
        tables: [...TABLES, { id: 'table-hall', tableNo: 'Hall', seats: 100, isActive: true }],
      }),
    });

    await service.create('user-1', createDto({ guests: 80 }));
    expect(created.mock.calls[0][0].data.tableId).toBe('table-hall');
  });

  it('refuses a booking made with less notice than the branch asks for', async () => {
    // A table claimed a minute before the guest walks in is not a booking, it
    // is a surprise for whoever is on the door. The notice is expressed as ten
    // days here purely so the test is about the rule rather than about what
    // time of day it happens to run — `DATE` is five days out, and otherwise a
    // perfectly ordinary 19:00 slot.
    const { service, deposits } = build({
      branch: branch({ bookingPolicy: { minLeadMinutes: 10 * 24 * 60 } }),
    });

    await expect(service.create('user-1', createDto())).rejects.toThrow(
      UnprocessableEntityException,
    );
    // Nothing was held for a booking that was never legal.
    expect(deposits.authorize).not.toHaveBeenCalled();
  });

  it('lets a branch take walk-up bookings by asking for no notice at all', async () => {
    // Zero has to be a real answer rather than reading as "inherit the hour",
    // which is the whole reason the resolver uses `??` and not `||`.
    const { service, created } = build({
      branch: branch({ bookingPolicy: { minLeadMinutes: 0 } }),
    });

    await service.create('user-1', createDto());
    expect(created).toHaveBeenCalled();
  });
});

describe('cancel', () => {
  it('refunds when cancelled outside the cutoff', async () => {
    const { service, deposits } = build({
      reservation: reservationRow({
        reservedFor: new Date(Date.now() + 5 * 3_600_000),
      }),
    });

    await service.cancel('user-1', 'res-1');
    expect(deposits.settle).toHaveBeenCalledWith(expect.anything(), DepositOutcome.Refund);
  });

  it('keeps the deposit when cancelled too late', async () => {
    // The table was held and could not be resold.
    const { service, deposits } = build({
      reservation: reservationRow({
        reservedFor: new Date(Date.now() + 30 * 60_000),
      }),
    });

    await service.cancel('user-1', 'res-1');
    expect(deposits.settle).toHaveBeenCalledWith(expect.anything(), DepositOutcome.Capture);
  });

  it('frees the slot so the table can be rebooked', async () => {
    // Regression: keying uniqueness on reservedFor would have blocked this
    // table and time forever once anyone cancelled.
    const { service, updated } = build();
    await service.cancel('user-1', 'res-1');

    expect(updated.mock.calls[0][0].data.activeSlot).toBeNull();
  });

  it('refuses once the guest has been seated', async () => {
    const { service } = build({
      reservation: reservationRow({ status: ReservationStatus.Seated }),
    });

    await expect(service.cancel('user-1', 'res-1')).rejects.toThrow(UnprocessableEntityException);
  });

  it('scopes the lookup to the caller', async () => {
    const { service, prisma } = build();
    await service.cancel('user-1', 'res-1');

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res-1', userId: 'user-1' } }),
    );
  });

  it("404s on someone else's booking", async () => {
    const { service } = build({ reservation: null });
    await expect(service.cancel('user-1', 'res-1')).rejects.toThrow(NotFoundException);
  });

  it('matches on the status it read, so a race loses instead of overwriting', async () => {
    const { service, updated } = build();
    await service.cancel('user-1', 'res-1');

    expect(updated.mock.calls[0][0].where).toEqual({
      id: 'res-1',
      status: ReservationStatus.Confirmed,
    });
  });
});

describe('detail', () => {
  it('reports the local time a guest actually booked', async () => {
    const { service } = build();
    const detail = await service.findOne('user-1', 'res-1');

    expect(detail.localTime).toBe(localTimeLabel(at(19 * 60)));
    expect(detail.tableNo).toBe('2');
  });
});
