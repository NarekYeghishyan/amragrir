import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ORDER_EVENT_INCLUDE,
  toHistoryEntry,
  type OrderHistoryEntry,
} from './order-history';

/**
 * Reading an order's history.
 *
 * Writing it is not here on purpose: every entry is written in the same
 * transaction as the change it records (see `OrdersService.transition` and
 * `PaymentsService.settle`), because a service that is asked to log afterwards
 * is a service that will one day not be. This side is the only part that can be
 * a separate query, so it is the only part that is one.
 */
@Injectable()
export class OrderHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The timeline of one order, oldest first — a story reads forwards.
   *
   * Takes the whole `where` rather than an id so the caller's reach is part of
   * the query, as everywhere else in the back office: there is no path that
   * loads an order outside the caller's scope and then decides whether to show
   * its history. An order they may not see 404s, which is also what an order
   * that does not exist does.
   */
  async list(where: Prisma.OrderWhereInput): Promise<{ items: OrderHistoryEntry[] }> {
    const order = await this.prisma.order.findFirst({
      where,
      select: {
        id: true,
        events: {
          include: ORDER_EVENT_INCLUDE,
          // `created_at` defaults to the *transaction's* start time in Postgres,
          // so two entries written by one transaction would tie. Nothing writes
          // two today, and `id` is the tiebreak if that changes: arbitrary, but
          // the same arbitrary order on every request — a timeline that
          // reshuffles between two reads is one nobody can quote in a dispute.
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return { items: order.events.map(toHistoryEntry) };
  }
}
