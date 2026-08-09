import { OrderStatus, StaffNotificationType } from '@prisma/client';
import { OrderRemindersService } from './order-reminders.service';
import type { StaffNotificationsService } from './staff-notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

/**
 * The prep reminder — see BUSINESS_LOGIC.md §4.
 *
 * The API's first scheduled job, so these cases are as much about *not* being
 * dangerous as about working: it must not send twice, must not take the process
 * down, and must not let one bad row cost the rest of the batch.
 */

const NOW = new Date('2026-08-05T08:00:00.000Z');

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    code: 'AMR-12344821',
    branchId: 'branch-1',
    status: OrderStatus.confirmed,
    readyAt: new Date('2026-08-05T09:00:00.000Z'),
    prepStartAt: new Date('2026-08-05T08:40:00.000Z'),
    prepMin: 20,
    items: [{ qty: 2 }],
    ...over,
  };
}

function build(options: { due?: unknown[]; locked?: boolean; update?: jest.Mock } = {}) {
  const update = options.update ?? jest.fn().mockResolvedValue({});
  const tx = { order: { update } };

  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue(options.due ?? [orderRow()]) },
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const redis = {
    setIfAbsent: jest.fn().mockResolvedValue(!options.locked),
  } as unknown as RedisService;

  const notifications = {
    record: jest.fn().mockResolvedValue({ id: 'notif-1', createdAt: NOW }),
    publish: jest.fn(),
  } as unknown as StaffNotificationsService;

  return {
    service: new OrderRemindersService(prisma, redis, notifications),
    prisma,
    redis,
    notifications,
    update,
  };
}

describe('the prep reminder sweep', () => {
  it('tells the branch which order is coming up', async () => {
    const { service, notifications } = build();

    await service.send(NOW);

    expect(notifications.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        branchId: 'branch-1',
        type: StaffNotificationType.prep_due,
        orderId: 'order-1',
      }),
    );
  });

  it('sends numbers rather than a sentence', async () => {
    // A job has no request to take a language from. Writing prose here would
    // pick a language for a reader who has not arrived yet, so the panel
    // translates instead — as it already does for statuses and history.
    const { service, notifications } = build();

    await service.send(NOW);

    const payload = (notifications.record as jest.Mock).mock.calls[0][1].payload;
    expect(payload).toMatchObject({ code: 'AMR-12344821', prepMin: 20, itemsCount: 2 });
    expect(JSON.stringify(payload)).not.toMatch(/[a-z]{4,}\s[a-z]{4,}/i);
  });

  it('names the order rather than printing its collection code', async () => {
    // The bell is a screen a shift leaves open. A notification carrying the
    // code would hand out at a glance the one thing the counter is meant to
    // ask a guest for.
    const { service, notifications } = build();

    await service.send(NOW);

    const payload = (notifications.record as jest.Mock).mock.calls[0][1].payload;
    expect(payload).not.toHaveProperty('pickupCode');
  });

  it('says whether the order still needs accepting', async () => {
    // "Nobody has confirmed this yet" and "the kitchen just has to start" are
    // different jobs for whoever reads it.
    const { service, notifications } = build({
      due: [orderRow({ status: OrderStatus.paid })],
    });

    await service.send(NOW);

    expect((notifications.record as jest.Mock).mock.calls[0][1].payload).toMatchObject({
      needsConfirming: true,
    });
  });

  it('claims the order by matching on it being unsent', async () => {
    // What actually stops two passes both sending: the update matches on the
    // state the decision was made against, so the loser changes nothing and its
    // transaction — notification included — rolls back.
    const { service, update } = build();

    await service.send(NOW);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'order-1', reminderSentAt: null },
      data: { reminderSentAt: NOW },
    });
  });

  it('announces only after the transaction commits', async () => {
    // Publishing inside it would tell a panel about a row that may still be
    // rolled back.
    const order: string[] = [];
    const { service, prisma, notifications } = build();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (client: unknown) => Promise<unknown>) => {
        const result = await fn({ order: { update: jest.fn().mockResolvedValue({}) } });
        order.push('commit');
        return result;
      },
    );
    (notifications.publish as jest.Mock).mockImplementation(() => order.push('publish'));

    await service.send(NOW);

    expect(order).toEqual(['commit', 'publish']);
  });

  it('asks only for orders that are paid or accepted', async () => {
    // Nobody needs warning about an order never paid for, and there is nothing
    // to do about one already cooking or called off.
    const { service, prisma } = build();

    await service.send(NOW);

    expect((prisma.order.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      reminderAt: { not: null, lte: NOW },
      reminderSentAt: null,
      status: { in: [OrderStatus.paid, OrderStatus.confirmed] },
    });
  });

  it('lets one bad row cost only itself', async () => {
    // Nothing was marked for the one that threw, so the next pass finds it
    // again — and the rest of the batch still went out.
    const { service, notifications } = build({
      due: [orderRow({ id: 'order-1' }), orderRow({ id: 'order-2' })],
      update: jest
        .fn()
        .mockRejectedValueOnce(new Error('lost the race'))
        .mockResolvedValue({}),
    });

    const sent = await service.send(NOW);

    expect(sent).toBe(1);
    expect(notifications.publish).toHaveBeenCalledTimes(1);
  });
});

describe('the lock', () => {
  it('does the pass when it wins', async () => {
    const { service, prisma } = build();

    await service.sweep();

    expect(prisma.order.findMany).toHaveBeenCalled();
  });

  it('does nothing when another instance holds it', async () => {
    // `reminder_sent_at` stops the *second* pass, not two passes running at the
    // same moment — which is exactly what two instances on a one-minute cron do.
    const { service, prisma } = build({ locked: true });

    await service.sweep();

    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('never throws out of the cron handler', async () => {
    // An unhandled rejection here takes the process with it, and a missed
    // reminder is not worth an outage.
    const { service, prisma } = build();
    (prisma.order.findMany as jest.Mock).mockRejectedValue(new Error('database is gone'));

    await expect(service.sweep()).resolves.toBeUndefined();
  });
});
