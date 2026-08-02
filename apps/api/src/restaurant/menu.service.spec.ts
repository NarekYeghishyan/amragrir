import { NotFoundException } from '@nestjs/common';
import { AuditAction, MenuTab, StaffRole } from '@amragrir/shared';
import { MenuService, stripEmpty } from './menu.service';

import { CreateMenuItemDto, ListRestaurantsDto, UpdateMenuItemDto } from './menu.dto';
import { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

const RESTAURANT_ID = '44444444-4444-4444-8444-444444444444';

/** A restaurant admin over one restaurant — the common case. */
const admin: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantAdmin, restaurantId: RESTAURANT_ID, branchId: null }],
};

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

function build(
  options: {
    branch?: unknown;
    item?: unknown;
    ordered?: unknown;
    restaurants?: unknown[];
    /** What `restaurant.findFirst` answers — the single-restaurant lookups. */
    restaurant?: unknown;
  } = {},
) {
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
  const auditCreate = jest.fn().mockResolvedValue({});

  const prisma = {
    // Every mutation now writes its audit entry in the same transaction as the
    // change. Running the callback against this same mock is what lets these
    // tests keep asserting on `menuItem.update` while the entry is written too.
    $transaction: jest.fn((run: (tx: unknown) => unknown) => Promise.resolve(run(prisma))),
    auditLog: { create: auditCreate },
    restaurantBranch: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? { id: BRANCH_ID } : options.branch),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    menuItem: {
      // The whole row, not just an id: every mutation now diffs the patch
      // against what is already there (so an unchanged field writes no entry)
      // and takes the entry's scope from the branch it hangs off.
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.item === undefined
            ? { ...itemRow(), branch: { restaurantId: RESTAURANT_ID } }
            : options.item,
        ),
      findMany: jest.fn().mockResolvedValue([itemRow()]),
      create: menuCreate,
      update: menuUpdate,
      delete: menuDelete,
    },
    orderItem: { findFirst: jest.fn().mockResolvedValue(options.ordered ?? null) },
    category: { findUnique: jest.fn().mockResolvedValue({ id: CATEGORY_ID }) },
    restaurant: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.restaurant === undefined ? { id: RESTAURANT_ID } : options.restaurant,
        ),
      findMany: jest.fn().mockResolvedValue(options.restaurants ?? []),
      count: jest.fn().mockResolvedValue((options.restaurants ?? []).length),
    },
  } as unknown as PrismaService;

  return {
    service: new MenuService(prisma, new AuditService(prisma)),
    prisma,
    menuCreate,
    menuUpdate,
    menuDelete,
    auditCreate,
  };
}

const createDto = (over: Partial<CreateMenuItemDto> = {}): CreateMenuItemDto =>
  Object.assign(new CreateMenuItemDto(), {
    branchId: BRANCH_ID,
    menuTab: MenuTab.Mains,
    nameI18n: { hy: 'Բուրգեր', en: 'Burger' },
    priceAmd: 5800,
    // Required by the DTO — a dish is not added without one. What refuses a
    // creation missing it is validation, covered in `menu.dto.spec.ts`.
    photoUrl: 'https://cdn.amragrir.am/burger.jpg',
    ...over,
  });

const listQuery = (over: Partial<ListRestaurantsDto> = {}): ListRestaurantsDto =>
  Object.assign(new ListRestaurantsDto(), { page: 1, limit: 10, ...over });

