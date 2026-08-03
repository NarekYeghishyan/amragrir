import { Language } from '@amragrir/shared';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';

function branchRow(id: string, restaurantId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    restaurantId,
    lat: null,
    lng: null,
    isOpen: true,
    avgPrepMin: 12,
    createdAt: new Date(),
    restaurant: {
      id: restaurantId,
      slug: restaurantId,
      name: 'Green Bean',
      cuisine: 'Healthy',
      priceLevel: 2,
      ratingAvg: 4.7,
      reviewsCount: 720,
      coverUrl: null,
    },
    ...over,
  };
}

function build(rows: ReturnType<typeof branchRow>[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    restaurantBranch: { findMany },
    // Dishes are a raw query; this suite is about the restaurant list.
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;

  return { service: new SearchService(prisma), findMany };
}

const query = (q: string): SearchQueryDto => Object.assign(new SearchQueryDto(), { q });

describe('SearchService.search', () => {
  // Regression: restaurants are matched on name and cuisine — both restaurant
  // columns — so every branch of a match qualified. "green" returned Green Bean
  // five times, five identical cards all opening the same page, and those five
  // rows ate a quarter of the twenty results other restaurants needed.
  it('returns a restaurant once, however many branches it has', async () => {
    const { service } = build([
      branchRow('a1', 'rest-a'),
      branchRow('a2', 'rest-a'),
      branchRow('a3', 'rest-a'),
      branchRow('b1', 'rest-b'),
    ]);

    const { restaurants } = await service.search(query('green'), Language.Hy);

    expect(restaurants.map((r) => r.id)).toEqual(['a1', 'b1']);
  });

  // A chain's branches share one rating, so the ORDER BY is a tie across all of
  // them; without a tie-break the kept row is whichever the database yielded,
  // and it would not be the branch `/restaurants/{slug}` opens.
  it('breaks rating ties the way the restaurant page picks a branch', async () => {
    const { service, findMany } = build([branchRow('a1', 'rest-a')]);

    await service.search(query('green'), Language.Hy);

    expect(findMany.mock.calls[0]![0].orderBy.slice(-2)).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('reads a wider window than it returns, so collapsing cannot starve the list', async () => {
    const { service, findMany } = build([branchRow('a1', 'rest-a')]);

    await service.search(query('green'), Language.Hy);

    expect(findMany.mock.calls[0]![0].take).toBeGreaterThan(20);
  });

  it('answers an empty query with empty lists rather than everything', async () => {
    const { service, findMany } = build([branchRow('a1', 'rest-a')]);

    const { restaurants, dishes } = await service.search(query('   '), Language.Hy);

    expect(restaurants).toEqual([]);
    expect(dishes).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
