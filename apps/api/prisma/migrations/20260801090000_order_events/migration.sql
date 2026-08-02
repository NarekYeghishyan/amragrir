-- An order's history, written as it happens.
--
-- `orders.status` is a single column: every update overwrites the answer to
-- "when did this become ready, and who made it so". That question is asked
-- constantly — by a counter reconciling a disputed pickup, by support asking why
-- an order sat unpaid for twenty minutes — and until now nothing in the database
-- could answer it.
--
-- Deliberately not `audit_log`. That table's actor is a `staff_users` row, and
-- most of what happens to an order is done by the customer who placed it or by
-- the payment provider; every one of those rows would carry a NULL actor, which
-- is exactly what this table exists to avoid.

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('created', 'status_changed', 'payment');

-- CreateEnum
CREATE TYPE "OrderActorType" AS ENUM ('customer', 'staff', 'system');

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "OrderEventType" NOT NULL,
    -- Null for `created` (nothing preceded it) and for `payment`, which records
    -- an attempt that moved the order nowhere.
    "from_status" "OrderStatus",
    "to_status" "OrderStatus",
    "actor_type" "OrderActorType" NOT NULL,
    "actor_user_id" UUID,
    "actor_staff_id" UUID,
    -- The real human behind an impersonated session. Null in the ordinary case;
    -- without it the timeline would name the account that was being acted as
    -- rather than the person acting.
    "acting_staff_id" UUID,
    -- Per-type extras (payment method, what happened to the money). Read only
    -- for display, so a new kind of detail is not a migration.
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- The timeline is always read for one order, oldest first.
-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- The order owns its history: deleting one takes its events with it.
-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The actors do not. An entry outlives the account that made it, minus the
-- name — losing who is better than losing that it happened.
-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_staff_id_fkey" FOREIGN KEY ("actor_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_acting_staff_id_fkey" FOREIGN KEY ("acting_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every order that already exists gets the one entry the database can still
-- prove: it was created, at `orders.created_at`, by the customer whose order it
-- is. Everything that happened to it afterwards is genuinely unrecoverable —
-- backfilling a guessed status change would put a fiction in an audit trail —
-- so the timeline for those orders starts there and says nothing it cannot
-- support.
INSERT INTO "order_events" ("id", "order_id", "type", "to_status", "actor_type", "actor_user_id", "detail", "created_at")
SELECT
    gen_random_uuid(),
    "id",
    'created',
    'created',
    'customer',
    "user_id",
    jsonb_build_object('backfilled', true, 'serviceMode', "service_mode", 'totalAmd', "total_amd"),
    "created_at"
FROM "orders";
