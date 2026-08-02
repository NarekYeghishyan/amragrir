import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  ACTIVE_ORDER_STATUSES,
  OrderActorType,
  OrderStatus,
  QueueFilter,
  StaffRole,
  TERMINAL_ORDER_STATUSES,
} from '@amragrir/shared';
import { RestaurantOrdersService } from './orders.service';

import { ListQueueDto, SetOrderStatusDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import type { OrderHistoryService } from '../orders/order-history.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

const ORDER_ID = '55555555-5555-4555-8555-555555555555';

const RESTAURANT_ID = '44444444-4444-4444-8444-444444444444';

/** A restaurant admin, whose reach is every branch of their restaurant. */
const staff: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantAdmin, restaurantId: RESTAURANT_ID, branchId: null }],
};

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
    items: [
      { menuItemId: 'dish-1', nameSnapshot: 'Burger', qty: 2, lineTotalAmd: 5600 },
    ],
    ...over,
  };
}

function build(options: { order?: unknown; grouped?: unknown[] } = {}) {
  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(options.order === undefined ? orderRow() : options.order),
      findMany: jest.fn().mockResolvedValue([orderRow()]),
      count: jest.fn().mockResolvedValue(1),
      // The per-stage counts the tabs render from.
      groupBy: jest.fn().mockResolvedValue(options.grouped ?? []),
    },
  } as unknown as PrismaService;

  const orders = { transition: jest.fn().mockResolvedValue({ status: OrderStatus.Preparing }) };
  const history = { list: jest.fn().mockResolvedValue({ items: [] }) };

  return {
    service: new RestaurantOrdersService(
      prisma,
      orders as unknown as OrdersService,
      history as unknown as OrderHistoryService,
    ),
    prisma,
    orders,
    history,
  };
}

const query = (over: Partial<ListQueueDto> = {}): ListQueueDto =>
  Object.assign(new ListQueueDto(), { page: 1, limit: 20, ...over });