describe('listRestaurants', () => {
  const branchRow = (over: Record<string, unknown> = {}) => ({
    id: BRANCH_ID,
    name: 'Northern Ave',
    address: 'Northern Ave 5',
    city: 'Yerevan',
    phone: null,
    isOpen: true,
    avgPrepMin: 12,
    _count: { menuItems: 4 },
    ...over,
  });

  const restaurantRow = (over: Record<string, unknown> = {}) => ({
    id: RESTAURANT_ID,
    slug: 'sunny-table',
    name: 'Sunny Table',
    cuisine: 'Georgian',
    priceLevel: 2,
    reservationsEnabled: true,
    services: ['pickup'],
    branches: [],
    ...over,
  });

  it('returns a restaurant that has no branches yet', async () => {
    // The whole reason this endpoint exists. A flat branch list cannot show
    // this restaurant, and it is the one that needs a first branch adding.
    const { service } = build({ restaurants: [restaurantRow()] });
    const page = await service.listRestaurants(admin, listQuery());

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe('Sunny Table');
    expect(page.items[0]?.branches).toEqual([]);
  });

  it('nests the branches under their restaurant', async () => {
    const { service } = build({
      restaurants: [
        restaurantRow({
          branches: [
            {
              id: BRANCH_ID,
              name: 'Northern Ave',
              address: 'Northern Ave 5',
              city: 'Yerevan',
              phone: null,
              isOpen: true,
              avgPrepMin: 12,
              _count: { menuItems: 4 },
            },
          ],
        }),
      ],
    });

    const page = await service.listRestaurants(admin, listQuery());
    const branch = page.items[0]?.branches[0];

    expect(branch?.name).toBe('Northern Ave');
    expect(branch?.menuItemCount).toBe(4);
    // The parent is filled in from the restaurant it was nested under, so the
    // branch shape stays identical to the flat list's.
    expect(branch?.restaurantId).toBe(RESTAURANT_ID);
    expect(branch?.restaurantName).toBe('Sunny Table');
  });

  it('scopes the restaurants and their branches independently', async () => {
    // A shift sees the restaurant their branch belongs to, and only that
    // branch under it — not its siblings.
    const shift: StaffJwtPayload = {
      sub: 'staff-2',
      kind: 'staff',
      scopes: [{ role: StaffRole.BranchStaff, restaurantId: null, branchId: BRANCH_ID }],
    };
    const { service, prisma } = build({ restaurants: [restaurantRow()] });
    await service.listRestaurants(shift, listQuery());

    const args = (prisma.restaurant.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { id: { in: [] } },
      { branches: { some: { id: { in: [BRANCH_ID] } } } },
    ]);
    expect(args.include.branches.where.OR).toEqual([
      { restaurantId: { in: [] } },
      { id: { in: [BRANCH_ID] } },
    ]);
  });

  it('pages, and reports how many there are in all', async () => {
    const { service, prisma } = build({ restaurants: [restaurantRow()] });
    (prisma.restaurant.count as jest.Mock).mockResolvedValue(25);

    const page = await service.listRestaurants(admin, listQuery({ page: 3, limit: 10 }));

    const args = (prisma.restaurant.findMany as jest.Mock).mock.calls[0][0];
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(page.total).toBe(25);
    expect(page.page).toBe(3);
  });

  it('searches the restaurant and its branches in one term', async () => {
    const { service, prisma } = build({ restaurants: [restaurantRow()] });
    await service.listRestaurants(admin, listQuery({ q: 'cascade' }));

    // ANDed on, never assigned to `where.OR` — that is where the scope filter
    // lives, and replacing it would widen the caller's reach.
    const where = (prisma.restaurant.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual([
      { name: { contains: 'cascade', mode: 'insensitive' } },
      { slug: { contains: 'cascade', mode: 'insensitive' } },
      {
        branches: {
          some: {
            OR: [
              { name: { contains: 'cascade', mode: 'insensitive' } },
              { address: { contains: 'cascade', mode: 'insensitive' } },
              { city: { contains: 'cascade', mode: 'insensitive' } },
            ],
          },
        },
      },
    ]);
  });

  it('shows only the branches that matched, when the restaurant did not', async () => {
    // Searching a branch name should answer with that branch, not bury it
    // among the nine siblings of the chain it belongs to.
    const { service } = build({
      restaurants: [
        restaurantRow({
          branches: [branchRow({ name: 'Cascade' }), branchRow({ id: 'b2', name: 'Komitas' })],
        }),
      ],
    });

    const page = await service.listRestaurants(admin, listQuery({ q: 'cascade' }));
    expect(page.items[0]?.branches.map((b) => b.name)).toEqual(['Cascade']);
  });

  it('still counts the branches a filter hid', async () => {
    // The card reads its count off this. Reporting the filtered length would
    // tell somebody a two-branch restaurant has one.
    const { service } = build({
      restaurants: [
        restaurantRow({
          branches: [branchRow({ name: 'Cascade' }), branchRow({ id: 'b2', name: 'Komitas' })],
        }),
      ],
    });

    const page = await service.listRestaurants(admin, listQuery({ q: 'cascade' }));
    expect(page.items[0]?.branches).toHaveLength(1);
    expect(page.items[0]?.branchCount).toBe(2);
  });

  it('shows every branch when the search was for the restaurant itself', async () => {
    // "Sunny" is the chain. Hiding nine of its ten branches would be a strange
    // way to answer a search for the chain.
    const { service } = build({
      restaurants: [
        restaurantRow({
          branches: [branchRow({ name: 'Cascade' }), branchRow({ id: 'b2', name: 'Komitas' })],
        }),
      ],
    });

    const page = await service.listRestaurants(admin, listQuery({ q: 'sunny' }));
    expect(page.items[0]?.branches.map((b) => b.name)).toEqual(['Cascade', 'Komitas']);
  });

  it('shows a named branch alone, and still counts its siblings', async () => {
    const { service, prisma } = build({
      restaurants: [
        restaurantRow({
          branches: [branchRow(), branchRow({ id: 'b2', name: 'Komitas' })],
        }),
      ],
    });
    const page = await service.listRestaurants(admin, listQuery({ branchId: BRANCH_ID }));

    // Narrowed at the restaurant level; the branches themselves come back
    // whole and are filtered after, which is what keeps the count honest.
    const args = (prisma.restaurant.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.branches).toEqual({ some: { id: BRANCH_ID } });
    expect(page.items[0]?.branches.map((b) => b.name)).toEqual(['Northern Ave']);
    expect(page.items[0]?.branchCount).toBe(2);
  });

  it('narrows to one restaurant', async () => {
    const { service, prisma } = build({ restaurants: [restaurantRow()] });
    await service.listRestaurants(admin, listQuery({ restaurantId: RESTAURANT_ID }));

    expect((prisma.restaurant.findMany as jest.Mock).mock.calls[0][0].where.id).toBe(RESTAURANT_ID);
  });

  it('ignores a search of nothing but spaces', async () => {
    const { service, prisma } = build({ restaurants: [restaurantRow()] });
    await service.listRestaurants(admin, listQuery({ q: '   ' }));

    expect((prisma.restaurant.findMany as jest.Mock).mock.calls[0][0].where.AND).toBeUndefined();
  });
});

