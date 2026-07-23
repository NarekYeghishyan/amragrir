import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Language } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { boundingBox, distanceKm, roundKm } from './geo';
import { SearchService } from './search.service';
import { ListRestaurantsDto, MenuQueryDto, RestaurantSort } from './dto';

/**
 * Implicit radius for `sort=nearest` when the caller sets no `distMax`. This is
 * an order-ahead product — a branch 40 km away is not a result anyone wants —
 * and without a bound the query degenerates into a full scan. Matches the top
 * of the design's distance filter (DISTANCE_RANGE_KM).
 */
const NEAREST_RADIUS_KM = 5;

/** Backstop on how many rows a distance query may materialise. */
const MAX_DISTANCE_CANDIDATES = 500;

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

export interface RestaurantDetail {
  id: string;
  restaurantId: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  services: string[];
  reservationsEnabled: boolean;
  coverUrl: string | null;
  branch: {
    id: string;
    name: string | null;
    address: string | null;
    city: string;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    openHours: unknown;
    isOpen: boolean;
    prepMin: number | null;
  };
}

export interface TableDto {
  id: string;
  tableNo: string;
  seats: number;
  zone: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
  ) {}

  /**
   * Nearby list for the home feed. Each row is a *branch* — that is what a
   * user travels to and what carries hours, geo and prep time.
   */
  async list(
    query: ListRestaurantsDto,
    _language: Language,
  ): Promise<{ items: RestaurantListItem[]; total: number; page: number }> {
    const origin = this.origin(query);

    // Resolved before the main query because it is an aggregate over dishes,
    // which Prisma cannot express as a relation filter. An empty result means
    // "no branch matches", not "no filter" — hence the explicit null check.
    const priceFiltered =
      query.priceMin !== undefined || query.priceMax !== undefined
        ? await this.search.branchIdsInPriceRange(query.priceMin, query.priceMax)
        : null;

    if (priceFiltered !== null && priceFiltered.length === 0) {
      return { items: [], total: 0, page: query.page };
    }
    // Distance is computed in the app (see geo.ts), so a distance filter or
    // sort has to be applied before paging — fetch the candidate set, then page.
    const usesDistance =
      origin !== null && (query.sort === RestaurantSort.Nearest || query.distMax !== undefined);

    const radiusKm = usesDistance ? (query.distMax ?? NEAREST_RADIUS_KM) : undefined;
    const where = this.buildWhere(
      query,
      origin && radiusKm ? { origin, radiusKm } : undefined,
      priceFiltered,
    );

    if (!usesDistance) {
      const [rows, total] = await Promise.all([
        this.prisma.restaurantBranch.findMany({
          where,
          include: { restaurant: true },
          orderBy: this.orderBy(query.sort),
          ...this.pageArgs(query),
        }),
        this.prisma.restaurantBranch.count({ where }),
      ]);
      return { items: rows.map((row) => this.toListItem(row, origin)), total, page: query.page };
    }

    // The bounding box above already narrows this in SQL; the cap is a backstop
    // so a dense city can never materialise an unbounded result set.
    const rows = await this.prisma.restaurantBranch.findMany({
      where,
      include: { restaurant: true },
      orderBy: this.orderBy(query.sort),
      take: MAX_DISTANCE_CANDIDATES,
    });

    // Filter on the true distance, not the rounded display value, so a branch
    // just outside the radius cannot round its way in.
    let scored = rows
      .map((row) => ({ row, km: this.exactDistanceKm(row, origin) }))
      .filter(({ km }) => km !== null && km <= radiusKm!);

    if (query.sort === RestaurantSort.Nearest) {
      scored.sort((a, b) => a.km! - b.km!);
    }
    // Any other sort keeps the database ordering applied above, which the
    // stable `Array.prototype.sort` and the untouched order both preserve.

    const total = scored.length;
    const start = (query.page - 1) * query.limit;
    scored = scored.slice(start, start + query.limit);

    return {
      items: scored.map(({ row }) => this.toListItem(row, origin)),
      total,
      page: query.page,
    };
  }

  async findOne(idOrSlug: string, _language: Language): Promise<RestaurantDetail> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: this.identityWhere(idOrSlug),
      include: { restaurant: true },
      orderBy: RestaurantsService.BRANCH_PICK_ORDER,
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

  async tables(idOrSlug: string): Promise<{ tables: TableDto[] }> {
    const branch = await this.resolveBranch(idOrSlug);

    const tables = await this.prisma.table.findMany({
      where: { branchId: branch.id, isActive: true },
      select: { id: true, tableNo: true, seats: true, zone: true },
    });

    // `table_no` is a varchar, so ordering it in SQL puts "10" before "2".
    // Sort numerically when both sides are numbers, alphabetically otherwise
    // (a branch may label tables "A1", "Terrace-2").
    tables.sort((a, b) => compareTableNo(a.tableNo, b.tableNo));

    return { tables };
  }

  private async resolveBranch(idOrSlug: string): Promise<{ id: string }> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: this.identityWhere(idOrSlug),
      select: { id: true },
      orderBy: RestaurantsService.BRANCH_PICK_ORDER,
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

  /**
   * Deterministic tie-break for the lookups above. A restaurant id or slug can
   * match several branches, and `findFirst` without an order returns whichever
   * row the database happens to yield — so the same URL could serve a
   * different branch's menu and prices on each request.
   */
  private static readonly BRANCH_PICK_ORDER: Prisma.RestaurantBranchOrderByWithRelationInput[] = [
    { createdAt: 'asc' },
    { id: 'asc' },
  ];

  private buildWhere(
    query: ListRestaurantsDto,
    bounds?: { origin: { lat: number; lng: number }; radiusKm: number },
    priceFilteredBranchIds?: string[] | null,
  ): Prisma.RestaurantBranchWhereInput {
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

    // `isOpen` is a branch column, so this filters the branch row directly
    // rather than the parent restaurant.
    if (query.openNow) {
      where.isOpen = true;
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

    // Narrow a distance query in SQL so the app never scans the whole table
    // to answer "near me". Corners of the box are trimmed by the exact
    // distance check afterwards.
    if (bounds) {
      const box = boundingBox(bounds.origin, bounds.radiusKm);
      where.lat = { gte: box.minLat, lte: box.maxLat };
      where.lng = { gte: box.minLng, lte: box.maxLng };
    }

    if (priceFilteredBranchIds) {
      where.id = { in: priceFilteredBranchIds };
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

  /** Caller coordinates, or null when the request supplied only one of the pair. */
  private origin(query: ListRestaurantsDto): { lat: number; lng: number } | null {
    return query.lat !== undefined && query.lng !== undefined
      ? { lat: query.lat, lng: query.lng }
      : null;
  }

  /** True (unrounded) distance in km, or null when either side lacks coordinates. */
  private exactDistanceKm(
    row: BranchWithRestaurant,
    origin: { lat: number; lng: number } | null,
  ): number | null {
    if (!origin || row.lat === null || row.lng === null) {
      return null;
    }
    return distanceKm(origin, { lat: Number(row.lat), lng: Number(row.lng) });
  }

  private toListItem(
    row: BranchWithRestaurant,
    origin: { lat: number; lng: number } | null,
  ): RestaurantListItem {
    const { restaurant } = row;
    const exact = this.exactDistanceKm(row, origin);
    const distance = exact === null ? null : roundKm(exact);

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

/** Numeric where possible so "2" precedes "10"; falls back to locale compare. */
export function compareTableNo(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
    return na - nb;
  }
  if (Number.isFinite(na) !== Number.isFinite(nb)) {
    return Number.isFinite(na) ? -1 : 1;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}
