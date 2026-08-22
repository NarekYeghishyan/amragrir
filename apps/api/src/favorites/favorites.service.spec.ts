import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Language } from '@amragrir/shared';
import { FavoritesService } from './favorites.service';
import type { PrismaService } from '../prisma/prisma.service';

const USER = 'user-1';
const BRANCH = 'branch-1';
const DISH = 'dish-1';

function favoriteRow(over: Record<string, unknown> = {}) {
  return {
    id: 'fav-1',
    userId: USER,
    branchId: BRANCH,
    createdAt: new Date('2026-07-20T10:00:00Z'),
    branch: {
      id: BRANCH,
      name: 'Republic Square',
      address: '5 Abovyan St',
      city: 'Yerevan',
      avgPrepMin: 12,
      isOpen: true,
      coverUrl: null,
      services: [],
      servicesOverridden: false,
      reservationsEnabled: null,
      restaurant: {
        id: 'rest-1',
        slug: 'sunny-table',
        name: 'Sunny Table',
        cuisine: 'Mediterranean',
        priceLevel: 2,
        ratingAvg: 4.8,
        reviewsCount: 1200,
        coverUrl: 'https://example.test/business.jpg',
        services: ['pickup'],
        reservationsEnabled: false,
      },
    },
    ...over,
  };
}

/** A saved dish as the include loads it: the dish, the kitchen under it, and the
 *  business under that. */
function dishRow(over: Record<string, unknown> = {}) {
  return {
    id: 'fav-dish-1',
    userId: USER,
    menuItemId: DISH,
    createdAt: new Date('2026-08-17T10:00:00Z'),
    menuItem: {
      id: DISH,
      nameI18n: { hy: 'Խինկալի', ru: 'Хинкали' },
      descI18n: { ru: 'С говядиной' },
      priceAmd: 2400,
      photoUrl: 'https://example.test/dish.jpg',
      caloriesKcal: 620,
      prepMin: 15,
      isAvailable: true,
      sectionId: 'section-1',
      branch: {
        id: BRANCH,
        name: 'Republic Square',
        address: '5 Abovyan St',
        city: 'Yerevan',
        isOpen: true,
        restaurant: { id: 'rest-1', slug: 'sunny-table', name: 'Sunny Table' },
      },
    },
    ...over,
  };
}

function build(
  options: {
    rows?: unknown[];
    branch?: unknown;
    createError?: unknown;
    dishRows?: unknown[];
    dish?: unknown;
    dishCreateError?: unknown;
  } = {},
) {
  const create = options.createError
    ? jest.fn().mockRejectedValue(options.createError)
    : jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const createDish = options.dishCreateError
    ? jest.fn().mockRejectedValue(options.dishCreateError)
    : jest.fn().mockResolvedValue({});
  const deleteDish = jest.fn().mockResolvedValue({ count: 1 });
  const findDishes = jest.fn().mockResolvedValue(options.dishRows ?? [dishRow()]);

  const prisma = {
    favorite: {
      findMany: jest.fn().mockResolvedValue(options.rows ?? [favoriteRow()]),
      create,
      deleteMany,
    },
    favoriteMenuItem: {
      findMany: findDishes,
      create: createDish,
      deleteMany: deleteDish,
    },
    restaurantBranch: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? { id: BRANCH } : options.branch),
    },
    menuItem: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.dish === undefined ? { id: DISH } : options.dish),
    },
  } as unknown as PrismaService;

  return {
    service: new FavoritesService(prisma),
    prisma,
    create,
    deleteMany,
    createDish,
    deleteDish,
    findDishes,
  };
}

describe('list', () => {
  it('names the branch that was saved, not just the business', async () => {
    const { service } = build();
    const item = (await service.list(USER)).items[0];

    expect(item?.branchId).toBe(BRANCH);
    expect(item?.restaurantId).toBe('rest-1');
    // What tells two branches of one chain apart in the list.
    expect(item?.branchName).toBe('Republic Square');
    expect(item?.address).toBe('5 Abovyan St');
    expect(item?.prepMin).toBe(12);
    expect(item?.isOpen).toBe(true);
  });

  it('draws the branch offering, so a card matches the one that was hearted', async () => {
    const { service } = build({
      rows: [
        favoriteRow({
          branch: {
            ...favoriteRow().branch,
            coverUrl: 'https://example.test/branch.jpg',
            services: ['dinein'],
            servicesOverridden: true,
          },
        }),
      ],
    });
    const item = (await service.list(USER)).items[0];

    expect(item?.coverUrl).toBe('https://example.test/branch.jpg');
    expect(item?.services).toEqual(['dinein']);
  });
});