describe('getRestaurant', () => {
  const detailRow = (over: Record<string, unknown> = {}) => ({
    id: RESTAURANT_ID,
    slug: 'sunny-table',
    name: 'Sunny Table',
    cuisine: 'Georgian',
    priceLevel: 2,
    reservationsEnabled: true,
    services: ['pickup'],
    ratingAvg: { toString: () => '4.5' },
    reviewsCount: 12,
    coverUrl: null,
    createdAt: new Date('2026-01-05T10:00:00.000Z'),
    branches: [],
    ...over,
  });

  it('404s on a restaurant outside the caller reach', async () => {
    // Not a 403: the reach is part of the query, so there is no path that
    // loads someone else's restaurant and then decides — and the answer does
    // not confirm the id names anything.
    const { service } = build({ restaurant: null });
    await expect(service.getRestaurant(admin, RESTAURANT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('scopes the lookup and the branches under it separately', async () => {
    const { service, prisma } = build({ restaurant: detailRow() });
    await service.getRestaurant(admin, RESTAURANT_ID);

    const args = (prisma.restaurant.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where.id).toBe(RESTAURANT_ID);
    expect(args.where.OR).toBeDefined();
    // A branch_staff sees the restaurant its branch belongs to, and only that
    // branch under it — so the nested list carries its own filter.
    expect(args.include.branches.where.OR).toBeDefined();
  });

  it('resolves the rating rather than passing a Decimal through', async () => {
    // Over the wire a Prisma Decimal arrives as an object with its own
    // toString and compares wrongly against a number.
    const { service } = build({ restaurant: detailRow() });
    const detail = await service.getRestaurant(admin, RESTAURANT_ID);

    expect(detail.ratingAvg).toBe(4.5);
    expect(detail.createdAt).toBe('2026-01-05T10:00:00.000Z');
  });

  it('counts the branches it returns, because nothing narrowed them', async () => {
    const { service } = build({
      restaurant: detailRow({
        branches: [
          {
            id: BRANCH_ID,
            name: 'Northern Ave',
            address: null,
            city: 'Yerevan',
            phone: null,
            isOpen: true,
            avgPrepMin: 12,
            _count: { menuItems: 4 },
          },
        ],
      }),
    });
    const detail = await service.getRestaurant(admin, RESTAURANT_ID);

    expect(detail.branchCount).toBe(1);
    expect(detail.branches).toHaveLength(1);
    expect(detail.branches[0]?.restaurantName).toBe('Sunny Table');
    expect(detail.branches[0]?.menuItemCount).toBe(4);
  });
});

describe('listMenu', () => {
  it('scopes to the caller and lets branchId narrow it', async () => {
    const { service, prisma } = build();
    await service.listMenu(admin, { branchId: BRANCH_ID });

    const where = (prisma.menuItem.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.branchId).toBe(BRANCH_ID);
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT_ID] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('returns the raw i18n objects, not a resolved string', async () => {
    // The admin is editing all three languages; resolving one would make the
    // others invisible and silently unsaveable.
    const { service } = build();
    const page = await service.listMenu(admin, {});

    expect(page.items[0]?.nameI18n).toEqual({ hy: 'Բուրգեր', en: 'Burger' });
  });
});

describe('create', () => {
  it('refuses a branch the caller cannot reach', async () => {
    const { service } = build({ branch: null });
    await expect(service.create(admin, createDto())).rejects.toThrow(NotFoundException);
  });

  it('rejects an unknown category rather than letting it become a 500', async () => {
    const { service, prisma } = build();
    (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.create(admin, createDto({ categoryId: CATEGORY_ID }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('defaults dietary tags to an empty list', async () => {
    const { service, menuCreate } = build();
    await service.create(admin, createDto());

    expect(menuCreate.mock.calls[0][0].data.dietaryTags).toEqual([]);
  });

  it('stores the photo the dish was added with', async () => {
    const { service, menuCreate } = build();
    await service.create(admin, createDto({ photoUrl: 'https://cdn.amragrir.am/khorovats.jpg' }));

    expect(menuCreate.mock.calls[0][0].data.photoUrl).toBe(
      'https://cdn.amragrir.am/khorovats.jpg',
    );
  });
});

describe('update', () => {
  it('does not touch orders already placed', async () => {
    // Order items store the price they were bought at, so a menu edit writes
    // to menu_items only — this asserts nothing else is written.
    const { service, menuUpdate } = build();
    await service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { priceAmd: 7000 }));

    expect(menuUpdate).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { priceAmd: 7000 } });
  });

  it('404s on a dish outside the caller scope', async () => {
    const { service } = build({ item: null });
    await expect(
      service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { priceAmd: 1 })),
    ).rejects.toThrow(NotFoundException);
  });

  it('disconnects the category when it is cleared', async () => {
    const { service, menuUpdate } = build();
    await service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { categoryId: null }));

    expect(menuUpdate.mock.calls[0][0].data.category).toEqual({ disconnect: true });
  });

  it('clears the prep estimate on a null, and records that it went', async () => {
    // The panel's edit form sends this when the box is emptied. An estimate can
    // turn out to be wrong, and a dish that could claim one but never take it
    // back would keep a number the kitchen has stopped believing.
    const { service, menuUpdate, auditCreate } = build();
    await service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { prepMin: null }));

    expect(menuUpdate.mock.calls[0][0].data.prepMin).toBeNull();
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: AuditAction.MenuItemUpdate,
      before: expect.objectContaining({ prepMin: 12 }),
      after: { prepMin: null },
    });
  });

  it('writes nothing when an edit re-sends what the dish already says', async () => {
    // A form opened and saved without a change. The panel holds its Save button
    // for exactly this, but the API is where it has to be true: an entry saying
    // the price went from 5800 to 5800 is the noise that hides the real ones.
    const { service, auditCreate } = build();
    await service.update(
      admin,
      ITEM_ID,
      Object.assign(new UpdateMenuItemDto(), { priceAmd: 5800, menuTab: MenuTab.Mains }),
    );

    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe('remove', () => {
  it('flags the dish rather than deleting the row', async () => {
    const { service, menuUpdate, menuDelete } = build();
    await service.remove(admin, ITEM_ID);

    expect(menuUpdate).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { deletedAt: expect.any(Date) },
    });
    // `order_items` references this row. Deleting it would break every order
    // that ever contained the dish.
    expect(menuDelete).not.toHaveBeenCalled();
  });

  it('removes a dish that has been ordered before', async () => {
    // This used to be a 409 telling the admin to mark it unavailable instead,
    // because the foreign key made a real delete impossible. Keeping the row
    // removes that objection, so a restaurant can finally retire a dish that
    // sold — which is the whole point of the soft delete.
    const { service, menuUpdate } = build({ ordered: { id: 'order-item-1' } });

    await service.remove(admin, ITEM_ID);

    expect(menuUpdate).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('records what the dish was, so the feed can still name it', async () => {
    const { service, auditCreate } = build();
    await service.remove(admin, ITEM_ID);

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.MenuItemDelete,
        entityId: ITEM_ID,
        actorStaffId: 'staff-1',
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
        before: { nameI18n: { hy: 'Բուրգեր', en: 'Burger' }, priceAmd: 5800 },
      }),
    });
  });

  it('404s on a dish already off the menu', async () => {
    // `load` filters on `deleted_at IS NULL`, so a stale panel cannot delete —
    // or re-price — something that is already gone.
    const { service } = build({ item: null });
    await expect(service.remove(admin, ITEM_ID)).rejects.toThrow(NotFoundException);
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
