import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  ACTIVE_ORDER_STATUSES,
  HANDOVER_CODE_MISMATCH,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  QueueFilter,
  StaffRole,
  TERMINAL_ORDER_STATUSES,
} from '@amragrir/shared';
import { RestaurantOrdersService } from './orders.service';

import { ListQueueDto, SetOrderReminderDto, SetOrderStatusDto } from './dto';
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
    // Six digits with nothing of the order code in them, which is the point of
    // the column: `4821` is the tail of `code` and is *not* what the counter
    // asks for any more.
    pickupCode: '730914',
    status: OrderStatus.Paid,
    serviceMode: 'pickup',
    totalAmd: 6160,
    readyAt: new Date(Date.now() + 600_000),
    // Null is an ordinary order: placed for as soon as possible, with no
    // warning to give and therefore no lead. The pre-order cases below set both.
    reminderAt: null,
    reminderLeadMin: null,
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

function build(
  options: { order?: unknown; grouped?: unknown[]; scheduled?: number } = {},
) {
  // Echoes the write back, which is what the real client does and what
  // `setReminderLead` reads its answer out of.
  const orderUpdate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: ORDER_ID, ...data }),
    );
  const orderEventCreate = jest.fn().mockResolvedValue({ id: 'event-1' });

  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(options.order === undefined ? orderRow() : options.order),
      findMany: jest.fn().mockResolvedValue([orderRow()]),
      // Two counts, in the order `listOrders` asks for them: the page total,
      // then the pre-orders. The second cannot come from the grouped query —
      // it is a question about a timestamp, not a status.
      count: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValue(options.scheduled ?? 0),
      // The per-stage counts the tabs render from.
      groupBy: jest.fn().mockResolvedValue(options.grouped ?? []),
      update: orderUpdate,
    },
    orderEvent: { create: orderEventCreate },
    // The interactive form: the service hands in a callback, and the real
    // client hands it a transaction client. Handing back the same mock is the
    // equivalent here — what is being asserted is that both writes happen under
    // one call, not that Postgres held a lock.
    $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) => run(prisma)),
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
    orderUpdate,
    orderEventCreate,
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

  it('lists by when the kitchen has to start — a queue, not a stack', async () => {
    // It used to sort on `created_at`, which for an as-soon-as-possible order is
    // the same ordering: `prep_start_at` is that time plus a prep estimate. What
    // it is not the same as is a pre-order, whose place in the queue is the hour
    // it must be started and not the day it was placed.
    //
    // Nulls last, so orders from before this column existed — all of them
    // finished — do not sort to the front of a live board.
    const { service, prisma } = build();
    await service.listOrders(staff, query());

    expect((prisma.order.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { prepStartAt: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('shows the order code and the dish count', async () => {
    const { service } = build();
    const page = await service.listOrders(staff, query());

    expect(page.items[0]?.code).toBe('AMR-12344821');
    expect(page.items[0]?.itemsCount).toBe(2);
  });

  it('never sends the collection code to the board', async () => {
    // The whole handover check rests on this. A card that printed the code —
    // which it used to — means the counter can close an order without ever
    // asking the guest for anything, and the confirmation is decoration.
    const { service } = build();
    const page = await service.listOrders(staff, query());

    expect(page.items[0]).not.toHaveProperty('pickupCode');
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
    // The search is the first narrowing; the due/scheduled split is always the
    // last one, on every stage.
    expect(where.AND[0]).toEqual({
      OR: [
        { code: { contains: '4821', mode: 'insensitive' } },
        { user: { name: { contains: '4821', mode: 'insensitive' } } },
      ],
    });
  });

  it('finds an order by the collection code a guest reads out', async () => {
    // The code is no longer a substring of `code`, so without this branch a
    // guest who knows only their six digits could not be found at all.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ q: '730914' }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.AND[0].OR).toContainEqual({ pickupCode: '730914' });
  });

  it('matches a collection code whole, never as a substring', async () => {
    // A `contains` here would answer "which orders have a 7 in their code" —
    // and repeated with each digit, that is the code itself, arrived at without
    // anybody being told it. Only a full six digits is a lookup.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ q: '7309' }));

    const or = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where.AND[0].OR;
    expect(or.some((clause: Record<string, unknown>) => 'pickupCode' in clause)).toBe(false);
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

    // Only the due/scheduled split is left — nothing was searched for, so
    // nothing else narrows the board.
    const and = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where.AND;
    expect(and).toHaveLength(1);
    expect(and[0].OR).toBeDefined();
  });

  it('keeps pre-orders off the live board until their hour comes', async () => {
    // The whole point of the split. An order placed today for next Tuesday is
    // `paid`, and by `created_at` it is the *oldest* paid order for a week — so
    // without this it would sit pinned above the work somebody is doing now.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Paid }));

    const and = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where.AND;
    expect(and[and.length - 1]).toEqual({
      OR: [{ reminderAt: null }, { reminderAt: { lte: expect.any(Date) } }],
    });
  });

  it('asks for the pre-orders themselves under the scheduled stage', async () => {
    // The mirror image, and the only stage that reads the column the other way
    // round. Sorted by when the kitchen must start, like every other stage.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Scheduled }));

    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.AND[where.AND.length - 1]).toEqual({ reminderAt: { gt: expect.any(Date) } });
    // Paid *or* confirmed: accepting a pre-order does not take it off this
    // board, because accepting it is not cooking it.
    expect(where.status).toEqual({ in: [OrderStatus.Paid, OrderStatus.Confirmed] });
  });

  it('splits on the clock rather than on whether the reminder was sent', async () => {
    // `reminder_sent_at` is the job's own bookkeeping. If the board read it, a
    // deployment where the job had stopped would strand every pre-order off the
    // queue on the day it was due — the worst possible failure for the feature.
    const { service, prisma } = build();
    await service.listOrders(staff, query({ status: QueueFilter.Scheduled }));

    const where = JSON.stringify(
      (prisma.order.findMany as jest.Mock).mock.calls[0][0].where,
    );
    expect(where).not.toContain('reminderSentAt');
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
      [QueueFilter.Scheduled]: 0,
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
      [QueueFilter.Scheduled]: 0,
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
  const dto = (status: OrderStatus, pickupCode?: string): SetOrderStatusDto =>
    Object.assign(new SetOrderStatusDto(), { status, pickupCode });

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

  describe('the handover check', () => {
    const ready = () => build({ order: orderRow({ status: OrderStatus.Ready }) });

    it('completes an order when the code the guest showed matches', async () => {
      const { service, orders } = ready();
      await service.setStatus(staff, ORDER_ID, dto(OrderStatus.Completed, '730914'));

      expect(orders.transition).toHaveBeenCalledWith(
        expect.objectContaining({ id: ORDER_ID }),
        OrderStatus.Completed,
        expect.anything(),
      );
    });

    it('refuses a code that belongs to some other order', async () => {
      const { service, orders } = ready();

      await expect(
        service.setStatus(staff, ORDER_ID, dto(OrderStatus.Completed, '000001')),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(orders.transition).not.toHaveBeenCalled();
    });

    it('refuses the tail of the order code, which used to be the whole answer', async () => {
      // `AMR-12344821` → `4821` was the pickup code until this change. Anybody
      // holding a receipt knew it, which is why it is not one any more.
      const { service, orders } = ready();

      await expect(
        service.setStatus(staff, ORDER_ID, dto(OrderStatus.Completed, '124821')),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(orders.transition).not.toHaveBeenCalled();
    });

    it('refuses to complete an order with no code at all', async () => {
      // The DTO requires one on this status, so a request without it never
      // reaches the service — but a caller inside the API could still get here,
      // and "undefined matched nothing" must not read as a match.
      const { service, orders } = ready();

      await expect(
        service.setStatus(staff, ORDER_ID, dto(OrderStatus.Completed)),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(orders.transition).not.toHaveBeenCalled();
    });

    it('says why, in a form the panel can act on', async () => {
      // A mistyped digit is the ordinary case at a counter, and the panel says
      // so in the shift's own language rather than showing the API's sentence.
      const { service } = ready();

      await expect(
        service.setStatus(staff, ORDER_ID, dto(OrderStatus.Completed, '000001')),
      ).rejects.toMatchObject({
        response: { reason: HANDOVER_CODE_MISMATCH },
      });
    });

    it('asks for no code on any other move', async () => {
      // Only the handover is a handover. Requiring one to start cooking would
      // be a counter fetching a guest before the food exists.
      const { service, orders } = build({ order: orderRow({ status: OrderStatus.Confirmed }) });
      await service.setStatus(staff, ORDER_ID, dto(OrderStatus.Preparing));

      expect(orders.transition).toHaveBeenCalledTimes(1);
    });

    it('still refuses an illegal move before it looks at the code', async () => {
      // A correct code does not make `paid -> completed` legal. The state
      // machine is checked first, so the answer names the real problem.
      const { service, orders } = build({ order: orderRow({ status: OrderStatus.Paid }) });

      await expect(
        service.setStatus(staff, ORDER_ID, dto(OrderStatus.Completed, '730914')),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(orders.transition).not.toHaveBeenCalled();
    });
  });
});

describe('setReminderLead', () => {
  /** Tomorrow at 13:00 Yerevan, warned about forty minutes ahead — the default
   *  a thirty-minute dish arrives with. */
  const READY_AT = new Date('2026-08-06T09:00:00.000Z');
  const DEFAULT_LEAD = 40;

  /**
   * The day before that, so "tomorrow" stays tomorrow.
   *
   * These tests read a fixed instant and compare it against `new Date()` inside
   * the service — which meant they passed until the literal above stopped being
   * in the future, and then "re-arms a warning that had already gone out" began
   * failing on a calendar rather than on a change. Pinning the clock keeps the
   * assertions literal, which is what makes them readable.
   */
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-08-05T10:00:00.000Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const preOrder = (over: Record<string, unknown> = {}) =>
    orderRow({
      status: OrderStatus.Confirmed,
      readyAt: READY_AT,
      reminderAt: new Date(READY_AT.getTime() - DEFAULT_LEAD * 60_000),
      reminderLeadMin: DEFAULT_LEAD,
      ...over,
    });

  const dto = (leadMin: number): SetOrderReminderDto =>
    Object.assign(new SetOrderReminderDto(), { leadMin });

  it('counts the lead back from when the food is due', async () => {
    // The whole contract, and the reason the number is stored rather than
    // derived: "warn me 45 minutes before it is due" has to mean 12:15 for a
    // 13:00 order, whatever the kitchen's own estimate says it takes to cook.
    const { service, orderUpdate } = build({ order: preOrder() });
    const result = await service.setReminderLead(staff, ORDER_ID, dto(45));

    expect(orderUpdate.mock.calls[0][0].data.reminderAt.toISOString()).toBe(
      '2026-08-06T08:15:00.000Z',
    );
    expect(result.reminderLeadMin).toBe(45);
  });

  it('re-arms a warning that had already gone out', async () => {
    // Lengthening the notice on an order somebody was already told about means
    // the earlier telling was for a moment nobody chose any more. Leaving
    // `reminder_sent_at` set would make the new time silently never fire.
    const { service, orderUpdate } = build({ order: preOrder() });
    await service.setReminderLead(staff, ORDER_ID, dto(45));

    expect(orderUpdate.mock.calls[0][0].data.reminderSentAt).toBeNull();
  });

  it('leaves the sent mark alone when the new moment is already past', async () => {
    // A lead long enough to land in the past is legal — it means "warn me now"
    // — but it is not a request to be told twice about the same order.
    const { service, orderUpdate } = build({
      order: preOrder({ readyAt: new Date(Date.now() + 10 * 60_000) }),
    });
    const result = await service.setReminderLead(staff, ORDER_ID, dto(60));

    expect(orderUpdate.mock.calls[0][0].data.reminderSentAt).toBeUndefined();
    // And it leaves the Scheduled tab, because its hour has effectively come.
    expect(result.scheduled).toBe(false);
  });

  it('records who moved it, and what it was before', async () => {
    // `reminder_lead_min` is overwritten in place, so this entry is the only
    // record that it ever moved — and "somebody set it to 45" does not answer
    // "why did this go out so early".
    const { service, orderEventCreate } = build({ order: preOrder() });
    await service.setReminderLead(staff, ORDER_ID, dto(45));

    expect(orderEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: ORDER_ID,
        type: OrderEventType.ReminderSet,
        // Not a status change: the order stays where it is and the food is
        // still promised for the same minute.
        fromStatus: null,
        toStatus: null,
        actorType: OrderActorType.Staff,
        actorStaffId: 'staff-1',
        detail: expect.objectContaining({
          reminderLeadMin: 45,
          previousReminderLeadMin: DEFAULT_LEAD,
        }),
      }),
    });
  });

  it('writes the column and the entry under one transaction', async () => {
    const { service, prisma } = build({ order: preOrder() });
    await service.setReminderLead(staff, ORDER_ID, dto(45));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses an order placed for as soon as possible', async () => {
    // There is no warning to move: the kitchen already has it.
    const { service } = build({ order: orderRow() });

    await expect(service.setReminderLead(staff, ORDER_ID, dto(45))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses an order that is over', async () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      const { service, orderUpdate } = build({ order: preOrder({ status }) });

      await expect(service.setReminderLead(staff, ORDER_ID, dto(45))).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(orderUpdate).not.toHaveBeenCalled();
    }
  });

  it('scopes the lookup on orders:advance, like every other move', async () => {
    const watcher: StaffJwtPayload = {
      sub: 'staff-2',
      kind: 'staff',
      scopes: [{ role: StaffRole.BranchStaff, restaurantId: null, branchId: 'branch-1' }],
    };
    const { service, prisma } = build({ order: preOrder() });
    await service.setReminderLead(watcher, ORDER_ID, dto(45));

    const where = (prisma.order.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBe(ORDER_ID);
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [] } } },
      { branchId: { in: ['branch-1'] } },
    ]);
  });

  it('404s on an order outside the caller scope', async () => {
    const { service } = build({ order: null });

    await expect(service.setReminderLead(staff, ORDER_ID, dto(45))).rejects.toThrow(
      NotFoundException,
    );
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
