import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction, Permission, type MenuTab } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { changedFields } from '../audit/audit';
import { LIVE_MENU_ITEM } from '../common/menu-visibility';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { branchScope, menuScope, restaurantScope } from '../staff/scope';
import {
  CreateBranchDto,
  CreateMenuItemDto,
  ListMenuItemsDto,
  ListRestaurantsDto,
  SetAvailabilityDto,
  SetBranchStatusDto,
  UpdateBranchDto,
  UpdateMenuItemDto,
} from './menu.dto';

/**
 * Staff view of a dish.
 *
 * Unlike the public `GET /restaurants/{id}/menu`, this returns the **raw
 * `*_i18n` objects**: the caller is editing all three languages, so resolving
 * one for them would make the other two invisible and silently unsaveable.
 */
export interface StaffMenuItem {
  id: string;
  branchId: string;
  categoryId: string | null;
  menuTab: MenuTab;
  nameI18n: Record<string, string>;
  descI18n: Record<string, string> | null;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  /** Every dish added from now on has one — `CreateMenuItemDto` requires it.
   *  Nullable because the ones added before it did not, and nothing invents a
   *  picture for them. */
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
}

export interface StaffBranch {
  id: string;
  restaurantId: string;
  restaurantName: string;
  name: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  isOpen: boolean;
  avgPrepMin: number | null;
  menuItemCount: number;
}

/**
 * A restaurant with the branches the caller may see under it.
 *
 * The flat branch list cannot represent a restaurant that has **no** branches
 * yet, which is exactly the restaurant that most needs to be visible: it is the
 * one somebody has to add a first branch to. Grouping client-side from the
 * branch list would leave it invisible and unreachable.
 */
export interface StaffRestaurant {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  reservationsEnabled: boolean;
  services: string[];
  /** Branches in the caller's reach, before any filter narrowed which of them
   *  `branches` shows. Reporting the filtered length here would tell somebody
   *  a five-branch chain has one. */
  branchCount: number;
  branches: StaffBranch[];
}

/**
 * One restaurant, opened on its own.
 *
 * Everything the list carries plus what there is no room for in a row — the
 * rating, the review count, the cover, and when it was created. The list stays
 * lean because it renders ten of these at a time; a detail page renders one and
 * can afford to answer questions the list only hints at.
 */
export interface StaffRestaurantDetail extends StaffRestaurant {
  ratingAvg: number;
  reviewsCount: number;
  coverUrl: string | null;
  createdAt: string;
}

const BRANCH_INCLUDE = {
  restaurant: { select: { id: true, name: true } },
  // Filtered, or "12 dishes" would keep counting the ones taken off the menu and
  // never move down again.
  _count: { select: { menuItems: { where: LIVE_MENU_ITEM } } },
} as const;

/**
 * What an edit needs to know about the dish before it changes it: the fields a
 * PATCH can move (to diff against), and the branch and restaurant the entry is
 * scoped to.
 */
const MENU_AUDIT_SELECT = {
  id: true,
  branchId: true,
  categoryId: true,
  menuTab: true,
  nameI18n: true,
  descI18n: true,
  priceAmd: true,
  caloriesKcal: true,
  prepMin: true,
  photoUrl: true,
  dietaryTags: true,
  isAvailable: true,
  branch: { select: { restaurantId: true } },
} as const;

