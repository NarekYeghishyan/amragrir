import { NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@amragrir/shared';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerNotificationEventsService } from './customer-notification-events.service';
import { OrderEventsService, type OrderStatusEvent } from '../orders/order-events.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The customer bell — see BUSINESS_LOGIC.md §4 and DATABASE.md §12.
 *
 * Two things are being pinned down here. **What earns an interruption**: the
 * bell buzzes a phone, so a status the customer already knows about must not
 * reach it. And **whose bell it is**: every read and write is scoped to one
 * account, and the cases below are as much about the rows that must *not* come
 * back as the ones that must.
 */

const CREATED_AT = new Date('2026-08-09T09:00:00.000Z');

function statusEvent(over: Partial<OrderStatusEvent> = {}): OrderStatusEvent {
  return {
    orderId: 'order-1',
    userId: 'user-1',
    branchId: 'branch-1',
    code: 'AMR-12344821',
    status: OrderStatus.Ready,
    readyAt: null,
    secondsLeft: null,
    ...over,
  };
}

function build(
  options: {
    create?: jest.Mock;
    updateMany?: jest.Mock;
    deleteMany?: jest.Mock;
    /** What `users.notif_push` says. Selected back with the created row. */
    notifPush?: boolean;
  } = {},
) {
  const create =
    options.create ??
    jest.fn().mockResolvedValue({
      id: 'notification-1',
      type: 'order',
      title: null,
      body: null,
      isRead: false,
      createdAt: CREATED_AT,
      user: { notifPush: options.notifPush ?? true },
    });

  const prisma = {
    notification: {
      create,
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: options.updateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: options.deleteMany ?? jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const orderEvents = new OrderEventsService();
  const events = new CustomerNotificationEventsService();
  const service = new CustomerNotificationsService(prisma, orderEvents, events);
  service.onModuleInit();

  return { service, prisma, orderEvents, events, create };
}

/** The listener does async work from a sync callback, so a published event is
 *  not finished when `publish` returns. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('what earns a notification', () => {
  it.each([
    OrderStatus.Confirmed,
    OrderStatus.Preparing,
    OrderStatus.AlmostReady,
    OrderStatus.Ready,
    OrderStatus.Completed,
    OrderStatus.Cancelled,
  ])('writes one when an order reaches %s', async (status) => {
    const { orderEvents, create, service } = build();

    orderEvents.publish(statusEvent({ status }));
    await settle();

    expect(create).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it.each([OrderStatus.Created, OrderStatus.Paid])('stays quiet on %s', async (status) => {
    // `created` is the customer's own act, and `paid` is published back to back
    // with `confirmed` from one payment — notifying on both would buzz twice
    // for one tap.
    const { orderEvents, create, service } = build();

    orderEvents.publish(statusEvent({ status }));
    await settle();

    expect(create).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('stores the facts and no prose', async () => {
    // The words come from the client's dictionary; a sentence written here
    // would be frozen in one language. See `order-notifications.ts`.
    const { orderEvents, create, service } = build();

    orderEvents.publish(statusEvent({ status: OrderStatus.Ready }));
    await settle();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'user-1',
          type: 'order',
          payload: { orderId: 'order-1', code: 'AMR-12344821', status: OrderStatus.Ready },
        },
      }),
    );
    service.onModuleDestroy();
  });

  it('announces it to the account that owns it', async () => {
    const { orderEvents, events, service } = build();
    const heard: unknown[] = [];
    events.subscribe((event) => heard.push(event));

    orderEvents.publish(statusEvent({ userId: 'user-9' }));
    await settle();

    expect(heard).toEqual([
      expect.objectContaining({ id: 'notification-1', userId: 'user-9', type: 'order' }),
    ]);
    service.onModuleDestroy();
  });

  it('survives a write that fails, rather than taking the API down over a bell', async () => {
    // The listener is sync and the work is not, so an un-caught rejection here
    // would be an unhandled one.
    const { orderEvents, service } = build({
      create: jest.fn().mockRejectedValue(new Error('database is on fire')),
    });

    orderEvents.publish(statusEvent());

    await expect(settle()).resolves.toBeUndefined();
    service.onModuleDestroy();
  });

  it('stops listening when the module goes down', async () => {
    const { orderEvents, create, service } = build();
    service.onModuleDestroy();

    orderEvents.publish(statusEvent());
    await settle();

    expect(create).not.toHaveBeenCalled();
  });
});

describe('reading and clearing', () => {
  it('counts every unread, not only the ones on the page', async () => {
    // A badge that said 30 because that is where the page ended would be a lie
    // the moment somebody had 31.
    const { service, prisma } = build();
    (prisma.notification.count as jest.Mock).mockResolvedValue(31);

    const result = await service.list('user-1', 30);

    expect(result.unread).toBe(31);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
    });
    service.onModuleDestroy();
  });

  it('scopes the list to one account in the query, not afterwards', async () => {
    const { service, prisma } = build();

    await service.list('user-1', 10);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, take: 10 }),
    );
    service.onModuleDestroy();
  });

  it('marks one read only when it belongs to the caller', async () => {
    const { service, prisma } = build();

    await service.markRead('user-1', 'notification-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1' },
      data: { isRead: true },
    });
    service.onModuleDestroy();
  });

  it('answers "not found" for somebody elses id, the same as for no id at all', async () => {
    // A distinguishable error would confirm the id exists, which is what makes
    // a list of ids worth probing with.
    const { service } = build({ updateMany: jest.fn().mockResolvedValue({ count: 0 }) });

    await expect(service.markRead('user-1', 'notification-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    service.onModuleDestroy();
  });

  it('clears the badge in one call', async () => {
    const { service, prisma } = build({ updateMany: jest.fn().mockResolvedValue({ count: 4 }) });

    await expect(service.markAllRead('user-1')).resolves.toEqual({ read: 4 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: { isRead: true },
    });
    service.onModuleDestroy();
  });
});

describe('throwing them away', () => {
  it('deletes one, scoped to the caller in the query', async () => {
    const { service, prisma } = build();

    await service.remove('user-1', 'notification-1');

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1' },
    });
    service.onModuleDestroy();
  });

  it('answers "not found" for somebody elses id, the same as for no id at all', async () => {
    // Deleting is the operation where a distinguishable error would matter
    // most: it is the one an id can be probed with and get a different answer
    // depending on whether it exists.
    const { service } = build({ deleteMany: jest.fn().mockResolvedValue({ count: 0 }) });

    await expect(service.remove('user-1', 'notification-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    service.onModuleDestroy();
  });

  it('empties the bell, unread ones included', async () => {
    // "Clear" that quietly left the unread ones behind would look like it had
    // failed.
    const { service, prisma } = build({ deleteMany: jest.fn().mockResolvedValue({ count: 7 }) });

    await expect(service.removeAll('user-1')).resolves.toEqual({ deleted: 7 });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    service.onModuleDestroy();
  });

  it('empties nothing for an account with nothing', async () => {
    const { service } = build({ deleteMany: jest.fn().mockResolvedValue({ count: 0 }) });

    // Not an error: clearing an empty bell leaves the caller where they asked
    // to be, which is the definition of success for this verb.
    await expect(service.removeAll('user-1')).resolves.toEqual({ deleted: 0 });
    service.onModuleDestroy();
  });
});

describe('the switch in Settings', () => {
  /**
   * `notif_push` is the customer's answer to being interrupted, and until now
   * nothing on the server read it — the toggle persisted and changed nothing.
   * The ruling these cases pin down is that it governs *delivery*, not the
   * record: the bell stays this order's history, and the switch decides whether
   * anybody is nudged about it.
   */

  it('still records the notification when push is off', async () => {
    // Turning the switch back on must not reveal a hole where the last
    // fortnight of orders went.
    const { orderEvents, create, service } = build({ notifPush: false });

    orderEvents.publish(statusEvent({ status: OrderStatus.Ready }));
    await settle();

    expect(create).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('does not announce it when push is off', async () => {
    const { orderEvents, events, service } = build({ notifPush: false });
    const heard: unknown[] = [];
    events.subscribe((event) => heard.push(event));

    orderEvents.publish(statusEvent({ status: OrderStatus.Ready }));
    await settle();

    expect(heard).toEqual([]);
    service.onModuleDestroy();
  });

  it('announces it when push is on', async () => {
    const { orderEvents, events, service } = build({ notifPush: true });
    const heard: unknown[] = [];
    events.subscribe((event) => heard.push(event));

    orderEvents.publish(statusEvent({ status: OrderStatus.Ready }));
    await settle();

    expect(heard).toHaveLength(1);
    service.onModuleDestroy();
  });

  it('reads the preference in the same statement that writes the row', async () => {
    // A second query for one boolean would be a round trip on the path of every
    // order that moves.
    const { orderEvents, create, service } = build();

    orderEvents.publish(statusEvent({ status: OrderStatus.Ready }));
    await settle();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ user: { select: { notifPush: true } } }),
      }),
    );
    service.onModuleDestroy();
  });
});
