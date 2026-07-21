import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Language } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { distanceKm, roundKm } from './geo';
import { ListRestaurantsDto, MenuQueryDto, RestaurantSort } from './dto';

export interface RestaurantListItem {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  distanceKm: number | null;
  prepMin: number | null;
  isOpen: boolean;
  services: string[];
  reservationsEnabled: boolean;
  coverUrl: string | null;
}

export interface MenuItemDto {
  id: string;
  name: string;
  desc: string;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
  menuTab: string;
  categoryId: string | null;
}

/** A branch row joined with its parent restaurant — what the list renders. */
type BranchWithRestaurant = Prisma.RestaurantBranchGetPayload<{
  include: { restaurant: true };
}>;

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nearby list for the home feed. Each row is a *branch* — that is what a
   * user travels to and what carries hours, geo and prep time.
   */
  async list(
    query: ListRestaurantsDto,
    language: Language,
  ): Promise<{ items: RestaurantListItem[]; total: number; page: number }> {
    const where = this.buildWhere(query);

    // Distance is computed in the app (see geo.ts), so a distance filter or
    // sort has to be applied before paging — fetch the filtered set, then page.
    const usesDistance =
      query.lat !== undefined &&
      query.lng !== undefined &&
      (query.sort === RestaurantSort.Nearest || query.distMax !== undefined);

    const rows = await this.prisma.restaurantBranch.findMany({
      where,
      include: { restaurant: true },
      ...(usesDistance ? {} : this.pageArgs(query)),
      ...(usesDistance ? {} : { orderBy: this.orderBy(query.sort) }),
    });

    let items = rows.map((row) => this.toListItem(row, query, language));

    if (usesDistance) {
      if (query.distMax !== undefined) {
        items = items.filter((i) => i.distanceKm !== null && i.distanceKm <= query.distMax!);
      }
      if (query.sort === RestaurantSort.Nearest) {
        items.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      }
      const total = items.length;
      const start = (query.page - 1) * query.limit;
      return { items: items.slice(start, start + query.limit), total, page: query.page };
    }

    const total = await this.prisma.restaurantBranch.count({ where });
    return { items, total, page: query.page };
  }

  async findOne(idOrSlug: string, language: Language): Promise<Record<string, unknown>> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: this.identityWhere(idOrSlug),
      include: { restaurant: true },
    });

    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }

    const { restaurant } = branch;
    return {
      id: branch.id,
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      priceLevel: restaurant.priceLevel,
      rating: Number(restaurant.ratingAvg),
      reviewsCount: restaurant.reviewsCount,
      services: restaurant.services,
      reservationsEnabled: restaurant.reservationsEnabled,
      coverUrl: restaurant.coverUrl,
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        city: branch.city,
        lat: branch.lat === null ? null : Number(branch.lat),
        lng: branch.lng === null ? null : Number(branch.lng),
        phone: branch.phone,
        openHours: branch.openHours,
        isOpen: branch.isOpen,
        prepMin: branch.avgPrepMin,
      },
      // Language is resolved for the caller even though these columns are not
      // localised yet — keeps the contract stable if they become so.
      language,
    };
  }

  async menu(
    idOrSlug: string,
    query: MenuQueryDto,
    language: Language,
  ): Promise<{ items: MenuItemDto[] }> {
    const branch = await this.resolveBranch(idOrSlug);

    const items = await this.prisma.menuItem.findMany({
      where: {
        branchId: branch.id,
        ...(query.menuTab ? { menuTab: query.menuTab } : {}),
        ...(query.category ? { category: { key: query.category } } : {}),
      },
      orderBy: [{ menuTab: 'asc' }, { priceAmd: 'asc' }],
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        name: localize(item.nameI18n as I18nField, language),
        desc: localize(item.descI18n as I18nField, language),
        priceAmd: item.priceAmd,
        caloriesKcal: item.caloriesKcal,
        prepMin: item.prepMin,
        photoUrl: item.photoUrl,
        dietaryTags: item.dietaryTags,
        isAvailable: item.isAvailable,
        menuTab: item.menuTab,
        categoryId: item.categoryId,
      })),
    };
  }

  async tables(idOrSlug: string): Promise<{ tables: unknown[] }> {
    const branch = await this.resolveBranch(idOrSlug);

    const tables = await this.prisma.table.findMany({
      where: { branchId: branch.id, isActive: true },
      orderBy: { tableNo: 'asc' },
      select: { id: true, tableNo: true, seats: true, zone: true },
    });

    return { tables };
  }

  private async resolveBranch(idOrSlug: string): Promise<{ id: string }> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: this.identityWhere(idOrSlug),
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }
    return branch;
  }

  /** Accepts a branch id, a restaurant id, or a restaurant slug — clients hold
   *  whichever of the three the previous screen gave them. */
  private identityWhere(idOrSlug: string): Prisma.RestaurantBranchWhereInput {
    return isUuid(idOrSlug)
      ? { OR: [{ id: idOrSlug }, { restaurantId: idOrSlug }] }
      : { restaurant: { slug: idOrSlug } };
  }

  private buildWhere(query: ListRestaurantsDto): Prisma.RestaurantBranchWhereInput {
    const restaurant: Prisma.RestaurantWhereInput = {};

    if (query.minRating !== undefined) {
      restaurant.ratingAvg = { gte: query.minRating };
    }
    if (query.service?.length) {
      restaurant.services = { hasSome: query.service };
    }
    if (query.q) {
      restaurant.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { cuisine: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const where: Prisma.RestaurantBranchWhereInput = {};
    if (Object.keys(restaurant).length > 0) {
      where.restaurant = restaurant;
    }

    // Category and dietary filters describe dishes, so they select branches
    // that have at least one matching item.
    const menuItem: Prisma.MenuItemWhereInput = {};
    if (query.category) {
      menuItem.category = { key: query.category };
    }
    if (query.dietary?.length) {
      menuItem.dietaryTags = { hasSome: query.dietary };
    }
    if (Object.keys(menuItem).length > 0) {
      where.menuItems = { some: menuItem };
    }

    return where;
  }

  /**
   * SQL ordering. `nearest` never reaches here with coordinates — that path is
   * sorted in the app — and without coordinates it is meaningless, so it takes
   * the default ordering rather than an arbitrary one.
   */
  private orderBy(sort: RestaurantSort): Prisma.RestaurantBranchOrderByWithRelationInput[] {
    if (sort === RestaurantSort.Fastest) {
      return [{ avgPrepMin: 'asc' }];
    }
    if (sort === RestaurantSort.TopRated) {
      return [{ restaurant: { ratingAvg: 'desc' } }];
    }
    return [{ restaurant: { ratingAvg: 'desc' } }, { restaurant: { reviewsCount: 'desc' } }];
  }

  private pageArgs(query: ListRestaurantsDto): { skip: number; take: number } {
    return { skip: (query.page - 1) * query.limit, take: query.limit };
  }

  private toListItem(
    row: BranchWithRestaurant,
    query: ListRestaurantsDto,
    _language: Language,
  ): RestaurantListItem {
    const { restaurant } = row;

    let distance: number | null = null;
    if (query.lat !== undefined && query.lng !== undefined && row.lat !== null && row.lng !== null) {
      distance = roundKm(
        distanceKm(
          { lat: query.lat, lng: query.lng },
          { lat: Number(row.lat), lng: Number(row.lng) },
        ),
      );
    }

    return {
      id: row.id,
      slug: restaurant.slug,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      priceLevel: restaurant.priceLevel,
      rating: Number(restaurant.ratingAvg),
      reviewsCount: restaurant.reviewsCount,
      distanceKm: distance,
      prepMin: row.avgPrepMin,
      isOpen: row.isOpen,
      services: restaurant.services,
      reservationsEnabled: restaurant.reservationsEnabled,
      coverUrl: restaurant.coverUrl,
    };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}
