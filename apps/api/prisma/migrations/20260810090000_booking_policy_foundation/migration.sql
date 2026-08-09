-- Table booking becomes something a restaurant can configure.
--
-- Until now every rule was a constant in `packages/shared`: a 90-minute
-- seating, a 10-minute grid, 2000֏ a head, 30 days ahead, 12 guests at most —
-- the same numbers for a wine bar with four tables and a hall that seats a
-- hundred, and changeable by nobody but a deploy. This migration puts the
-- numbers where the people who live by them can reach them, and adds the two
-- things a booking calendar cannot work without: hours it may offer, and days
-- it may not.
--
-- **Nothing here changes a single answer today.** Every column added is
-- nullable and every NULL means "inherit", so a database that has just run this
-- resolves to exactly the constants it resolved to before. The behaviour moves
-- only when somebody fills a field in. That is the property the whole of stage
-- one is written to preserve, and the existing test suite is what proves it.

-- ── The exception kinds ─────────────────────────────────────────────────────

CREATE TYPE "ClosureKind" AS ENUM ('closed', 'custom_hours');

-- ── Booking policy: one row per restaurant, or per branch ───────────────────
--
-- Two nullable owners and a CHECK that exactly one is set, rather than two
-- tables with identical columns. The same shape `payments` already uses to
-- settle either an order or a reservation, and for the same reason: the columns
-- are the columns, and duplicating them would mean every future field is added
-- twice and the resolver has to know which table it is reading.

CREATE TABLE "booking_policies" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID,
    "branch_id" UUID,

    -- Every one of these is NULL by default, and NULL is not "off" — it is
    -- "ask the level above". The resolution order is branch, then restaurant,
    -- then the platform constant, and it happens in exactly one function
    -- (`resolveBookingPolicy` in @amragrir/shared) so that the API, the back
    -- office and the tests cannot come to three different conclusions.
    "seating_minutes" SMALLINT,
    "slot_minutes" SMALLINT,
    "max_guests" SMALLINT,
    "max_lead_days" SMALLINT,
    "min_lead_minutes" SMALLINT,
    "deposit_per_guest_amd" INTEGER,
    "free_cancel_hours" SMALLINT,
    "auto_confirm" BOOLEAN,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_policies_pkey" PRIMARY KEY ("id")
);

-- A policy belongs to a restaurant or to a branch, never to both and never to
-- neither. Without this the table would admit an orphan row that no resolution
-- path can ever read, and a row belonging to both, which would be two
-- inheritance levels claiming the same values.
ALTER TABLE "booking_policies"
    ADD CONSTRAINT "booking_policies_one_owner"
    CHECK (("restaurant_id" IS NULL) <> ("branch_id" IS NULL));

-- One policy per owner. This is also what makes the lazy row safe: an upsert
-- keyed on the owner cannot race itself into two rows.
CREATE UNIQUE INDEX "booking_policies_restaurant_id_key" ON "booking_policies" ("restaurant_id");
CREATE UNIQUE INDEX "booking_policies_branch_id_key" ON "booking_policies" ("branch_id");

ALTER TABLE "booking_policies"
    ADD CONSTRAINT "booking_policies_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_policies"
    ADD CONSTRAINT "booking_policies_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── When bookings are taken, as opposed to when food is served ──────────────

ALTER TABLE "restaurant_branches"
    -- NULL means "whenever we are open", which is what every branch means until
    -- it says otherwise. The column exists because the two are genuinely
    -- different questions: a kitchen serving from 10:00 that only books its
    -- dining room for dinner previously had to misstate its opening hours to
    -- express that, and those hours are on the public card.
    ADD COLUMN "booking_hours" JSONB;

-- ── Days that are not like the others ───────────────────────────────────────

CREATE TABLE "branch_closures" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    -- DATE, not a timestamp. A day off is a day off in Yerevan; giving it an
    -- instant would invite a timezone into a value that has none.
    "date" DATE NOT NULL,
    "kind" "ClosureKind" NOT NULL,
    -- Minutes from local midnight. `closes_minutes` is allowed past 1440, which
    -- is how a night ending after midnight is written.
    "opens_minutes" SMALLINT,
    "closes_minutes" SMALLINT,
    "reason" VARCHAR(200),
    "created_by_staff_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_closures_pkey" PRIMARY KEY ("id")
);

-- Hours belong to `custom_hours` and to nothing else. A `closed` row carrying
-- times would read, to anyone opening the table by hand, as a day that is open
-- — and the next person to write the resolution would believe it.
ALTER TABLE "branch_closures"
    ADD CONSTRAINT "branch_closures_hours_match_kind"
    CHECK (
        ("kind" = 'closed' AND "opens_minutes" IS NULL AND "closes_minutes" IS NULL)
        OR
        ("kind" = 'custom_hours' AND "opens_minutes" IS NOT NULL AND "closes_minutes" IS NOT NULL)
    );

-- One answer per day. A branch both shut and on short hours the same date is
-- two people having edited it, and the second edit replaces the first rather
-- than sitting beside it where only the query plan decides which wins.
CREATE UNIQUE INDEX "branch_closures_branch_id_date_key" ON "branch_closures" ("branch_id", "date");

ALTER TABLE "branch_closures"
    ADD CONSTRAINT "branch_closures_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── A table number names one table ──────────────────────────────────────────
--
-- Checked before the constraint is added, so a database that already holds
-- duplicates fails with a sentence rather than with `23505` and a list of
-- column names. There is no way to guess which of two tables numbered 5 is the
-- one on the terrace, so this refuses to guess.

DO $$
DECLARE
    offending TEXT;
BEGIN
    SELECT string_agg(DISTINCT "branch_id"::TEXT || ' #' || "table_no", ', ')
      INTO offending
      FROM (
          SELECT "branch_id", "table_no"
            FROM "tables"
        GROUP BY "branch_id", "table_no"
          HAVING count(*) > 1
      ) AS duplicates;

    IF offending IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot number tables uniquely: these branch/table pairs appear more than once (%). Renumber or deactivate the duplicates, then run this migration again.',
            offending;
    END IF;
END $$;

CREATE UNIQUE INDEX "tables_branch_id_table_no_key" ON "tables" ("branch_id", "table_no");

-- ── What a booking was promised, as opposed to what the branch offers now ───

ALTER TABLE "reservations"
    -- The seating length this booking was made under, snapshotted exactly as
    -- `orders.prep_min` snapshots the prep estimate an order was priced
    -- against. A branch that lengthens its seating has changed what it offers;
    -- it has not changed what it already promised somebody for Friday.
    --
    -- This is also what keeps that change *safe*. Read live, a longer seating
    -- would stretch every accepted booking backwards in time, and two that sat
    -- comfortably an hour apart would start overlapping on one table — an
    -- overlap nothing would catch, because the unique index guards the start
    -- instant and the serializable transaction that checks intervals committed
    -- weeks ago.
    --
    -- NULL on existing rows and left that way. Nothing recorded this for them,
    -- and a backfill would be inventing a fact; readers fall back to the
    -- resolved policy, which is precisely what they did before this column.
    ADD COLUMN "seating_minutes" SMALLINT;
