-- A favourite is a **branch**, not a business.
--
-- Everything else a customer touches in this product is already a branch: a card
-- on the feed is a branch, a basket is opened against a branch, a table is
-- booked at a branch. Favourites were the exception, and it showed — hearting
-- one address of a chain filled the heart on every other address of it, and the
-- Favourites list could not say which kitchen it meant. Nobody can act on "the
-- restaurant"; they act on the one on their street.

-- AlterTable
ALTER TABLE "favorites" ADD COLUMN "branch_id" UUID;

-- Every saved restaurant moves onto the branch that answered for it.
--
-- Oldest first (`created_at`, then `id`) — the same tie-break
-- `/restaurants/{slug}` and the grouped listing use, so the row a customer
-- saved becomes the branch whose card they were looking at and whose page the
-- heart opened.
UPDATE "favorites" f
SET "branch_id" = (
    SELECT b."id"
    FROM "restaurant_branches" b
    WHERE b."restaurant_id" = f."restaurant_id"
    ORDER BY b."created_at" ASC, b."id" ASC
    LIMIT 1
);

-- A restaurant with no branches has no address to have saved. The row named
-- something nobody could ever open — the favourites list itself drew it with a
-- null branch id and no opening state — so it goes rather than blocking the
-- NOT NULL below.
DELETE FROM "favorites" WHERE "branch_id" IS NULL;

-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_restaurant_id_fkey";

-- DropIndex
DROP INDEX "favorites_user_id_restaurant_id_key";

-- AlterTable
ALTER TABLE "favorites" DROP COLUMN "restaurant_id";
ALTER TABLE "favorites" ALTER COLUMN "branch_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
-- One heart per person per address. Two branches of one chain are two rows now,
-- which is the whole point.
CREATE UNIQUE INDEX "favorites_user_id_branch_id_key" ON "favorites"("user_id", "branch_id");
