import { ReservationStatus, StaffRole } from '@amragrir/shared';
import { RestaurantReservationsService } from './reservations.service';
import { instantOf } from '../reservations/slots';
import { ReservationsService } from '../reservations/reservations.service';
import { ReservationNotificationsService } from '../notifications/reservation-notifications.service';
import { CustomerNotificationEventsService } from '../notifications/customer-notification-events.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { DepositsService } from '../payments/deposits.service';
import type { StaffNotificationsService } from '../notifications/staff-notifications.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/**
 * A shift moving a booking, and what reaches the guest because of it.
 *
 * This path had no test at all, which is why it is worth one now: the
 * notification is written inside `settle`'s transaction callback and announced
 * after that transaction commits, so the row and the frame are joined by a
 * variable captured out of a closure. Nothing about that arrangement is visible
 * to the type checker — it compiles just as happily if the announcement never
 * fires — and it is the half a guest actually experiences.
 */

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const RESTAURANT_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_ID = '33333333-3333-4333-8333-333333333333';
const NOTIFICATION_ID = 'notification-1';
const CREATED_AT = new Date('2026-08-22T12:00:00.000Z');

const STAFF: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantAdmin, restaurantId: RESTAURANT_ID, branchId: null }],
};

function reservation(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    userId: GUEST_ID,
    branchId: BRANCH_ID,
    status: ReservationStatus.Pending,
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

function build(options: { reservation?: unknown; notifPush?: boolean } = {}) {
  const create = jest
    .fn()
    .mockResolvedValue({ id: NOTIFICATION_ID, createdAt: CREATED_AT });

  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(reservation(data)),
    );

  const prisma = {
    reservation: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.reservation === undefined ? reservation() : options.reservation),
      update,
    },
    notification: { create },
    user: {
      findUnique: jest.fn().mockResolvedValue({ notifPush: options.notifPush ?? true }),
    },
    // The callback runs against the same mocks, which is what lets a case see
    // that the notification was written *inside* the move's transaction.
    $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) =>
      run({
        reservation: { update },
        notification: { create },
        payment: { update: jest.fn() },
      }),
    ),
  } as unknown as PrismaService;

  const events = new CustomerNotificationEventsService();
  const heard: unknown[] = [];
  events.subscribe((event) => heard.push(event));

  const service = new RestaurantReservationsService(
    prisma,
    new ReservationsService(prisma, {} as unknown as DepositsService, {
      record: jest.fn(),
      publish: jest.fn(),
    } as unknown as StaffNotificationsService),
    { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
    new ReservationNotificationsService(events),
  );

  return { service, create, heard, prisma };
}

const dto = (status: ReservationStatus) => ({ status }) as { status: ReservationStatus };

describe('a shift accepting a table', () => {
  it('writes the guest a notification', async () => {
    const { service, create } = build();

    await service.setStatus(STAFF, 'res-1', dto(ReservationStatus.Confirmed));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: GUEST_ID,
          type: 'reservation',
          payload: expect.objectContaining({
            reservationId: 'res-1',
            status: ReservationStatus.Confirmed,
          }),
        }),
      }),
    );
  });

  it('announces it once the move has committed', async () => {
    // The case the closure exists for: the row's id has to survive out of the
    // transaction callback to be published afterwards.
    const { service, heard } = build();

    await service.setStatus(STAFF, 'res-1', dto(ReservationStatus.Confirmed));

    expect(heard).toEqual([
      expect.objectContaining({
        id: NOTIFICATION_ID,
        userId: GUEST_ID,
        type: 'reservation',
      }),
    ]);
  });

  it('still answers with the booking', async () => {
    // The notification is a side effect; the endpoint's job is unchanged.
    const { service } = build();

    const detail = await service.setStatus(STAFF, 'res-1', dto(ReservationStatus.Confirmed));

    expect(detail).toEqual(expect.objectContaining({ id: 'res-1' }));
  });
});

describe('a move the guest is not told about', () => {
  it('writes nothing when a booking is seated', async () => {
    // The guest is in the room. Telling them they are sitting at their table is
    // the clearest case of a notification nobody needs.
    const { service, create, heard, prisma } = build({
      reservation: reservation({ status: ReservationStatus.Confirmed }),
    });

    await service.setStatus(STAFF, 'res-1', dto(ReservationStatus.Seated));

    expect(create).not.toHaveBeenCalled();
    expect(heard).toEqual([]);
    // Not even asked about: the preference is read only when there is something
    // to announce.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('the switch in Settings', () => {
  it('records the move but stays silent when push is off', async () => {
    const { service, create, heard } = build({ notifPush: false });

    await service.setStatus(STAFF, 'res-1', dto(ReservationStatus.Confirmed));

    expect(create).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([]);
  });
});
