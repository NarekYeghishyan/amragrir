import { NotFoundException } from '@nestjs/common';
import { Language } from '@amragrir/shared';
import { RestaurantsService } from './restaurants.service';
import type { SearchService } from './search.service';
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

function build(rows: ReturnType<typeof branchRow>[], tables: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(rows.length);
  const tableFindMany = jest.fn().mockResolvedValue(tables);
  const prisma = {
    restaurantBranch: { findMany, count, findFirst: jest.fn().mockResolvedValue(rows[0] ?? null) },
    menuItem: { findMany: jest.fn().mockResolvedValue([]) },
    table: { findMany: tableFindMany },
  } as unknown as PrismaService;

  // Only the price filter reaches the search service, and these fixtures do
  // not set one — so it must never be called.
  const search = {
    branchIdsInPriceRange: jest.fn().mockResolvedValue([]),
  } as unknown as SearchService;

  return {
    service: new RestaurantsService(prisma, search),
    findMany,
    count,
    tableFindMany,
    prisma,
    search,
  };
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
    const far = branchRow({ id: 'far', lat: 40.19, lng: 44.53 });
    const { service } = build([far, near]);

    const { items } = await service.list(
      query({ ...CENTRE, sort: RestaurantSort.Nearest }),
      Language.Hy,
    );

    expect(items.map((i) => i.id)).toEqual(['near', 'far']);
  });

  // `nearest` with no distMax used to mean "every branch in the database".
  // An order-ahead product has no use for a result 40 km away, and the
  // unbounded query was the reason the endpoint could be used to exhaust memory.
  it('applies an implicit radius to nearest when no distMax is given', async () => {
    const inRange = branchRow({ id: 'in-range', lat: 40.19, lng: 44.53 });
    const wayOut = branchRow({ id: 'way-out', lat: 40.6, lng: 45.2 });
    const { service } = build([inRange, wayOut]);

    const { items, total } = await service.list(
      query({ ...CENTRE, sort: RestaurantSort.Nearest }),
      Language.Hy,
    );

    expect(items.map((i) => i.id)).toEqual(['in-range']);
    expect(total).toBe(1);
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

  // Regression: the distance path ran findMany with neither skip/take nor a
  // geographic predicate, so "near me" selected every branch in the table and
  // materialised it in Node before slicing to one page.
  it('bounds the distance query in SQL instead of scanning the table', async () => {
    const { service, findMany } = build([branchRow()]);

    await service.list(query({ ...CENTRE, sort: RestaurantSort.Nearest }), Language.Hy);

    const args = findMany.mock.calls[0]![0];
    expect(args.take).toBeGreaterThan(0);
    expect(args.where.lat).toEqual({ gte: expect.any(Number), lte: expect.any(Number) });
    expect(args.where.lng).toEqual({ gte: expect.any(Number), lte: expect.any(Number) });
    // The implicit radius must actually be narrow, not a whole-planet box.
    expect(args.where.lat.lte - args.where.lat.gte).toBeLessThan(1);
  });

  // Regression: setting distMax disabled the SQL ORDER BY while the in-app
  // sort only ran for `nearest`, so every other sort was silently discarded.
  it('keeps the requested sort when a distance filter is applied', async () => {
    const { service, findMany } = build([branchRow()]);

    await service.list(
      query({ ...CENTRE, distMax: 2, sort: RestaurantSort.Fastest }),
      Language.Hy,
    );

    expect(findMany.mock.calls[0]![0].orderBy).toEqual([{ avgPrepMin: 'asc' }]);
  });

  // Regression: the radius was compared against the rounded display distance,
  // so a branch 2.04 km away rounded to 2.0 and slipped past distMax=2.
  it('filters on the true distance, not the rounded display value', async () => {
    // ~2.04 km north of the centre.
    const justOutside = branchRow({ id: 'outside', lat: 40.19595, lng: CENTRE.lng });
    const { service } = build([justOutside]);

    const { items } = await service.list(query({ ...CENTRE, distMax: 2 }), Language.Hy);

    expect(items).toHaveLength(0);
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

  // Regression: findFirst had no ordering, so a restaurant id or slug matching
  // several branches returned whichever row the database happened to yield —
  // the same URL could serve a different branch's menu on each request.
  it.each([
    ['findOne', (s: RestaurantsService) => s.findOne('sunny-table', Language.Hy)],
    ['menu', (s: RestaurantsService) => s.menu('sunny-table', {}, Language.Hy)],
    ['tables', (s: RestaurantsService) => s.tables('sunny-table')],
  ])('resolves the branch deterministically in %s', async (_label, call) => {
    const { service, prisma } = build([branchRow()]);

    await call(service);

    expect(prisma.restaurantBranch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
  });
});

describe('RestaurantsService.tables', () => {
  const table = (tableNo: string) => ({ id: tableNo, tableNo, seats: 2, zone: null });

  // Regression: table_no is a varchar, so ordering it in SQL listed "10"
  // immediately after "1". The seed only has tables 1-4, where lexicographic
  // and numeric order coincide, so live testing could not surface it.
  it('orders numbered tables numerically, not lexicographically', async () => {
    const { service } = build(
      [branchRow()],
      ['10', '2', '1', '12', '3'].map(table),
    );

    const { tables } = await service.tables('sunny-table');

    expect(tables.map((t) => t.tableNo)).toEqual(['1', '2', '3', '10', '12']);
  });

  it('keeps non-numeric labels together after the numbered ones', async () => {
    const { service } = build([branchRow()], ['A2', '2', 'A1', '1'].map(table));

    const { tables } = await service.tables('sunny-table');

    expect(tables.map((t) => t.tableNo)).toEqual(['1', '2', 'A1', 'A2']);
  });
});
