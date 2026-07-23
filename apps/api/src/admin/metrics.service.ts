import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { MetricsQueryDto } from './dto';

/**
 * Statuses that count as revenue.
 *
 * A `created` order is a basket someone abandoned, and a `cancelled` one was
 * refunded — counting either would make the dashboard flatter than reality in
 * one direction and richer in the other. Revenue starts at `paid`.
 */
const EARNING_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Paid,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
  OrderStatus.Completed,
];

export interface Metrics {
  from: string;
  to: string;
  orders: {
    total: number;
    earning: number;
    cancelled: number;
    /** Share of orders that never got paid, as a percentage. */
    abandonedPct: number;
  };
  revenue: {
    grossAmd: number;
    serviceFeeAmd: number;
    discountAmd: number;
    averageOrderAmd: number;
  };
  byStatus: { status: string; count: number }[];
  topRestaurants: { name: string; orders: number; revenueAmd: number }[];
  users: { total: number; verified: number; newInPeriod: number };
  reservations: { total: number; seated: number; noShow: number };
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: MetricsQueryDto): Promise<Metrics> {
    const { from, to } = resolveRange(query);
    const period = { gte: from, lte: to };

    // Aggregates run in SQL and in parallel. Pulling orders into Node to sum
    // them would work on seed data and fall over on a real month.
    const [totals, earning, cancelled, byStatus, topRows, users, verified, newUsers, reservations] =
      await Promise.all([
        this.prisma.order.count({ where: { createdAt: period } }),
        this.prisma.order.aggregate({
          where: { createdAt: period, status: { in: [...EARNING_STATUSES] } },
          _count: true,
          _sum: { totalAmd: true, serviceFeeAmd: true, discountAmd: true },
        }),
        this.prisma.order.count({
          where: { createdAt: period, status: OrderStatus.Cancelled },
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where: { createdAt: period },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['branchId'],
          where: { createdAt: period, status: { in: [...EARNING_STATUSES] } },
          _count: { _all: true },
          _sum: { totalAmd: true },
          orderBy: { _sum: { totalAmd: 'desc' } },
          take: 5,
        }),
        this.prisma.user.count({ where: { isGuest: false } }),
        this.prisma.user.count({ where: { phoneVerified: true } }),
        this.prisma.user.count({ where: { createdAt: period, isGuest: false } }),
        this.prisma.reservation.groupBy({
          by: ['status'],
          where: { createdAt: period },
          _count: { _all: true },
        }),
      ]);

    const earningCount = earning._count;
    const grossAmd = earning._sum.totalAmd ?? 0;

    // Branch names need a second query; doing it once for five ids beats
    // joining the whole aggregate.
    const branches = await this.prisma.restaurantBranch.findMany({
      where: { id: { in: topRows.map((row) => row.branchId) } },
      include: { restaurant: { select: { name: true } } },
    });
    const nameOf = new Map(
      branches.map((branch) => [
        branch.id,
        branch.name ? `${branch.restaurant.name} — ${branch.name}` : branch.restaurant.name,
      ]),
    );

    const reservationCount = (status: string) =>
      reservations.find((row) => row.status === status)?._count._all ?? 0;
    const reservationTotal = reservations.reduce((sum, row) => sum + row._count._all, 0);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      orders: {
        total: totals,
        earning: earningCount,
        cancelled,
        // Clamped: the three counts are separate queries, so an order
        // cancelled between them can make the arithmetic go negative — and a
        // dashboard showing "-60% abandoned" is worse than a rounding error.
        abandonedPct: percentage(Math.max(0, totals - earningCount - cancelled), totals),
      },
      revenue: {
        grossAmd,
        serviceFeeAmd: earning._sum.serviceFeeAmd ?? 0,
        discountAmd: earning._sum.discountAmd ?? 0,
        // Integer division on purpose: a fractional dram does not exist.
        averageOrderAmd: earningCount === 0 ? 0 : Math.round(grossAmd / earningCount),
      },
      byStatus: byStatus
        .map((row) => ({ status: row.status, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      topRestaurants: topRows.map((row) => ({
        name: nameOf.get(row.branchId) ?? 'Unknown',
        orders: row._count._all,
        revenueAmd: row._sum.totalAmd ?? 0,
      })),
      users: { total: users, verified, newInPeriod: newUsers },
      reservations: {
        total: reservationTotal,
        seated: reservationCount('seated') + reservationCount('completed'),
        noShow: reservationCount('no_show'),
      },
    };
  }

  /** Payments that took money but whose order says otherwise, and vice versa.
   *  Empty is the expected answer; anything here is a human's problem. */
  async reconciliation(): Promise<{ items: { orderCode: string; issue: string }[] }> {
    const mismatched = await this.prisma.payment.findMany({
      where: {
        OR: [
          // Captured against an order that was cancelled — the refund path
          // logs loudly when it cannot complete, and this is where the result
          // surfaces.
          { status: PaymentStatus.Captured, order: { status: OrderStatus.Cancelled } },
          // The reverse: an order marked paid with nothing captured or pending.
          {
            status: { in: [PaymentStatus.Failed, PaymentStatus.Cancelled] },
            order: { status: { notIn: [OrderStatus.Created, OrderStatus.Cancelled] } },
          },
        ],
      },
      include: { order: { select: { code: true, status: true } } },
      take: 50,
    });

    return {
      items: mismatched
        .filter((payment) => payment.order !== null)
        .map((payment) => ({
          orderCode: payment.order!.code,
          issue: `payment ${payment.status} but order ${payment.order!.status}`,
        })),
    };
  }
}

/** Defaults to the last 30 days — the range a dashboard is asked for when
 *  nobody says otherwise. */
function resolveRange(query: MetricsQueryDto): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

export function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}
