import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ActivityKind,
  AuditAction,
  AuditEntity,
  OrderActorType,
  Permission,
  type OrderEventType,
  type OrderStatus,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from './staff-token.service';
import { reachFor } from './scope';
import { ListActivityDto } from './dto';

/**
 * One thing a person did, from either table.
 *
 * A discriminated union rather than a lowest common denominator: an `audit`
 * entry has an action and a `before`/`after` pair, an `order` entry has two
 * statuses and a code. Flattening them into one optional-everything shape would
 * push the "which fields are actually set" question onto every reader, and the
 * panel renders a different sentence for each anyway.
 */
export type StaffActivityEntry =
  | {
      kind: typeof ActivityKind.Audit;
      id: string;
      action: AuditAction;
      entity: AuditEntity;
      entityId: string | null;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      where: ActivityWhere;
      /** The super admin who was acting as this person, on the entries where
       *  somebody was. Null on everything else, which is nearly all of them. */
      impersonatedBy: ActivityPerson | null;
      at: string;
    }
  | {
      kind: typeof ActivityKind.Order;
      id: string;
      type: OrderEventType;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus | null;
      /** The order's short code — what a counter says out loud, and the thing
       *  worth showing in a feed. The id is there to link with. */
      orderId: string;
      orderCode: string;
      where: ActivityWhere;
      impersonatedBy: ActivityPerson | null;
      at: string;
    };

export interface ActivityPerson {
  id: string | null;
  name: string | null;
}

/** Where it happened, resolved for display. Null on a platform action, which
 *  happened over no restaurant at all. */
export interface ActivityWhere {
  restaurantId: string | null;
  restaurantName: string | null;
  branchId: string | null;
  branchName: string | null;
}

/**
 * Reading what one person did.
 *
 * Two tables, merged at read time, and deliberately not one. `order_events`
 * records the customer and the payment provider as well as staff, so folding it
 * into `audit_log` — whose actor column is a staff id — would mean a NULL actor
 * on most of its rows. Writing every status change to both would mean two
 * records of one fact, free to drift. So the merge lives here, at the one place
 * that wants them interleaved.
 *
 * Everything is scoped twice over, and both are load-bearing:
 *
 * 1. **The person** must be someone the caller can already see — the same reach
 *    the directory applies. Otherwise this endpoint would be a way to read the
 *    activity of anybody whose id you could guess.
 * 2. **The entries** are filtered to the caller's reach as well, because a
 *    person can work in two restaurants and their admin may only see one. This
 *    is why `audit_log` carries scope columns at all.
 */
@Injectable()
export class StaffActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    staff: StaffJwtPayload,
    personId: string,
    query: ListActivityDto,
  ): Promise<{ items: StaffActivityEntry[]; total: number; page: number }> {
    await this.assertVisible(staff, personId);

    const auditWhere = this.auditReach(staff, personId);
    const eventWhere = this.eventReach(staff, personId);

    // Merging two ordered streams by offset means over-fetching both: entry 40
    // of the merged feed can be entry 40 of either table, so neither can be
    // asked for a narrower window than the whole prefix. `ListActivityDto` caps
    // the page depth for exactly this reason — the cost grows with the offset,
    // not the page size, and a feed nobody pages to the end of should not make
    // that possible to try.
    const window = (query.page - 1) * query.limit + query.limit;

    const [audits, events, auditTotal, eventTotal] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: auditWhere,
        include: AUDIT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: window,
      }),
      this.prisma.orderEvent.findMany({
        where: eventWhere,
        include: EVENT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: window,
      }),
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.orderEvent.count({ where: eventWhere }),
    ]);

    const merged = [...audits.map(toAuditEntry), ...events.map(toOrderEntry)].sort(newestFirst);

    return {
      items: merged.slice((query.page - 1) * query.limit, window),
      // The real total across both, so the pager is a statement about the feed
      // rather than about whichever table happened to be longer.
      total: auditTotal + eventTotal,
      page: query.page,
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /**
   * Refuses a person the caller could not have found in the directory.
   *
   * Same reach, same permission the list screen uses, and a 404 rather than a
   * 403 — a 403 would confirm that the id belongs to somebody.
   */
  private async assertVisible(staff: StaffJwtPayload, personId: string): Promise<void> {
    const reach = reachFor(staff.scopes, Permission.StaffActivity);
    const qualifying: Prisma.StaffAssignmentWhereInput = reach.all
      ? {}
      : {
          OR: [
            { restaurantId: { in: reach.restaurantIds } },
            { branch: { restaurantId: { in: reach.restaurantIds } } },
            { branchId: { in: reach.branchIds } },
          ],
        };

    const person = await this.prisma.staffUser.findFirst({
      where: { id: personId, assignments: { some: qualifying } },
      select: { id: true },
    });
    if (!person) {
      throw new NotFoundException('Staff account not found');
    }
  }

  /**
   * This person's `audit_log` rows, within the caller's reach.
   *
   * `actor` **or** `acting`: a change made while impersonating belongs in two
   * feeds. It is in the impersonated account's, because that account is what
   * made it and somebody auditing that account has to see it; and it is in the
   * super admin's, because they are who actually did it. Recording both columns
   * and then reading only one would waste the distinction the column exists for.
   */
  private auditReach(staff: StaffJwtPayload, personId: string): Prisma.AuditLogWhereInput {
    const reach = reachFor(staff.scopes, Permission.StaffActivity);
    const mine: Prisma.AuditLogWhereInput = {
      OR: [{ actorStaffId: personId }, { actingStaffId: personId }],
    };
    if (reach.all) {
      return mine;
    }
    // AND, never a second OR at the top level: a sibling `OR` would replace this
    // one and hand back every restaurant's rows.
    return {
      AND: [
        mine,
        {
          OR: [
            { restaurantId: { in: reach.restaurantIds } },
            { branchId: { in: reach.branchIds } },
          ],
        },
      ],
    };
  }

  private eventReach(staff: StaffJwtPayload, personId: string): Prisma.OrderEventWhereInput {
    const reach = reachFor(staff.scopes, Permission.StaffActivity);
    const mine: Prisma.OrderEventWhereInput = {
      // Staff only. The same order's customer and payment events are not this
      // person's activity, and `actorType` is what says so — an order moved by
      // the customer has no staff id in either column anyway, but filtering on
      // the type states the intent rather than relying on that.
      actorType: OrderActorType.Staff,
      OR: [{ actorStaffId: personId }, { actingStaffId: personId }],
    };
    if (reach.all) {
      return mine;
    }
    return {
      AND: [
        mine,
        {
          order: {
            OR: [
              { branch: { restaurantId: { in: reach.restaurantIds } } },
              { branchId: { in: reach.branchIds } },
            ],
          },
        },
      ],
    };
  }
}