type MenuAuditRow = Prisma.MenuItemGetPayload<{ select: typeof MENU_AUDIT_SELECT }>;

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The restaurants the caller may act on, each with its branches.
   *
   * Both halves are scoped independently: a `branch_staff` sees the restaurant
   * their branch belongs to and *only that branch* under it, not its siblings.
   */
  async listRestaurants(
    staff: StaffJwtPayload,
    query: ListRestaurantsDto,
  ): Promise<{ items: StaffRestaurant[]; total: number; page: number }> {
    const term = query.q?.trim();

    // Matches a branch by what somebody would type looking for one. Reused
    // twice below — once to decide which restaurants qualify, once to decide
    // which of their branches to show.
    const branchMatches: Prisma.RestaurantBranchWhereInput | undefined = term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { address: { contains: term, mode: 'insensitive' } },
            { city: { contains: term, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const where: Prisma.RestaurantWhereInput = {
      ...restaurantScope(staff.scopes, Permission.BranchRead),
    };
    if (query.restaurantId) {
      where.id = query.restaurantId;
    }
    if (query.branchId) {
      where.branches = { some: { id: query.branchId } };
    }
    if (term) {
      // `AND`, not `OR`: `restaurantScope` may put its own `OR` at the top
      // level, and assigning over it would widen the caller's reach.
      where.AND = [
        {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { slug: { contains: term, mode: 'insensitive' } },
            { branches: { some: branchMatches } },
          ],
        },
      ];
    }

    // Every branch the caller may see is fetched, and the narrowing to *which
    // of them to show* happens below. That is deliberate: `branchCount` has to
    // report how many the restaurant really has, or a card saying "1 branch"
    // under a search would be telling somebody a five-branch chain has one.
    const [rows, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        include: {
          branches: {
            where: branchScope(staff.scopes, Permission.BranchRead),
            include: { _count: { select: { menuItems: { where: LIVE_MENU_ITEM } } } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    const needle = term?.toLowerCase();
    const matchesTerm = (value: string | null): boolean =>
      needle !== undefined && value !== null && value.toLowerCase().includes(needle);

    return {
      items: rows.map((row) => {
        // Which branches to show under this card:
        //
        // A named branch shows alone — that is what naming it means. A search
        // shows the branches that matched it, *unless* the restaurant itself is
        // what matched, in which case the search was for the chain and hiding
        // nine of its ten branches would be a strange way to answer.
        const restaurantMatched = matchesTerm(row.name) || matchesTerm(row.slug);
        let shown = row.branches;
        if (query.branchId) {
          shown = shown.filter((b) => b.id === query.branchId);
        } else if (needle !== undefined && !restaurantMatched) {
          shown = shown.filter(
            (b) => matchesTerm(b.name) || matchesTerm(b.address) || matchesTerm(b.city),
          );
        }

        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          cuisine: row.cuisine,
          priceLevel: row.priceLevel,
          reservationsEnabled: row.reservationsEnabled,
          services: row.services,
          /** How many the restaurant has in the caller's reach — not how many
           *  of them a filter left showing. */
          branchCount: row.branches.length,
          branches: shown.map((branch) =>
            toStaffBranch({ ...branch, restaurant: { id: row.id, name: row.name } }),
          ),
        };
      }),
      total,
      page: query.page,
    };
  }

  /**
   * One restaurant, with every branch of it the caller may see.
   *
   * Unfiltered by anything the list was narrowed to: arriving here means having
   * chosen this restaurant, and the search that found it has no business
   * deciding which of its branches exist afterwards.
   *
   * Outside the caller's reach is a **404, not a 403** — the reach is part of
   * the query rather than a check after the fetch, so there is no code path
   * that loads someone else's restaurant and then decides, and the answer does
   * not confirm that the id names anything.
   */
  async getRestaurant(staff: StaffJwtPayload, id: string): Promise<StaffRestaurantDetail> {
    const row = await this.prisma.restaurant.findFirst({
      where: { id, ...restaurantScope(staff.scopes, Permission.BranchRead) },
      include: {
        branches: {
          where: branchScope(staff.scopes, Permission.BranchRead),
          include: { _count: { select: { menuItems: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Restaurant not found');
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      cuisine: row.cuisine,
      priceLevel: row.priceLevel,
      reservationsEnabled: row.reservationsEnabled,
      services: row.services,
      // Nothing narrowed the branches here, so the two agree. Kept in the shape
      // anyway: the detail page reuses the list's card, and a field that
      // disappears between two responses of the same type is a trap.
      branchCount: row.branches.length,
      branches: row.branches.map((branch) =>
        toStaffBranch({ ...branch, restaurant: { id: row.id, name: row.name } }),
      ),
      // `Decimal` over the wire would arrive as an object with its own toString
      // and compare wrongly against a number. Resolved here, once.
      ratingAvg: Number(row.ratingAvg),
      reviewsCount: row.reviewsCount,
      coverUrl: row.coverUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listBranches(staff: StaffJwtPayload): Promise<{ items: StaffBranch[] }> {
    const rows = await this.prisma.restaurantBranch.findMany({
      where: branchScope(staff.scopes, Permission.BranchRead),
      include: BRANCH_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return { items: rows.map(toStaffBranch) };
  }

  /**
   * Adds a branch.
   *
   * The restaurant must be one the caller administers — checked as a query, so
   * a restaurant outside their reach is a 404 rather than a refusal that
   * confirms it exists.
   */
  async createBranch(staff: StaffJwtPayload, dto: CreateBranchDto): Promise<StaffBranch> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: dto.restaurantId, ...restaurantScope(staff.scopes, Permission.BranchCreate) },
      select: { id: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const branch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.restaurantBranch.create({
        data: {
          restaurantId: dto.restaurantId,
          name: dto.name ?? null,
          address: dto.address ?? null,
          ...(dto.city ? { city: dto.city } : {}),
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          phone: dto.phone ?? null,
          avgPrepMin: dto.avgPrepMin ?? null,
          // Opens closed. A new branch has no menu yet, and one that starts
          // accepting orders is a kitchen taking money for nothing.
          isOpen: false,
        },
        include: BRANCH_INCLUDE,
      });

      await this.audit.record(tx, staff, {
        action: AuditAction.BranchCreate,
        entityId: created.id,
        scope: { restaurantId: dto.restaurantId, branchId: created.id },
        after: { name: created.name, address: created.address, city: created.city },
      });

      return created;
    });

    return toStaffBranch(branch);
  }

  /** Open/closed and the prep estimate — the controls a shift uses. */
  async setBranchStatus(
    staff: StaffJwtPayload,
    branchId: string,
    dto: SetBranchStatusDto,
  ): Promise<StaffBranch> {
    return this.updateBranchWith(
      staff,
      branchId,
      Permission.BranchHours,
      AuditAction.BranchStatus,
      dto,
    );
  }

  /** The branch's standing details, which outlive any one shift. */
  async updateBranch(
    staff: StaffJwtPayload,
    branchId: string,
    dto: UpdateBranchDto,
  ): Promise<StaffBranch> {
    return this.updateBranchWith(
      staff,
      branchId,
      Permission.BranchWrite,
      AuditAction.BranchUpdate,
      dto,
    );
  }

  async listMenu(
    staff: StaffJwtPayload,
    query: ListMenuItemsDto,
  ): Promise<{ items: StaffMenuItem[] }> {
    const where: Prisma.MenuItemWhereInput = {
      ...menuScope(staff.scopes, Permission.MenuRead),
      ...LIVE_MENU_ITEM,
    };
    if (query.branchId) {
      // Narrows the scope, never replaces it.
      where.branchId = query.branchId;
    }
    if (query.menuTab) {
      where.menuTab = query.menuTab;
    }

    const items = await this.prisma.menuItem.findMany({
      where,
      orderBy: [{ menuTab: 'asc' }, { priceAmd: 'asc' }],
    });

    return { items: items.map(toStaffMenuItem) };
  }

  async create(staff: StaffJwtPayload, dto: CreateMenuItemDto): Promise<StaffMenuItem> {
    const restaurantId = await this.assertReachesBranch(
      staff,
      dto.branchId,
      Permission.MenuWrite,
    );
    await this.assertCategoryExists(dto.categoryId);

    const { branchId, categoryId, nameI18n, descI18n, ...rest } = dto;
    const name = stripEmpty(nameI18n);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          ...rest,
          branchId,
          categoryId: categoryId ?? null,
          nameI18n: name,
          descI18n: descI18n ? stripEmpty(descI18n) : Prisma.DbNull,
          dietaryTags: dto.dietaryTags ?? [],
        },
      });

      // In the transaction that created it, like every other entry: a dish that
      // exists with nothing saying who added it is the gap this table exists to
      // close.
      await this.audit.record(tx, staff, {
        action: AuditAction.MenuItemCreate,
        entityId: created.id,
        scope: { restaurantId, branchId },
        // No `before` — there was no dish. `after` carries what the feed needs
        // to name it and the price it went on the menu at.
        after: { nameI18n: name, priceAmd: created.priceAmd, menuTab: created.menuTab },
      });

      return created;
    });

    return toStaffMenuItem(item);
  }

  /**
   * Edits a dish.
   *
   * Changing a price does **not** touch orders that already exist: every order
   * item stores the price it was bought at (BUSINESS_LOGIC.md §4), so history
   * is not rewritten by a menu edit.
   */
  async update(staff: StaffJwtPayload, id: string, dto: UpdateMenuItemDto): Promise<StaffMenuItem> {
    const current = await this.load(staff, id, Permission.MenuWrite);
    await this.assertCategoryExists(dto.categoryId ?? undefined);

    const { nameI18n, descI18n, categoryId, ...rest } = dto;
    const data: Prisma.MenuItemUpdateInput = { ...rest };

    if (nameI18n) {
      data.nameI18n = stripEmpty(nameI18n);
    }
    if (descI18n !== undefined) {
      data.descI18n = stripEmpty(descI18n);
    }
    if (categoryId !== undefined) {
      data.category = categoryId === null ? { disconnect: true } : { connect: { id: categoryId } };
    }

    // Diffed against the loaded row rather than taken from the body: a form that
    // submits every field re-sends the price nobody touched, and "changed the
    // price from 2400 to 2400" is the noise that makes a real change hard to
    // find. Null when the PATCH moved nothing, and then no entry is written —
    // a request that changed nothing is not something somebody did.
    const changed = changedFields(
      {
        categoryId: current.categoryId,
        menuTab: current.menuTab,
        nameI18n: current.nameI18n,
        descI18n: current.descI18n,
        priceAmd: current.priceAmd,
        caloriesKcal: current.caloriesKcal,
        prepMin: current.prepMin,
        photoUrl: current.photoUrl,
        dietaryTags: current.dietaryTags,
        isAvailable: current.isAvailable,
      },
      {
        ...rest,
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(nameI18n ? { nameI18n: stripEmpty(nameI18n) } : {}),
        ...(descI18n !== undefined ? { descI18n: stripEmpty(descI18n) } : {}),
      },
    );

    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({ where: { id }, data });

      if (changed) {
        await this.audit.record(tx, staff, {
          action: AuditAction.MenuItemUpdate,
          entityId: id,
          scope: { restaurantId: current.branch.restaurantId, branchId: current.branchId },
          // The name goes in on every edit, changed or not: without it the feed
          // can only say "changed a price" and the reader has to go and look up
          // which dish. It is a label, not a diff, so it sits outside the pair.
          before: { ...changed.before, nameI18n: current.nameI18n as Prisma.InputJsonValue },
          after: changed.after,
        });
      }

      return updated;
    });

    return toStaffMenuItem(item);
  }

  /**
   * Sold out, and back again — on a narrower permission than editing the dish.
   *
   * This is the one menu change a shift may make: it says what is true right
   * now and reverses in a tap, unlike a price, which outlives the shift.
   */
  async setAvailability(
    staff: StaffJwtPayload,
    id: string,
    dto: SetAvailabilityDto,
  ): Promise<StaffMenuItem> {
    const current = await this.load(staff, id, Permission.MenuAvailability);

    // Flipping it to what it already is happened, but nothing changed by it —
    // and a shift tapping a stuck button four times should not fill somebody's
    // activity with four identical rows.
    if (current.isAvailable === dto.isAvailable) {
      const unchanged = await this.prisma.menuItem.findUniqueOrThrow({ where: { id } });
      return toStaffMenuItem(unchanged);
    }

    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
        where: { id },
        data: { isAvailable: dto.isAvailable },
      });

      // Its own action rather than a `menu_item.update` carrying one field. A
      // shift holds `menu:availability` and not `menu:write`, so folding the two
      // together would make every sold-out flip read as a menu edit.
      await this.audit.record(tx, staff, {
        action: AuditAction.MenuItemAvailability,
        entityId: id,
        scope: { restaurantId: current.branch.restaurantId, branchId: current.branchId },
        before: {
          isAvailable: current.isAvailable,
          nameI18n: current.nameI18n as Prisma.InputJsonValue,
        },
        after: { isAvailable: dto.isAvailable },
      });

      return updated;
    });

    return toStaffMenuItem(item);
  }

  /**
   * Takes a dish off the menu.
   *
   * A soft delete: the row stays and `deleted_at` is set. Every read filters it
   * out (`LIVE_MENU_ITEM`), so it is gone from the panel, gone from the public
   * menu, and cannot be added to a new order.
   *
   * This used to refuse — 409, "mark it unavailable instead" — for any dish that
   * had ever been ordered, because `order_items` references this table and an
   * order that can no longer say what was bought is not an order. Keeping the
   * row removes that objection entirely: the reference stays valid, past orders
   * still resolve, and a restaurant can finally retire a dish that sold. The
   * refusal had no reason left, so it is gone.
   *
   * Still distinct from `isAvailable: false`, which is "sold out tonight" and
   * comes back on a shift's say-so. This needs `menu:write` and the panel offers
   * no way back.
   */
  async remove(staff: StaffJwtPayload, id: string): Promise<void> {
    const current = await this.load(staff, id, Permission.MenuWrite);

    await this.prisma.$transaction(async (tx) => {
      await tx.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });

      await this.audit.record(tx, staff, {
        action: AuditAction.MenuItemDelete,
        entityId: id,
        scope: { restaurantId: current.branch.restaurantId, branchId: current.branchId },
        // What it was, so the feed can name a dish nothing else will show again.
        // The row does survive here, but `before` is what makes every deletion
        // in this table readable the same way — including the hard-deleted ones.
        before: {
          nameI18n: current.nameI18n as Prisma.InputJsonValue,
          priceAmd: current.priceAmd,
        },
      });
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * The two branch edits, which differ only in the permission they need and the
   * action they record. The action is passed rather than derived from the
   * permission: `branch:hours` and `branch:write` happen to map one-to-one today
   * and there is no reason a third edit could not share a permission with one of
   * them.
   */
  private async updateBranchWith(
    staff: StaffJwtPayload,
    branchId: string,
    permission: Permission,
    action: typeof AuditAction.BranchStatus | typeof AuditAction.BranchUpdate,
    data: SetBranchStatusDto | UpdateBranchDto,
  ): Promise<StaffBranch> {
    const current = await this.prisma.restaurantBranch.findFirst({
      where: { id: branchId, ...branchScope(staff.scopes, permission) },
      select: {
        restaurantId: true,
        name: true,
        address: true,
        phone: true,
        isOpen: true,
        avgPrepMin: true,
      },
    });
    if (!current) {
      throw new NotFoundException('Branch not found');
    }

    const changed = changedFields(current, data);

    const branch = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantBranch.update({
        where: { id: branchId },
        data,
        include: BRANCH_INCLUDE,
      });

      if (changed) {
        await this.audit.record(tx, staff, {
          action,
          entityId: branchId,
          scope: { restaurantId: current.restaurantId, branchId },
          before: changed.before,
          after: changed.after,
        });
      }

      return updated;
    });

    return toStaffBranch(branch);
  }

  /** Reach as a query, like everywhere else: 404 rather than 403, since a 403
   *  would confirm the branch exists. Returns the restaurant it belongs to,
   *  which the audit entry needs so a restaurant admin reaches the row without
   *  a join through the branch. */
  private async assertReachesBranch(
    staff: StaffJwtPayload,
    branchId: string,
    permission: Permission,
  ): Promise<string> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: { id: branchId, ...branchScope(staff.scopes, permission) },
      select: { restaurantId: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch.restaurantId;
  }

  /**
   * The dish, as it stands right now — the row every mutation diffs against and
   * takes its scope from.
   *
   * Filters out the soft-deleted, which is what makes a withdrawn dish
   * un-editable rather than merely invisible: without it, a stale panel could
   * still PATCH a price onto something already off the menu.
   */
  private async load(
    staff: StaffJwtPayload,
    id: string,
    permission: Permission,
  ): Promise<MenuAuditRow> {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, ...menuScope(staff.scopes, permission), ...LIVE_MENU_ITEM },
      select: MENU_AUDIT_SELECT,
    });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  /** A bad category id would otherwise surface as a foreign-key 500. */
  private async assertCategoryExists(categoryId?: string): Promise<void> {
    if (!categoryId) {
      return;
    }
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }
}