describe('add', () => {
  it('404s for a branch that does not exist', async () => {
    const { service } = build({ branch: null });
    await expect(service.add(USER, BRANCH)).rejects.toThrow(NotFoundException);
  });

  it('is idempotent — a double tap is not an error', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6',
    });
    const { service } = build({ createError: duplicate });

    await expect(service.add(USER, BRANCH)).resolves.toEqual({ favorited: true });
  });

  it('still surfaces a real database failure', async () => {
    const { service } = build({ createError: new Error('connection lost') });
    await expect(service.add(USER, BRANCH)).rejects.toThrow('connection lost');
  });
});

describe('remove', () => {
  it('is idempotent and scoped to the caller', async () => {
    const { service, deleteMany } = build();
    await service.remove(USER, BRANCH);

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: USER, branchId: BRANCH } });
  });
});

describe('idsFor', () => {
  it('answers in branch ids, which is what a card can ask about', async () => {
    const { service } = build({ rows: [{ branchId: BRANCH }] });
    await expect(service.idsFor(USER)).resolves.toEqual([BRANCH]);
  });
});

describe('listDishes', () => {
  it('names the dish in the reader s language and the kitchen behind it', async () => {
    const { service } = build();
    const item = (await service.listDishes(USER, Language.Ru)).items[0];

    expect(item?.menuItemId).toBe(DISH);
    expect(item?.name).toBe('Хинкали');
    expect(item?.desc).toBe('С говядиной');
    expect(item?.priceAmd).toBe(2400);
    // The branch travels with the dish — it is what the row opens, and what
    // tells two branches of one chain apart.
    expect(item?.branchId).toBe(BRANCH);
    expect(item?.restaurantName).toBe('Sunny Table');
    expect(item?.address).toBe('5 Abovyan St');
    expect(item?.isOpen).toBe(true);
  });

  it('falls back to Armenian for a dish nobody translated', async () => {
    const { service } = build();
    const item = (await service.listDishes(USER, Language.En)).items[0];

    expect(item?.name).toBe('Խինկալի');
  });

  it('leaves out dishes taken off the menu', async () => {
    const { service, findDishes } = build();
    await service.listDishes(USER, Language.Hy);

    expect(findDishes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, menuItem: { deletedAt: null } },
      }),
    );
  });
});

describe('addDish', () => {
  it('404s for a dish that is not on any menu', async () => {
    const { service } = build({ dish: null });
    await expect(service.addDish(USER, DISH)).rejects.toThrow(NotFoundException);
  });

  it('is idempotent — a double tap is not an error', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6',
    });
    const { service } = build({ dishCreateError: duplicate });

    await expect(service.addDish(USER, DISH)).resolves.toEqual({ favorited: true });
  });

  it('still surfaces a real database failure', async () => {
    const { service } = build({ dishCreateError: new Error('connection lost') });
    await expect(service.addDish(USER, DISH)).rejects.toThrow('connection lost');
  });
});

describe('removeDish', () => {
  it('gives back a dish that has since left the menu', async () => {
    const { service, deleteDish } = build({ dish: null });
    await service.removeDish(USER, DISH);

    // No `deletedAt` filter here on purpose: the withdrawn dish is exactly the
    // one somebody needs to be able to unsave.
    expect(deleteDish).toHaveBeenCalledWith({ where: { userId: USER, menuItemId: DISH } });
  });
});

describe('dishIdsFor', () => {
  it('narrows to one branch s menu when a page asks about one', async () => {
    const { service, findDishes } = build({ dishRows: [{ menuItemId: DISH }] });

    await expect(service.dishIdsFor(USER, BRANCH)).resolves.toEqual([DISH]);
    expect(findDishes).toHaveBeenCalledWith({
      where: { userId: USER, menuItem: { deletedAt: null, branchId: BRANCH } },
      select: { menuItemId: true },
    });
  });

  it('answers for every branch when none is named', async () => {
    const { service, findDishes } = build({ dishRows: [{ menuItemId: DISH }] });

    await service.dishIdsFor(USER);
    expect(findDishes).toHaveBeenCalledWith({
      where: { userId: USER, menuItem: { deletedAt: null } },
      select: { menuItemId: true },
    });
  });
});
