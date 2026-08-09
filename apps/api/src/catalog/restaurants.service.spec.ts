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
  // The grouped list counts restaurants, not branches.
  const restaurantCount = jest
    .fn()
    .mockResolvedValue(new Set(rows.map((row) => row.restaurantId)).size);
  const prisma = {
    restaurantBranch: { findMany, count, findFirst: jest.fn().mockResolvedValue(rows[0] ?? null) },
    restaurant: { count: restaurantCount },
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
    restaurantCount,
    tableFindMany,
    prisma,
    search,
  };
}

/** Oldest-first is the tie-break every ordering ends in. */
const TIE_BREAK = [{ createdAt: 'asc' }, { id: 'asc' }];

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
      restaurantId: 'rest-1',
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

  /**
   * A row carries both ids, and they are not interchangeable.
   *
   * `id` is the branch — what a basket is opened against and what the card's
   * link resolves. `restaurantId` is the business, and it is the one a heart
   * sends to `POST /favorites`, because that is what a favourite is stored
   * against (DATABASE.md §13). Asserted separately because the two were the
   * same field for a long time and a card that favourited a *branch* would have
   * looked right until a chain's second address appeared.
   */
  it('names the branch and the business separately', async () => {
    const base = branchRow();
    const { service } = build([
      branchRow({
        id: 'branch-9',
        restaurantId: 'rest-9',
        restaurant: { ...base.restaurant, id: 'rest-9' },
      }),
    ]);

    const { items } = await service.list(query(), Language.Hy);

    expect(items[0]!.id).toBe('branch-9');
    expect(items[0]!.restaurantId).toBe('rest-9');
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

    expect(findMany.mock.calls[0]![0].orderBy).toEqual([{ avgPrepMin: 'asc' }, ...TIE_BREAK]);
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

    it('filters by declared service, asking each branch and not just its parent', async () => {
      // Services are answered per branch now. Filtering the restaurant alone
      // would hand back branches that have withdrawn the very service somebody
      // filtered for, and hide the ones that added it — so the filter mirrors
      // `resolveBranchOffering`: an overriding branch is matched on its own
      // array, and every other on its restaurant's.
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ service: ['reserve'] }), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.OR).toEqual([
        { servicesOverridden: true, services: { hasSome: ['reserve'] } },
        { servicesOverridden: false, restaurant: { services: { hasSome: ['reserve'] } } },
      ]);
    });

    it('keeps the service filter out of the restaurant clause the search shares', async () => {
      // `q` builds its own OR *inside* `where.restaurant`, so the two must not
      // collide — the service filter is a top-level OR precisely so they don't.
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ service: ['reserve'], q: 'sunny' }), Language.Hy);

      const where = findMany.mock.calls[0]![0].where;
      expect(where.restaurant.services).toBeUndefined();
      expect(where.restaurant.OR).toBeDefined();
      expect(where.OR).toHaveLength(2);
    });

    it('filters to open branches when openNow is set', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query({ openNow: true }), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.isOpen).toBe(true);
    });

    it('does not constrain isOpen when openNow is absent', async () => {
      const { service, findMany } = build([branchRow()]);

      await service.list(query(), Language.Hy);

      expect(findMany.mock.calls[0]![0].where.isOpen).toBeUndefined();
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
        // `deletedAt: null` alongside them: a dish taken off the menu must not
        // be why a branch turns up under "vegan", or the search promises
        // something the menu no longer offers.
        some: { category: { key: 'sushi' }, dietaryTags: { hasSome: ['vegan'] }, deletedAt: null },
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
      [RestaurantSort.Fastest, [{ avgPrepMin: 'asc' }, ...TIE_BREAK]],
      [RestaurantSort.TopRated, [{ restaurant: { ratingAvg: 'desc' } }, ...TIE_BREAK]],
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
        ...TIE_BREAK,
      ]);
    });

    // Regression: a chain's branches share one rating, so the ORDER BY was a
    // tie for every row of it. Postgres may return tied rows in any order,
    // which makes skip/take paging drop and repeat rows between pages.
    it.each([RestaurantSort.Recommended, RestaurantSort.TopRated, RestaurantSort.Fastest])(
      'breaks ties deterministically under %s',
      async (sort) => {
        const { service, findMany } = build([branchRow()]);

        await service.list(query({ sort }), Language.Hy);

        expect(findMany.mock.calls[0]![0].orderBy.slice(-2)).toEqual(TIE_BREAK);
      },
    );
  });
});

