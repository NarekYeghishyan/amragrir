import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveBranchOffering, type Language } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { LIVE_MENU_ITEM } from '../common/menu-visibility';

/**
 * A saved branch, shaped like the card that saved it.
 *
 * **The branch is the subject, not the business.** `branchId` is what was
 * hearted and what the card opens; `restaurantId` and `slug` are there because
 * the name, cuisine and rating belong to the business behind it. The branch's
 * own name and address ride along so a list of two Dolmamas is a list of two
 * streets rather than the same row twice (DATABASE.md §13).
 */
export interface FavoriteBranch {
  branchId: string;
  restaurantId: string;
  slug: string;
  name: string;
  /** The branch's own name ("Republic Square"), where it has one. */
  branchName: string | null;
  address: string | null;
  city: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  coverUrl: string | null;
  prepMin: number | null;
  isOpen: boolean;
  services: string[];
  addedAt: string;
}

/**
 * A saved dish, shaped like the row that saved it.
 *
 * **The dish is the subject, and the kitchen comes with it.** `menuItemId` is
 * what was hearted; `branchId` is where it is cooked, and it is not a second
 * choice anybody made — a dish belongs to one branch, so saving it already said
 * which address. That is what the row opens: the menu at this dish
 * (`/restaurant/{branchId}?item={menuItemId}`).
 *
 * The name, price and picture are read from the menu on every list rather than
 * copied at save time, so a dish renamed or repriced is shown as the kitchen
 * describes it today.
 */
export interface FavoriteDish {
  menuItemId: string;
  branchId: string;
  restaurantId: string;
  slug: string;
  /** The dish, in the caller's language. */
  name: string;
  desc: string;
  priceAmd: number;
  photoUrl: string | null;
  caloriesKcal: number | null;
  prepMin: number | null;
  /** Sold out tonight — the same flag the menu draws, so a saved dish does not
   *  promise something the kitchen has run out of. */
  isAvailable: boolean;
  sectionId: string;
  /** Whose kitchen it is: the business's name, the branch's own name and its
   *  address, so two branches of one chain are two rows rather than the same
   *  dish printed twice. */
  restaurantName: string;
  branchName: string | null;
  address: string | null;
  city: string;
  /** Whether that kitchen is open right now. */
  isOpen: boolean;
  addedAt: string;
}

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<{ items: FavoriteBranch[] }> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: { branch: { include: { restaurant: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      items: rows.map((row) => {
        const { branch } = row;
        const { restaurant } = branch;
        // The card is this address, so it shows this address's cover and
        // services — its own where it has answered for itself, the business's
        // where it has not. Same resolution the catalog card was drawn with.
        const offering = resolveBranchOffering(branch, restaurant);
        return {
          branchId: branch.id,
          restaurantId: restaurant.id,
          slug: restaurant.slug,
          name: restaurant.name,
          branchName: branch.name,
          address: branch.address,
          city: branch.city,
          cuisine: restaurant.cuisine,
          priceLevel: restaurant.priceLevel,
          rating: Number(restaurant.ratingAvg),
          reviewsCount: restaurant.reviewsCount,
          coverUrl: offering.coverUrl,
          prepMin: branch.avgPrepMin,
          isOpen: branch.isOpen,
          services: [...offering.services],
          addedAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  /**
   * Saves a branch.
   *
   * Idempotent by design: favouriting something already favourited is what a
   * double tap does, and it is not an error worth showing anyone.
   */
  async add(userId: string, branchId: string): Promise<{ favorited: true }> {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    try {
      await this.prisma.favorite.create({ data: { userId, branchId } });
    } catch (err) {
      // The (user, branch) unique index fired — already a favourite.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
    }
    return { favorited: true };
  }

  /** Also idempotent: removing something that is not there leaves the caller
   *  in the state they asked for. */
  async remove(userId: string, branchId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, branchId } });
  }

  /** Branch ids the user has favourited, for marking hearts in a list. */
  async idsFor(userId: string): Promise<string[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { branchId: true },
    });
    return rows.map((row) => row.branchId);
  }

  /**
   * The dishes the user has saved, newest first.
   *
   * **Dishes taken off the menu are left out.** `menu_items` is soft-deleted
   * (`LIVE_MENU_ITEM`), so a withdrawn dish still has its row here — and a list
   * that drew it would be offering something nobody can order and whose price
   * stopped meaning anything. The heart survives the withdrawal, so a dish that
   * comes back is still saved.
   *
   * Sold-out is a different state and *is* shown: it is true tonight, the dish
   * is still on the menu, and hiding it would make the list flicker with the
   * kitchen's stock.
   */
  async listDishes(userId: string, language: Language): Promise<{ items: FavoriteDish[] }> {
    const rows = await this.prisma.favoriteMenuItem.findMany({
      where: { userId, menuItem: LIVE_MENU_ITEM },
      include: { menuItem: { include: { branch: { include: { restaurant: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      items: rows.map((row) => {
        const { menuItem } = row;
        const { branch } = menuItem;
        const { restaurant } = branch;
        return {
          menuItemId: menuItem.id,
          branchId: branch.id,
          restaurantId: restaurant.id,
          slug: restaurant.slug,
          name: localize(menuItem.nameI18n as I18nField, language),
          desc: localize(menuItem.descI18n as I18nField, language),
          priceAmd: menuItem.priceAmd,
          photoUrl: menuItem.photoUrl,
          caloriesKcal: menuItem.caloriesKcal,
          prepMin: menuItem.prepMin,
          isAvailable: menuItem.isAvailable,
          sectionId: menuItem.sectionId,
          restaurantName: restaurant.name,
          branchName: branch.name,
          address: branch.address,
          city: branch.city,
          isOpen: branch.isOpen,
          addedAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  /**
   * Saves a dish.
   *
   * Idempotent like `add` above, and refuses a dish that is off the menu for
   * the same reason the list hides one: a heart on something withdrawn saves a
   * row nothing will ever draw.
   */
  async addDish(userId: string, menuItemId: string): Promise<{ favorited: true }> {
    const dish = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, ...LIVE_MENU_ITEM },
      select: { id: true },
    });
    if (!dish) {
      throw new NotFoundException('Menu item not found');
    }

    try {
      await this.prisma.favoriteMenuItem.create({ data: { userId, menuItemId } });
    } catch (err) {
      // The (user, dish) unique index fired — already a favourite.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
    }
    return { favorited: true };
  }

  /** Also idempotent, and **not** filtered by `LIVE_MENU_ITEM`: giving back a
   *  dish that has since left the menu is exactly the case somebody needs to
   *  succeed. */
  async removeDish(userId: string, menuItemId: string): Promise<void> {
    await this.prisma.favoriteMenuItem.deleteMany({ where: { userId, menuItemId } });
  }

  /**
   * Dish ids the user has saved, for filling hearts on a menu or a card.
   *
   * Narrowed to one branch where the caller has one on screen — a menu page
   * asks about its own dishes, and there is no reason to hand it the ids of
   * every dish this account saved anywhere in Yerevan.
   */
  async dishIdsFor(userId: string, branchId?: string): Promise<string[]> {
    const rows = await this.prisma.favoriteMenuItem.findMany({
      where: {
        userId,
        menuItem: { ...LIVE_MENU_ITEM, ...(branchId ? { branchId } : {}) },
      },
      select: { menuItemId: true },
    });
    return rows.map((row) => row.menuItemId);
  }
}
