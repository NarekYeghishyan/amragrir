import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_ORDER_STATUSES,
  OrderStatus,
  TERMINAL_ORDER_STATUSES,
  canTransitionOrder,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_DETAIL_INCLUDE, OrdersService, type OrderDetail } from '../orders/orders.service';
import { countdown } from '../orders/order-events.service';
import { pickupCodeFrom } from '../orders/order-code';
import type { JwtPayload } from '../auth/token.service';
import { orderScopeFor } from './branch-access';
import { ListOwnerOrdersDto, OwnerQueueFilter, SetOrderStatusDto } from './dto';

export interface OwnerQueueItem {
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
  items: { name: string; qty: number }[];
  notes: string | null;
}

@Injectable()
export class OwnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /** The kitchen queue: orders for the branches this user is scoped to. */
  async listOrders(
    user: JwtPayload,
    query: ListOwnerOrdersDto,
  ): Promise<{ items: OwnerQueueItem[]; total: number; page: number }> {
    const where: Prisma.OrderWhereInput = { ...orderScopeFor(user) };

    if (query.status === OwnerQueueFilter.Active) {
      where.status = { in: [...ACTIVE_ORDER_STATUSES] };
    } else if (query.status === OwnerQueueFilter.Past) {
      where.status = { in: [...TERMINAL_ORDER_STATUSES] };
    }
    if (query.branchId) {
      // Narrows the scope, never widens it: the ownership filter above stays.
      where.branchId = query.branchId;
    }

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          branch: true,
          payment: { select: { status: true } },
          user: { select: { name: true } },
          items: { select: { nameSnapshot: true, qty: true } },
        },
        // Oldest first: a kitchen works a queue, not a stack.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
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
        items: row.items.map((item) => ({ name: item.nameSnapshot, qty: item.qty })),
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
  async setStatus(user: JwtPayload, orderId: string, dto: SetOrderStatusDto): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({
      // Ownership is part of the query: there is no path that loads an order
      // outside the caller's scope and then decides.
      where: { id: orderId, ...orderScopeFor(user) },
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

    return this.orders.transition(order, dto.status);
  }
}
