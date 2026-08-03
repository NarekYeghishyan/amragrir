import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@amragrir/shared';
import { PaymentsService } from './payments.service';
import { PaymentDeclinedError, type PaymentProvider } from './payment.provider';
import type { OrderEventsService } from '../orders/order-events.service';
import { CreatePaymentDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReferralsService } from '../referrals/referrals.service';

const ORDER_ID = '44444444-4444-4444-8444-444444444444';

/** An hour from now, which is far enough ahead to be a pre-order under any
 *  prep estimate. Relative rather than fixed: what matters is only that the
 *  column is set, and a hard-coded date would expire. */
const SCHEDULED_FOR = () => new Date(Date.now() + 60 * 60_000);

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    code: 'AMR-12344821',
    userId: 'user-1',
    status: OrderStatus.Created,
    totalAmd: 6160,
    payment: null,
    // Null is what an ordinary order carries — placed for as soon as possible,
    // nothing to warn anybody about. Spelled out rather than left off, because
    // absent and null are the same to a cast fixture and very much not the same
    // to the code under test.
    reminderAt: null,
    ...over,
  };
}

function build(options: { order?: unknown; charge?: jest.Mock } = {}) {
  const paymentCreate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'pay-1', ...data }),
    );
  const paymentUpdate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'pay-1', ...data }),
    );
  const orderEventCreate = jest.fn().mockResolvedValue({ id: 'event-1' });

  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(options.order === undefined ? orderRow() : options.order),
      // Echoes back whatever status the write asked for, so a settlement that
      // writes twice — paid, then the automatic confirmation of a pre-order —
      // does not get the first row's answer for the second move.
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: { status?: OrderStatus } }) =>
          Promise.resolve(orderRow({ status: data.status ?? OrderStatus.Paid })),
        ),
    },
    payment: { create: paymentCreate, update: paymentUpdate },
    orderEvent: { create: orderEventCreate },
    // The real client runs the array in one transaction; here the promises are
    // already resolved, so awaiting them all is equivalent.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const provider: PaymentProvider = {
    charge: options.charge ?? jest.fn().mockResolvedValue({ providerRef: 'dev_1' }),
    refund: jest.fn().mockResolvedValue(undefined),
    // Deposits go through DepositsService, not here; present so the stub
    // satisfies the interface.
    authorize: jest.fn().mockResolvedValue({ providerRef: 'dev_auth_1' }),
    capture: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };

  const events = { publish: jest.fn(), subscribe: jest.fn() };
  const referrals = { creditReferrerFor: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new PaymentsService(
      prisma,
      provider,
      events as unknown as OrderEventsService,
      referrals as unknown as ReferralsService,
    ),
    prisma,
    provider,
    events,
    referrals,
    paymentCreate,
    paymentUpdate,
    orderEventCreate,
  };
}

const dto = (over: Partial<CreatePaymentDto> = {}): CreatePaymentDto =>
  Object.assign(new CreatePaymentDto(), {
    orderId: ORDER_ID,
    method: PaymentMethod.Card,
    ...over,
  });

