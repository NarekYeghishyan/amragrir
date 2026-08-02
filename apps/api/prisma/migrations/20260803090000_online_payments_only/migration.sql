-- Cash is no longer a way to pay for an order.
--
-- An order used to be placeable without paying for it: `PaymentsService.pay`
-- recorded a `cash` payment as `pending`, moved the order to `paid` anyway so
-- the kitchen would see it, and left the money to be handed over at the
-- counter. Nothing in this database ever settled those rows — there was no
-- endpoint that turned a pending cash payment into a captured one — so "paid"
-- and "actually paid for" were two different facts wearing the same word.
-- Every method is online now, and an order reaches the kitchen only once the
-- charge has gone through.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt.
--
-- **The rewrite below cannot preserve the truth about existing rows.** A cash
-- payment becomes `card`, which is a statement about how it was taken that is
-- not true. What survives is `provider_ref = 'legacy_cash'`: cash rows are
-- exactly the rows with no provider reference (nothing was charged), so this
-- marks them before the method itself becomes unreadable, and a query for them
-- later is `provider_ref = 'legacy_cash'`.
--
-- This is written for a development database, whose data is seeded and
-- disposable. **A live database needs a decision before this runs** — those
-- orders were either settled at a counter or never paid for, and only the
-- restaurant knows which. Deciding that here, in SQL, would be inventing
-- revenue.

UPDATE "payments"
SET "provider_ref" = 'legacy_cash'
WHERE "method" = 'cash' AND "provider_ref" IS NULL;

ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";

CREATE TYPE "PaymentMethod" AS ENUM ('apple_pay', 'google_pay', 'card');

ALTER TABLE "payments"
  ALTER COLUMN "method" TYPE "PaymentMethod"
  USING (CASE WHEN "method"::text = 'cash' THEN 'card' ELSE "method"::text END)::"PaymentMethod";

DROP TYPE "PaymentMethod_old";
