-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(6);

-- A partial index, hand-written for the reason the one on `orders` is: the rows
-- the sweep wants are a vanishing fraction of the table — bookings still ahead
-- and not yet reminded — and an index over the whole of `reservations` would be
-- scanned past on every pass. Partial indexes have no schema.prisma spelling.
-- CreateIndex
CREATE INDEX "reservations_reminder_due_idx" ON "reservations"("reserved_for")
    WHERE "reminder_sent_at" IS NULL;
