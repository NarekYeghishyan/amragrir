-- A payment now settles either an order (food) or a reservation (a table
-- deposit). Both columns are nullable so one row type serves both; the CHECK
-- at the bottom is what stops a payment belonging to neither or to both.
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reservation_id" UUID,
ALTER COLUMN "order_id" DROP NOT NULL;

-- Mirrors reserved_for while a booking holds its table, NULL once it does not.
-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "active_slot" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "payments_reservation_id_key" ON "payments"("reservation_id");

-- One live booking per table per start time. Keyed on active_slot rather than
-- reserved_for because Postgres treats NULLs in a unique index as distinct:
-- cancelling a booking clears active_slot and frees the slot, where a
-- constraint on reserved_for would have blocked it forever.
-- CreateIndex
CREATE UNIQUE INDEX "reservations_table_id_active_slot_key" ON "reservations"("table_id", "active_slot");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one target. Prisma cannot express this, so it lives here: without
-- it, "nullable order_id" would quietly permit an orphan payment that no
-- reconciliation could attribute to anything.
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_target"
  CHECK (("order_id" IS NULL) <> ("reservation_id" IS NULL));

-- Backfill: every existing reservation predates this column, and any that is
-- still live must hold its slot.
UPDATE "reservations"
   SET "active_slot" = "reserved_for"
 WHERE "status" IN ('pending', 'confirmed', 'seated');