describe('pay', () => {
  it('charges the order total, not an amount from the request', async () => {
    // The DTO has no amount field at all; this is the test that keeps it that way.
    const { service, provider } = build();
    await service.pay('user-1', dto());

    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({ amountAmd: 6160, reference: 'AMR-12344821' }),
    );
  });

  it('captures the charge and moves the order to paid', async () => {
    const { service, prisma } = build();
    const result = await service.pay('user-1', dto());

    expect(result.status).toBe(PaymentStatus.Captured);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: OrderStatus.Paid } }),
    );
  });

  it('charges every method — no order reaches the kitchen unpaid', async () => {
    // BUSINESS_LOGIC.md §5. There used to be a `cash` path that recorded a
    // `pending` payment and moved the order to `paid` anyway, which meant an
    // order could be in the queue with nothing taken and nothing in this
    // database that would ever settle it. A method that skips the provider is
    // the shape of that bug returning.
    for (const method of Object.values(PaymentMethod)) {
      // A service per method rather than one with its mocks cleared: what is
      // being asserted is a whole payment, and a cleared mock hides which
      // iteration set it.
      const { service, provider, prisma } = build();
      const result = await service.pay('user-1', dto({ method }));

      expect(provider.charge).toHaveBeenCalledWith(expect.objectContaining({ method }));
      expect(result.status).toBe(PaymentStatus.Captured);
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OrderStatus.Paid } }),
      );
    }
  });

  it('records a decline and leaves the order unpaid', async () => {
    const charge = jest.fn().mockRejectedValue(new PaymentDeclinedError());
    const { service, prisma, paymentCreate } = build({ charge });

    await expect(service.pay('user-1', dto())).rejects.toThrow(UnprocessableEntityException);

    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.Failed }) }),
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('gives a decline a history entry of its own', async () => {
    // It moves no status, so without one the order's timeline would show it
    // sitting in `created` with nothing to say why.
    const charge = jest.fn().mockRejectedValue(new PaymentDeclinedError());
    const { service, orderEventCreate } = build({ charge });

    await expect(service.pay('user-1', dto())).rejects.toThrow(UnprocessableEntityException);

    expect(orderEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: ORDER_ID,
        type: OrderEventType.Payment,
        toStatus: null,
        actorType: OrderActorType.Customer,
        detail: expect.objectContaining({ paymentStatus: PaymentStatus.Failed }),
      }),
    });
  });

  it('records the move to paid in the same transaction as the money', async () => {
    const { service, orderEventCreate, prisma } = build();
    await service.pay('user-1', dto());

    expect(orderEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: OrderEventType.StatusChanged,
        fromStatus: OrderStatus.Created,
        toStatus: OrderStatus.Paid,
        detail: expect.objectContaining({
          paymentMethod: PaymentMethod.Card,
          paymentStatus: PaymentStatus.Captured,
        }),
      }),
    });
    // One transaction, not three calls: a captured charge whose history entry
    // failed to write would be money with no trail.
    expect((prisma.$transaction as jest.Mock).mock.calls[0][0]).toHaveLength(3);
  });

  it('leaves an ordinary order waiting for the restaurant to accept it', async () => {
    // The counterpart to the pre-order cases below, and the reason `reminderAt`
    // is spelled out in the fixture: `paid` is a real stage of the board, and
    // confirming everything on payment would empty the tab a kitchen opens on.
    const { service, prisma } = build();
    const result = await service.pay('user-1', dto());

    expect(result.orderStatus).toBe(OrderStatus.Paid);
    expect(prisma.order.update).toHaveBeenCalledTimes(1);
  });
  it('lets a failed payment be retried on the same row', async () => {
    const existing = { id: 'pay-1', status: PaymentStatus.Failed, amountAmd: 6160 };
    const { service, paymentUpdate, paymentCreate } = build({
      order: orderRow({ payment: existing }),
    });

    await service.pay('user-1', dto());

    expect(paymentUpdate).toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('refuses to pay twice', async () => {
    const existing = { id: 'pay-1', status: PaymentStatus.Captured, amountAmd: 6160 };
    const { service } = build({ order: orderRow({ payment: existing }) });

    await expect(service.pay('user-1', dto())).rejects.toThrow(ConflictException);
  });

  it('refuses to pay an order the state machine has moved past', async () => {
    const { service } = build({ order: orderRow({ status: OrderStatus.Preparing }) });
    await expect(service.pay('user-1', dto())).rejects.toThrow(ConflictException);
  });

  it('refuses to pay a cancelled order', async () => {
    const { service } = build({ order: orderRow({ status: OrderStatus.Cancelled }) });
    await expect(service.pay('user-1', dto())).rejects.toThrow(ConflictException);
  });

  it('matches on the order status, so paying cannot un-cancel a cancelled order', async () => {
    // Regression: the transition check runs before the charge. A cancellation
    // landing in between used to be overwritten by an unconditional update.
    const { service, prisma } = build();
    await service.pay('user-1', dto());

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORDER_ID, status: OrderStatus.Created } }),
    );
  });

  it('reports a conflict when that guard finds nothing to update', async () => {
    const { service, prisma } = build();
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('no rows', {
        code: 'P2025',
        clientVersion: '6',
      }),
    );

    await expect(service.pay('user-1', dto())).rejects.toThrow(ConflictException);
  });

  it('scopes the order lookup to the caller', async () => {
    const { service, prisma } = build();
    await service.pay('user-1', dto());

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORDER_ID, userId: 'user-1' } }),
    );
  });

  it('404s on someone else\'s order', async () => {
    const { service } = build({ order: null });
    await expect(service.pay('user-1', dto())).rejects.toThrow(NotFoundException);
  });
});

