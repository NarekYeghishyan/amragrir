import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AUDIT_ACTION_ENTITY,
  AuditAction,
  AuditEntity,
  CustomerOrderFilter,
  Role,
  StaffRole,
} from '@amragrir/shared';
import { AdminService, countPerCustomerFilter } from './admin.service';
import { CreateRestaurantDto, IssuePromoDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { InvitesService } from '../staff/invites.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/** The caller, as a token payload rather than a bare id: `createRestaurant`
 *  passes it straight to `InvitesService`, which now records who invited whom —
 *  and, on an impersonated session, who was really behind it. */
const ACTOR = { sub: 'staff-1', kind: 'staff', scopes: [] } as unknown as StaffJwtPayload;
const TARGET = '22222222-2222-4222-8222-222222222222';

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: TARGET,
    name: 'Aram',
    phone: '+37499123456',
    email: null,
    role: Role.Customer,
    isGuest: false,
    phoneVerified: true,
    rewardPoints: 0,
    createdAt: new Date('2026-07-01T10:00:00Z'),
    _count: { orders: 3 },
    ...over,
  };
}

/** One order the way the customer-orders query loads it — branch and restaurant
 *  joined, the payment and the booked table beside it, and the lines carrying
 *  the name each was bought under. */
function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    code: 'AMR-12344821',
    status: 'completed',
    serviceMode: 'pickup',
    subtotalAmd: 5800,
    serviceFeeAmd: 360,
    depositAmd: 0,
    discountAmd: 0,
    totalAmd: 6160,
    readyAt: new Date('2026-07-20T18:30:00Z'),
    notes: null,
    createdAt: new Date('2026-07-20T18:00:00Z'),
    branch: {
      id: 'branch-1',
      name: 'Northern Ave',
      restaurantId: 'rest-1',
      restaurant: { name: 'Dolmama' },
    },
    payment: { method: 'card', status: 'captured' },
    reservation: null,
    items: [
      {
        menuItemId: 'dish-1',
        nameSnapshot: 'Khorovats',
        qty: 2,
        unitPriceAmd: 2900,
        lineTotalAmd: 5800,
      },
    ],
    ...over,
  };
}

function build(
  options: {
    user?: unknown;
    adminCount?: number;
    ownedCount?: number;
    recipients?: { id: string }[];
    created?: number;
    orders?: unknown[];
    orderCount?: number;
    grouped?: { status: string; _count: { _all: number } }[];
  } = {},
) {
  const update = jest.fn().mockResolvedValue({});
  const couponCreateMany = jest.fn().mockResolvedValue({ count: options.created ?? 2 });
  const orderFindMany = jest.fn().mockResolvedValue(options.orders ?? [orderRow()]);

  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.user === undefined ? userRow() : options.user),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(userRow((options.user ?? {}) as Record<string, unknown>)),
      // Two callers share this: `listUsers` includes the order count, while
      // the promo recipient lookup only selects ids.
      findMany: jest.fn().mockImplementation((args: { include?: unknown }) =>
        Promise.resolve(
          args.include ? [userRow()] : (options.recipients ?? [{ id: 'u1' }, { id: 'u2' }]),
        ),
      ),
      count: jest.fn().mockResolvedValue(options.adminCount ?? 3),
      update,
    },
    restaurant: {
      count: jest.fn().mockResolvedValue(options.ownedCount ?? 0),
      create: jest.fn().mockResolvedValue({ id: 'rest-1', slug: 'new-place' }),
    },
    order: {
      findMany: orderFindMany,
      count: jest.fn().mockResolvedValue(options.orderCount ?? 1),
      groupBy: jest
        .fn()
        .mockResolvedValue(options.grouped ?? [{ status: 'completed', _count: { _all: 1 } }]),
    },
    coupon: { createMany: couponCreateMany },
  } as unknown as PrismaService;

  const invites = {
    create: jest.fn().mockResolvedValue({ granted: false, email: 'ann@x.am', expiresAt: null }),
  } as unknown as InvitesService;

  const recordStandalone = jest.fn().mockResolvedValue(undefined);
  const audit = { recordStandalone } as unknown as AuditService;

  return {
    service: new AdminService(prisma, invites, audit),
    prisma,
    invites,
    update,
    couponCreateMany,
    orderFindMany,
    recordStandalone,
  };
}

