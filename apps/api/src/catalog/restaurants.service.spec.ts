import { NotFoundException } from '@nestjs/common';
import { Language } from '@amragrir/shared';
import { RestaurantsService } from './restaurants.service';
import { ListRestaurantsDto, RestaurantSort } from './dto';
import type { PrismaService } from '../prisma/prisma.service';

/** Yerevan landmarks — the seed places branches around here. */
const CENTRE = { lat: 40.1776, lng: 44.5126 };

function branchRow(over: Record<string, unknown> = {}) {
  return {
    id: 'branch-1',
    restaurantId: 'rest-1',
    name: 'Northern Ave',
    address: 'Northern Ave 5',
    city: 'Yerevan',
    lat: 40.1811,
    lng: 44.5136,
    phone: null,
    openHours: null,
    isOpen: true,
    avgPrepMin: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
    restaurant: {
      id: 'rest-1',
      slug: 'sunny-table',
      name: 'Sunny Table',
      cuisine: 'Mediterranean',
      priceLevel: 2,
      ratingAvg: 4.8,
      reviewsCount: 1200,
      ownerId: 'owner-1',
      reservationsEnabled: true,
      services: ['pickup', 'dinein', 'reserve'],
      coverUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...over,
  };
}

function build(rows: ReturnType<typeof branchRow>[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(rows.length);
  const prisma = {
    restaurantBranch: { findMany, count, findFirst: jest.fn().mockResolvedValue(rows[0] ?? null) },
    menuItem: { findMany: jest.fn().mockResolvedValue([]) },
    table: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  return { service: new RestaurantsService(prisma), findMany, count, prisma };
}

function query(over: Partial<ListRestaurantsDto> = {}): ListRestaurantsDto {
  return Object.assign(new ListRestaurantsDto(), { page: 1, limit: 20, sort: 'recommended' }, over);
}

describe('RestaurantsService.list', () => {
  it('maps a branch row to the list shape the home feed renders', async () => {
    const { service } = build([branchRow()]);

    const { items, total, page } = await service.list(query(), Language.Hy);

    expect(total).toBe(1);
    expect(page).toBe(1);
    expect(items[0]).toMatchObject({
      id: 'branch-1',
      slug: 'sunny-table',
      name: 'Sunny Table',
      rating: 4.8,
      reviewsCount: 1200,
      prepMin: 12,
      isOpen: true,
      services: ['pickup', 'dinein', 'reserve'],
      reservationsEnabled: true,
    });
  });

  it('omits distance when the caller sends no coordinates', async () => {
    const { service } = build([branchRow()]);

    const { items } = await service.list(query(), Language.Hy);

    expect(items[0]!.distanceKm).toBeNull();
  });

  it('computes distance when coordinates are supplied', async () => {
    const { service } = build([branchRow()]);

    const { items } = await service.list(query({ ...CENTRE }), Language.Hy);

    // ~400 m from Republic Square to Northern Ave.
    expect(items[0]!.distanceKm).toBeGreaterThan(0);
    expect(items[0]!.distanceKm).toBeLessThan(1);
  });

  it('sorts by distance when asked, regardless of DB order', async () => {
    const near = branchRow({ id: 'near', lat: 40.178, lng: 44.5128 });
    const far = branchRow({ id: 'far', lat: 40.21, lng: 44.56 });
    const { service } = build([far, near]);

    const { items } = await service.list(
      query({ ...CENTRE, sort: RestaurantSort.Nearest }),
      Language.Hy,
    );

    expect(items.map((i) => i.id)).toEqual(['near', 'far']);
  });

  it('drops branches beyond distMax', async () => {
    const near = branchRow({ id: 'near', lat: 40.178, lng: 44.5128 });
    const far = branchRow({ id: 'far', lat: 40.5, lng: 45.0 });
    const { service } = build([near, far]);

    const { items, total } = await service.list(query({ ...CENTRE, distMax: 2 }), Language.Hy);

    expect(items.map((i) => i.id)).toEqual(['near']);
    expect(total).toBe(1);
  });

  // Distance is computed after the query, so paging must happen after
  // filtering or a page would be missing rows that were filtered out.
  it('pages the distance-filtered set rather than the raw query', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      branchRow({ id: `b${i}`, lat: 40.178 + i * 0.001, lng: 44.5128 }),
    );
    const { service } = build(rows);

    const { items, total } = await service.list(
      query({ ...CENTRE, sort: RestaurantSort.Nearest, page: 2, limit: 2 }),
      Language.Hy,
    );

    expect(total).toBe(5);
    expect(items.map((i) => i.id)).toEqual(['b2', 'b3']);
  });

  it('delegates paging to the database when distance is not involved', async () => {
    const { service, findMany } = build([branchRow()]);

    await service.list(query({ page: 3, limit: 10 }), Language.Hy);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  describe('filters', () => {
    it('filters by minimum rating', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ minRating: 4.5 }), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.restaurant.ratingAvg).toEqual({ gte: 4.5 });
    });

    it('filters by declared service', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ service: ['reserve'] }), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.restaurant.services).toEqual({
        hasSome: ['reserve'],
      });
    });

    it('searches name and cuisine together', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ q: 'sushi' }), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.restaurant.OR).toHaveLength(2);
    });

    // Category and dietary describe dishes, so they must select branches that
    // have a matching menu item — not filter the restaurant row itself.
    it('turns category and dietary into a menu-item condition', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ category: 'sushi', dietary: ['vegan'] }), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.menuItems).toEqual({
        some: { category: { key: 'sushi' }, dietaryTags: { hasSome: ['vegan'] } },
      });
    });

    it('applies no filter when none is requested', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query(), Language.Hy);

      expect(findMany.mock.calls[0]![0].where).toEqual({});
    });
  });

  describe('sorting', () => {
    it.each([
      [RestaurantSort.Fastest, [{ avgPrepMin: 'asc' }]],
      [RestaurantSort.TopRated, [{ restaurant: { ratingAvg: 'desc' } }]],
    ])('orders by %s in the database', async (sort, expected) => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ sort }), Language.Hy);

      expect(findMany.mock.calls[0]![0].orderBy).toEqual(expected);
    });

    // "Nearest" without coordinates cannot be honoured; it must not produce an
    // arbitrary order that looks meaningful.
    it('falls back to the default order for nearest without coordinates', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ sort: RestaurantSort.Nearest }), Language.Hy);

      expect(findMany.mock.calls[0]![0].orderBy).toEqual([
        { restaurant: { ratingAvg: 'desc' } },
        { restaurant: { reviewsCount: 'desc' } },
      ]);
    });
  });
});

describe('RestaurantsService lookups', () => {
  it('resolves a restaurant by slug', async () => {
    const { service, prisma } = build([branchRow()]);

    await service.findOne('sunny-table', Language.Hy);

    expect(prisma.restaurantBranch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurant: { slug: 'sunny-table' } } }),
    );
  });

  // A client may hold either id depending on which screen it came from.
  it('accepts a uuid as either a branch id or a restaurant id', async () => {
    const { service, prisma } = build([branchRow()]);
    const uuid = '11111111-2222-3333-4444-555555555555';

    await service.findOne(uuid, Language.Hy);

    expect(prisma.restaurantBranch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ id: uuid }, { restaurantId: uuid }] },
      }),
    );
  });

  it('404s for an unknown restaurant', async () => {
    const { service } = build([]);

    await expect(service.findOne('nope', Language.Hy)).rejects.toThrow(NotFoundException);
  });

  it('404s when asking for the menu of an unknown restaurant', async () => {
    const { service } = build([]);

    await expect(service.menu('nope', {}, Language.Hy)).rejects.toThrow(NotFoundException);
  });
});
