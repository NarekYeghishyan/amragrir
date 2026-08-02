import { NotFoundException } from '@nestjs/common';
import { AuditAction, OrderActorType, OrderEventType, StaffRole } from '@amragrir/shared';
import { StaffActivityService } from './staff-activity.service';
import { ListActivityDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from './staff-token.service';

const RESTAURANT = '44444444-4444-4444-8444-444444444444';
const BRANCH = '11111111-1111-4111-8111-111111111111';
const PERSON = '22222222-2222-4222-8222-222222222222';

const actor = (...scopes: StaffJwtPayload['scopes']): StaffJwtPayload => ({
  sub: 'staff-1',
  kind: 'staff',
  scopes,
});

const superAdmin = actor({ role: StaffRole.SuperAdmin, restaurantId: null, branchId: null });
const restaurantAdmin = actor({
  role: StaffRole.RestaurantAdmin,
  restaurantId: RESTAURANT,
  branchId: null,
});

const auditRow = (over: Record<string, unknown> = {}) => ({
  id: 'audit-1',
  action: AuditAction.MenuItemUpdate,
  entity: 'menu_item',
  entityId: 'item-1',
  before: { priceAmd: 2400 },
  after: { priceAmd: 2600 },
  restaurantId: RESTAURANT,
  branchId: BRANCH,
  restaurant: { name: 'Sunny Table' },
  branch: { name: 'Northern Ave', city: 'Yerevan', restaurantId: RESTAURANT },
  actingStaff: null,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  ...over,
});

const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'event-1',
  type: OrderEventType.StatusChanged,
  fromStatus: 'preparing',
  toStatus: 'ready',
  actingStaff: null,
  createdAt: new Date('2026-08-01T11:00:00Z'),
  order: {
    id: 'order-1',
    code: 'A41',
    branchId: BRANCH,
    branch: {
      name: 'Northern Ave',
      city: 'Yerevan',
      restaurantId: RESTAURANT,
      restaurant: { name: 'Sunny Table' },
    },
  },
  ...over,
});

function build(
  options: {
    person?: unknown;
    audits?: unknown[];
    events?: unknown[];
    auditTotal?: number;
    eventTotal?: number;
  } = {},
) {
  const auditFindMany = jest.fn().mockResolvedValue(options.audits ?? [auditRow()]);
  const eventFindMany = jest.fn().mockResolvedValue(options.events ?? [eventRow()]);

  const prisma = {
    staffUser: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.person === undefined ? { id: PERSON } : options.person),
    },
    auditLog: {
      findMany: auditFindMany,
      count: jest.fn().mockResolvedValue(options.auditTotal ?? 1),
    },
    orderEvent: {
      findMany: eventFindMany,
      count: jest.fn().mockResolvedValue(options.eventTotal ?? 1),
    },
  } as unknown as PrismaService;

  return { service: new StaffActivityService(prisma), prisma, auditFindMany, eventFindMany };
}

const paging = (over: Partial<ListActivityDto> = {}): ListActivityDto =>
  Object.assign(new ListActivityDto(), { page: 1, limit: 20, ...over });

