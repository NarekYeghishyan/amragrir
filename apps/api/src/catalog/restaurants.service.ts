import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CARD_DISH_SLIDER_LIMIT,
  Language,
  effectiveCategoryId,
  resolveBranchOffering,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { LIVE_MENU_ITEM, LIVE_MENU_SECTION } from '../common/menu-visibility';
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

/**
 * Backstop on how many branch rows the grouped list may materialise.
 *
 * Collapsing branches to restaurants happens in the app (see `listGrouped`),
 * so the rows have to exist in memory first — and an unbounded materialisation
 * is exactly what the cap above already exists to prevent.
 */
const MAX_GROUPED_CANDIDATES = 500;

/**
 * A dish on a restaurant card, shown when a category filter is on.
 *
 * The card normally wears the branch's photograph. Under a category chip that
 * picture answers the wrong question: the guest asked for sushi, and a shot of
 * the dining room does not tell them whether this kitchen has any. So the cover
 * gives way to the matching dishes themselves, with the two facts somebody
 * choosing between restaurants actually compares — what it is and what it costs.
 *
 * `sectionId` travels so the tap can land on the dish rather than on the top of
 * a menu the guest then has to search.
 */
export interface CardDish {
  id: string;
  name: string;
  priceAmd: number;
  photoUrl: string | null;
  sectionId: string;
}

export interface RestaurantListItem {
  id: string;
  /**
   * The business behind the row, since `id` is the branch's.
   *
   * The name, cuisine and rating on this row are the business's; the distance,
   * hours, prep time and cover are the branch's — and so is the heart, which
   * posts `id` (DATABASE.md §13). Both ids travel because a card is genuinely
   * about both; `SearchRestaurant` has always sent the pair for the same reason.
   */
  restaurantId: string;
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
  /**
   * The dishes that matched the category filter, or `undefined` when no
   * category was asked for.
   *
   * Undefined and empty mean different things and the clients read both: no
   * filter is on (wear the cover), versus a filter is on but every match is
   * sold out tonight (wear the cover, and the card is still a true answer —
   * the kitchen does serve this, just not right now).
   */
  dishes?: CardDish[];
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
  sectionId: string;
  /** On the branch's "Popular" shelf — a showcase across the whole menu, not a
   *  section, so this is true *as well as* the dish having a section. */
  isPopular: boolean;
  /** The **effective** category: the dish's own, or its section's. Resolved
   *  here so no client has to know the inheritance rule to draw a chip. */
  categoryId: string | null;
}

/** One heading of a branch's menu, in the reader's language. */
export interface MenuSectionDto {
  id: string;
  name: string;
  /** The platform category this whole shelf maps onto, or null. */
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
    language: Language,
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

