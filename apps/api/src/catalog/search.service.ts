import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Language, SPEND_ITEMS_PER_PERSON } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { distanceKm, roundKm } from './geo';
import { SearchQueryDto } from './dto';

/** Bounded so a one-letter query cannot ask for the whole database. */
const RESTAURANT_LIMIT = 20;
const DISH_LIMIT = 20;

/**
 * Branch rows read to fill those 20 restaurant results.
 *
 * Restaurants are matched by name and cuisine — both restaurant columns — so
 * every branch of a match qualifies, and taking 20 branches could return one
 * chain twenty times. Read a wider window and collapse it below.
 */
const RESTAURANT_CANDIDATES = 200;

/**
 * Popular searches for the empty search screen.
 *
 * Static and hardcoded, deliberately: deriving them needs query logging that
 * does not exist yet, and inventing a table that nothing writes to would look
 * like a feature while returning nothing. These are the design's own tags.
 * Replace with a real ranking once searches are recorded.
 */
const POPULAR_TAGS = [
  'Lunch deals',
  'Sushi',
  'Poke bowls',
  'Ramen',
  'Cold brew',
  'Vegan',
] as const;

export interface SearchRestaurant {
  id: string;
  restaurantId: string;
  slug: string;
  name: string;
  cuisine: string | null;
  rating: number;
  reviewsCount: number;
  priceLevel: number | null;
  coverUrl: string | null;
  prepMin: number | null;
  isOpen: boolean;
  distanceKm: number | null;
}

export interface SearchDish {
  id: string;
  name: string;
  priceAmd: number;
  photoUrl: string | null;
  branchId: string;
  restaurantName: string;
  restaurantSlug: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One query across restaurants and dishes.
   *
   * Two result lists rather than one blended one: "Sushi" is both a cuisine
   * and a dish, and a guest looking for a place to eat wants different rows
   * from one looking for a specific plate. The client shows them as sections.
   */
  async search(
    query: SearchQueryDto,
    language: Language,
  ): Promise<{ restaurants: SearchRestaurant[]; dishes: SearchDish[]; query: string }> {
    const q = query.q.trim();
    if (q.length === 0) {
      return { restaurants: [], dishes: [], query: q };
    }

    const origin =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : null;

    const [branches, dishes] = await Promise.all([
      this.searchRestaurants(q, origin),
      this.searchDishes(q, language),
    ]);

    return { restaurants: branches, dishes, query: q };
  }

  popular(): { tags: string[] } {
    return { tags: [...POPULAR_TAGS] };
  }

  private async searchRestaurants(
    q: string,
    origin: { lat: number; lng: number } | null,
  ): Promise<SearchRestaurant[]> {
    const rows = await this.prisma.restaurantBranch.findMany({
      where: {
        restaurant: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { cuisine: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      include: { restaurant: true },
      orderBy: [
        { restaurant: { ratingAvg: 'desc' } },
        { restaurant: { reviewsCount: 'desc' } },
        // A chain's branches share one rating, so without this the tied rows
        // come back in no particular order and the branch kept below would be
        // whichever the database happened to yield. Oldest-first is how
        // `/restaurants/{slug}` picks a branch too, so the result row and the
        // page it opens describe the same address.
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: RESTAURANT_CANDIDATES,
    });

    // One row per restaurant: a searcher looking for "green" wants Green Bean
    // once, not once per branch — five identical cards that all open the same
    // page, crowding out the other matches.
    const seen = new Set<string>();
    const unique = rows
      .filter((row) => {
        if (seen.has(row.restaurantId)) {
          return false;
        }
        seen.add(row.restaurantId);
        return true;
      })
      .slice(0, RESTAURANT_LIMIT);

    return unique.map((row) => {
      const exact =
        origin && row.lat !== null && row.lng !== null
          ? distanceKm(origin, { lat: Number(row.lat), lng: Number(row.lng) })
          : null;

      return {
        id: row.id,
        restaurantId: row.restaurant.id,
        slug: row.restaurant.slug,
        name: row.restaurant.name,
        cuisine: row.restaurant.cuisine,
        rating: Number(row.restaurant.ratingAvg),
        reviewsCount: row.restaurant.reviewsCount,
        priceLevel: row.restaurant.priceLevel,
        // A result row is a branch (`id` above), so it wears that branch's
        // photograph — its own, or the business's when it has none.
        coverUrl: row.coverUrl ?? row.restaurant.coverUrl,
        prepMin: row.avgPrepMin,
        isOpen: row.isOpen,
        distanceKm: exact === null ? null : roundKm(exact),
      };
    });
  }

  /**
   * Dishes matching the query in **any** language.
   *
   * `name_i18n` is a JSON blob, so this searches the serialised text rather
   * than one language's key: someone typing "Burger" on a Russian phone should
   * still find «Бургер»'s row, and which key holds the match is not the
   * guest's problem.
   */
  private async searchDishes(q: string, language: Language): Promise<SearchDish[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name_i18n: Prisma.JsonValue; price_amd: number; photo_url: string | null; branch_id: string; restaurant_name: string; slug: string }[]
    >`
      SELECT m.id, m.name_i18n, m.price_amd, m.photo_url, m.branch_id,
             r.name AS restaurant_name, r.slug
        FROM menu_items m
        JOIN restaurant_branches b ON b.id = m.branch_id
        JOIN restaurants r ON r.id = b.restaurant_id
       WHERE m.is_available = true
         AND m.name_i18n::text ILIKE ${`%${q}%`}
       ORDER BY m.price_amd ASC
       LIMIT ${DISH_LIMIT}
    `;

    return rows.map((row) => ({
      id: row.id,
      name: localize(row.name_i18n as I18nField, language),
      priceAmd: row.price_amd,
      photoUrl: row.photo_url,
      branchId: row.branch_id,
      restaurantName: row.restaurant_name,
      restaurantSlug: row.slug,
    }));
  }

  /**
   * Branch ids whose typical spend **per person** falls in a range.
   *
   * The design's "price per person" filter has no backing column, and adding
   * one would mean a denormalised figure that every menu edit has to keep in
   * step. So it is derived: the average price of a branch's available dishes,
   * times `SPEND_ITEMS_PER_PERSON` — a person orders a main and something with
   * it. An approximation, and documented as one.
   *
   * **The multiplier is the fix, not a decoration.** Without it this compared a
   * per-person budget against one dish's average, which is a different quantity
   * — dragged down by the drinks and the sides. Every branch on the platform sat
   * between 1 480 and 3 900֏ by that measure while the design drew the slider
   * from 4 000, so the filter matched everything or nothing wherever it was put,
   * and it was left unbuilt for that reason.
   *
   * **A branch with nothing available is excluded, deliberately.** It has no
   * typical spend to compare against, and "places where a meal costs up to X"
   * is not a question an empty menu answers. Clients say "no limit" by sending
   * no bound rather than by sending a large one — see `spendFromSlider` on the
   * phone — so this never costs a guest a restaurant they could have eaten at.
   */
  async branchIdsInPriceRange(min?: number, max?: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ branch_id: string }[]>`
      SELECT branch_id
        FROM menu_items
       WHERE is_available = true
       GROUP BY branch_id
      HAVING AVG(price_amd) * ${SPEND_ITEMS_PER_PERSON} >= ${min ?? 0}
         AND AVG(price_amd) * ${SPEND_ITEMS_PER_PERSON} <= ${max ?? Number.MAX_SAFE_INTEGER}
    `;
    return rows.map((row) => row.branch_id);
  }
}