/** Drops blank translations so a half-filled form stores `{ hy: … }` rather
 *  than `{ hy: …, ru: '', en: '' }` — an empty string is not a translation,
 *  and it would win over the `hy` fallback in `localize()`. */
export function stripEmpty(field: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(field).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  ) as Record<string, string>;
}

function toStaffBranch(row: {
  id: string;
  restaurant: { id: string; name: string };
  name: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  isOpen: boolean;
  avgPrepMin: number | null;
  _count: { menuItems: number };
}): StaffBranch {
  return {
    id: row.id,
    restaurantId: row.restaurant.id,
    restaurantName: row.restaurant.name,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    isOpen: row.isOpen,
    avgPrepMin: row.avgPrepMin,
    menuItemCount: row._count.menuItems,
  };
}

function toStaffMenuItem(item: {
  id: string;
  branchId: string;
  categoryId: string | null;
  menuTab: string;
  nameI18n: Prisma.JsonValue;
  descI18n: Prisma.JsonValue;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
}): StaffMenuItem {
  return {
    id: item.id,
    branchId: item.branchId,
    categoryId: item.categoryId,
    menuTab: item.menuTab as MenuTab,
    nameI18n: (item.nameI18n ?? {}) as Record<string, string>,
    descI18n: (item.descI18n ?? null) as Record<string, string> | null,
    priceAmd: item.priceAmd,
    caloriesKcal: item.caloriesKcal,
    prepMin: item.prepMin,
    photoUrl: item.photoUrl,
    dietaryTags: item.dietaryTags,
    isAvailable: item.isAvailable,
  };
}
