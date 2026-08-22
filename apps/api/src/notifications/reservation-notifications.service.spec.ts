import { ReservationStatus } from '@amragrir/shared';
import { CustomerNotificationEventsService } from './customer-notification-events.service';
import { ReservationNotificationsService } from './reservation-notifications.service';
import type { Prisma } from '@prisma/client';

/**
 * What a guest is told about their table — see BUSINESS_LOGIC.md §4.
 *
 * Two rules are being pinned down. **Which moves are news**: three of the six,
 * and the three that are not are as deliberate as the three that are. And
 * **what the switch in Settings governs**: the row is written whatever it says,
 * because the bell is this booking's history; the switch decides only whether
 * anybody is interrupted about it.
 */

const CREATED_AT = new Date('2026-08-22T11:00:00.000Z');
const RESERVED_FOR = new Date('2026-08-23T19:00:00.000Z');

function move(status: ReservationStatus) {
  return {
    reservationId: 'reservation-1',
    userId: 'user-1',
    status,
    reservedFor: RESERVED_FOR,
  };
}

function build() {
  const create = jest.fn().mockResolvedValue({ id: 'notification-1', createdAt: CREATED_AT });
  const tx = { notification: { create } } as unknown as Prisma.TransactionClient;

  const events = new CustomerNotificationEventsService();
  const service = new ReservationNotificationsService(events);

  const heard: unknown[] = [];
  events.subscribe((event) => heard.push(event));

  return { service, tx, create, heard };
}

describe('which moves reach the guest', () => {
  it.each([ReservationStatus.Confirmed, ReservationStatus.Cancelled, ReservationStatus.NoShow])(
    'writes one when a booking becomes %s',
    async (status) => {
      // Each is a decision somebody else made about this person's evening — and,
      // for the last two, about their deposit.
      const { service, tx, create } = build();

      const written = await service.record(tx, move(status));

      expect(create).toHaveBeenCalledTimes(1);
      expect(written).not.toBeNull();
    },
  );

  it.each([ReservationStatus.Pending, ReservationStatus.Seated, ReservationStatus.Completed])(
    'stays quiet on %s',
    async (status) => {
      // `pending` is the guest's own act; the other two happen with the guest in
      // the room, and telling somebody they are sitting at their table is the
      // clearest case of a notification nobody needs.
      const { service, tx, create } = build();

      const written = await service.record(tx, move(status));

      expect(create).not.toHaveBeenCalled();
      expect(written).toBeNull();
    },
  );

  it('stores the facts and no prose', async () => {
    // The words come from the client's dictionary; a sentence written here would
    // be frozen in whichever language the reader preferred that day.
    const { service, tx, create } = build();

    await service.record(tx, move(ReservationStatus.Confirmed));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'user-1',
          type: 'reservation',
          payload: {
            reservationId: 'reservation-1',
            status: ReservationStatus.Confirmed,
            reservedFor: RESERVED_FOR.toISOString(),
          },
        },
      }),
    );
  });
});

describe('the switch in Settings', () => {
  it('announces the move when push is on', async () => {
    const { service, tx, heard } = build();

    const written = await service.record(tx, move(ReservationStatus.Confirmed));
    service.publish(written!, move(ReservationStatus.Confirmed), true);

    expect(heard).toEqual([
      expect.objectContaining({ id: 'notification-1', userId: 'user-1', type: 'reservation' }),
    ]);
  });

  it('says nothing when push is off', async () => {
    const { service, tx, heard } = build();

    const written = await service.record(tx, move(ReservationStatus.Confirmed));
    service.publish(written!, move(ReservationStatus.Confirmed), false);

    expect(heard).toEqual([]);
  });

  it('still wrote the row when push is off', async () => {
    // Turning the switch back on must not reveal a hole where a cancelled
    // booking used to be.
    const { service, tx, create } = build();

    const written = await service.record(tx, move(ReservationStatus.Cancelled));
    service.publish(written!, move(ReservationStatus.Cancelled), false);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
