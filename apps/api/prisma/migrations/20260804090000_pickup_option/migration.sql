-- What a guest does with a pickup order: takes it away, or eats it here.
--
-- A sub-mode, not a mode. The order is `pickup` either way and is still released
-- by its pickup code; what this adds is where the food ends up, which the
-- kitchen needs before it plates anything — a bag and a plate are not the same
-- order to prepare, and asking at the counter is asking too late.
--
-- Eating in is only offered by a restaurant that declared `eat_in` in
-- `restaurants.services`, where it cannot coexist with `dinein` (see
-- BUSINESS_LOGIC.md §2). That half is enforced in the API, against the same rule
-- the back office disables its switches with.

-- CreateEnum
CREATE TYPE "PickupOption" AS ENUM ('take_away', 'eat_in');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "pickup_option" "PickupOption";

-- Every pickup order placed before today was taken away, because that was the
-- only thing on offer: no restaurant could declare `eat_in` until the column it
-- lives in learned the value. So this is not a guess standing in for missing
-- history — it is what happened.
--
-- Dine-in rows are left NULL, which is what the constraint below then holds
-- them to.
UPDATE "orders" SET "pickup_option" = 'take_away' WHERE "service_mode" = 'pickup';

-- Exactly the pickup orders have one.
--
-- A CHECK rather than NOT NULL, because the column is required for one value of
-- `service_mode` and forbidden for the other — a dine-in order has a table
-- instead, and "took it away from a table it is sitting at" is not a state worth
-- being able to store. Written as an equality between two booleans so it says
-- the whole rule in one line rather than as two overlapping ones.
--
-- Not expressible in schema.prisma, which has no CHECK support; DATABASE.md §5
-- is where it is written down for a reader.
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_option_matches_service_mode"
    CHECK (("service_mode" = 'pickup') = ("pickup_option" IS NOT NULL));