describe('who may be looked at', () => {
  it('404s on somebody outside the caller reach', async () => {
    // Otherwise this endpoint reads the activity of anybody whose id you can
    // guess. 404 rather than 403, since a 403 confirms the account exists.
    const { service } = build({ person: null });

    await expect(service.list(restaurantAdmin, PERSON, paging())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('looks the person up through the same reach the directory uses', async () => {
    const { service, prisma } = build();
    await service.list(restaurantAdmin, PERSON, paging());

    const where = (prisma.staffUser.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBe(PERSON);
    expect(where.assignments.some.OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
  });
});

describe('the entries are scoped too', () => {
  it('narrows a restaurant admin to their own restaurant', async () => {
    // A person can work for two restaurants. Seeing that they work for you does
    // not mean seeing what they did for somebody else.
    const { service, auditFindMany } = build();
    await service.list(restaurantAdmin, PERSON, paging());

    const where = auditFindMany.mock.calls[0][0].where;
    expect(where.AND[1].OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branchId: { in: [] } },
    ]);
  });

  it('scopes order events through the order branch', async () => {
    const { service, eventFindMany } = build();
    await service.list(restaurantAdmin, PERSON, paging());

    const where = eventFindMany.mock.calls[0][0].where;
    expect(where.AND[1].order.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('does not narrow a platform role', async () => {
    const { service, auditFindMany } = build();
    await service.list(superAdmin, PERSON, paging());

    // No AND wrapper at all — the reach is unscoped, so the only condition is
    // whose activity this is.
    expect(auditFindMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('counts an entry as this person when they were impersonated', async () => {
    // A change made while acting as somebody belongs in two feeds: theirs,
    // because their account made it, and the super admin's, because they did.
    const { service, auditFindMany } = build();
    await service.list(superAdmin, PERSON, paging());

    expect(auditFindMany.mock.calls[0][0].where.OR).toEqual([
      { actorStaffId: PERSON },
      { actingStaffId: PERSON },
    ]);
  });

  it('reads only staff-driven order events', async () => {
    // The same order's customer and payment events are not this person's doing.
    const { service, eventFindMany } = build();
    await service.list(superAdmin, PERSON, paging());

    expect(eventFindMany.mock.calls[0][0].where.actorType).toBe(OrderActorType.Staff);
  });
});

describe('merging the two tables', () => {
  it('interleaves them newest first', async () => {
    const { service } = build({
      audits: [auditRow({ id: 'a-old', createdAt: new Date('2026-08-01T09:00:00Z') })],
      events: [eventRow({ id: 'e-new', createdAt: new Date('2026-08-01T12:00:00Z') })],
    });

    const page = await service.list(superAdmin, PERSON, paging());

    expect(page.items.map((entry) => entry.id)).toEqual(['e-new', 'a-old']);
    expect(page.items[0]?.kind).toBe('order');
    expect(page.items[1]?.kind).toBe('audit');
  });

  it('reports the total across both tables', async () => {
    // A pager built on either one alone is a statement about the wrong list.
    const { service } = build({ auditTotal: 7, eventTotal: 5 });
    const page = await service.list(superAdmin, PERSON, paging());

    expect(page.total).toBe(12);
  });

  it('over-fetches both to the end of the page, then slices', async () => {
    // Entry 40 of the merged feed can be entry 40 of either table, so neither
    // can be asked for a narrower window than the whole prefix.
    const { service, auditFindMany, eventFindMany } = build();
    await service.list(superAdmin, PERSON, paging({ page: 3, limit: 20 }));

    expect(auditFindMany.mock.calls[0][0].take).toBe(60);
    expect(eventFindMany.mock.calls[0][0].take).toBe(60);
  });

  it('breaks ties on id so a page cannot reshuffle between reads', async () => {
    // `created_at` defaults to the transaction start time and the two tables
    // have independent id spaces, so identical instants are genuinely possible.
    // An order that reshuffles can drop an entry off both pages it straddles.
    const same = new Date('2026-08-01T10:00:00Z');
    const { service } = build({
      audits: [auditRow({ id: 'a-1', createdAt: same })],
      events: [eventRow({ id: 'z-1', createdAt: same })],
    });

    const page = await service.list(superAdmin, PERSON, paging());
    expect(page.items.map((entry) => entry.id)).toEqual(['z-1', 'a-1']);
  });
});

describe('what an entry says', () => {
  it('carries the before and after of an audit entry', async () => {
    const { service } = build({ events: [] });
    const [entry] = (await service.list(superAdmin, PERSON, paging())).items;

    expect(entry).toMatchObject({
      kind: 'audit',
      action: AuditAction.MenuItemUpdate,
      before: { priceAmd: 2400 },
      after: { priceAmd: 2600 },
      where: { restaurantName: 'Sunny Table', branchName: 'Northern Ave' },
    });
  });

  it('names an order entry by its code', async () => {
    const { service } = build({ audits: [] });
    const [entry] = (await service.list(superAdmin, PERSON, paging())).items;

    expect(entry).toMatchObject({
      kind: 'order',
      orderCode: 'A41',
      fromStatus: 'preparing',
      toStatus: 'ready',
    });
  });

  it('falls back to the city for a branch with no name', async () => {
    const { service } = build({
      audits: [auditRow({ branch: { name: null, city: 'Gyumri', restaurantId: RESTAURANT } })],
      events: [],
    });
    const [entry] = (await service.list(superAdmin, PERSON, paging())).items;

    expect(entry?.where.branchName).toBe('Gyumri');
  });

  it('names the impersonator when there was one', async () => {
    const { service } = build({
      audits: [auditRow({ actingStaff: { id: 'super-1', name: 'Narek' } })],
      events: [],
    });
    const [entry] = (await service.list(superAdmin, PERSON, paging())).items;

    expect(entry?.impersonatedBy).toEqual({ id: 'super-1', name: 'Narek' });
  });

  it('leaves a platform action without a place', async () => {
    const { service } = build({
      audits: [
        auditRow({
          action: AuditAction.StaffImpersonate,
          restaurantId: null,
          branchId: null,
          restaurant: null,
          branch: null,
        }),
      ],
      events: [],
    });
    const [entry] = (await service.list(superAdmin, PERSON, paging())).items;

    expect(entry?.where).toEqual({
      restaurantId: null,
      restaurantName: null,
      branchId: null,
      branchName: null,
    });
  });
});
