import { NotFoundException } from '@nestjs/common';
import { OrderActorType, OrderEventType, OrderStatus } from '@amragrir/shared';
import {
  SYSTEM_ACTOR,
  customerActor,
  orderEventData,
  staffActor,
  toHistoryEntry,
  type OrderEventRow,
} from './order-history';
import { OrderHistoryService } from './order-history.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

const ORDER_ID = '55555555-5555-4555-8555-555555555555';

function eventRow(over: Partial<OrderEventRow> = {}): OrderEventRow {
  return {
    id: 'event-1',
    orderId: ORDER_ID,
    type: OrderEventType.StatusChanged,
    fromStatus: OrderStatus.Paid,
    toStatus: OrderStatus.Confirmed,
    actorType: OrderActorType.Staff,
    actorUserId: null,
    actorStaffId: 'staff-1',
    actingStaffId: null,
    detail: null,
    createdAt: new Date('2026-08-01T09:30:00Z'),
    actorUser: null,
    actorStaff: { name: 'Ani', email: 'ani@sunny.am' },
    actingStaff: null,
    ...over,
  } as OrderEventRow;
}

function build(events: OrderEventRow[] | null) {
  const findFirst = jest
    .fn()
    .mockResolvedValue(events === null ? null : { id: ORDER_ID, events });
  const prisma = { order: { findFirst } } as unknown as PrismaService;
  return { service: new OrderHistoryService(prisma), findFirst };
}

describe('orderEventData', () => {
  it('puts a customer in the customer column and nowhere else', () => {
    const data = orderEventData({
      type: OrderEventType.Created,
      actor: customerActor('user-1'),
      toStatus: OrderStatus.Created,
    });

    expect(data.actorType).toBe(OrderActorType.Customer);
    expect(data.actorUserId).toBe('user-1');
    expect(data.actorStaffId).toBeNull();
  });

  it('carries the super admin behind an impersonated staff token', () => {
    // `sub` is the account being acted as. Recording only that would put the
    // change against somebody who was not at the keyboard.
    const staff = { sub: 'staff-1', kind: 'staff', scopes: [], act: 'super-1' } as StaffJwtPayload;
    const data = orderEventData({ type: OrderEventType.StatusChanged, actor: staffActor(staff) });

    expect(data.actorStaffId).toBe('staff-1');
    expect(data.actingStaffId).toBe('super-1');
  });

  it('leaves acting empty for an ordinary staff session', () => {
    const staff = { sub: 'staff-1', kind: 'staff', scopes: [] } as StaffJwtPayload;
    expect(orderEventData({ type: OrderEventType.Payment, actor: staffActor(staff) }).actingStaffId)
      .toBeNull();
  });

  it('names nobody for an action the system took on nobody behalf', () => {
    const data = orderEventData({ type: OrderEventType.StatusChanged, actor: SYSTEM_ACTOR });

    expect(data.actorType).toBe(OrderActorType.System);
    expect(data.actorUserId).toBeNull();
    expect(data.actorStaffId).toBeNull();
  });

  it('records both ends of a status change, so the entry reads as a move', () => {
    const data = orderEventData({
      type: OrderEventType.StatusChanged,
      actor: SYSTEM_ACTOR,
      fromStatus: OrderStatus.Preparing,
      toStatus: OrderStatus.Ready,
    });

    expect(data.fromStatus).toBe(OrderStatus.Preparing);
    expect(data.toStatus).toBe(OrderStatus.Ready);
  });
});

