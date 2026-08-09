import type { PrismaClient } from '@prisma/client';
import { CATEGORY_PHOTOS, DISH_PHOTOS } from './menu-photos';
import { CUISINE_COVERS, RESTAURANT_COVERS } from './restaurant-covers';
import { refreshSeedCovers, refreshSeedPhotos } from './refresh-photos';

/**
 * What the script does to a table it did not plant.
 *
 * This is the half nothing else can check: it is run by hand against a database
 * that is already up, so a mistake here is somebody's demo data rewritten, and
 * the worst mistake — overwriting a photograph a restaurant uploaded — cannot be
 * undone from the panel. Prisma is a stand-in; what is asserted is which rows it
 * was asked to write and with what.
 */
function build(items: unknown[]) {
  const updateMany = jest
    .fn()
    .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve({ count: where.id.in.length }),
    );
  const prisma = {
    menuItem: { findMany: jest.fn().mockResolvedValue(items), updateMany },
  } as unknown as PrismaClient;

  return { prisma, updateMany };
}

const dish = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  nameI18n: { hy: 'Մարգարիտա', en: 'Margherita' },
  photoUrl: null,
  category: { key: 'pizza' },
  ...over,
});

describe('refreshSeedPhotos', () => {
  it('gives a dish with no photograph the one for what it is', async () => {
    const { prisma, updateMany } = build([dish()]);

    await expect(refreshSeedPhotos(prisma)).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] } },
      data: { photoUrl: DISH_PHOTOS.Margherita },
    });
  });

  it('replaces a placeholder left by an older seed', async () => {
    const { prisma, updateMany } = build([
      dish({ photoUrl: 'http://localhost:3000/static/menu/pizza.svg' }),
    ]);

    await expect(refreshSeedPhotos(prisma)).resolves.toBe(1);
    expect(updateMany.mock.calls[0][0].data.photoUrl).toBe(DISH_PHOTOS.Margherita);
  });

  it('never touches a photograph somebody uploaded', async () => {
    const { prisma, updateMany } = build([
      dish({ photoUrl: 'http://localhost:3000/uploads/menu/6f2a-91c3.jpg' }),
      dish({ id: 'item-2', photoUrl: 'https://cdn.example.com/their-own.jpg' }),
    ]);

    await expect(refreshSeedPhotos(prisma)).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does nothing on a second run', async () => {
    const { prisma, updateMany } = build([dish({ photoUrl: DISH_PHOTOS.Margherita })]);

    await expect(refreshSeedPhotos(prisma)).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('falls back to the category for a dish this table does not name', async () => {
    const { prisma, updateMany } = build([
      dish({ nameI18n: { hy: 'Նապոլեոն', en: 'Napoleon' }, category: { key: 'desserts' } }),
    ]);

    await refreshSeedPhotos(prisma);
    expect(updateMany.mock.calls[0][0].data.photoUrl).toBe(CATEGORY_PHOTOS.desserts);
  });

  it('survives a dish with no English name and no category', async () => {
    // Both are nullable in the schema, and a dish added by hand through the API
    // has whatever names somebody typed.
    const { prisma, updateMany } = build([dish({ nameI18n: { hy: 'Ինչ-որ բան' }, category: null })]);

    await refreshSeedPhotos(prisma);
    expect(updateMany.mock.calls[0][0].data.photoUrl).toBe(CATEGORY_PHOTOS.dish);
  });

  it('writes one statement per picture, not one per dish', async () => {
    // The seed plants several hundred rows across every branch of every
    // restaurant; a statement each would be a slow script for no reason.
    const { prisma, updateMany } = build([
      dish({ id: 'a' }),
      dish({ id: 'b' }),
      dish({ id: 'c', nameI18n: { en: 'Pepperoni' } }),
    ]);

    await expect(refreshSeedPhotos(prisma)).resolves.toBe(3);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b']);
  });
});

function buildRestaurants(rows: unknown[]) {
  const updateMany = jest
    .fn()
    .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve({ count: where.id.in.length }),
    );
  const prisma = {
    restaurant: { findMany: jest.fn().mockResolvedValue(rows), updateMany },
  } as unknown as PrismaClient;

  return { prisma, updateMany };
}

const restaurant = (over: Record<string, unknown> = {}) => ({
  id: 'rest-1',
  slug: 'dolmama',
  cuisine: 'Armenian',
  coverUrl: null,
  ...over,
});

describe('refreshSeedCovers', () => {
  it('gives a restaurant with no cover the one for what it is', async () => {
    const { prisma, updateMany } = buildRestaurants([restaurant()]);

    await expect(refreshSeedCovers(prisma)).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['rest-1'] } },
      data: { coverUrl: RESTAURANT_COVERS.dolmama },
    });
  });

  it('falls back to the cuisine, and then to a dining room', async () => {
    const { prisma, updateMany } = buildRestaurants([
      restaurant({ slug: 'karas' }),
      // Cuisine is nullable, and a restaurant added by hand through the panel
      // may have been given one nothing here knows.
      restaurant({ id: 'rest-2', slug: 'somewhere-new', cuisine: null }),
    ]);

    await expect(refreshSeedCovers(prisma)).resolves.toBe(2);
    expect(updateMany.mock.calls[0][0].data.coverUrl).toBe(CUISINE_COVERS.Armenian);
    expect(updateMany.mock.calls[1][0].data.coverUrl).toBe(CUISINE_COVERS.restaurant);
  });

  it('never touches a cover somebody uploaded', async () => {
    // The endpoint does not exist yet. When it does, this is the test that says
    // a reseed cannot take back the photograph a restaurant chose.
    const { prisma, updateMany } = buildRestaurants([
      restaurant({ coverUrl: 'http://localhost:3000/uploads/covers/6f2a-91c3.jpg' }),
      restaurant({ id: 'rest-2', slug: 'karas', coverUrl: 'https://cdn.example.com/their-own.jpg' }),
    ]);

    await expect(refreshSeedCovers(prisma)).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does nothing on a second run', async () => {
    const { prisma, updateMany } = buildRestaurants([
      restaurant({ coverUrl: RESTAURANT_COVERS.dolmama }),
    ]);

    await expect(refreshSeedCovers(prisma)).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
