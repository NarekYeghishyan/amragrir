-- Who administers a restaurant is now a `staff_assignments` row, not a column.
--
-- `restaurants.owner_id` pointed at a `users` row with `role = 'owner'`. Those
-- roles are gone: a restaurant is administered by whoever holds
-- `restaurant_admin` over it, which is a set rather than a single id — that is
-- what makes two administrators, or a handover, expressible at all.
--
-- The column is made nullable rather than dropped. It is the only record of the
-- original owner for restaurants whose owner had no email address and so could
-- not be carried into `staff_users` by the previous migration; dropping it would
-- destroy the evidence needed to invite the right person.

-- DropForeignKey then re-add as nullable, so an owner account can be deleted
-- without taking the restaurant with it.
ALTER TABLE "restaurants" ALTER COLUMN "owner_id" DROP NOT NULL;
