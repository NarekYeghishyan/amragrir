import { BOOKING_REMINDER_LEAD_MINUTES, ReservationStatus } from '@amragrir/shared';
import { BookingRemindersService } from './booking-reminders.service';
import { CustomerNotificationEventsService } from './customer-notification-events.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

/**
 * Reminding a guest that their table is coming up — see BUSINESS_LOGIC.md §4.
 *
 * The rules worth holding still are the two that decide whether somebody is
 * interrupted at the wrong moment: **which bookings are due** — promised, still
 * ahead, not already reminded — and **that a reminder is sent once**, whichever
 * instance's sweep happens to be running.
 */

const NOW = new Date('2026-08-22T16:00:00.000Z');
const MINUTE = 60_000;

function booking(over: Record<string, unknown> = {}) {
  return {
    id: 'reservation-1',
    userId: 'user-1',
    reservedFor: new Date(NOW.getTime() + 60 * MINUTE),
    // Booked yesterday: long enough ago to have been forgotten, which is what a
    // reminder is for.
    createdAt: new Date(NOW.getTime() - 24 * 60 * MINUTE),
    user: { notifPush: true },
    ...over,
  };
}

function build(options: { due?: unknown[]; locked?: boolean; update?: jest.Mock } = {}) {
  const findMany = jest.fn().mockResolvedValue(options.due ?? [booking()]);
  const update = options.update ?? jest.fn().mockResolvedValue({});
  const create = jest
    .fn()
    .mockResolvedValue({ id: 'notification-1', createdAt: NOW, isRead: false });

  const prisma = {
    reservation: { findMany, update },
    notification: { create },
    // The transaction hands back a client with the same shape, so the claim and
    // the write are the same two mocks.
    $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) =>
      run({ reservation: { update }, notification: { create } }),
    ),
  } as unknown as PrismaService;

  const redis = {
    setIfAbsent: jest.fn().mockResolvedValue(!options.locked),
  } as unknown as RedisService;

  const events = new CustomerNotificationEventsService();
  const heard: unknown[] = [];
  events.subscribe((event) => heard.push(event));

  const service = new BookingRemindersService(prisma, redis, events);

  return { service, findMany, update, create, redis, heard };
}

describe('which bookings are due a reminder', () => {
  it('asks only for tables that are promised, ahead, and not yet reminded', async () => {
    const { service, findMany } = build();

    await service.send(NOW);

    const where = findMany.mock.calls[0][0].where;
    expect(where.reminderSentAt).toBeNull();
    expect(where.status).toBe(ReservationStatus.Confirmed);
    // The window: from now to one lead ahead.
    expect(where.reservedFor.gte).toEqual(NOW);
    expect(where.reservedFor.lte).toEqual(
      new Date(NOW.getTime() + BOOKING_REMINDER_LEAD_MINUTES * MINUTE),
    );
  });

  it('never reminds about a sitting that has already begun', async () => {
    // After an outage the backlog holds tables whose evening has passed, and
    // "your table is soon" at midnight is worse than the silence it replaces.
    // The floor is in the query, so such rows are never even selected.
    const { service, findMany } = build();

    await service.send(NOW);

    expect(findMany.mock.calls[0][0].where.reservedFor.gte).toEqual(NOW);
  });

  it('sends nothing when another instance holds the lock', async () => {
    // `reminder_sent_at` stops the second *pass*, not two passes running at the
    // same moment — which is exactly what several instances produce.
    const { service, findMany } = build({ locked: true });

    await service.sweep();

    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('sending one', () => {
  it('claims the booking by the state it decided against', async () => {
    // Matching on `reminderSentAt: null` is what makes two racing passes settle
    // to one send: the loser's `where` matches nothing and its transaction —
    // notification included — rolls back.
    const { service, update } = build();

    await service.send(NOW);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'reservation-1', reminderSentAt: null },
      data: { reminderSentAt: NOW },
    });
  });

  it('writes a row that says it is a reminder', async () => {
    const { service, create } = build();

    await service.send(NOW);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'reservation',
          payload: expect.objectContaining({
            reservationId: 'reservation-1',
            reminder: true,
            // Unmoved: a reminder is not a status change.
            status: ReservationStatus.Confirmed,
          }),
        }),
      }),
    );
  });

  it('announces it', async () => {
    const { service, heard } = build();

    await service.send(NOW);

    expect(heard).toEqual([
      expect.objectContaining({ id: 'notification-1', userId: 'user-1', type: 'reservation' }),
    ]);
  });

  it('says nothing to a guest who turned notifications off, but still records it', async () => {
    const { service, create, heard } = build({
      due: [booking({ user: { notifPush: false } })],
    });

    await service.send(NOW);

    expect(create).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([]);
  });

  it('carries on when one booking fails', async () => {
    // The next pass finds it again, because nothing was marked.
    const { service } = build({
      due: [booking(), booking({ id: 'reservation-2' })],
      update: jest.fn().mockRejectedValue(new Error('lost the race')),
    });

    await expect(service.send(NOW)).resolves.toBe(0);
  });

  it('does not take the process down when the sweep throws', async () => {
    // An unhandled rejection out of a cron handler ends the API, and a missed
    // reminder is not worth an outage.
    const { service } = build({
      update: jest.fn().mockRejectedValue(new Error('database is on fire')),
    });

    await expect(service.sweep()).resolves.toBeUndefined();
  });
});

describe('who could have forgotten', () => {
  /**
   * A reminder has to tell somebody something they do not already know. The
   * guest who booked a table for tonight two hours ago knows.
   */

  it('says nothing to a guest who booked inside the window', async () => {
    // Taken at five for seven: already within the three-hour lead when it was
    // made, so the sweep would announce it a minute after they chose it.
    const { service, create, heard } = build({
      due: [
        booking({
          reservedFor: new Date(NOW.getTime() + 120 * MINUTE),
          createdAt: new Date(NOW.getTime() - MINUTE),
        }),
      ],
    });

    await service.send(NOW);

    expect(create).not.toHaveBeenCalled();
    expect(heard).toEqual([]);
  });

  it('reminds a guest who booked before there was anything to remind them of', async () => {
    const { service, create } = build({
      due: [
        booking({
          reservedFor: new Date(NOW.getTime() + 120 * MINUTE),
          // Booked a week out, well before its own reminder point.
          createdAt: new Date(NOW.getTime() - 7 * 24 * 60 * MINUTE),
        }),
      ],
    });

    await service.send(NOW);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('counts only what it actually sent', async () => {
    const { service } = build({
      due: [
        booking({ id: 'kept', createdAt: new Date(NOW.getTime() - 24 * 60 * MINUTE) }),
        booking({ id: 'too-late', createdAt: new Date(NOW.getTime() - MINUTE) }),
      ],
    });

    await expect(service.send(NOW)).resolves.toBe(1);
  });
});
