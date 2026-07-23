-- What a coupon took off an order, and which coupon did it. Stored rather than
-- recomputed at read time: a referral coupon's percentage grows as more friends
-- join, and a past order must keep saying what was actually charged.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "coupon_id" UUID,
ADD COLUMN     "discount_amd" INTEGER NOT NULL DEFAULT 0;

-- Unique per user rather than globally: a referral reward is a personal
-- coupon, so two people may well hold the same friendly code.
-- CreateIndex
CREATE UNIQUE INDEX "coupons_user_id_code_key" ON "coupons"("user_id", "code");

-- SET NULL, not CASCADE: deleting a coupon must never delete the order that
-- used it.
-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
