/**
 * Gives every demo dish the picture for what it is, and every demo restaurant
 * the cover for what it is.
 *
 * Run on its own against a database that is already up:
 *
 *     pnpm --filter @amragrir/api db:photos
 *
 * The seed calls the same two functions, so a fresh database and a running one
 * end up saying the same thing. Neither re-seeds anything else — this touches
 * one column of `menu_items` and one of `restaurants`.
 *
 * **An uploaded picture is never overwritten.** Only rows with none at all, or
 * one this seed put there (see `isSeedPhoto` and `isSeedCover`), are rewritten:
 * the image a restaurant chose is the one thing in the table nobody else
 * picked, and a script that quietly replaced it with a stock photo of a burger
 * would be the worst thing in this directory.
 *
 * Idempotent — a second run finds nothing to do and says so.
 */
import { PrismaClient } from '@prisma/client';
import { isSeedPhoto, photoFor, usingLocalPhotos } from './menu-photos';
import { coverFor, isSeedCover } from './restaurant-covers';

/** The i18n column as the seed writes it. Only `en` is read here: the photo
 *  table is keyed by the English name, which is the one name every seeded dish
 *  has and the one that does not change between runs. */
interface NameI18n {
  en?: string;
}

export async function refreshSeedPhotos(prisma: PrismaClient): Promise<number> {
  const items = await prisma.menuItem.findMany({
    select: {
      id: true,
      nameI18n: true,
      photoUrl: true,
      category: { select: { key: true } },
    },
  });

  /** Grouped by the URL they are getting, so a table of several hundred dishes
   *  is a few dozen statements rather than one apiece. */
  const idsByPhoto = new Map<string, string[]>();
  for (const item of items) {
    if (!isSeedPhoto(item.photoUrl)) {
      continue;
    }
    const name = (item.nameI18n as NameI18n | null)?.en;
    const wanted = photoFor(name, item.category?.key);
    if (wanted === item.photoUrl) {
      continue; // already right
    }
    idsByPhoto.set(wanted, [...(idsByPhoto.get(wanted) ?? []), item.id]);
  }

  let changed = 0;
  for (const [photoUrl, ids] of idsByPhoto) {
    const { count } = await prisma.menuItem.updateMany({
      where: { id: { in: ids } },
      data: { photoUrl },
    });
    changed += count;
  }
  return changed;
}

/**
 * The same, for `restaurants.cover_url`.
 *
 * Separate from the dishes above because it answers a different question — a
 * dish is identified by its English name and a restaurant by its slug — but it
 * runs on the same terms: seed-planted or empty only, never an upload.
 */
export async function refreshSeedCovers(prisma: PrismaClient): Promise<number> {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, slug: true, cuisine: true, coverUrl: true },
  });

  const idsByCover = new Map<string, string[]>();
  for (const restaurant of restaurants) {
    if (!isSeedCover(restaurant.coverUrl)) {
      continue;
    }
    const wanted = coverFor(restaurant.slug, restaurant.cuisine);
    if (wanted === restaurant.coverUrl) {
      continue; // already right
    }
    idsByCover.set(wanted, [...(idsByCover.get(wanted) ?? []), restaurant.id]);
  }

  let changed = 0;
  for (const [coverUrl, ids] of idsByCover) {
    const { count } = await prisma.restaurant.updateMany({
      where: { id: { in: ids } },
      data: { coverUrl },
    });
    changed += count;
  }
  return changed;
}

/** Run directly (`db:photos`) rather than imported by the seed. */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const changed = await refreshSeedPhotos(prisma);
    const kept = await prisma.menuItem.count({ where: { photoUrl: null } });
    console.log(
      changed === 0
        ? 'Menu photos: every dish already has the right picture.'
        : `Menu photos: ${changed} dish(es) updated${usingLocalPhotos() ? ' (local placeholders)' : ''}.`,
    );
    // Should always be 0. Printed rather than assumed, because "every dish has
    // a picture" is the claim this script exists to make true.
    console.log(`Dishes still without a photograph: ${kept}`);

    const covers = await refreshSeedCovers(prisma);
    const coverless = await prisma.restaurant.count({ where: { coverUrl: null } });
    console.log(
      covers === 0
        ? 'Restaurant covers: every restaurant already has the right picture.'
        : `Restaurant covers: ${covers} restaurant(s) updated${usingLocalPhotos() ? ' (local placeholders)' : ''}.`,
    );
    console.log(`Restaurants still without a cover: ${coverless}`);
  } finally {
    await prisma.$disconnect();
  }
}

// `require.main` rather than a flag: importing this from the seed must not
// start a second client or exit the process.
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
