import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OrderStatus,
  Permission,
  QUEUE_FILTER_STATUSES,
  canTransitionOrder,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_DETAIL_INCLUDE, OrdersService, type OrderDetail } from '../orders/orders.service';
import { countdown } from '../orders/order-events.service';
import { staffActor } from '../orders/order-history';
import { OrderHistoryService } from '../orders/order-history.service';
import type { OrderHistoryEntry } from '../orders/order-history';
import { pickupCodeFrom } from '../orders/order-code';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { orderScope } from '../staff/scope';
import { ListQueueDto, QueueFilter, SetOrderStatusDto } from './dto';

export interface QueueItem {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: string;
  branch: { id: string; name: string | null };
  customerName: string | null;
  itemsCount: number;
  totalAmd: number;
  paymentStatus: string | null;
  readyAt: string | null;
  secondsLeft: number | null;
  createdAt: string;
  /**
   * The lines of the order, as the card on the board reads them.
   *
   * `name` is the snapshot taken when the order was placed — what the diner
   * bought, whatever the dish has been renamed to since — while `menuItemId`
   * points at the dish itself, which is what makes a line on the board a link
   * to the menu row. Both are needed: the id cannot say what was ordered, and
   * the name cannot say what to open.
   *
   * `lineTotalAmd` is the line, not the dish: two of something is twice the
   * price, and a board showing the unit price beside a quantity would be
   * inviting the kitchen to do the multiplication itself.
   */
  items: { menuItemId: string; name: string; qty: number; lineTotalAmd: number }[];
  notes: string | null;
}

/**
 * How many orders each stage holds under everything *except* the stage filter.
 *
 * The point is that a search tells you where the order is. Type a pickup code
 * while looking at the live board and the counts say "Active 0 · Past 1" — one
 * click away, instead of an empty board and no reason given.
 */
export type QueueCounts = Record<QueueFilter, number>;

/**
 * Folds a `group by status` into a count per stage.
 *
 * One grouped query rather than five counts: the stages overlap (`new` and
 * `ready` are both inside `active`), so counting them separately would be five
 * scans of the same rows to answer what one pass already knows.
 */
export function countPerStage(
  grouped: readonly { status: string; _count: { _all: number } }[],
): QueueCounts {
  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));

  const counts = {} as QueueCounts;
  for (const filter of Object.values(QueueFilter)) {
    counts[filter] = QUEUE_FILTER_STATUSES[filter].reduce(
      (sum, status) => sum + (byStatus.get(status) ?? 0),
      0,
    );
  }
  return counts;
}

@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly orderHistory: OrderHistoryService,
  ) {}

  /**
   * The kitchen queue: orders for the branches this user is scoped to,
   * narrowed by whatever the panel is filtering on.
   *
   * Every filter is applied **here**, not in the client. The panel used to
   * fetch one page of active orders and sort them into stages itself, which is
   * only correct while every order fits on a page — past that, a tab counting
   * "3 ready" meant "3 ready among the twenty I happen to have".
   */
  async listOrders(
    staff: StaffJwtPayload,
    query: ListQueueDto,
  ): Promise<{ items: QueueItem[]; total: number; page: number; counts: QueueCounts }> {
    // Everything except the stage, so the per-stage counts below can be taken
    // under the same search and scoping the list is under.
    const base: Prisma.OrderWhereInput = { ...orderScope(staff.scopes, Permission.OrdersRead) };

    if (query.restaurantId) {
      // Narrows the scope, never widens it: the ownership filter above stays,
      // and this is ANDed with it.
      base.branch = { restaurantId: query.restaurantId };
    }
    if (query.branchId) {
      base.branchId = query.branchId;
    }

    const term = query.q?.trim();
    if (term) {
      // `AND`, not `OR`. `orderScope` puts its own `OR` at the top level for
      // any account that is not platform-wide, and assigning `where.OR` here
      // would replace it — turning a search into a way to read every
      // restaurant's orders. This nests instead.
      base.AND = [
        {
          OR: [
            // Matches the full code and the pickup code both: the latter is the
            // last four digits of the former.
            { code: { contains: term, mode: 'insensitive' } },
            { user: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const stage = query.status ?? QueueFilter.Active;
    const where: Prisma.OrderWhereInput = {
      ...base,
      status: { in: [...QUEUE_FILTER_STATUSES[stage]] },
    };

    const [rows, total, grouped] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          branch: true,
          payment: { select: { status: true } },
          user: { select: { name: true } },
          items: {
            select: { menuItemId: true, nameSnapshot: true, qty: true, lineTotalAmd: true },
          },
        },
        // Oldest first: a kitchen works a queue, not a stack.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);

    return {
      counts: countPerStage(grouped),
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        pickupCode: pickupCodeFrom(row.code),
        status: row.status as OrderStatus,
        serviceMode: row.serviceMode,
        branch: { id: row.branch.id, name: row.branch.name },
        customerName: row.user.name,
        itemsCount: row.items.reduce((sum, item) => sum + item.qty, 0),
        totalAmd: row.totalAmd,
        paymentStatus: row.payment?.status ?? null,
        readyAt: row.readyAt?.toISOString() ?? null,
        secondsLeft: countdown(row.readyAt, row.status as OrderStatus),
        createdAt: row.createdAt.toISOString(),
        items: row.items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.nameSnapshot,
          qty: item.qty,
          lineTotalAmd: item.lineTotalAmd,
        })),
        notes: row.notes,
      })),
      total,
      page: query.page,
    };
  }

  /**
   * Advances an order through the kitchen.
   *
   * The legality of the move comes from the shared state machine, not from a
   * list written here — the same table the customer app reads, so the two
   * cannot disagree about what "ready" follows.
   */
  async setStatus(
    staff: StaffJwtPayload,
    orderId: string,
    dto: SetOrderStatusDto,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({
      // Reach is part of the query: there is no path that loads an order
      // outside the caller's scope and then decides. Scoped on `orders:advance`
      // rather than `orders:read`, so a role that may only watch the queue
      // cannot move an order in it.
      where: { id: orderId, ...orderScope(staff.scopes, Permission.OrdersAdvance) },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!canTransitionOrder(order.status as OrderStatus, dto.status)) {
      throw new UnprocessableEntityException(
        `An order that is ${order.status} cannot become ${dto.status}`,
      );
    }

    // The staff member the token stands for — and the super admin behind it, if
    // this is an impersonated session. See `staffActor`.
    return this.orders.transition(order, dto.status, staffActor(staff));
  }

  /**
   * Everything that has happened to one order, for the card's History button.
   *
   * `orders:read`, not `orders:advance`: reading how an order got here is part
   * of watching the queue, and a shift that may not move an order still has to
   * be able to answer "when did this come in and who confirmed it" at the
   * counter. The reach filter goes into the query, so an order outside it 404s
   * rather than leaking its timeline.
   */
  async history(staff: StaffJwtPayload, orderId: string): Promise<{ items: OrderHistoryEntry[] }> {
    return this.orderHistory.list({
      id: orderId,
      ...orderScope(staff.scopes, Permission.OrdersRead),
    });
  }
}