describe('paying for a pre-order', () => {
  const preOrder = (over: Record<string, unknown> = {}) =>
    build({ order: orderRow({ reminderAt: SCHEDULED_FOR(), ...over }) });

  it('accepts it there and then', async () => {
    // Nobody is going to press Confirm on Monday for a Saturday order — and
    // until somebody did, the diner's screen would say the restaurant had not
    // looked at it. The branch hears about it from the reminder instead.
    const { service } = preOrder();
    const result = await service.pay('user-1', dto());

    expect(result.orderStatus).toBe(OrderStatus.Confirmed);
  });

  it('confirms in the same transaction as the payment', async () => {
    const { service, prisma } = preOrder();
    await service.pay('user-1', dto());

    // Five writes: the payment, the move to paid and its entry, then the
    // confirmation and its entry. A paid pre-order that failed to confirm would
    // sit on no board at all.
    expect((prisma.$transaction as jest.Mock).mock.calls[0][0]).toHaveLength(5);
  });

  it('matches on paid, so the confirmation cannot overwrite something else', async () => {
    const { service, prisma } = preOrder();
    await service.pay('user-1', dto());

    expect(prisma.order.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: ORDER_ID, status: OrderStatus.Paid },
        data: { status: OrderStatus.Confirmed },
      }),
    );
  });

  it('records the confirmation as the system, not as the customer', async () => {
    // A diner cannot accept an order on a restaurant's behalf, and no member of
    // staff was here. The timeline says a rule did it, which is what happened.
    const { service, orderEventCreate } = preOrder();
    await service.pay('user-1', dto());

    expect(orderEventCreate).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        type: OrderEventType.StatusChanged,
        fromStatus: OrderStatus.Paid,
        toStatus: OrderStatus.Confirmed,
        actorType: OrderActorType.System,
        actorUserId: null,
        actorStaffId: null,
      }),
    });
  });

  it('announces both moves, so no watcher sees a jump the machine cannot make', async () => {
    const { service, events } = preOrder();
    await service.pay('user-1', dto());

    expect(events.publish).toHaveBeenCalledTimes(2);
    expect(
      events.publish.mock.calls.map(([event]) => (event as { status: string }).status),
    ).toEqual([OrderStatus.Paid, OrderStatus.Confirmed]);
  });

  it('still confirms one whose hour has already come round', async () => {
    // Whether this was a pre-order is a fact about how it was placed. Deciding
    // it against the clock would mean a customer who took an hour to reach the
    // payment screen got a different rule than one who paid at once.
    const { service } = preOrder({ reminderAt: new Date(Date.now() - 60_000) });
    const result = await service.pay('user-1', dto());

    expect(result.orderStatus).toBe(OrderStatus.Confirmed);
  });
});

describe('reverse', () => {
  it('refunds a captured payment', async () => {
    const { service, provider } = build();
    const status = await service.reverse({
      id: 'pay-1',
      status: PaymentStatus.Captured,
      amountAmd: 6160,
      providerRef: 'dev_1',
    } as never);

    expect(provider.refund).toHaveBeenCalledWith('dev_1', 6160);
    expect(status).toBe(PaymentStatus.Refunded);
  });

  it('just cancels an attempt that took nothing', async () => {
    // What actually reaches `reverse` now that an order can only be cancelled
    // before it is paid: a refused card on an order the customer then dropped.
    const { service, provider } = build();
    const status = await service.reverse({
      id: 'pay-1',
      status: PaymentStatus.Failed,
      amountAmd: 6160,
      providerRef: null,
    } as never);

    expect(provider.refund).not.toHaveBeenCalled();
    expect(status).toBe(PaymentStatus.Cancelled);
  });
});

describe('methods', () => {
  it('offers every method with apple pay preselected', () => {
    // Online only — `cash` was removed with the counter-settlement path.
    const { service } = build();
    expect(service.methods()).toEqual({
      methods: ['apple_pay', 'google_pay', 'card'],
      default: 'apple_pay',
    });
  });
});
