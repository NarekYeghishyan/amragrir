import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OrderStatus, Role } from '@amragrir/shared';
import { OwnerService } from './owner.service';
import { orderScopeFor } from './branch-access';
import { ListOwnerOrdersDto, SetOrderStatusDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import type { JwtPayload } from '../auth/token.service';

const ORDER_ID = '55555555-5555-4555-8555-555555555555';

const user = (role: Role): JwtPayload => ({
  sub: 'staff-1',
  role,
  isGuest: false,
  phoneVerified: true,
});

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    code: 'AMR-12344821',
    status: OrderStatus.Paid,
    serviceMode: 'pickup',
    totalAmd: 6160,
    readyAt: new Date(Date.now() + 600_000),
    createdAt: new Date(),
    notes: null,
    branch: { id: 'branch-1', name: 'Northern Ave' },
    payment: { status: 'captured' },
    user: { name: 'Aram' },
    items: [{ nameSnapshot: 'Burger', qty: 2 }],
    ...over,
  };
}

function build(options: { order?: unknown } = {}) {
  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(options.order === undefined ? orderRow() : options.order),
      findMany: jest.fn().mockResolvedValue([orderRow()]),
      count: jest.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;

  const orders = { transition: jest.fn().mockResolvedValue({ status: OrderStatus.Preparing }) };

  return {
    service: new OwnerService(prisma, orders as unknown as OrdersService),
    prisma,
    orders,
  };
}

const query = (over: Partial<ListOwnerOrdersDto> = {}): ListOwnerOrdersDto =>
  Object.assign(new ListOwnerOrdersDto(), { page: 1, limit: 20, ...over });

describe('orderScopeFor', () => {
  it('gives an admin everything', () => {
    expect(orderScopeFor(user(Role.Admin))).toEqual({});
  });

  it('limits an owner to their own restaurants', () => {
    expect(orderScopeFor(user(Role.Owner))).toEqual({
      branch: { restaurant: { ownerId: 'staff-1' } },
    });
  });

  it('refuses staff rather than handing them the owner reach', () => {
    // The schema has no user-to-branch link yet, so there is nothing to scope
    // staff by. Refusing is the safe answer until that table exists.
    expect(() => orderScopeFor(user(Role.Staff))).toThrow(ForbiddenException);
    expect(() => orderScopeFor(user(Role.Customer))).toThrow(ForbiddenException);
  });
});

describe('listOrders', () => {
  it('scopes the queue to the branches the owner owns', async () => {
    const { service, prisma } = build();
    await service.listOrders(user(Role.Owner), query());

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branch: { restaurant: { ownerId: 'staff-1' } } }),
      }),
    );
  });

  it('lets branchId narrow the scope but never widen it', async () => {
    const { service, prisma } = build();
    await service.listOrders(user(Role.Owner), query({ branchId: 'branch-9' }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.branchId).toBe('branch-9');
    // The ownership filter survives alongside it — otherwise passing someone
    // else's branchId would list their orders.
    expect(where.branch).toEqual({ restaurant: { ownerId: 'staff-1' } });
  });

  it('lists oldest first — a kitchen works a queue, not a stack', async () => {
    const { service, prisma } = build();
    await service.listOrders(user(Role.Owner), query());

    expect((prisma.order.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('shows the pickup code and the dish count', async () => {
    const { service } = build();
    const page = await service.listOrders(user(Role.Owner), query());

    expect(page.items[0]?.pickupCode).toBe('4821');
    expect(page.items[0]?.itemsCount).toBe(2);
  });
});

describe('setStatus', () => {
  const dto = (status: OrderStatus): SetOrderStatusDto =>
    Object.assign(new SetOrderStatusDto(), { status });

  it('advances an order through the shared state machine', async () => {
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Confirmed }) });
    await service.setStatus(user(Role.Owner), ORDER_ID, dto(OrderStatus.Preparing));

    expect(orders.transition).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORDER_ID }),
      OrderStatus.Preparing,
    );
  });

  it('refuses a move the state machine does not allow', async () => {
    // paid -> ready skips the kitchen entirely.
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Paid }) });

    await expect(
      service.setStatus(user(Role.Owner), ORDER_ID, dto(OrderStatus.Ready)),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(orders.transition).not.toHaveBeenCalled();
  });

  it('puts ownership in the lookup, so another restaurant order is simply missing', async () => {
    const { service, prisma } = build();
    await service.setStatus(user(Role.Owner), ORDER_ID, dto(OrderStatus.Confirmed));

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID, branch: { restaurant: { ownerId: 'staff-1' } } },
      }),
    );
  });

  it('404s on an order outside the caller scope', async () => {
    const { service } = build({ order: null });

    await expect(
      service.setStatus(user(Role.Owner), ORDER_ID, dto(OrderStatus.Confirmed)),
    ).rejects.toThrow(NotFoundException);
  });
});