    if (query.groupByRestaurant) {
      return this.listGrouped(query, where, origin, radiusKm, language);
    }

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
      return {
        items: await this.withDishes(
          rows.map((row) => this.toListItem(row, origin)),
          query.category,
          language,
        ),
        total,
        page: query.page,
      };
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
      items: await this.withDishes(
        scored.map(({ row }) => this.toListItem(row, origin)),
        query.category,
        language,
      ),
      total,
      page: query.page,
    };
  }

  /**
   * The same list, collapsed to one row per restaurant.
   *
   * Collapsing happens **after** filtering and ordering, so the branch kept is
   * the best one under the active query — the fastest under `sort=fastest`, an
   * open one under `openNow`. With no branch-level sort in play the ordering
   * ends in the tie-break below, so the row kept is the oldest branch: the very
   * one `/restaurants/{slug}` resolves to, which is what a card claiming "open,
   * 12 min" must describe if the page behind it is to agree.
   *
   * Done here rather than in SQL because the interesting orderings are not
   * expressible as a `DISTINCT ON` over this query, and because the distance
   * path already has to materialise rows for the same reason. Both are capped.
   */
  private async listGrouped(
    query: ListRestaurantsDto,
    where: Prisma.RestaurantBranchWhereInput,
    origin: { lat: number; lng: number } | null,
    radiusKm: number | undefined,
    language: Language,
  ): Promise<{ items: RestaurantListItem[]; total: number; page: number }> {
    const rows = await this.prisma.restaurantBranch.findMany({
      where,
      include: { restaurant: true },
      orderBy: this.orderBy(query.sort),
      take: MAX_GROUPED_CANDIDATES,
    });

    let ranked: BranchWithRestaurant[] = rows;

    // Distance is computed in the app, so it has to be applied before rows are
    // collapsed — a branch outside the radius must not be the one that
    // represents its restaurant.
    if (radiusKm !== undefined && origin !== null) {
      const scored = rows
        .map((row) => ({ row, km: this.exactDistanceKm(row, origin) }))
        .filter(({ km }) => km !== null && km <= radiusKm);

      if (query.sort === RestaurantSort.Nearest) {
        scored.sort((a, b) => a.km! - b.km!);
      }
      ranked = scored.map(({ row }) => row);
    }

    const seen = new Set<string>();
    const collapsed = ranked.filter((row) => {
      if (seen.has(row.restaurantId)) {
        return false;
      }
      seen.add(row.restaurantId);
      return true;
    });

    // Counted in the database when it can be, so the figure a client prints
    // ("Restaurants in Yerevan (23)") is the real total rather than however
    // many rows happened to fit under the cap. A distance query cannot: its
    // final filter runs in the app, above, so only the collapsed set knows.
    const total =
      radiusKm === undefined
        ? await this.prisma.restaurant.count({ where: { branches: { some: where } } })
        : collapsed.length;

    const start = (query.page - 1) * query.limit;

    return {
      items: await this.withDishes(
        collapsed.slice(start, start + query.limit).map((row) => this.toListItem(row, origin)),
        query.category,
        language,
      ),
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
    // What *this address* offers, which is what the page is about — a branch
    // that answers for itself overrides the business, and one that does not
    // wears its defaults. The response shape is unchanged: these three have
    // always described the branch the card resolves to, and until now that was
    // only true because every branch was the same.
    const offering = resolveBranchOffering(branch, restaurant);
    return {
      id: branch.id,
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      priceLevel: restaurant.priceLevel,
      rating: Number(restaurant.ratingAvg),
      reviewsCount: restaurant.reviewsCount,
      services: [...offering.services],
      reservationsEnabled: offering.reservationsEnabled,
      coverUrl: offering.coverUrl,
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

  /**
   * A branch's menu: its own headings, and the dishes under them.
   *
   * The sections travel **with** the items and are not derivable from them — a
   * heading a kitchen has created but not filled yet still belongs on its page,
   * and a `?category=` narrowing must not make the empty ones disappear and the
   * tab strip jump about. So the sections are always the branch's full set, in
   * its own order, and only `items` answers to the filters.
   */
  async menu(
    idOrSlug: string,
    query: MenuQueryDto,
    language: Language,
  ): Promise<{ sections: MenuSectionDto[]; items: MenuItemDto[] }> {
    const branch = await this.resolveBranch(idOrSlug);

    const [sections, items] = await Promise.all([
      this.prisma.branchMenuSection.findMany({
        where: { branchId: branch.id, ...LIVE_MENU_SECTION },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.menuItem.findMany({
        where: {
          branchId: branch.id,
          // A dish taken off the menu is off it for customers first of all.
          ...LIVE_MENU_ITEM,
          ...(query.sectionId ? { sectionId: query.sectionId } : {}),
          ...(query.category ? categoryMatch(query.category) : {}),
        },
        include: { section: { select: { categoryId: true, sortOrder: true } } },
        orderBy: [{ section: { sortOrder: 'asc' } }, { priceAmd: 'asc' }],
      }),
    ]);

    return {
      sections: sections.map((section) => ({
        id: section.id,
        name: localize(section.nameI18n as I18nField, language),
        categoryId: section.categoryId,
      })),
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
        sectionId: item.sectionId,
        isPopular: item.isPopular,
        categoryId: effectiveCategoryId(item, item.section),
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

    // Services are answered per branch now, so this asks each row the same
    // question `resolveBranchOffering` does: a branch that overrides is matched
    // on its own array, and one that does not on its restaurant's. Filtering
    // the parent alone would hand back branches that have withdrawn the very
    // service the guest filtered for — and hide ones that added it.
    //
    // Top-level `OR`, which is free here: the `q` search above builds its `OR`
    // inside `restaurant`, so the two do not collide.
    if (query.service?.length) {
      where.OR = [
        { servicesOverridden: true, services: { hasSome: query.service } },
        {
          servicesOverridden: false,
          restaurant: { services: { hasSome: query.service } },
        },
      ];
    }

    // Category and dietary filters describe dishes, so they select branches
    // that have at least one matching item.
    const menuItem: Prisma.MenuItemWhereInput = {};
    if (query.category) {
      Object.assign(menuItem, categoryMatch(query.category));
    }
    if (query.dietary?.length) {
      menuItem.dietaryTags = { hasSome: query.dietary };
    }
    if (Object.keys(menuItem).length > 0) {
      // A withdrawn dish must not be why a branch turns up under "vegan": the
      // search would promise something the menu no longer offers.
      where.menuItems = { some: { ...menuItem, ...LIVE_MENU_ITEM } };
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
   *
   * Every ordering ends in `BRANCH_PICK_ORDER`. Ratings tie constantly (a
   * chain's branches share one), and rows tied under `ORDER BY` come back in
   * whatever order the database felt like, which makes `skip`/`take` paging
   * drop and repeat rows between pages. It also decides which branch
   * represents its restaurant in `listGrouped` — and the tie-break being the
   * same one `/restaurants/{slug}` uses is what makes the two agree.
   */
  private orderBy(sort: RestaurantSort): Prisma.RestaurantBranchOrderByWithRelationInput[] {
    if (sort === RestaurantSort.Fastest) {
      return [{ avgPrepMin: 'asc' }, ...RestaurantsService.BRANCH_PICK_ORDER];
    }
    if (sort === RestaurantSort.TopRated) {
      return [{ restaurant: { ratingAvg: 'desc' } }, ...RestaurantsService.BRANCH_PICK_ORDER];
    }
    return [
      { restaurant: { ratingAvg: 'desc' } },
      { restaurant: { reviewsCount: 'desc' } },
      ...RestaurantsService.BRANCH_PICK_ORDER,
    ];
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

  /**
   * Hangs the matching dishes on the cards, when a category was asked for.
   *
   * Runs after paging, never before: the slider is decoration on twenty rows,
   * and fetching menus for the five hundred candidates a distance query
   * materialises to then throw away 96% of them would be paying for a picture
   * nobody sees.
   *
   * One round trip for the whole page. The obvious alternative — a query per
   * card — is twenty; the other one, a single unranked `findMany`, cannot cap
   * *per branch*, so one restaurant with a sixty-dish pizza list would spend
   * the whole budget and leave the other nineteen cards blank.
   */
  private async withDishes(
    items: RestaurantListItem[],
    categoryKey: string | undefined,
    language: Language,
  ): Promise<RestaurantListItem[]> {
    if (!categoryKey || items.length === 0) {
      return items;
    }

    const byBranch = await this.cardDishes(
      items.map((item) => item.id),
      categoryKey,
      language,
    );

    // Every card gets the key, empty array included: `undefined` means "no
    // filter is on" to the clients, and a branch whose matches are all sold out
    // tonight is not that.
    return items.map((item) => ({ ...item, dishes: byBranch.get(item.id) ?? [] }));
  }

  private async cardDishes(
    branchIds: string[],
    categoryKey: string,
    language: Language,
  ): Promise<Map<string, CardDish[]>> {
    // `ROW_NUMBER` per branch, because the cap is per card. Ordered the way a
    // kitchen would introduce itself: what it is known for first, then cheapest
    // — and `id` last so two dishes at one price cannot swap places between
    // requests and make the slider look shuffled.
    //
    // `COALESCE(m.category_id, s.category_id)` is `effectiveCategoryId` in SQL.
    // The two are the same rule and have to stay so; the branch filter that
    // decided this card belongs on the page used the TypeScript one.
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        branch_id: string;
        name_i18n: Prisma.JsonValue;
        price_amd: number;
        photo_url: string | null;
        section_id: string;
      }[]
    >`
      SELECT id, branch_id, name_i18n, price_amd, photo_url, section_id
        FROM (
          SELECT m.id, m.branch_id, m.name_i18n, m.price_amd, m.photo_url, m.section_id,
                 ROW_NUMBER() OVER (
                   PARTITION BY m.branch_id
                   ORDER BY m.is_popular DESC, m.price_amd ASC, m.id ASC
                 ) AS rn
            FROM menu_items m
            JOIN branch_menu_sections s ON s.id = m.section_id
           WHERE m.branch_id::text IN (${Prisma.join(branchIds)})
             AND m.deleted_at IS NULL
             AND m.is_available = true
             AND COALESCE(m.category_id, s.category_id)
                 = (SELECT c.id FROM categories c WHERE c.key = ${categoryKey})
        ) ranked
       WHERE rn <= ${CARD_DISH_SLIDER_LIMIT}
    `;

    const byBranch = new Map<string, CardDish[]>();
    for (const row of rows) {
      const list = byBranch.get(row.branch_id) ?? [];
      list.push({
        id: row.id,
        // The one place the feed carries a dish name, so it resolves here —
        // `list()` had a language parameter it never used until now.
        name: localize(row.name_i18n as I18nField, language),
        priceAmd: row.price_amd,
        photoUrl: row.photo_url,
        sectionId: row.section_id,
      });
      byBranch.set(row.branch_id, list);
    }
    return byBranch;
  }

  private toListItem(
    row: BranchWithRestaurant,
    origin: { lat: number; lng: number } | null,
  ): RestaurantListItem {
    const { restaurant } = row;
    const exact = this.exactDistanceKm(row, origin);
    const distance = exact === null ? null : roundKm(exact);
    // A card *is* a branch — `id` above is the branch's — so these three are
    // resolved for that branch rather than copied off the parent. Two branches
    // of one chain can now show different photographs and different services,
    // which is the whole point of the columns this reads.
    const offering = resolveBranchOffering(row, restaurant);

    return {
      id: row.id,
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      priceLevel: restaurant.priceLevel,
      rating: Number(restaurant.ratingAvg),
      reviewsCount: restaurant.reviewsCount,
      distanceKm: distance,
      prepMin: row.avgPrepMin,
      isOpen: row.isOpen,
      services: [...offering.services],
      reservationsEnabled: offering.reservationsEnabled,
      coverUrl: offering.coverUrl,
    };
  }
}

/**
 * Dishes in a platform category, **inheritance included**.
 *
 * A dish is in "Pizza" if it says so itself, or if it says nothing and the
 * shelf it sits on says so. Written once and used by both readers — the branch
 * filter on the feed and the menu narrowing on a restaurant page — because the
 * two disagreeing would mean a card promising a dish its own menu then hides.
 */
const categoryMatch = (key: string): Prisma.MenuItemWhereInput => ({
  OR: [{ category: { key } }, { categoryId: null, section: { category: { key } } }],
});

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
