import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MenuTab } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/token.service';
import { branchScopeFor, menuScopeFor } from './branch-access';
import {
  CreateMenuItemDto,
  ListMenuItemsDto,
  UpdateBranchDto,
  UpdateMenuItemDto,
} from './menu.dto';

/**
 * Owner view of a dish.
 *
 * Unlike the public `GET /restaurants/{id}/menu`, this returns the **raw
 * `*_i18n` objects**: the owner is editing all three languages, so resolving
 * one for them would make the other two invisible and silently unsaveable.
 */
export interface OwnerMenuItem {
  id: string;
  branchId: string;
  categoryId: string | null;
  menuTab: MenuTab;
  nameI18n: Record<string, string>;
  descI18n: Record<string, string> | null;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
}

export interface OwnerBranch {
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

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async listBranches(user: JwtPayload): Promise<{ items: OwnerBranch[] }> {
    const rows = await this.prisma.restaurantBranch.findMany({
      where: branchScopeFor(user),
      include: { restaurant: { select: { id: true, name: true } }, _count: { select: { menuItems: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      items: rows.map((row) => ({
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
      })),
    };
  }

  async updateBranch(user: JwtPayload, branchId: string, dto: UpdateBranchDto): Promise<OwnerBranch> {
    await this.assertOwnsBranch(user, branchId);

    await this.prisma.restaurantBranch.update({ where: { id: branchId }, data: dto });

    const branches = await this.listBranches(user);
    const updated = branches.items.find((branch) => branch.id === branchId);
    if (!updated) {
      throw new NotFoundException('Branch not found');
    }
    return updated;
  }

  async listMenu(user: JwtPayload, query: ListMenuItemsDto): Promise<{ items: OwnerMenuItem[] }> {
    const where: Prisma.MenuItemWhereInput = { ...menuScopeFor(user) };
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

    return { items: items.map(toOwnerMenuItem) };
  }

  async create(user: JwtPayload, dto: CreateMenuItemDto): Promise<OwnerMenuItem> {
    await this.assertOwnsBranch(user, dto.branchId);
    await this.assertCategoryExists(dto.categoryId);

    const { branchId, categoryId, nameI18n, descI18n, ...rest } = dto;

    const item = await this.prisma.menuItem.create({
      data: {
        ...rest,
        branchId,
        categoryId: categoryId ?? null,
        nameI18n: stripEmpty(nameI18n),
        descI18n: descI18n ? stripEmpty(descI18n) : Prisma.DbNull,
        dietaryTags: dto.dietaryTags ?? [],
      },
    });

    return toOwnerMenuItem(item);
  }

  /**
   * Edits a dish.
   *
   * Changing a price does **not** touch orders that already exist: every order
   * item stores the price it was bought at (BUSINESS_LOGIC.md §4), so history
   * is not rewritten by a menu edit.
   */
  async update(user: JwtPayload, id: string, dto: UpdateMenuItemDto): Promise<OwnerMenuItem> {
    await this.load(user, id);
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

    const item = await this.prisma.menuItem.update({ where: { id }, data });
    return toOwnerMenuItem(item);
  }

  /**
   * Removes a dish that was never ordered.
   *
   * A dish that appears in an order cannot be deleted: `order_items` points at
   * it, and an order that can no longer say what was bought is not an order.
   * The answer for a discontinued dish is `isAvailable: false`, which hides it
   * from the menu and keeps history intact — so that is what the 409 says.
   */
  async remove(user: JwtPayload, id: string): Promise<void> {
    await this.load(user, id);

    const ordered = await this.prisma.orderItem.findFirst({
      where: { menuItemId: id },
      select: { id: true },
    });
    if (ordered) {
      throw new ConflictException(
        'This dish has been ordered before and cannot be deleted; mark it unavailable instead',
      );
    }

    await this.prisma.menuItem.delete({ where: { id } });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Ownership as a query, like everywhere else: 404 rather than 403, since a
   *  403 would confirm the branch exists. */
  private async assertOwnsBranch(user: JwtPayload, branchId: string): Promise<void> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: { id: branchId, ...branchScopeFor(user) },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }

  private async load(user: JwtPayload, id: string): Promise<{ id: string }> {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, ...menuScopeFor(user) },
      select: { id: true },
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

function toOwnerMenuItem(item: {
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
}): OwnerMenuItem {
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
