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

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    code: 'AMR-12344821',
    userId: 'user-1',
    status: OrderStatus.Created,
    totalAmd: 6160,
    payment: null,
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
      update: jest.fn().mockResolvedValue(orderRow({ status: OrderStatus.Paid })),
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