describe('listUsers', () => {
  it('masks phone numbers', async () => {
    // An admin list is not a reason to hand out every phone number in full.
    const { service } = build();
    const page = await service.listUsers(
      Object.assign(Object.create(null), { page: 1, limit: 20 }),
    );

    expect(page.items[0]?.phone).not.toContain('123456');
    expect(page.items[0]?.phone).toMatch(/\*/);
  });

  it('narrows to one customer exactly when given an id', async () => {
    // What a link naming a diner asks for — the panel knows their id and has
    // no search term that would find only them: names are shared, and the
    // phone this screen shows is masked.
    const { service, prisma } = build();
    await service.listUsers(
      Object.assign(Object.create(null), { page: 1, limit: 20, id: 'user-7' }),
    );

    const args = (prisma.user.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.id).toBe('user-7');
  });
});

describe('revealPhone', () => {
  it('hands back the number the list masked', async () => {
    // The whole point of the endpoint: the list is unreadable on purpose, and
    // this is the deliberate exception for one account at a time.
    const { service } = build();
    await expect(service.revealPhone(ACTOR, TARGET)).resolves.toEqual({
      id: TARGET,
      phone: '+37499123456',
    });
  });

  it('records who read it, against the customer, before answering', async () => {
    // A masked column anyone holding `platform:users` can unmask silently is
    // not masked. The row is the thing that makes the mask mean something.
    const { service, recordStandalone } = build();
    await service.revealPhone(ACTOR, TARGET, '10.0.0.7');

    const entry = recordStandalone.mock.calls[0][1];
    expect(recordStandalone.mock.calls[0][0]).toBe(ACTOR);
    expect(entry.action).toBe(AuditAction.CustomerPhoneView);
    expect(entry.entityId).toBe(TARGET);
    expect(entry.ip).toBe('10.0.0.7');
  });

  it('keeps the recorded copy masked too', async () => {
    // Otherwise the mask is defeated by the table written to defend it: an
    // entry per reveal, each carrying a readable number, is the same list
    // again with timestamps on it.
    const { service, recordStandalone } = build();
    await service.revealPhone(ACTOR, TARGET);

    expect(recordStandalone.mock.calls[0][1].after.phone).not.toContain('123456');
  });

  it('refuses to answer if it could not record', async () => {
    // A number handed out with no row saying who asked is the exact gap this
    // exists to close, so the failure has to be the whole call's.
    const { service, recordStandalone } = build();
    recordStandalone.mockRejectedValue(new Error('audit_log is unreachable'));

    await expect(service.revealPhone(ACTOR, TARGET)).rejects.toThrow();
  });

  it('has nothing to reveal for an account with no number', async () => {
    // A guest who never verified one, and an id belonging to nobody, are the
    // same answer at this address: there is no phone here.
    const { service, recordStandalone } = build({ user: null });

    await expect(service.revealPhone(ACTOR, TARGET)).rejects.toThrow(NotFoundException);
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it('writes the entry over no restaurant at all', async () => {
    // Platform scope, which is what keeps the row readable only by an unscoped
    // account — the same rule `staff.impersonate` follows. A restaurant admin
    // has no business reading who looked up a diner's number. The entity is not
    // passed at all: `auditData` derives it from the action, so the row cannot
    // index against the wrong table.
    const { service, recordStandalone } = build();
    await service.revealPhone(ACTOR, TARGET);

    const entry = recordStandalone.mock.calls[0][1];
    expect(entry.scope).toBeUndefined();
    expect(AUDIT_ACTION_ENTITY[AuditAction.CustomerPhoneView]).toBe(AuditEntity.Customer);
  });
});

describe('listCustomerOrders', () => {
  const query = (over: Record<string, unknown> = {}) =>
    Object.assign(Object.create(null), { page: 1, limit: 10, ...over });

  it('reads one diner’s orders newest first', async () => {
    // Newest first because this is a record of what somebody bought and the
    // recent end is the one worth reading — the opposite of the kitchen queue,
    // which is work in the order it arrived.
    const { service, orderFindMany } = build();
    const page = await service.listCustomerOrders(TARGET, query());

    expect(orderFindMany.mock.calls[0][0].where).toEqual({ userId: TARGET });
    expect(orderFindMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(page.total).toBe(1);
  });

  it('leaves the status column out of the query for the whole history', async () => {
    // `all` narrows to nothing, and an `IN` over every status is a clause that
    // can never exclude a row.
    const { service, orderFindMany } = build();
    await service.listCustomerOrders(TARGET, query({ status: CustomerOrderFilter.All }));

    expect(orderFindMany.mock.calls[0][0].where.status).toBeUndefined();
  });

  it('narrows to the statuses a filter admits', async () => {
    // Cancelled is its own filter rather than a twelfth of "past": it is the
    // row somebody opens this dialog to find.
    const { service, orderFindMany } = build();
    await service.listCustomerOrders(TARGET, query({ status: CustomerOrderFilter.Cancelled }));

    expect(orderFindMany.mock.calls[0][0].where.status).toEqual({ in: ['cancelled'] });
  });

  it('searches the code, the dishes and where it was bought', async () => {
    // The three things somebody has to go on. Not the customer's name, which
    // the board matches and which would match every row here by construction.
    const { service, orderFindMany } = build();
    await service.listCustomerOrders(TARGET, query({ q: ' khorovats ' }));

    const where = orderFindMany.mock.calls[0][0].where;
    // Trimmed, so a stray space off a paste is not a search for nothing.
    expect(JSON.stringify(where.OR)).toContain('khorovats');
    expect(JSON.stringify(where.OR)).not.toContain(' khorovats ');
    expect(where.OR).toHaveLength(4);
    // And still this customer's, because `userId` is a sibling key that Prisma
    // ANDs with the OR rather than one the OR replaced.
    expect(where.userId).toBe(TARGET);
  });

  it('counts under the search but not under the status filter', async () => {
    // Which is what lets the segments say where a searched-for order is before
    // anybody clicks one. Counting under the status too would make every
    // segment report its own selection.
    const { service, prisma } = build();
    await service.listCustomerOrders(
      TARGET,
      query({ q: 'khorovats', status: CustomerOrderFilter.Cancelled }),
    );

    const grouped = (prisma.order.groupBy as jest.Mock).mock.calls[0][0];
    expect(grouped.where.status).toBeUndefined();
    expect(JSON.stringify(grouped.where.OR)).toContain('khorovats');
  });

  it('returns each order whole, lines included', async () => {
    // The screen opens these rows in place, so a second request per row would
    // be ten round trips to read what one query already joined.
    const { service } = build();
    const page = await service.listCustomerOrders(TARGET, query());

    expect(page.items[0]?.items).toEqual([
      {
        menuItemId: 'dish-1',
        name: 'Khorovats',
        qty: 2,
        unitPriceAmd: 2900,
        lineTotalAmd: 5800,
      },
    ]);
  });

  it('counts dishes rather than lines', async () => {
    // One line ordered twice is two things to eat.
    const { service } = build();
    const page = await service.listCustomerOrders(TARGET, query());

    expect(page.items[0]?.itemsCount).toBe(2);
  });

  it('carries the pickup code and where the order was placed', async () => {
    // All three are what the row is linked *with*: the board is addressable by
    // restaurant, branch and code, so an order here is somewhere to go.
    const { service } = build();
    const page = await service.listCustomerOrders(TARGET, query());

    expect(page.items[0]?.pickupCode).toBe('4821');
    expect(page.items[0]?.restaurantId).toBe('rest-1');
    expect(page.items[0]?.branchId).toBe('branch-1');
  });

  it('says an order was never paid for rather than inventing a status', async () => {
    const { service } = build({ orders: [orderRow({ payment: null })] });
    const page = await service.listCustomerOrders(TARGET, query());

    expect(page.items[0]?.payment).toBeNull();
  });

  it('refuses an id that belongs to nobody', async () => {
    // An empty page cannot tell "has never ordered" from "does not exist", and
    // only the first of those is worth an empty state.
    const { service } = build({ user: null });

    await expect(service.listCustomerOrders(TARGET, query())).rejects.toThrow(NotFoundException);
  });
});

describe('countPerCustomerFilter', () => {
  const grouped = [
    { status: 'preparing', _count: { _all: 1 } },
    { status: 'ready', _count: { _all: 2 } },
    { status: 'completed', _count: { _all: 9 } },
    { status: 'cancelled', _count: { _all: 3 } },
  ];

  it('folds the statuses into the four segments', () => {
    expect(countPerCustomerFilter(grouped)).toEqual({
      all: 15,
      active: 3,
      completed: 9,
      cancelled: 3,
    });
  });

  it('counts a status no filter buckets into the total anyway', () => {
    // A status added to the enum and not bucketed here would otherwise make
    // "All" show fewer rows than the list under it — a segment quietly
    // undercounting, which nothing else would catch.
    const counts = countPerCustomerFilter([...grouped, { status: 'invented', _count: { _all: 4 } }]);

    expect(counts.all).toBe(19);
    expect(counts.active + counts.completed + counts.cancelled).toBe(15);
  });

  it('reports zero rather than nothing for a filter with no rows', () => {
    // The segment renders the number it is given; `undefined` would render as
    // no pill at all, which reads as "not counted" rather than as "none".
    expect(countPerCustomerFilter([])).toEqual({
      all: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
    });
  });
});

describe('createRestaurant', () => {
  const dto = (over: Partial<CreateRestaurantDto> = {}) =>
    Object.assign(new CreateRestaurantDto(), {
      slug: 'new-place',
      name: 'New Place',
      ...over,
    });

  it('creates a restaurant with no administrator yet', async () => {
    // A normal state: the restaurant exists and can be assigned to someone
    // from the staff screen later.
    const { service, prisma, invites } = build();
    await service.createRestaurant(ACTOR, dto());

    expect(prisma.restaurant.create).toHaveBeenCalled();
    expect(invites.create).not.toHaveBeenCalled();
  });

  it('invites the administrator when an email is given', async () => {
    const { service, invites } = build();
    await service.createRestaurant(ACTOR, dto({ adminEmail: 'ann@example.am' }));

    expect(invites.create).toHaveBeenCalledWith(ACTOR, {
      email: 'ann@example.am',
      role: StaffRole.RestaurantAdmin,
      restaurantId: 'rest-1',
    });
  });

  it('does not invite anyone if the restaurant was not created', async () => {
    // An invitation naming a restaurant that does not exist is a dead link; a
    // restaurant with nobody invited yet is fixable from a screen.
    const { service, prisma, invites } = build();
    (prisma.restaurant.create as unknown as jest.Mock).mockRejectedValue(new Error('taken'));

    await expect(
      service.createRestaurant(ACTOR, dto({ adminEmail: 'ann@example.am' })),
    ).rejects.toThrow();
    expect(invites.create).not.toHaveBeenCalled();
  });
});

describe('issuePromo', () => {
  const promo = (over: Partial<IssuePromoDto> = {}) =>
    Object.assign(new IssuePromoDto(), { code: 'SUMMER', discountPct: 10, ...over });

  it('issues to every verified account and reports what was created', async () => {
    const { service, couponCreateMany } = build({ created: 2 });
    const result = await service.issuePromo(promo());

    expect(result).toEqual({ code: 'SUMMER', issued: 2 });
    // skipDuplicates, so re-running tops up new accounts instead of failing.
    expect(couponCreateMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('demands exactly one kind of discount', async () => {
    const { service } = build();
    await expect(service.issuePromo(promo({ discountAmd: 500 }))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.issuePromo(promo({ discountPct: undefined })),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an expiry already in the past', async () => {
    const { service } = build();
    await expect(
      service.issuePromo(promo({ validUntil: new Date(Date.now() - 1000).toISOString() })),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses when nobody matches', async () => {
    const { service } = build({ recipients: [] });
    await expect(service.issuePromo(promo())).rejects.toThrow(UnprocessableEntityException);
  });

  it('only ever targets verified, non-guest accounts', async () => {
    const { service, prisma } = build();
    await service.issuePromo(promo());

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phoneVerified: true, isGuest: false }),
      }),
    );
  });
});
