import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Language,
  ORDER_MAX_LEAD_DAYS,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SERVICE_FEE_AMD,
  ServiceMode,
} from '@amragrir/shared';
import { OrdersService } from './orders.service';
import { OrderEventsService, countdown } from './order-events.service';
import { CreateOrderDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentsService } from '../payments/payments.service';
import type { CouponsService } from '../referrals/coupons.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const BURGER = '22222222-2222-4222-8222-222222222222';
const FRIES = '33333333-3333-4333-8333-333333333333';

function branch(over: Record<string, unknown> = {}) {
  return {
    id: BRANCH_ID,
    name: 'Northern Ave',
    address: 'Northern Ave 5',
    isOpen: true,
    avgPrepMin: 12,
    restaurant: { name: 'Sunny Table', coverUrl: null },
    ...over,
  };
}

function menuItem(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    branchId: BRANCH_ID,
    nameI18n: { hy: 'Ô²Õ¸Ö‚Ö€Õ£Õ¥Ö€', en: 'Burger' },
    priceAmd: 5800,
    prepMin: 12,
    isAvailable: true,
    ...over,
  };
}

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    code: 'AMR-12344821',
    status: OrderStatus.Created,
    serviceMode: ServiceMode.Pickup,
    subtotalAmd: 5800,
    serviceFeeAmd: SERVICE_FEE_AMD,
    depositAmd: 0,
    totalAmd: 5800 + SERVICE_FEE_AMD,
    readyAt: null,
    reservationId: null,
    reservation: null,
    notes: null,
    payment: null,
    createdAt: new Date('2026-07-21T10:00:00Z'),
    branch: branch(),
    items: [
      {
        id: 'item-1',
        menuItemId: BURGER,
        nameSnapshot: 'Burger',
        unitPriceAmd: 5800,
        qty: 1,
        lineTotalAmd: 5800,
      },
    ],
    ...over,
  };
}

const RESERVATION = '55555555-5555-4555-8555-555555555555';

function reservationRow(over: Record<string, unknown> = {}) {
  return {
    id: RESERVATION,
    branchId: BRANCH_ID,
    status: 'confirmed',
    depositAmd: 4000,
    table: { tableNo: '2' },
    order: null,
    ...over,
  };
}

function build(
  options: {
    branch?: unknown;
    menuItems?: unknown[];
    order?: unknown;
    reservation?: unknown;
    coupon?: { coupon: { id: string }; discountAmd: number };
    /** What `PaymentsService.reverse` reports back. Defaults to a refund,
     *  which is the only outcome that has anything to check afterwards. */
    reversedTo?: PaymentStatus;
  } = {},
) {
  const orderCreate = jest.fn().mockResolvedValue(options.order ?? orderRow());
  const orderUpdate = jest.fn().mockImplementation(({ data }: { data: { status: string } }) =>
    Promise.resolve(orderRow({ status: data.status })),
  );
  const paymentUpdate = jest.fn().mockResolvedValue({});
  const orderEventCreate = jest.fn().mockResolvedValue({ id: 'event-1' });

  const prisma = {
    restaurantBranch: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? branch() : options.branch),
    },
    menuItem: { findMany: jest.fn().mockResolvedValue(options.menuItems ?? [menuItem(BURGER)]) },
    order: {
      create: orderCreate,
      update: orderUpdate,
      // Two callers share findFirst: the pickup-code clash probe (which
      // selects only `id`) and the ownership lookup. No clash by default.
      findFirst: jest
        .fn()
        .mockImplementation((args: { select?: unknown }) =>
          Promise.resolve(args.select ? null : (options.order ?? orderRow())),
        ),
      findMany: jest.fn().mockResolvedValue([orderRow()]),
      count: jest.fn().mockResolvedValue(1),
    },
    payment: { update: paymentUpdate },
    reservation: {
      findFirst: jest.fn().mockResolvedValue(options.reservation ?? null),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          order: { update: orderUpdate },
          payment: { update: paymentUpdate },
          orderEvent: { create: orderEventCreate },
        }),
      ),
    ),
  } as unknown as PrismaService;

  const payments = {
    reverse: jest.fn().mockResolvedValue(options.reversedTo ?? PaymentStatus.Refunded),
  };
  const events = { publish: jest.fn(), subscribe: jest.fn() };
  const coupons = {
    preview: jest.fn().mockResolvedValue(options.coupon ?? null),
    claim: jest.fn().mockResolvedValue(options.coupon ?? null),
    release: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new OrdersService(
      prisma,
      payments as unknown as PaymentsService,
      events as unknown as OrderEventsService,
      coupons as unknown as CouponsService,
    ),
    prisma,
    payments,
    events,
    coupons,
    orderCreate,
    orderUpdate,
    paymentUpdate,
    orderEventCreate,
  };
}

