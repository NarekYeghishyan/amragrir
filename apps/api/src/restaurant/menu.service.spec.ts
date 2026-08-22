import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AuditEntity, RestaurantService, StaffRole } from '@amragrir/shared';
import { MenuService, stripEmpty } from './menu.service';

import {
  CreateMenuItemDto,
  ListRestaurantsDto,
  SetBranchBookingsDto,
  SetBranchCoverDto,
  SetBranchServicesDto,
  SetRestaurantCoverDto,
  SetRestaurantServicesDto,
  UpdateMenuItemDto,
} from './menu.dto';
import { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const SECTION_ID = '55555555-5555-4555-8555-555555555555';

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
    sectionId: SECTION_ID,
    isPopular: false,
    // The shelf's own mapping, which the dish inherits when its `categoryId` is
    // null. Included on every row because `toStaffMenuItem` resolves the
    // effective category from the pair.
    section: { categoryId: null },
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
    /** What `branchMenuSection.findFirst` answers — `null` for a section that
     *  is not this branch's, `{ categoryId: null }` for an unmapped shelf. */
    section?: unknown;
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
  const restaurantUpdate = jest.fn().mockResolvedValue({});
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
    // The section a dish is filed under, proven to belong to the same branch.
    // Mapped to a category by default, which is the arrangement that lets a
    // dish carry none of its own.
    branchMenuSection: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.section === undefined ? { categoryId: CATEGORY_ID } : options.section,
        ),
    },
    restaurant: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.restaurant === undefined ? { id: RESTAURANT_ID } : options.restaurant,
        ),
      findMany: jest.fn().mockResolvedValue(options.restaurants ?? []),
      count: jest.fn().mockResolvedValue((options.restaurants ?? []).length),
      update: restaurantUpdate,
    },
  } as unknown as PrismaService;

  return {
    service: new MenuService(prisma, new AuditService(prisma)),
    prisma,
    menuCreate,
    menuUpdate,
    menuDelete,
    restaurantUpdate,
    auditCreate,
  };
}