describe('listOrders', () => {
  it('scopes the queue to the branches the owner owns', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query());

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT_ID] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('lets branchId narrow the scope but never widen it', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query({ branchId: 'branch-9' }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.branchId).toBe('branch-9');
    // The ownership filter survives alongside it — otherwise passing someone
    // else's branchId would list their orders.
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT_ID] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('lists oldest first — a kitchen works a queue, not a stack', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query());

    expect((prisma.order.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('shows the pickup code and the dish count', async () => {
    const { service } = build();
    const page = await service.listOrders(staff, query());

    expect(page.items[0]?.pickupCode).toBe('4821');
    expect(page.items[0]?.itemsCount).toBe(2);
  });

  it('gives each line the dish it came from and what it cost', async () => {
    // The name is the snapshot — what the diner bought, whatever the dish is
    // called now — and the id is the dish itself, which is what lets the board
    // link a line to its row on the menu. The price is the line, not the unit.
    const { service } = build();
    const page = await service.listOrders(staff, query());

    expect(page.items[0]?.items).toEqual([
      { menuItemId: 'dish-1', name: 'Burger', qty: 2, lineTotalAmd: 5600 },
    ]);
  });

  it('shows the live board when no stage is asked for', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query());

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status.in).toEqual([...ACTIVE_ORDER_STATUSES]);
  });

  it('filters by stage, so a tab is not the panel sorting one page', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Ready }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status.in).toEqual([OrderStatus.Ready]);
  });

  it('gives the paid-but-unaccepted orders a stage of their own', async () => {
    // The one queue whose next move is the restaurant's: the money is taken
    // and nobody has confirmed yet, so a diner is watching a timer that has not
    // started. Exactly `paid` — `created` is an unpaid basket and `confirmed`
    // is already somebody's problem.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Paid }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status.in).toEqual([OrderStatus.Paid]);
  });

  it('reaches finished orders, which the board could not before', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Past }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status.in).toEqual([...TERMINAL_ORDER_STATUSES]);
  });

  it('searches the order code and the customer name', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query({ q: '4821' }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.AND).toEqual([
      {
        OR: [
          { code: { contains: '4821', mode: 'insensitive' } },
          { user: { name: { contains: '4821', mode: 'insensitive' } } },
        ],
      },
    ]);
  });

  it('keeps the ownership filter intact while searching', async () => {
    // The search must not be assigned to `where.OR` — that is where the scope
    // filter lives, and replacing it would turn the search box into a way to
    // read every restaurant's orders.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ q: 'Aram' }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT_ID] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('ignores a search of nothing but spaces', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query({ q: '   ' }));

    expect((prisma.order.findMany as jest.Mock).mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('narrows to one restaurant', async () => {
    const { service, prisma } = build();
    await service.listOrders(staff, query({ restaurantId: RESTAURANT_ID }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.branch).toEqual({ restaurantId: RESTAURANT_ID });
  });

  it('counts every stage under the search, but not under the stage itself', async () => {
    // What makes a search useful: looking at the live board and typing a code
    // that belongs to a finished order should say where it went.
    const { service, prisma } = build({
      grouped: [
        { status: OrderStatus.Ready, _count: { _all: 2 } },
        { status: OrderStatus.Completed, _count: { _all: 1 } },
      ],
    });
    const page = await service.listOrders(staff, query({ status: QueueFilter.Confirmed }));

    expect(page.counts).toEqual({
      [QueueFilter.Active]: 2,
      [QueueFilter.Paid]: 0,
      [QueueFilter.Unpaid]: 0,
      [QueueFilter.Confirmed]: 0,
      [QueueFilter.Preparing]: 0,
      [QueueFilter.AlmostReady]: 0,
      [QueueFilter.Ready]: 2,
      [QueueFilter.Past]: 1,
    });

    // Grouped under everything except the stage — otherwise every tab but the
    // open one would read zero.
    expect((prisma.order.groupBy as jest.Mock).mock.calls[0][0].where.status).toBeUndefined();
  });

  it('counts one paid order under both active and paid', async () => {
    // `active` still spans the whole live queue, so the counts do not add up to
    // the number of orders. A count that did would mean an order had fallen out
    // of a stage that admits it.
    const { service } = build({
      grouped: [{ status: OrderStatus.Paid, _count: { _all: 1 } }],
    });
    const page = await service.listOrders(staff, query({ status: QueueFilter.Paid }));

    expect(page.counts).toEqual({
      [QueueFilter.Active]: 1,
      [QueueFilter.Paid]: 1,
      [QueueFilter.Unpaid]: 0,
      [QueueFilter.Confirmed]: 0,
      [QueueFilter.Preparing]: 0,
      [QueueFilter.AlmostReady]: 0,
      [QueueFilter.Ready]: 0,
      [QueueFilter.Past]: 0,
    });
  });

  it('reaches the orders nobody paid for', async () => {
    // An abandoned basket and a declined card both leave a `created` order
    // behind, and nothing expires them — so the one way to find them is asking
    // for this stage.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Unpaid }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status.in).toEqual([OrderStatus.Created]);
  });

  it('splits preparing from almost ready, which used to be one stage', async () => {
    // "Almost ready" is the warning a counter needs before it has to hand
    // something over. Folded into `preparing` it could not be counted, and a
    // pass cannot plan around a number it does not have.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.AlmostReady }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status.in).toEqual([OrderStatus.AlmostReady]);
  });
});

describe('setStatus', () => {
  const dto = (status: OrderStatus): SetOrderStatusDto =>
    Object.assign(new SetOrderStatusDto(), { status });

  it('advances an order through the shared state machine', async () => {
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Confirmed }) });
    await service.setStatus(staff, ORDER_ID, dto(OrderStatus.Preparing));

    expect(orders.transition).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORDER_ID }),
      OrderStatus.Preparing,
      expect.objectContaining({ type: OrderActorType.Staff, staffId: 'staff-1' }),
    );
  });

  it('names the staff member who moved it', async () => {
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Confirmed }) });
    await service.setStatus(staff, ORDER_ID, dto(OrderStatus.Preparing));

    expect(orders.transition).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      type: OrderActorType.Staff,
      staffId: 'staff-1',
      actingStaffId: undefined,
    });
  });

  it('records the real super admin behind an impersonated session', async () => {
    // `sub` is the account being acted as, which every scope filter uses. The
    // history has to name both, or it credits the change to somebody who was
    // not at the keyboard.
    const impersonated: StaffJwtPayload = { ...staff, act: 'super-1' };
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Confirmed }) });
    await service.setStatus(impersonated, ORDER_ID, dto(OrderStatus.Preparing));

    expect(orders.transition).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      type: OrderActorType.Staff,
      staffId: 'staff-1',
      actingStaffId: 'super-1',
    });
  });

  it('refuses a move the state machine does not allow', async () => {
    // paid -> ready skips the kitchen entirely.
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Paid }) });

    await expect(
      service.setStatus(staff, ORDER_ID, dto(OrderStatus.Ready)),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(orders.transition).not.toHaveBeenCalled();
  });

  it('takes a cooking order straight to ready, in one move', async () => {
    // The board's second button on a preparing card. It is one transition, not
    // two run together: the dish never sat in `almost_ready`, so the history
    // says `preparing -> ready` and says it once.
    const { service, orders } = build({ order: orderRow({ status: OrderStatus.Preparing }) });
    await service.setStatus(staff, ORDER_ID, dto(OrderStatus.Ready));

    expect(orders.transition).toHaveBeenCalledTimes(1);
    expect(orders.transition).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORDER_ID }),
      OrderStatus.Ready,
      expect.anything(),
    );
  });

  it('puts reach in the lookup, so another restaurant order is simply missing', async () => {
    const { service, prisma } = build();
    await service.setStatus(staff, ORDER_ID, dto(OrderStatus.Confirmed));

    const where = (prisma.order.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBe(ORDER_ID);
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT_ID] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('scopes the lookup on orders:advance, not orders:read', async () => {
    // A role allowed only to watch the queue must not be able to move an
    // order in it, so the filter is built for the permission being exercised.
    const watcher: StaffJwtPayload = {
      sub: 'staff-2',
      kind: 'staff',
      scopes: [{ role: StaffRole.BranchStaff, restaurantId: null, branchId: 'branch-1' }],
    };
    const { service, prisma } = build();
    await service.setStatus(watcher, ORDER_ID, dto(OrderStatus.Confirmed));

    const where = (prisma.order.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [] } } },
      { branchId: { in: ['branch-1'] } },
    ]);
  });

  it('404s on an order outside the caller scope', async () => {
    const { service } = build({ order: null });

    await expect(
      service.setStatus(staff, ORDER_ID, dto(OrderStatus.Confirmed)),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('history', () => {
  it('puts the caller reach in the query rather than checking it afterwards', async () => {
    const { service, history } = build();
    await service.history(staff, ORDER_ID);

    expect(history.list).toHaveBeenCalledWith({
      id: ORDER_ID,
      OR: [{ branch: { restaurantId: { in: [RESTAURANT_ID] } } }, { branchId: { in: [] } }],
    });
  });

  it('scopes on orders:read, so a shift that cannot advance can still read the trail', async () => {
    const watcher: StaffJwtPayload = {
      sub: 'staff-2',
      kind: 'staff',
      scopes: [{ role: StaffRole.BranchStaff, restaurantId: null, branchId: 'branch-1' }],
    };
    const { service, history } = build();
    await service.history(watcher, ORDER_ID);

    expect((history.list as jest.Mock).mock.calls[0][0].OR).toEqual([
      { branch: { restaurantId: { in: [] } } },
      { branchId: { in: ['branch-1'] } },
    ]);
  });
});