// The list is a branch list, and the web renders one page per *restaurant* —
// so a five-branch chain drew five identical cards that all linked to the same
// page, and the heading counted 78 "restaurants" where there were 23.
describe('RestaurantsService.list grouped by restaurant', () => {
  const chain = (id: string, restaurantId: string, over: Record<string, unknown> = {}) =>
    branchRow({
      id,
      restaurantId,
      restaurant: { ...branchRow().restaurant, id: restaurantId, slug: restaurantId },
      ...over,
    });

  it('returns one row per restaurant', async () => {
    const { service } = build([
      chain('a1', 'rest-a'),
      chain('a2', 'rest-a'),
      chain('a3', 'rest-a'),
      chain('b1', 'rest-b'),
    ]);

    const { items } = await service.list(query({ groupByRestaurant: true }), Language.Hy);

    expect(items.map((i) => i.id)).toEqual(['a1', 'b1']);
  });

  // The kept branch has to be the one `/restaurants/{slug}` resolves to, or a
  // card reading "open · 12 min" opens a page that says something else.
  it('keeps the branch the restaurant page itself resolves to', async () => {
    const { service, findMany } = build([chain('a1', 'rest-a'), chain('a2', 'rest-a')]);

    const { items } = await service.list(query({ groupByRestaurant: true }), Language.Hy);

    expect(findMany.mock.calls[0]![0].orderBy.slice(-2)).toEqual(TIE_BREAK);
    expect(items[0]!.id).toBe('a1');
  });

  it('counts restaurants rather than branches', async () => {
    const { service, restaurantCount } = build([
      chain('a1', 'rest-a'),
      chain('a2', 'rest-a'),
      chain('b1', 'rest-b'),
    ]);

    const { total } = await service.list(query({ groupByRestaurant: true }), Language.Hy);

    expect(total).toBe(2);
    expect(restaurantCount).toHaveBeenCalledWith({ where: { branches: { some: {} } } });
  });

  // Collapsing before the filter ran would let a closed branch stand in for a
  // restaurant that does have an open one — and vice versa.
  it('collapses after the filters, so the kept branch matches the query', async () => {
    const { service, findMany } = build([chain('a2', 'rest-a', { isOpen: true })]);

    const { items } = await service.list(
      query({ groupByRestaurant: true, openNow: true }),
      Language.Hy,
    );

    expect(findMany.mock.calls[0]![0].where.isOpen).toBe(true);
    expect(items[0]!.isOpen).toBe(true);
  });

  // Paging happens after collapsing, or page 2 would start 24 branches in and
  // skip past restaurants page 1 never showed.
  it('pages the collapsed set rather than the branch rows', async () => {
    const { service } = build([
      chain('a1', 'rest-a'),
      chain('a2', 'rest-a'),
      chain('b1', 'rest-b'),
      chain('c1', 'rest-c'),
    ]);

    const { items } = await service.list(
      query({ groupByRestaurant: true, page: 2, limit: 1 }),
      Language.Hy,
    );

    expect(items.map((i) => i.id)).toEqual(['b1']);
  });

  it('still applies the distance filter before collapsing', async () => {
    const near = chain('a-near', 'rest-a', { lat: 40.178, lng: 44.5128 });
    const far = chain('b-far', 'rest-b', { lat: 40.5, lng: 45.0 });
    const { service } = build([near, far]);

    const { items, total } = await service.list(
      query({ groupByRestaurant: true, ...CENTRE, distMax: 2 }),
      Language.Hy,
    );

    expect(items.map((i) => i.id)).toEqual(['a-near']);
    // A distance query filters in the app, so only the collapsed set knows the
    // total — the database cannot count it.
    expect(total).toBe(1);
  });

  it('leaves the branch list untouched when not asked to group', async () => {
    const { service } = build([chain('a1', 'rest-a'), chain('a2', 'rest-a')]);

    const { items } = await service.list(query(), Language.Hy);

    expect(items.map((i) => i.id)).toEqual(['a1', 'a2']);
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
