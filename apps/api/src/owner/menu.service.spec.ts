import { ConflictException, NotFoundException } from '@nestjs/common';
import { MenuTab, Role } from '@amragrir/shared';
import { MenuService, stripEmpty } from './menu.service';
import { branchScopeFor, menuScopeFor } from './branch-access';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/token.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

const owner: JwtPayload = { sub: 'owner-1', role: Role.Owner, isGuest: false, phoneVerified: true };

function itemRow(over: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    branchId: BRANCH_ID,
    categoryId: CATEGORY_ID,
    menuTab: MenuTab.Mains,
    nameI18n: { hy: 'Բուրգեր', en: 'Burger' },
    descI18n: null,
    priceAmd: 5800,
    caloriesKcal: 520,
    prepMin: 12,
    photoUrl: null,
    dietaryTags: [],
    isAvailable: true,
    ...over,
  };
}

function build(options: { branch?: unknown; item?: unknown; ordered?: unknown } = {}) {
  const menuCreate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(itemRow(data)),
    );
  const menuUpdate = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(itemRow(data)),
    );
  const menuDelete = jest.fn().mockResolvedValue(itemRow());

  const prisma = {
    restaurantBranch: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? { id: BRANCH_ID } : options.branch),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    menuItem: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.item === undefined ? { id: ITEM_ID } : options.item),
      findMany: jest.fn().mockResolvedValue([itemRow()]),
      create: menuCreate,
      update: menuUpdate,
      delete: menuDelete,
    },
    orderItem: { findFirst: jest.fn().mockResolvedValue(options.ordered ?? null) },
    category: { findUnique: jest.fn().mockResolvedValue({ id: CATEGORY_ID }) },
  } as unknown as PrismaService;

  return { service: new MenuService(prisma), prisma, menuCreate, menuUpdate, menuDelete };
}

const createDto = (over: Partial<CreateMenuItemDto> = {}): CreateMenuItemDto =>
  Object.assign(new CreateMenuItemDto(), {
    branchId: BRANCH_ID,
    menuTab: MenuTab.Mains,
    nameI18n: { hy: 'Բուրգեր', en: 'Burger' },
    priceAmd: 5800,
    ...over,
  });

describe('scoping', () => {
  it('limits an owner to their own branches and dishes', () => {
    expect(branchScopeFor(owner)).toEqual({ restaurant: { ownerId: 'owner-1' } });
    expect(menuScopeFor(owner)).toEqual({ branch: { restaurant: { ownerId: 'owner-1' } } });
  });

  it('gives an admin everything', () => {
    const admin: JwtPayload = { ...owner, role: Role.Admin };
    expect(branchScopeFor(admin)).toEqual({});
    expect(menuScopeFor(admin)).toEqual({});
  });
});

describe('listMenu', () => {
  it('scopes to the caller and lets branchId narrow it', async () => {
    const { service, prisma } = build();
    await service.listMenu(owner, { branchId: BRANCH_ID });

    const where = (prisma.menuItem.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.branchId).toBe(BRANCH_ID);
    expect(where.branch).toEqual({ restaurant: { ownerId: 'owner-1' } });
  });

  it('returns the raw i18n objects, not a resolved string', async () => {
    // The owner is editing all three languages; resolving one would make the
    // others invisible and silently unsaveable.
    const { service } = build();
    const page = await service.listMenu(owner, {});

    expect(page.items[0]?.nameI18n).toEqual({ hy: 'Բուրգեր', en: 'Burger' });
  });
});

describe('create', () => {
  it('refuses a branch the caller does not own', async () => {
    const { service } = build({ branch: null });
    await expect(service.create(owner, createDto())).rejects.toThrow(NotFoundException);
  });

  it('rejects an unknown category rather than letting it become a 500', async () => {
    const { service, prisma } = build();
    (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.create(owner, createDto({ categoryId: CATEGORY_ID }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('defaults dietary tags to an empty list', async () => {
    const { service, menuCreate } = build();
    await service.create(owner, createDto());

    expect(menuCreate.mock.calls[0][0].data.dietaryTags).toEqual([]);
  });
});

describe('update', () => {
  it('does not touch orders already placed', async () => {
    // Order items store the price they were bought at, so a menu edit writes
    // to menu_items only — this asserts nothing else is written.
    const { service, menuUpdate } = build();
    await service.update(owner, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { priceAmd: 7000 }));

    expect(menuUpdate).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { priceAmd: 7000 } });
  });

  it('404s on a dish outside the caller scope', async () => {
    const { service } = build({ item: null });
    await expect(
      service.update(owner, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { priceAmd: 1 })),
    ).rejects.toThrow(NotFoundException);
  });

  it('disconnects the category when it is cleared', async () => {
    const { service, menuUpdate } = build();
    await service.update(owner, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { categoryId: null }));

    expect(menuUpdate.mock.calls[0][0].data.category).toEqual({ disconnect: true });
  });
});

describe('remove', () => {
  it('deletes a dish nobody ever ordered', async () => {
    const { service, menuDelete } = build();
    await service.remove(owner, ITEM_ID);

    expect(menuDelete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
  });

  it('refuses to delete a dish that appears in an order', async () => {
    // order_items points at it; an order that can no longer say what was
    // bought is not an order. The 409 tells the owner to hide it instead.
    const { service, menuDelete } = build({ ordered: { id: 'order-item-1' } });

    await expect(service.remove(owner, ITEM_ID)).rejects.toThrow(ConflictException);
    expect(menuDelete).not.toHaveBeenCalled();
  });
});

describe('stripEmpty', () => {
  it('drops blank translations', () => {
    // An empty string is not a translation, and it would win over the `hy`
    // fallback in localize() — leaving the dish nameless for that language.
    expect(stripEmpty({ hy: 'Բուրգեր', ru: '', en: '   ' })).toEqual({ hy: 'Բուրգեր' });
  });

  it('keeps every filled language', () => {
    expect(stripEmpty({ hy: 'a', ru: 'b', en: 'c' })).toEqual({ hy: 'a', ru: 'b', en: 'c' });
  });
});