const createDto = (over: Partial<CreateMenuItemDto> = {}): CreateMenuItemDto =>
  Object.assign(new CreateMenuItemDto(), {
    branchId: BRANCH_ID,
    sectionId: SECTION_ID,
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

describe('setServices', () => {
  /** The row both lookups in `setServices` answer with — the scope check reads
   *  `services` off it, and the read-back at the end needs the whole detail. */
  const row = (services: string[]) => ({
    id: RESTAURANT_ID,
    slug: 'sunny-table',
    name: 'Sunny Table',
    cuisine: 'Georgian',
    priceLevel: 2,
    reservationsEnabled: true,
    services,
    ratingAvg: { toString: () => '4.5' },
    reviewsCount: 12,
    coverUrl: null,
    createdAt: new Date('2026-01-05T10:00:00.000Z'),
    branches: [],
  });

  const dto = (services: string[]) =>
    Object.assign(new SetRestaurantServicesDto(), { services } as {
      services: RestaurantService[];
    });

  it('refuses a room that both seats walk-ins and books its tables', async () => {
    // The rule this endpoint exists for. Both are ways of seating somebody and
    // an address does one of them; declaring both leaves the pre-order screen
    // unable to say whether "Eat at the Restaurant" is a button or a booking.
    // The panel cannot reach this set, but a panel is a courtesy, not a check.
    const { service, restaurantUpdate, auditCreate } = build({
      restaurant: row([RestaurantService.Pickup]),
    });

    await expect(
      service.setServices(
        admin,
        RESTAURANT_ID,
        dto([RestaurantService.Pickup, RestaurantService.DineIn, RestaurantService.Reserve]),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(restaurantUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('refuses the pair even with no pre-order under it', async () => {
    const { service, restaurantUpdate } = build({ restaurant: row([RestaurantService.Pickup]) });

    await expect(
      service.setServices(
        admin,
        RESTAURANT_ID,
        dto([RestaurantService.DineIn, RestaurantService.Reserve]),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(restaurantUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [[RestaurantService.Pickup]],
    [[RestaurantService.Pickup, RestaurantService.DineIn]],
    [[RestaurantService.Pickup, RestaurantService.Reserve]],
    [[RestaurantService.DineIn]],
    [[RestaurantService.Reserve]],
  ])('accepts %p — the combinations BUSINESS_LOGIC.md §2 allows', async (services) => {
    const { service, restaurantUpdate } = build({ restaurant: row([]) });
    await service.setServices(admin, RESTAURANT_ID, dto(services));

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { services },
    });
  });

  it('stores the set in order and records what the restaurant was left offering', async () => {
    const { service, restaurantUpdate, auditCreate } = build({
      restaurant: row([RestaurantService.Pickup]),
    });

    await service.setServices(
      admin,
      RESTAURANT_ID,
      // As a form might send them, and twice over.
      dto([RestaurantService.Reserve, RestaurantService.Pickup, RestaurantService.Reserve]),
    );

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { services: ['pickup', 'reserve'] },
    });

    const entry = auditCreate.mock.calls[0]![0].data;
    expect(entry.action).toBe(AuditAction.RestaurantServices);
    expect(entry.entity).toBe(AuditEntity.Restaurant);
    // Filed against the restaurant and no branch: this is one statement about
    // the whole business, not something that happened at one address.
    expect(entry.restaurantId).toBe(RESTAURANT_ID);
    expect(entry.branchId).toBeNull();
    expect(entry.after).toEqual({ services: ['pickup', 'reserve'] });
    expect(entry.before).toEqual({ services: ['pickup'] });
  });

  it('writes no entry for a save that changed nothing', async () => {
    // Including one that only reorders: a row seeded in another order is stored
    // canonically from now on, and that is not something somebody did.
    const { service, restaurantUpdate, auditCreate } = build({
      restaurant: row(['reserve', 'pickup']),
    });

    await service.setServices(
      admin,
      RESTAURANT_ID,
      dto([RestaurantService.Pickup, RestaurantService.Reserve]),
    );

    expect(restaurantUpdate).toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('404s on a restaurant the caller may not write to', async () => {
    const { service, restaurantUpdate } = build({ restaurant: null });

    await expect(
      service.setServices(admin, RESTAURANT_ID, dto([RestaurantService.Pickup])),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(restaurantUpdate).not.toHaveBeenCalled();
  });

  it('scopes the lookup by restaurant:write, not by what opens the page', async () => {
    // `branch:read` opens a restaurant and is held by a shift account; changing
    // what the business offers is a restaurant admin's decision.
    const { service, prisma } = build({ restaurant: row([RestaurantService.Pickup]) });
    await service.setServices(admin, RESTAURANT_ID, dto([RestaurantService.Pickup]));

    const args = (prisma.restaurant.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where.id).toBe(RESTAURANT_ID);
    expect(args.where.OR).toBeDefined();
  });
});

describe('a branch answering for itself', () => {
  const BRANCH_COVER = 'https://api.amragrir.am/uploads/covers/branch.jpg';
  const RESTAURANT_COVER = 'https://api.amragrir.am/uploads/covers/business.jpg';

  /** The restaurant's defaults, which every branch resolves against. */
  const parent = {
    id: RESTAURANT_ID,
    name: 'Sunny Table',
    services: [RestaurantService.Pickup, RestaurantService.Reserve],
    coverUrl: RESTAURANT_COVER,
    reservationsEnabled: true,
  };

  /** A branch as the database holds it — following the restaurant on all three
   *  unless the test says otherwise. */
  const branchRow = (over: Record<string, unknown> = {}) => ({
    id: BRANCH_ID,
    restaurantId: RESTAURANT_ID,
    restaurant: parent,
    name: 'Northern Ave',
    address: null,
    city: 'Yerevan',
    phone: null,
    isOpen: true,
    avgPrepMin: 12,
    coverUrl: null,
    services: [],
    servicesOverridden: false,
    reservationsEnabled: null,
    _count: { menuItems: 3 },
    ...over,
  });

  /** Its own mock rather than the shared `build`, because these are the only
   *  tests that need `restaurantBranch.update` to answer with a whole row. */
  const build = (row: Record<string, unknown> = branchRow()) => {
    const branchUpdate = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...data }),
      );
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: jest.fn((run: (tx: unknown) => unknown) => Promise.resolve(run(prisma))),
      auditLog: { create: auditCreate },
      restaurantBranch: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: branchUpdate,
      },
    } as unknown as PrismaService;

    return {
      service: new MenuService(prisma, new AuditService(prisma)),
      prisma,
      branchUpdate,
      auditCreate,
    };
  };

  const coverDto = (coverUrl: string | null) =>
    Object.assign(new SetBranchCoverDto(), { coverUrl });
  const servicesDto = (services: RestaurantService[] | null) =>
    Object.assign(new SetBranchServicesDto(), { services });
  const bookingsDto = (reservationsEnabled: boolean | null) =>
    Object.assign(new SetBranchBookingsDto(), { reservationsEnabled });

  it('wears the restaurant on all three until it says otherwise', async () => {
    const { service } = build();

    const branch = await service.setBranchCover(admin, BRANCH_ID, coverDto(null));

    // Nothing of its own...
    expect(branch.own.coverUrl).toBeNull();
    expect(branch.own.servicesOverridden).toBe(false);
    expect(branch.own.reservationsEnabled).toBeNull();
    // ...so a guest is shown the business's.
    expect(branch.offering.coverUrl).toBe(RESTAURANT_COVER);
    expect(branch.offering.services).toEqual([RestaurantService.Pickup, RestaurantService.Reserve]);
    expect(branch.offering.reservationsEnabled).toBe(true);
  });

  it('shows its own photograph once it has one', async () => {
    const { service, branchUpdate, auditCreate } = build();

    const branch = await service.setBranchCover(admin, BRANCH_ID, coverDto(BRANCH_COVER));

    expect(branchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverUrl: BRANCH_COVER } }),
    );
    expect(branch.offering.coverUrl).toBe(BRANCH_COVER);
    // Its own action, not `restaurant.cover`: a different decision by a
    // different person, and the feed has to be able to tell them apart.
    expect(auditCreate.mock.calls[0]![0].data.action).toBe(AuditAction.BranchCover);
    expect(auditCreate.mock.calls[0]![0].data.branchId).toBe(BRANCH_ID);
  });

  it('hands the photograph back to the business on null', async () => {
    // Not "no picture" — the branch stops answering and wears the chain's
    // again, which is the whole difference from the restaurant's endpoint.
    const { service, branchUpdate } = build(branchRow({ coverUrl: BRANCH_COVER }));

    const branch = await service.setBranchCover(admin, BRANCH_ID, coverDto(null));

    expect(branchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coverUrl: null } }),
    );
    expect(branch.offering.coverUrl).toBe(RESTAURANT_COVER);
  });

  it('overrides the services, and sets the flag with them', async () => {
    const { service, branchUpdate } = build();

    const branch = await service.setBranchServices(
      admin,
      BRANCH_ID,
      servicesDto([RestaurantService.DineIn]),
    );

    expect(branchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          services: [RestaurantService.DineIn],
          servicesOverridden: true,
        },
      }),
    );
    // The branch down the road still offers what the business declares; this
    // one seats people and hands nothing over a counter.
    expect(branch.offering.services).toEqual([RestaurantService.DineIn]);
  });

  it('tells "offers nothing" apart from "has not declared"', async () => {
    // `[]` overrides a parent that offers pickup; `null` hands the question
    // back. Emptiness could never have meant "unset" — every restaurant is
    // created having declared nothing — which is why the flag exists.
    const { service: emptying, branchUpdate: emptied } = build();
    const branch = await emptying.setBranchServices(admin, BRANCH_ID, servicesDto([]));

    expect(emptied).toHaveBeenCalledWith(
      expect.objectContaining({ data: { services: [], servicesOverridden: true } }),
    );
    expect(branch.offering.services).toEqual([]);

    const { service: deferring, branchUpdate: deferred } = build(
      branchRow({ services: [RestaurantService.DineIn], servicesOverridden: true }),
    );
    const back = await deferring.setBranchServices(admin, BRANCH_ID, servicesDto(null));

    expect(deferred).toHaveBeenCalledWith(
      expect.objectContaining({ data: { services: [], servicesOverridden: false } }),
    );
    expect(back.offering.services).toEqual([RestaurantService.Pickup, RestaurantService.Reserve]);
  });

  it('refuses a combination that is not a place, per branch', async () => {
    // The same rule as the restaurant's, judging one address: this branch
    // cannot both seat walk-ins and book its tables either.
    const { service, branchUpdate } = build();

    await expect(
      service.setBranchServices(
        admin,
        BRANCH_ID,
        servicesDto([RestaurantService.Pickup, RestaurantService.DineIn, RestaurantService.Reserve]),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(branchUpdate).not.toHaveBeenCalled();
  });

  it('lets one branch stop taking bookings while the business still does', async () => {
    const { service, branchUpdate, auditCreate } = build();

    const branch = await service.setBranchBookings(admin, BRANCH_ID, bookingsDto(false));

    expect(branchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reservationsEnabled: false } }),
    );
    expect(branch.offering.reservationsEnabled).toBe(false);
    expect(auditCreate.mock.calls[0]![0].data.action).toBe(AuditAction.BranchBookings);
  });

  it('scopes all three by branch:write, which a manager holds', async () => {
    // The point of moving these down: a `restaurant_manager` answers for one
    // address, and these are statements about that address. `branch:write` is
    // the permission that already lets them correct its phone number.
    const manager: StaffJwtPayload = {
      sub: 'staff-2',
      kind: 'staff',
      scopes: [{ role: StaffRole.RestaurantManager, restaurantId: null, branchId: BRANCH_ID }],
    };
    const { service, prisma } = build();

    await service.setBranchCover(manager, BRANCH_ID, coverDto(BRANCH_COVER));

    const args = (prisma.restaurantBranch.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where.id).toBe(BRANCH_ID);
    expect(args.where.OR).toEqual([
      { restaurantId: { in: [] } },
      { id: { in: [BRANCH_ID] } },
    ]);
  });

  it('writes nothing when the branch already says that', async () => {
    const { service, branchUpdate, auditCreate } = build(branchRow({ coverUrl: BRANCH_COVER }));

    await service.setBranchCover(admin, BRANCH_ID, coverDto(BRANCH_COVER));

    expect(branchUpdate).toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe('setCover', () => {
  const UPLOADED = 'https://api.amragrir.am/uploads/covers/a1b2c3d4.jpg';
  const SEEDED = 'https://www.themealdb.com/images/media/meals/rjhf741585564676.jpg';

  /** As in `setServices`: one row answers both the scope check (which reads
   *  `coverUrl`) and the read-back at the end. */
  const row = (coverUrl: string | null) => ({
    id: RESTAURANT_ID,
    slug: 'sunny-table',
    name: 'Sunny Table',
    cuisine: 'Georgian',
    priceLevel: 2,
    reservationsEnabled: true,
    services: [RestaurantService.Pickup],
    ratingAvg: { toString: () => '4.5' },
    reviewsCount: 12,
    coverUrl,
    createdAt: new Date('2026-01-05T10:00:00.000Z'),
    branches: [],
  });

  const dto = (coverUrl: string | null) =>
    Object.assign(new SetRestaurantCoverDto(), { coverUrl });

  it('stores the uploaded URL and answers with the restaurant', async () => {
    const { service, restaurantUpdate } = build({ restaurant: row(null) });

    const detail = await service.setCover(admin, RESTAURANT_ID, dto(UPLOADED));

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { coverUrl: UPLOADED },
    });
    // The shape `GET restaurants/:id` answers with, so the panel re-renders
    // from what was stored rather than from what it sent.
    expect(detail.id).toBe(RESTAURANT_ID);
    expect(detail.branchCount).toBe(0);
  });

  it('overwrites a seeded cover without ceremony', async () => {
    // The seed fills this column so the screens can be looked at. A restaurant
    // putting its own photograph there must not have to get past demo data.
    const { service, restaurantUpdate } = build({ restaurant: row(SEEDED) });

    await service.setCover(admin, RESTAURANT_ID, dto(UPLOADED));

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { coverUrl: UPLOADED },
    });
  });

  it('takes the cover down on null, and records the URL it had', async () => {
    const { service, restaurantUpdate, auditCreate } = build({ restaurant: row(UPLOADED) });

    await service.setCover(admin, RESTAURANT_ID, dto(null));

    expect(restaurantUpdate).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { coverUrl: null },
    });
    const entry = auditCreate.mock.calls[0]![0].data;
    expect(entry.action).toBe(AuditAction.RestaurantCover);
    expect(entry.before).toEqual({ coverUrl: UPLOADED });
    expect(entry.after).toEqual({ coverUrl: null });
  });

  it('records the replacement against the restaurant and no branch', async () => {
    const { service, auditCreate } = build({ restaurant: row(SEEDED) });

    await service.setCover(admin, RESTAURANT_ID, dto(UPLOADED));

    const entry = auditCreate.mock.calls[0]![0].data;
    expect(entry.action).toBe(AuditAction.RestaurantCover);
    expect(entry.entity).toBe(AuditEntity.Restaurant);
    // One cover covers every branch, so it did not happen at one of them.
    expect(entry.restaurantId).toBe(RESTAURANT_ID);
    expect(entry.branchId).toBeNull();
    // The previous URL is the only remaining record of the picture that was
    // replaced — the file itself is never deleted, so this is what recovers it.
    expect(entry.before).toEqual({ coverUrl: SEEDED });
    expect(entry.after).toEqual({ coverUrl: UPLOADED });
  });

  it('writes nothing at all when the cover is already that one', async () => {
    // Re-uploading the picture that is there is not an event, and neither is it
    // an update — the same rule every PATCH here follows.
    const { service, restaurantUpdate, auditCreate } = build({ restaurant: row(UPLOADED) });

    await service.setCover(admin, RESTAURANT_ID, dto(UPLOADED));

    expect(restaurantUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('404s on a restaurant the caller may not write to', async () => {
    const { service, restaurantUpdate } = build({ restaurant: null });

    await expect(service.setCover(admin, RESTAURANT_ID, dto(UPLOADED))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(restaurantUpdate).not.toHaveBeenCalled();
  });

  it('scopes the lookup by restaurant:write, like the services beside it', async () => {
    // Not `branch:read`, which opens the page: a manager can reach the
    // restaurant and may not choose the picture every branch is sold under.
    const { service, prisma } = build({ restaurant: row(null) });
    await service.setCover(admin, RESTAURANT_ID, dto(UPLOADED));

    const args = (prisma.restaurant.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where.id).toBe(RESTAURANT_ID);
    expect(args.where.OR).toBeDefined();
  });

  it('never reaches a query for a branch manager, whatever branch they hold', async () => {
    // The decision this endpoint exists to enforce: a manager answers for one
    // branch, and the cover is a statement about the whole business.
    //
    // `@RequiresPermission(restaurant:write)` refuses them at the guard, before
    // any of this runs. What is pinned here is the layer behind it — reach is
    // built per *permission*, so the branch a manager does hold grants nothing
    // towards this one, and `reachFor` refuses outright rather than assembling
    // a filter that merely happens to match nothing. The restaurant is never
    // loaded, so no path reads a row and then decides.
    const manager: StaffJwtPayload = {
      sub: 'staff-2',
      kind: 'staff',
      scopes: [{ role: StaffRole.RestaurantManager, restaurantId: null, branchId: BRANCH_ID }],
    };
    const { service, prisma, restaurantUpdate } = build({ restaurant: row(null) });

    await expect(service.setCover(manager, RESTAURANT_ID, dto(UPLOADED))).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(restaurantUpdate).not.toHaveBeenCalled();
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

    expect(menuUpdate).toHaveBeenCalledWith(
      // `include` rides along — the response resolves the dish's effective
      // category, which needs its section's. The assertion is about `data`.
      expect.objectContaining({ where: { id: ITEM_ID }, data: { priceAmd: 7000 } }),
    );
  });

  it('404s on a dish outside the caller scope', async () => {
    const { service } = build({ item: null });
    await expect(
      service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { priceAmd: 1 })),
    ).rejects.toThrow(NotFoundException);
  });

  it('disconnects the category when it is cleared, if the section supplies one', async () => {
    // Clearing a dish's own category is it handing the question to its shelf.
    // Legitimate only while the shelf can answer — hence the mapped section
    // here, and the refusal in the test below when it cannot.
    const { service, menuUpdate } = build({
      item: {
        ...itemRow({ section: { categoryId: CATEGORY_ID } }),
        branch: { restaurantId: RESTAURANT_ID },
      },
    });
    await service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { categoryId: null }));

    expect(menuUpdate.mock.calls[0][0].data.category).toEqual({ disconnect: true });
  });

  it('refuses to leave a dish in no category at all', async () => {
    // The failure this whole change exists to make impossible: a dish that
    // belongs to no category is a dish no chip on the home screen leads to,
    // and nothing in the panel used to say so. The section here maps to
    // nothing, so clearing the dish's own category strands it.
    const { service, menuUpdate } = build();

    await expect(
      service.update(admin, ITEM_ID, Object.assign(new UpdateMenuItemDto(), { categoryId: null })),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(menuUpdate).not.toHaveBeenCalled();
  });

  it('404s on a section belonging to another branch', async () => {
    // Section ids are uuids from a table every branch shares, so filing a dish
    // under somebody else's heading is one copied id away — and the foreign key
    // would take it. The lookup is by (id, branch), so it simply does not
    // resolve.
    const { service } = build({ section: null });

    await expect(
      service.update(
        admin,
        ITEM_ID,
        Object.assign(new UpdateMenuItemDto(), { sectionId: SECTION_ID }),
      ),
    ).rejects.toThrow(NotFoundException);
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
      Object.assign(new UpdateMenuItemDto(), { priceAmd: 5800, sectionId: SECTION_ID }),
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
