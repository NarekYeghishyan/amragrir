import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FavoritesService } from './favorites.service';
import type { PrismaService } from '../prisma/prisma.service';

const USER = 'user-1';
const RESTAURANT = 'rest-1';

function favoriteRow(over: Record<string, unknown> = {}) {
  return {
    id: 'fav-1',
    userId: USER,
    restaurantId: RESTAURANT,
    createdAt: new Date('2026-07-20T10:00:00Z'),
    restaurant: {
      id: RESTAURANT,
      slug: 'sunny-table',
      name: 'Sunny Table',
      cuisine: 'Mediterranean',
      priceLevel: 2,
      ratingAvg: 4.8,
      reviewsCount: 1200,
      coverUrl: null,
      services: ['pickup'],
      branches: [{ id: 'branch-1', avgPrepMin: 12, isOpen: true }],
    },
    ...over,
  };
}

function build(options: { rows?: unknown[]; restaurant?: unknown; createError?: unknown } = {}) {
  const create = options.createError
    ? jest.fn().mockRejectedValue(options.createError)
    : jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    favorite: {
      findMany: jest.fn().mockResolvedValue(options.rows ?? [favoriteRow()]),
      create,
      deleteMany,
    },
    restaurant: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.restaurant === undefined ? { id: RESTAURANT } : options.restaurant),
    },
  } as unknown as PrismaService;

  return { service: new FavoritesService(prisma), prisma, create, deleteMany };
}

describe('list', () => {
  it('returns a branch id so the card links somewhere orderable', async () => {
    const { service } = build();
    const page = await service.list(USER);

    expect(page.items[0]?.branchId).toBe('branch-1');
    expect(page.items[0]?.prepMin).toBe(12);
  });

  it('survives a restaurant with no branches', async () => {
    // Possible mid-setup; the favourite should still render rather than crash.
    const { service } = build({
      rows: [favoriteRow({ restaurant: { ...favoriteRow().restaurant, branches: [] } })],
    });
    const page = await service.list(USER);

    expect(page.items[0]?.branchId).toBeNull();
    expect(page.items[0]?.isOpen).toBe(false);
  });
});

describe('add', () => {
  it('404s for a restaurant that does not exist', async () => {
    const { service } = build({ restaurant: null });
    await expect(service.add(USER, RESTAURANT)).rejects.toThrow(NotFoundException);
  });

  it('is idempotent — a double tap is not an error', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6',
    });
    const { service } = build({ createError: duplicate });

    await expect(service.add(USER, RESTAURANT)).resolves.toEqual({ favorited: true });
  });

  it('still surfaces a real database failure', async () => {
    const { service } = build({ createError: new Error('connection lost') });
    await expect(service.add(USER, RESTAURANT)).rejects.toThrow('connection lost');
  });
});

describe('remove', () => {
  it('is idempotent and scoped to the caller', async () => {
    const { service, deleteMany } = build();
    await service.remove(USER, RESTAURANT);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: USER, restaurantId: RESTAURANT },
    });
  });
});
