-- Deleting a user no longer refuses to delete a restaurant's owner.
--
-- Drift, not a new decision. `20260731100000_restaurant_admin_by_assignment`
-- made `restaurants.owner_id` nullable, because ownership moved to a staff
-- assignment and a restaurant no longer needs a user behind it. Prisma's
-- implied referential action follows the column: `Restrict` while it is
-- required, `SetNull` once it is optional. The schema has said `SetNull` since
-- that day; the database was still carrying the `ON DELETE RESTRICT` written by
-- the initial migration, because nothing generated the SQL to change it.
--
-- So a database built by `prisma migrate deploy` — CI, a colleague's machine,
-- production — disagreed with the schema every client is generated from:
-- deleting a user who owns a restaurant failed with a foreign key violation,
-- where `owner User?` promises the column is simply emptied. `prisma migrate
-- dev` generated this the first time it was run after the payments migration.
--
-- Nothing to back-fill: this changes what happens to a row on a *future*
-- delete, and no `owner_id` value is touched.

-- DropForeignKey
ALTER TABLE "restaurants" DROP CONSTRAINT "restaurants_owner_id_fkey";

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
