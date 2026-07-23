import { OrderStatus } from '@amragrir/shared';
import { MetricsService, percentage } from './metrics.service';
import { MetricsQueryDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';

function build(over: Record<string, unknown> = {}) {
  const prisma = {
    order: {
      // Two different counts share this mock: the first call is the period
      // total, the second is the cancelled subset.
      count: jest
        .fn()
        .mockResolvedValueOnce(over.total ?? 10)
        .mockResolvedValue(over.cancelled ?? 1),
      aggregate: jest.fn().mockResolvedValue(
        over.aggregate ?? {
          _count: 6,
          _sum: { totalAmd: 60_000, serviceFeeAmd: 2_160, discountAmd: 1_200 },
        },
      ),
      groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by[0] === 'status'
            ? (over.byStatus ?? [
                { status: OrderStatus.Completed, _count: { _all: 6 } },
                { status: OrderStatus.Created, _count: { _all: 3 } },
                { status: OrderStatus.Cancelled, _count: { _all: 1 } },
              ])
            : (over.top ?? [
                { branchId: 'branch-1', _count: { _all: 6 }, _sum: { totalAmd: 60_000 } },
              ]),
        ),
      ),
    },
    user: { count: jest.fn().mockResolvedValue(42) },
    reservation: {
      groupBy: jest.fn().mockResolvedValue(
        over.reservations ?? [
          { status: 'completed', _count: { _all: 4 } },
          { status: 'no_show', _count: { _all: 1 } },
        ],
      ),
    },
    restaurantBranch: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'branch-1', name: 'Northern Ave', restaurant: { name: 'Sunny Table' } },
        ]),
    },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  return { service: new MetricsService(prisma), prisma };
}

const query = (over: Partial<MetricsQueryDto> = {}) =>
  Object.assign(new MetricsQueryDto(), over);

describe('overview', () => {
  it('counts only paid-or-later orders as revenue', async () => {
    // A `created` order is an abandoned basket and a `cancelled` one was
    // refunded; counting either would misreport the business in both
    // directions.
    const { service, prisma } = build();
    await service.overview(query());

    const statuses = (prisma.order.aggregate as jest.Mock).mock.calls[0][0].where.status.in;
    expect(statuses).not.toContain(OrderStatus.Created);
    expect(statuses).not.toContain(OrderStatus.Cancelled);
    expect(statuses).toContain(OrderStatus.Paid);
    expect(statuses).toContain(OrderStatus.Completed);
  });

  it('reports gross, fee, discount and an average order', async () => {
    const { service } = build();
    const metrics = await service.overview(query());

    expect(metrics.revenue.grossAmd).toBe(60_000);
    expect(metrics.revenue.serviceFeeAmd).toBe(2_160);
    expect(metrics.revenue.discountAmd).toBe(1_200);
    expect(metrics.revenue.averageOrderAmd).toBe(10_000);
  });

  it('never reports a negative share when the counts disagree', async () => {
    // The three counts are separate queries; an order cancelled between them
    // can make the arithmetic go negative, and a dashboard must not show that.
    const { service } = build({ total: 5, cancelled: 5 });
    const metrics = await service.overview(query());

    expect(metrics.orders.abandonedPct).toBeGreaterThanOrEqual(0);
  });

  it('does not divide by zero on a quiet period', async () => {
    const { service } = build({
      total: 0,
      cancelled: 0,
      aggregate: { _count: 0, _sum: { totalAmd: null, serviceFeeAmd: null, discountAmd: null } },
    });
    const metrics = await service.overview(query());

    expect(metrics.revenue.averageOrderAmd).toBe(0);
    expect(metrics.revenue.grossAmd).toBe(0);
    expect(metrics.orders.abandonedPct).toBe(0);
  });

  it('computes the abandoned share from what never got paid', async () => {
    // 10 total, 6 earning, 1 cancelled -> 3 abandoned.
    const { service } = build();
    const metrics = await service.overview(query());

    expect(metrics.orders.abandonedPct).toBe(30);
  });

  it('names the top restaurants rather than returning branch ids', async () => {
    const { service } = build();
    const metrics = await service.overview(query());

    expect(metrics.topRestaurants[0]).toEqual({
      name: 'Sunny Table — Northern Ave',
      orders: 6,
      revenueAmd: 60_000,
    });
  });

  it('counts a completed booking as seated', async () => {
    const { service } = build();
    const metrics = await service.overview(query());

    expect(metrics.reservations.seated).toBe(4);
    expect(metrics.reservations.noShow).toBe(1);
  });

  it('defaults to the last 30 days', async () => {
    const { service } = build();
    const metrics = await service.overview(query());

    const days = (new Date(metrics.to).getTime() - new Date(metrics.from).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('honours an explicit range', async () => {
    const { service } = build();
    const metrics = await service.overview(
      query({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' }),
    );

    expect(metrics.from).toBe('2026-01-01T00:00:00.000Z');
    expect(metrics.to).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('percentage', () => {
  it('keeps one decimal', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(1, 2)).toBe(50);
  });

  it('is zero rather than NaN on an empty denominator', () => {
    expect(percentage(0, 0)).toBe(0);
  });
});
