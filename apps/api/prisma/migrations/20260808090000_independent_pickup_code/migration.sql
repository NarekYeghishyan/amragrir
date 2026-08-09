-- The pickup code stops being the tail of the order number.
--
-- It was the last four digits of `orders.code` — derived in the API, never
-- stored, on the argument that two stored identifiers can come to disagree.
-- True, and beside the point: the order number is printed on the ticket, read
-- out over the phone and scanned off the board, so every place it appears was a
-- place the collection code leaked with it. `AMR-24919119` told you `9119`, and
-- `9119` was all the counter ever asked for.
--
-- So the code is drawn independently now, stored here, and the counter cannot
-- close an order without being told it. Six digits rather than four, because
-- this column is unique across the whole table rather than per branch (see
-- below) and four would run out.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "pickup_code" VARCHAR(6);

-- Every order that already exists gets one, finished ones included.
--
-- Including history is deliberate. The column is NOT NULL and the verification
-- reads it directly, so a row without a code would be a row the counter can
-- never close — and a completed order still has to be able to answer "which
-- order is this" from the same field as every other row, or the panel needs a
-- second code path for old data and the two will drift.
--
-- The assignment is a genuine shuffle: the whole code space is materialised,
-- put in random order, and dealt out to rows that are themselves in random
-- order. Unique by construction, because each side is a `row_number()` over a
-- distinct set and the join pairs them one-to-one.
--
-- **Not an arithmetic trick.** The obvious cheap version is
-- `(base + n * stride) mod 1000000` for some stride coprime with the space,
-- which is a bijection and therefore looks correct. It is not: the codes it
-- produces are an arithmetic progression, so on a table of a few hundred rows
-- they land in a narrow band, and — worse — anybody holding two of them can
-- recover the stride and enumerate the rest. These are collection codes. They
-- have to be as unguessable as the ones `generatePickupCode` draws.
--
-- A million-row sort costs a second or two, once, which is the right price.
-- It also gives the ceiling its natural enforcement: with more than 1,000,000
-- orders the pool runs out, rows keep a NULL `pickup_code`, and the NOT NULL
-- below fails the migration rather than letting a code be shared.
--
-- Live orders are in here too, which means a guest holding a screen that still
-- shows the old four digits will be refused at the counter. That is the cost of
-- the change and it is a few hours wide: the tracking screen re-reads the order,
-- and the new code is on it.
WITH pool AS (
  SELECT lpad(g::text, 6, '0') AS code, row_number() OVER (ORDER BY random()) AS n
  FROM generate_series(0, 999999) AS g
), numbered AS (
  SELECT id, row_number() OVER (ORDER BY random()) AS n FROM "orders"
)
UPDATE "orders" o
SET "pickup_code" = pool.code
FROM numbered JOIN pool USING (n)
WHERE o.id = numbered.id;

ALTER TABLE "orders" ALTER COLUMN "pickup_code" SET NOT NULL;

-- Unique across the table rather than per branch.
--
-- The code is only ever checked against the one order somebody is standing in
-- front of, so per-branch uniqueness would be enough to make the check correct.
-- Global uniqueness buys something else: a mistyped code cannot quietly be a
-- *different* live order's, at this branch or any other, so "wrong code" is
-- always the answer rather than sometimes being "somebody else's order".
--
-- The price is a ceiling of 1,000,000 orders for the lifetime of the platform.
-- Past it this index refuses the insert and order creation starts failing —
-- loudly, which is the point; the alternative is silently reusing a code that
-- is somebody's proof of purchase. The two ways out are widening the column or
-- scoping uniqueness to the branch, and both are decisions rather than
-- accidents. DATABASE.md §5 carries this note as well.
CREATE UNIQUE INDEX "orders_pickup_code_key" ON "orders"("pickup_code");
