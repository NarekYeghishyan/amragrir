import { OrderStatus } from '@amragrir/shared';
import { OrderEventsService, type OrderStatusEvent } from '../orders/order-events.service';
import { OrderPlacedNotificationsService } from './order-placed-notifications.service';
import type { StaffNotificationsService } from './staff-notifications.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The order that used to reach nobody — see BUSINESS_LOGIC.md §4.
 *
 * Two things are pinned down here. **Which orders earn a branch's attention**:
 * an immediate one is waiting on a human to accept it, while a pre-order was
 * accepted the moment it was paid for and is announced later, at the hour the
 * work starts. And **which moment**: `paid` is the question, `confirmed` is the
 * answer to it, and announcing the answer would be telling a shift about a
 * decision it had just taken.
 */

const CREATED_AT = new Date('2026-08-22T10:00:00.000Z');
const READY_AT = new Date('2026-08-22T10:25:00.000Z');

function statusEvent(over: Partial<OrderStatusEvent> = {}): OrderStatusEvent {
  return {
    orderId: 'order-1',
    userId: 'user-1',
    branchId: 'branch-1',
    code: 'AMR-12344821',
    status: OrderStatus.Paid,
    readyAt: null,
    secondsLeft: null,
    ...over,
  };
}

function build(
  options: {
    /** `null` stands for an order that is no longer there. */
    order?: {
      branchId: string;
      code: string;
      readyAt: Date | null;
      reminderAt: Date | null;
      items: { qty: number }[];
    } | null;
    record?: jest.Mock;
  } = {},
) {
  const order =
    options.order === undefined
      ? {
          branchId: 'branch-1',
          code: 'AMR-12344821',
          readyAt: READY_AT,
          // No reminder: placed for now, and waiting on somebody to accept it.
          reminderAt: null,
          items: [{ qty: 2 }, { qty: 1 }],
        }
      : options.order;

  const findUnique = jest.fn().mockResolvedValue(order);
  const prisma = { order: { findUnique } } as unknown as PrismaService;

  const record =
    options.record ?? jest.fn().mockResolvedValue({ id: 'notification-1', createdAt: CREATED_AT });
  const publish = jest.fn();
  const notifications = { record, publish } as unknown as StaffNotificationsService;

  const orderEvents = new OrderEventsService();
  const service = new OrderPlacedNotificationsService(prisma, orderEvents, notifications);
  service.onModuleInit();

  return { service, orderEvents, record, publish, findUnique };
}

/** The listener does async work from a sync callback, so a published event is
 *  not finished when `publish` returns. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('which orders ring a branch', () => {
  it('rings when an immediate order is paid for', async () => {
    const { orderEvents, record, service } = build();

    orderEvents.publish(statusEvent());
    await settle();

    expect(record).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('stays quiet on a pre-order', async () => {
    // Paying accepts a pre-order outright, so nobody has to answer it now. It
    // announces itself through `prep_due` when the work is in front of somebody.
    const { orderEvents, record, service } = build({
      order: {
        branchId: 'branch-1',
        code: 'AMR-12344821',
        readyAt: READY_AT,
        reminderAt: new Date('2026-08-23T08:00:00.000Z'),
        items: [{ qty: 1 }],
      },
    });

    orderEvents.publish(statusEvent());
    await settle();

    expect(record).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it.each([
    OrderStatus.Created,
    OrderStatus.Confirmed,
    OrderStatus.Preparing,
    OrderStatus.AlmostReady,
    OrderStatus.Ready,
    OrderStatus.Completed,
    OrderStatus.Cancelled,
  ])('stays quiet on %s', async (status) => {
    // `created` may never become work, and everything from `confirmed` on is a
    // move somebody at the branch already made.
    const { orderEvents, record, findUnique, service } = build();

    orderEvents.publish(statusEvent({ status }));
    await settle();

    expect(record).not.toHaveBeenCalled();
    // Not even looked up: the status alone settles it.
    expect(findUnique).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('stays quiet when the order is gone', async () => {
    const { orderEvents, record, service } = build({ order: null });

    orderEvents.publish(statusEvent());
    await settle();

    expect(record).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});

describe('what the branch is told', () => {
  it('carries the numbers the bell draws, and no prose', async () => {
    const { orderEvents, record, service } = build();

    orderEvents.publish(statusEvent());
    await settle();

    expect(record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        branchId: 'branch-1',
        type: 'order_placed',
        orderId: 'order-1',
        payload: {
          code: 'AMR-12344821',
          readyAt: READY_AT.toISOString(),
          // Dishes, not lines: two of one and one of another is three plates.
          itemsCount: 3,
          needsConfirming: true,
        },
      }),
    );
    service.onModuleDestroy();
  });

  it('announces it once it is written', async () => {
    const { orderEvents, publish, service } = build();

    orderEvents.publish(statusEvent());
    await settle();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notification-1',
        branchId: 'branch-1',
        type: 'order_placed',
        orderId: 'order-1',
        // Thin on the wire: the frame says a branch was told something, and
        // reading the list is what checks reach.
        payload: null,
        createdAt: CREATED_AT,
      }),
    );
    service.onModuleDestroy();
  });

  it('survives a write that fails, rather than taking the API down over a bell', async () => {
    const { orderEvents, publish, service } = build({
      record: jest.fn().mockRejectedValue(new Error('database is on fire')),
    });

    orderEvents.publish(statusEvent());
    await settle();

    expect(publish).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});