function dto(over: Partial<CreateOrderDto> = {}): CreateOrderDto {
  return Object.assign(new CreateOrderDto(), {
    branchId: BRANCH_ID,
    serviceMode: ServiceMode.Pickup,
    items: [{ menuItemId: BURGER, qty: 1 }],
    ...over,
  });
}

describe('quote', () => {
  it('prices from the database, ignoring anything the client thinks a dish costs', () => {
    // The DTO carries ids and quantities only â€” this is the test that says why.
    return build({ menuItems: [menuItem(BURGER, { priceAmd: 5800 })] })
      .service.quote(dto({ items: [{ menuItemId: BURGER, qty: 2 }] }), Language.En, 'user-1')
      .then((quote) => {
        expect(quote.subtotalAmd).toBe(11_600);
        expect(quote.totalAmd).toBe(11_600 + SERVICE_FEE_AMD);
        expect(quote.items[0]?.unitPriceAmd).toBe(5800);
      });
  });

  it('localises the dish name for the caller', async () => {
    const { service } = build();
    const quote = await service.quote(dto(), Language.En, 'user-1');
    expect(quote.items[0]?.name).toBe('Burger');
  });

  it('reports an unknown dish instead of throwing, so the basket can flag the line', async () => {
    const { service } = build({ menuItems: [] });
    const quote = await service.quote(dto(), Language.En, 'user-1');

    expect(quote.unavailable).toEqual([{ menuItemId: BURGER, reason: 'not_on_menu' }]);
    expect(quote.canOrder).toBe(false);
  });

  it('treats a dish from another branch as not on the menu', async () => {
    // The query is scoped to the branch, so a dish belonging elsewhere simply
    // does not come back â€” ordering it at its own price is not possible.
    const { service, prisma } = build({ menuItems: [] });
    await service.quote(dto(), Language.En, 'user-1');

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: BRANCH_ID }) }),
    );
  });

  it('reports a sold-out dish', async () => {
    const { service } = build({ menuItems: [menuItem(BURGER, { isAvailable: false })] });
    const quote = await service.quote(dto(), Language.En, 'user-1');

    expect(quote.unavailable).toEqual([{ menuItemId: BURGER, reason: 'sold_out' }]);
  });

  it('still prices a closed restaurant but refuses to let it be ordered', async () => {
    const { service } = build({ branch: branch({ isOpen: false }) });
    const quote = await service.quote(dto(), Language.En, 'user-1');

    expect(quote.subtotalAmd).toBe(5800);
    expect(quote.branchIsOpen).toBe(false);
    expect(quote.canOrder).toBe(false);
  });

  it('refuses a dine-in basket with no booking behind it', async () => {
    // Food brought to a table needs a table, which means a reservation —
    // that is what keeps orders.reservation_id meaningful.
    const { service } = build();
    await expect(
      service.quote(dto({ serviceMode: ServiceMode.DineIn }), Language.En, 'user-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('404s for an unknown branch', async () => {
    const { service } = build({ branch: null });
    await expect(service.quote(dto(), Language.En, 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('credits a table deposit against the bill instead of charging it again', async () => {
    // BUSINESS_LOGIC §3: the deposit was taken at booking. `totalAmd` is the
    // meal; `dueNowAmd` is what is actually left to pay at the table.
    const { service } = build({ reservation: reservationRow({ depositAmd: 4000 }) });

    const quote = await service.quote(
      dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
      Language.En,
      'user-1',
    );

    expect(quote.totalAmd).toBe(5800 + SERVICE_FEE_AMD);
    expect(quote.depositAmd).toBe(4000);
    expect(quote.dueNowAmd).toBe(5800 + SERVICE_FEE_AMD - 4000);
    expect(quote.tableNo).toBe('2');
  });

  it('never reports a negative amount due when the deposit exceeds the bill', async () => {
    const { service } = build({ reservation: reservationRow({ depositAmd: 99_000 }) });

    const quote = await service.quote(
      dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
      Language.En,
      'user-1',
    );

    expect(quote.dueNowAmd).toBe(0);
  });

  it('rejects the same dish twice rather than merging it silently', async () => {
    // Merging would hide a broken client basket and could smuggle a quantity
    // past ORDER_MAX_ITEM_QTY.
    const { service } = build();
    await expect(
      service.quote(
        dto({
          items: [
            { menuItemId: BURGER, qty: 1 },
            { menuItemId: BURGER, qty: 1 },
          ],
        }),
        Language.En,
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('create', () => {
  it('stores server-computed totals and a name snapshot', async () => {
    const { service, orderCreate } = build({
      menuItems: [menuItem(BURGER), menuItem(FRIES, { priceAmd: 1200, prepMin: 5 })],
    });

    await service.create(
      'user-1',
      dto({
        items: [
          { menuItemId: BURGER, qty: 2 },
          { menuItemId: FRIES, qty: 1 },
        ],
      }),
      Language.En,
    );

    const data = orderCreate.mock.calls[0][0].data;
    expect(data.subtotalAmd).toBe(12_800);
    expect(data.totalAmd).toBe(12_800 + SERVICE_FEE_AMD);
    expect(data.userId).toBe('user-1');
    expect(data.items.create[0].nameSnapshot).toBe('Burger');
  });

  it('refuses to create an order containing a sold-out dish', async () => {
    const { service } = build({ menuItems: [menuItem(BURGER, { isAvailable: false })] });
    await expect(service.create('user-1', dto(), Language.En)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses when the restaurant is closed', async () => {
    const { service } = build({ branch: branch({ isOpen: false }) });
    await expect(service.create('user-1', dto(), Language.En)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('defaults readyAt to the prep estimate', async () => {
    const { service, orderCreate } = build({ menuItems: [menuItem(BURGER, { prepMin: 20 })] });
    await service.create('user-1', dto(), Language.En);

    const readyAt: Date = orderCreate.mock.calls[0][0].data.readyAt;
    const minutes = (readyAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(19);
    expect(minutes).toBeLessThan(21);
  });

  it('rejects a readyAt the kitchen cannot make', async () => {
    const { service } = build({ menuItems: [menuItem(BURGER, { prepMin: 30 })] });
    const tooSoon = new Date(Date.now() + 5 * 60_000).toISOString();

    await expect(service.create('user-1', dto({ readyAt: tooSoon }), Language.En)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('tolerates a readyAt a few seconds early, which is only clock skew', async () => {
    // The client picks the time from the quote's earliestReadyAt; without
    // slack the round trip alone would make the server reject its own answer.
    const { service } = build({ menuItems: [menuItem(BURGER, { prepMin: 10 })] });
    const barelyEarly = new Date(Date.now() + 10 * 60_000 - 5_000).toISOString();

    await expect(
      service.create('user-1', dto({ readyAt: barelyEarly }), Language.En),
    ).resolves.toBeDefined();
  });

  it('rejects a readyAt beyond the booking horizon', async () => {
    const { service } = build();
    const tooFar = new Date(Date.now() + (ORDER_MAX_LEAD_DAYS + 1) * 86_400_000).toISOString();

    await expect(service.create('user-1', dto({ readyAt: tooFar }), Language.En)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('links a dine-in order to its booking', async () => {
    const { service, orderCreate } = build({ reservation: reservationRow() });

    await service.create(
      'user-1',
      dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
      Language.En,
    );

    const data = orderCreate.mock.calls[0][0].data;
    expect(data.reservationId).toBe(RESERVATION);
    expect(data.depositAmd).toBe(4000);
    // Recorded, never added: the guest already paid it at booking.
    expect(data.totalAmd).toBe(5800 + SERVICE_FEE_AMD);
  });

  it('refuses to order against a cancelled booking', async () => {
    const { service } = build({ reservation: reservationRow({ status: 'cancelled' }) });

    await expect(
      service.create(
        'user-1',
        dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
        Language.En,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses a second order on one booking', async () => {
    const { service } = build({ reservation: reservationRow({ order: { id: 'order-9' } }) });

    await expect(
      service.create(
        'user-1',
        dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
        Language.En,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses a booking made at a different restaurant', async () => {
    const { service } = build({ reservation: reservationRow({ branchId: 'other-branch' }) });

    await expect(
      service.create(
        'user-1',
        dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
        Language.En,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("scopes the booking lookup to the caller, so another guest's table is not found", async () => {
    const { service, prisma } = build({ reservation: reservationRow() });

    await service.create(
      'user-1',
      dto({ serviceMode: ServiceMode.DineIn, reservationId: RESERVATION }),
      Language.En,
    );

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: RESERVATION, userId: 'user-1' } }),
    );
  });

  it('derives the pickup code from the order code', async () => {
    const { service } = build({ order: orderRow({ code: 'AMR-99994821' }) });
    const order = await service.create('user-1', dto(), Language.En);

    expect(order.pickupCode).toBe('4821');
  });
});

describe('coupons on an order', () => {
  it('claims the coupon and stores what it took off', async () => {
    const { service, orderCreate, coupons } = build({
      coupon: { coupon: { id: 'coupon-1' }, discountAmd: 168 },
    });

    await service.create('user-1', dto({ couponCode: 'FRIENDS' }), Language.En);

    expect(coupons.claim).toHaveBeenCalled();
    const data = orderCreate.mock.calls[0][0].data;
    expect(data.discountAmd).toBe(168);
    expect(data.couponId).toBe('coupon-1');
    // 5800 - 168 + fee
    expect(data.totalAmd).toBe(5800 - 168 + SERVICE_FEE_AMD);
  });

  it('reports the discount back to the client', async () => {
    // Regression: the discount was applied to the total but left out of the
    // response, so the app could not show "you saved …".
    const { service } = build({
      order: orderRow({ discountAmd: 168 }),
      coupon: { coupon: { id: 'coupon-1' }, discountAmd: 168 },
    });

    const order = await service.create('user-1', dto({ couponCode: 'FRIENDS' }), Language.En);
    expect(order.discountAmd).toBe(168);
  });

  it('hands the coupon back when the order cannot be created', async () => {
    const { service, prisma, coupons } = build({
      coupon: { coupon: { id: 'coupon-1' }, discountAmd: 168 },
    });
    (prisma.order.create as jest.Mock).mockRejectedValue(new Error('insert failed'));

    await expect(
      service.create('user-1', dto({ couponCode: 'FRIENDS' }), Language.En),
    ).rejects.toThrow();
    expect(coupons.release).toHaveBeenCalledWith('coupon-1');
  });

  it('returns the coupon when the order is cancelled', async () => {
    const { service, coupons } = build({ order: orderRow({ couponId: 'coupon-1' }) });
    await service.cancel('user-1', 'order-1');

    expect(coupons.release).toHaveBeenCalledWith('coupon-1');
  });

  it('does not spend a coupon just to price a quote', async () => {
    const { service, coupons } = build({
      coupon: { coupon: { id: 'coupon-1' }, discountAmd: 168 },
    });

    await service.quote(dto({ couponCode: 'FRIENDS' }), Language.En, 'user-1');

    expect(coupons.preview).toHaveBeenCalled();
    expect(coupons.claim).not.toHaveBeenCalled();
  });
});

describe('reading orders', () => {
  it('scopes a lookup to the caller, so another user\'s order is simply not found', async () => {
    const { service, prisma } = build();
    await service.findOne('user-1', 'order-1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1', userId: 'user-1' } }),
    );
  });

  it('404s rather than 403s when the order belongs to someone else', async () => {
    const { service, prisma } = build();
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.findOne('user-1', 'order-1')).rejects.toThrow(NotFoundException);
  });

  it('counts dishes rather than lines', async () => {
    const { service, prisma } = build();
    (prisma.order.findMany as jest.Mock).mockResolvedValue([
      orderRow({ items: [{ qty: 2 }, { qty: 3 }] }),
    ]);

    const page = await service.list('user-1', { page: 1, limit: 20 });
    expect(page.items[0]?.itemsCount).toBe(5);
  });
});

describe('cancel', () => {
  it('refuses once the kitchen has started', async () => {
    const { service } = build({ order: orderRow({ status: OrderStatus.Preparing }) });
    await expect(service.cancel('user-1', 'order-1')).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses once the order has been paid for', async () => {
    // BUSINESS_LOGIC.md §4: paying commits the order. This is the rule that
    // replaced "cancellable until the kitchen starts", and it is what makes a
    // refund something this service never has to perform.
    for (const status of [OrderStatus.Paid, OrderStatus.Confirmed]) {
      const { service, payments } = build({ order: orderRow({ status }) });

      await expect(service.cancel('user-1', 'order-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(payments.reverse).not.toHaveBeenCalled();
    }
  });

  it('releases an attempt that took nothing when an unpaid order is dropped', async () => {
    // A card that was refused, on an order the customer then walked away from.
    // The payment row is closed off with it rather than left looking live.
    const payment = {
      id: 'pay-1',
      status: PaymentStatus.Failed,
      amountAmd: 6160,
      providerRef: null,
      method: 'card',
    };
    const { service, payments, paymentUpdate } = build({
      order: orderRow({ status: OrderStatus.Created, payment }),
      reversedTo: PaymentStatus.Cancelled,
    });

    await service.cancel('user-1', 'order-1');

    expect(payments.reverse).toHaveBeenCalledWith(payment);
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PaymentStatus.Cancelled } }),
    );
  });

  it('matches on the status it read, so a cancel racing the kitchen loses', async () => {
    // Regression: the cancellable check reads a snapshot. An unconditional
    // update would let a cancel land on an order that started cooking.
    const { service, orderUpdate } = build();
    await service.cancel('user-1', 'order-1');

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1', status: OrderStatus.Created } }),
    );
  });

  it('announces the change, so a tracking screen does not have to poll', async () => {
    const { service, events } = build();
    await service.cancel('user-1', 'order-1');

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', status: OrderStatus.Cancelled }),
    );
  });

  it('cancels an unpaid order without touching the provider', async () => {
    const { service, payments } = build();
    const order = await service.cancel('user-1', 'order-1');

    expect(payments.reverse).not.toHaveBeenCalled();
    expect(order.status).toBe(OrderStatus.Cancelled);
  });
});

describe('history', () => {
  it('writes the first entry in the same INSERT that creates the order', async () => {
    // Nested, not a second call: an order that exists with no record of having
    // been placed is the one gap this table cannot have.
    const { service, orderCreate } = build();
    await service.create('user-1', dto(), Language.En);

    const events = orderCreate.mock.calls[0][0].data.events.create;
    expect(events).toMatchObject({
      type: OrderEventType.Created,
      toStatus: OrderStatus.Created,
      actorType: OrderActorType.Customer,
      actorUserId: 'user-1',
    });
  });

  it('records what was ordered, so the entry says more than "created"', async () => {
    const { service, orderCreate } = build();
    await service.create('user-1', dto({ items: [{ menuItemId: BURGER, qty: 3 }] }), Language.En);

    expect(orderCreate.mock.calls[0][0].data.events.create.detail).toMatchObject({
      serviceMode: ServiceMode.Pickup,
      itemsCount: 3,
    });
  });

  it('records a status change inside the same transaction as the change', async () => {
    // Written through `tx`, not `prisma`: the optimistic match on the update
    // aborts this too, so no entry can claim a move that lost the race.
    const { service, orderEventCreate } = build();
    await service.cancel('user-1', 'order-1');

    expect(orderEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        type: OrderEventType.StatusChanged,
        fromStatus: OrderStatus.Created,
        toStatus: OrderStatus.Cancelled,
        actorUserId: 'user-1',
      }),
    });
  });

  it('says what became of the money when a cancellation closes an attempt off', async () => {
    // "Cancelled" and "cancelled, and the card attempt was released" are
    // different answers to the question this timeline gets opened for. A
    // captured payment can no longer be here — the order would have been
    // `paid`, and a paid order cannot be cancelled at all.
    const { service, orderEventCreate } = build({
      order: orderRow({
        status: OrderStatus.Created,
        payment: {
          id: 'pay-1',
          status: PaymentStatus.Failed,
          amountAmd: 6160,
          providerRef: null,
          method: PaymentMethod.Card,
        },
      }),
      reversedTo: PaymentStatus.Cancelled,
    });

    await service.cancel('user-1', 'order-1');

    expect(orderEventCreate.mock.calls[0][0].data.detail).toEqual({
      paymentStatus: PaymentStatus.Cancelled,
      paymentMethod: PaymentMethod.Card,
      amountAmd: 6160,
    });
  });

  it('names the staff member on a transition the panel made', async () => {
    const { service, orderEventCreate } = build();
    const order = orderRow() as Parameters<typeof service.transition>[0];

    await service.transition(order, OrderStatus.Cancelled, {
      type: OrderActorType.Staff,
      staffId: 'staff-7',
      actingStaffId: 'super-1',
    });

    expect(orderEventCreate.mock.calls[0][0].data).toMatchObject({
      actorType: OrderActorType.Staff,
      actorStaffId: 'staff-7',
      actingStaffId: 'super-1',
      actorUserId: null,
    });
  });
});

describe('countdown', () => {
  it('counts down to readyAt', () => {
    const readyAt = new Date(Date.now() + 480_000);
    expect(countdown(readyAt, OrderStatus.Preparing)).toBeCloseTo(480, -1);
  });

  it('never goes negative on a late order', () => {
    const readyAt = new Date(Date.now() - 60_000);
    expect(countdown(readyAt, OrderStatus.Preparing)).toBe(0);
  });

  it('is null once there is nothing left to wait for', () => {
    const readyAt = new Date(Date.now() + 480_000);
    expect(countdown(readyAt, OrderStatus.Ready)).toBeNull();
    expect(countdown(readyAt, OrderStatus.Completed)).toBeNull();
    expect(countdown(readyAt, OrderStatus.Cancelled)).toBeNull();
    expect(countdown(null, OrderStatus.Preparing)).toBeNull();
  });
});