describe('toHistoryEntry', () => {
  it('resolves the staff name and email', () => {
    const entry = toHistoryEntry(eventRow());

    expect(entry.actor).toEqual({
      type: OrderActorType.Staff,
      name: 'Ani',
      email: 'ani@sunny.am',
      impersonatedBy: null,
      id: 'staff-1',
      impersonatedById: null,
    });
  });

  it('answers with the id from the column the actor type names', () => {
    // Not "whichever is not null". A row with both set is a bug, and resolving
    // it by preference would answer with a real person who had nothing to do
    // with the order — the worst possible way to be wrong about who did this.
    const entry = toHistoryEntry(
      eventRow({
        actorType: OrderActorType.Customer,
        actorUserId: 'user-1',
        actorUser: { name: 'Aram' },
      } as Partial<OrderEventRow>),
    );

    expect(entry.actor.id).toBe('user-1');
  });

  it('names nobody, and no id, for the system', () => {
    const entry = toHistoryEntry(
      eventRow({
        actorType: OrderActorType.System,
        actorStaffId: null,
        actorStaff: null,
      } as Partial<OrderEventRow>),
    );

    expect(entry.actor.id).toBeNull();
    expect(entry.actor.name).toBeNull();
  });

  it('shows a customer name without their email', () => {
    // The kitchen has no business with a diner's contact details; the panel has
    // a customer screen for the times it does.
    const entry = toHistoryEntry(
      eventRow({
        actorType: OrderActorType.Customer,
        actorStaffId: null,
        actorStaff: null,
        actorUserId: 'user-1',
        actorUser: { name: 'Aram' },
      } as Partial<OrderEventRow>),
    );

    expect(entry.actor.name).toBe('Aram');
    expect(entry.actor.email).toBeNull();
  });

  it('names the real person behind an impersonated session, and where to find them', () => {
    const entry = toHistoryEntry(
      eventRow({
        actingStaffId: 'super-1',
        actingStaff: { name: 'Narek' },
      } as Partial<OrderEventRow>),
    );

    expect(entry.actor.impersonatedBy).toBe('Narek');
    expect(entry.actor.impersonatedById).toBe('super-1');
  });

  it('survives an actor whose account has since been deleted', () => {
    // The foreign keys are ON DELETE SET NULL: losing the name is better than
    // losing the fact that it happened. The id goes with the name — there is
    // nobody left to link to, and a dangling id would be a link to a 404.
    const entry = toHistoryEntry(
      eventRow({ actorStaffId: null, actorStaff: null } as Partial<OrderEventRow>),
    );

    expect(entry.actor.name).toBeNull();
    expect(entry.actor.id).toBeNull();
    expect(entry.type).toBe(OrderEventType.StatusChanged);
  });
});

describe('OrderHistoryService.list', () => {
  it('reads the timeline oldest first — a story reads forwards', async () => {
    const { service, findFirst } = build([eventRow()]);
    await service.list({ id: ORDER_ID });

    expect(findFirst.mock.calls[0][0].select.events.orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('passes the caller filter straight into the query', async () => {
    // Reach belongs in the query, so there is no path that loads an order out
    // of scope and then decides whether to show its history.
    const { service, findFirst } = build([]);
    await service.list({ id: ORDER_ID, branchId: { in: ['branch-1'] } });

    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: ORDER_ID,
      branchId: { in: ['branch-1'] },
    });
  });

  it('404s on an order the caller may not see, exactly as on one that is gone', async () => {
    const { service } = build(null);
    await expect(service.list({ id: ORDER_ID })).rejects.toThrow(NotFoundException);
  });

  it('returns entries the panel can render without a second lookup', async () => {
    const { service } = build([eventRow()]);
    const { items } = await service.list({ id: ORDER_ID });

    expect(items).toEqual([
      {
        id: 'event-1',
        type: OrderEventType.StatusChanged,
        fromStatus: OrderStatus.Paid,
        toStatus: OrderStatus.Confirmed,
        actor: {
          type: OrderActorType.Staff,
          name: 'Ani',
          email: 'ani@sunny.am',
          impersonatedBy: null,
          id: 'staff-1',
          impersonatedById: null,
        },
        detail: null,
        at: '2026-08-01T09:30:00.000Z',
      },
    ]);
  });
});
