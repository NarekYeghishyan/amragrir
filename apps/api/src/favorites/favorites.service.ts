import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface FavoriteRestaurant {
  restaurantId: string;
  /** Branch id, so the card links straight to a page that can be ordered from. */
  branchId: string | null;
  slug: string;
  name: string;
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

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<{ items: FavoriteRestaurant[] }> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        restaurant: {
          include: {
            // The favourites screen renders restaurant cards, which need the
            // branch fields (hours, prep time). Oldest branch, matching how
            // the catalog resolves a restaurant id.
            branches: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1 },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      items: rows.map((row) => {
        const branch = row.restaurant.branches[0];
        return {
          restaurantId: row.restaurant.id,
          branchId: branch?.id ?? null,
          slug: row.restaurant.slug,
          name: row.restaurant.name,
          cuisine: row.restaurant.cuisine,
          priceLevel: row.restaurant.priceLevel,
          rating: Number(row.restaurant.ratingAvg),
          reviewsCount: row.restaurant.reviewsCount,
          coverUrl: row.restaurant.coverUrl,
          prepMin: branch?.avgPrepMin ?? null,
          isOpen: branch?.isOpen ?? false,
          services: row.restaurant.services,
          addedAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  /**
   * Adds a favourite.
   *
   * Idempotent by design: favouriting something already favourited is what a
   * double tap does, and it is not an error worth showing anyone.
   */
  async add(userId: string, restaurantId: string): Promise<{ favorited: true }> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    try {
      await this.prisma.favorite.create({ data: { userId, restaurantId } });
    } catch (err) {
      // The (user, restaurant) unique index fired — already a favourite.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
    }
    return { favorited: true };
  }

  /** Also idempotent: removing something that is not there leaves the caller
   *  in the state they asked for. */
  async remove(userId: string, restaurantId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, restaurantId } });
  }

  /** Restaurant ids the user has favourited, for marking hearts in a list. */
  async idsFor(userId: string): Promise<string[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { restaurantId: true },
    });
    return rows.map((row) => row.restaurantId);
  }
}
