import { Injectable } from '@nestjs/common';
import { Prisma, StaffNotificationType } from '@prisma/client';
import { Permission } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { notificationScope } from '../staff/scope';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { NotificationEventsService } from './notification-events.service';

/** What one notification looks like to the panel's bell. */
export interface StaffNotificationItem {
  id: string;
  type: StaffNotificationType;
  branchId: string;
  orderId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  /** Whether **this** reader has seen it — not whether anybody has. A branch's
   *  notification is read by people, one at a time. */
  read: boolean;
}

@Injectable()
export class StaffNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEventsService,
  ) {}

  /**
   * Records a notification for a branch and announces it.
   *
   * Takes a transaction client when there is one, so a notification and whatever
   * it is about are written together or not at all — the reminder job marks the
   * order and raises this in one transaction, and a reminder that survived a
   * rolled-back mark would be sent again on the next pass.
   *
   * The announcement happens **after** the caller's transaction commits, not
   * here, for the reason every outbox exists: publishing inside a transaction
   * tells a panel about a row that may still be rolled back. `publish` below is
   * the second half, called by whoever owns the transaction.
   */
  async record(
    tx: Prisma.TransactionClient,
    input: {
      branchId: string;
      type: StaffNotificationType;
      orderId?: string | null;
      payload?: Record<string, unknown> | null;
    },
  ): Promise<{ id: string; createdAt: Date }> {
    return tx.staffNotification.create({
      data: {
        branchId: input.branchId,
        type: input.type,
        orderId: input.orderId ?? null,
        payload: (input.payload ?? null) as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
  }

  /** Announces a notification that is now safely committed. */
  publish(input: {
    id: string;
    branchId: string;
    type: StaffNotificationType;
    orderId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: Date;
  }): void {
    this.events.publish({
      id: input.id,
      branchId: input.branchId,
      type: input.type,
      orderId: input.orderId,
      payload: input.payload,
      createdAt: input.createdAt.toISOString(),
    });
  }

  /**
   * Every branch this account may be told about, as plain ids.
   *
   * Resolved once, when a panel opens its socket, rather than per notification:
   * a reminder arriving is not the moment to ask the database who somebody is.
   * `null` means every branch — a platform-wide account, whose reach is not a
   * list and would be a pointless one to materialise.
   *
   * A restaurant-level role reaches branches it does not name, so the
   * restaurants have to be expanded here; that is the whole reason this is a
   * query and not a read of the token.
   */
  async reachableBranchIds(staff: StaffJwtPayload): Promise<string[] | null> {
    const scope = notificationScope(staff.scopes, Permission.OrdersRead);
    if (Object.keys(scope).length === 0) {
      return null;
    }

    const branches = await this.prisma.restaurantBranch.findMany({
      where: {
        OR: [
          { restaurantId: { in: restaurantIdsIn(scope) } },
          { id: { in: branchIdsIn(scope) } },
        ],
      },
      select: { id: true },
    });
    return branches.map((branch) => branch.id);
  }

  /**
   * The bell: what this account's branches have been told, newest first.
   *
   * Reach is part of the query rather than a check afterwards, so a branch
   * outside it is not merely hidden — it is never selected.
   */
  async list(
    staff: StaffJwtPayload,
    limit = 30,
  ): Promise<{ items: StaffNotificationItem[]; unread: number }> {
    const where: Prisma.StaffNotificationWhereInput = {
      ...notificationScope(staff.scopes, Permission.OrdersRead),
    };

    const [rows, unread] = await Promise.all([
      this.prisma.staffNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: {
          // Only this reader's row, so "read" means what it says. Including
          // every reader's would be loading the whole shift to answer a
          // question about one person.
          reads: { where: { staffUserId: staff.sub }, select: { staffUserId: true } },
        },
      }),
      this.prisma.staffNotification.count({
        where: { ...where, reads: { none: { staffUserId: staff.sub } } },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        branchId: row.branchId,
        orderId: row.orderId,
        payload: row.payload as Record<string, unknown> | null,
        createdAt: row.createdAt.toISOString(),
        read: row.reads.length > 0,
      })),
      unread,
    };
  }

  /**
   * Marks notifications read by this person.
   *
   * Scoped, so an id belonging to a branch the caller cannot reach marks
   * nothing — the ids come from a list they were shown, and one that did not
   * would be a probe.
   *
   * `skipDuplicates`, because reading something twice is not an error and the
   * primary key would otherwise make it one.
   */
  async markRead(staff: StaffJwtPayload, ids: string[]): Promise<{ read: number }> {
    if (ids.length === 0) {
      return { read: 0 };
    }

    const reachable = await this.prisma.staffNotification.findMany({
      where: {
        id: { in: ids },
        ...notificationScope(staff.scopes, Permission.OrdersRead),
      },
      select: { id: true },
    });

    const result = await this.prisma.staffNotificationRead.createMany({
      data: reachable.map((row) => ({ notificationId: row.id, staffUserId: staff.sub })),
      skipDuplicates: true,
    });

    return { read: result.count };
  }
}

/**
 * Digs the ids back out of a scope filter.
 *
 * `branchChildScope` builds the shape and this reads it, which is a seam worth
 * naming: they must agree, and the pair is here rather than the shape being
 * rebuilt by hand so that a change to one is a compile error rather than a
 * silently empty reach.
 */
type ScopeFilter = { OR?: unknown[] };

function restaurantIdsIn(scope: ScopeFilter): string[] {
  const branch = scope.OR?.[0] as { branch?: { restaurantId?: { in?: string[] } } } | undefined;
  return branch?.branch?.restaurantId?.in ?? [];
}

function branchIdsIn(scope: ScopeFilter): string[] {
  const direct = scope.OR?.[1] as { branchId?: { in?: string[] } } | undefined;
  return direct?.branchId?.in ?? [];
}