const AUDIT_INCLUDE = {
  restaurant: { select: { name: true } },
  branch: { select: { name: true, city: true, restaurantId: true } },
  actingStaff: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogInclude;

const EVENT_INCLUDE = {
  order: {
    select: {
      id: true,
      code: true,
      branchId: true,
      branch: {
        select: { name: true, city: true, restaurantId: true, restaurant: { select: { name: true } } },
      },
    },
  },
  actingStaff: { select: { id: true, name: true } },
} satisfies Prisma.OrderEventInclude;

type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof AUDIT_INCLUDE }>;
type EventRow = Prisma.OrderEventGetPayload<{ include: typeof EVENT_INCLUDE }>;

/** A branch reads as its name, or the city when it has none — the same fallback
 *  the branch list uses, so one branch is not called two things. */
function branchLabel(branch: { name: string | null; city: string } | null): string | null {
  if (!branch) {
    return null;
  }
  return branch.name ?? branch.city;
}

function toAuditEntry(row: AuditRow): StaffActivityEntry {
  return {
    kind: ActivityKind.Audit,
    id: row.id,
    action: row.action as AuditAction,
    entity: row.entity as AuditEntity,
    entityId: row.entityId,
    before: (row.before as Record<string, unknown> | null) ?? null,
    after: (row.after as Record<string, unknown> | null) ?? null,
    where: {
      restaurantId: row.restaurantId,
      restaurantName: row.restaurant?.name ?? null,
      branchId: row.branchId,
      branchName: branchLabel(row.branch),
    },
    impersonatedBy: row.actingStaff
      ? { id: row.actingStaff.id, name: row.actingStaff.name }
      : null,
    at: row.createdAt.toISOString(),
  };
}

function toOrderEntry(row: EventRow): StaffActivityEntry {
  return {
    kind: ActivityKind.Order,
    id: row.id,
    type: row.type as OrderEventType,
    fromStatus: row.fromStatus as OrderStatus | null,
    toStatus: row.toStatus as OrderStatus | null,
    orderId: row.order.id,
    orderCode: row.order.code,
    where: {
      restaurantId: row.order.branch.restaurantId,
      restaurantName: row.order.branch.restaurant.name,
      branchId: row.order.branchId,
      branchName: branchLabel(row.order.branch),
    },
    impersonatedBy: row.actingStaff
      ? { id: row.actingStaff.id, name: row.actingStaff.name }
      : null,
    at: row.createdAt.toISOString(),
  };
}

/**
 * Newest first — a log, not a story.
 *
 * The order timeline reads oldest-first because it explains how one order got
 * where it is. This answers "what has this person been doing", where the useful
 * end is the recent one.
 *
 * Ties break on id, and the tiebreak matters more here than it does there: the
 * two tables have independent id spaces and `created_at` defaults to the
 * *transaction's* start time, so two entries genuinely can carry the same
 * instant. Any deterministic order will do; an order that reshuffles between two
 * reads of the same page will not, because it can drop an entry from both.
 */
function newestFirst(a: StaffActivityEntry, b: StaffActivityEntry): number {
  return b.at.localeCompare(a.at) || b.id.localeCompare(a.id);
}
