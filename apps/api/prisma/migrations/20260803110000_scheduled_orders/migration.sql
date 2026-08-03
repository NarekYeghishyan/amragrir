-- Pre-orders: an order placed hours or days before it is wanted, and the
-- reminder that stops the branch finding out about it too late.
--
-- The API already accepted a `ready_at` up to `ORDER_MAX_LEAD_DAYS` ahead, so
-- these orders could always be placed. Nothing downstream knew they were
-- different: the kitchen board sorts oldest-first, which pinned an order placed
-- today for next Tuesday above the work somebody was actually doing, and no
-- mechanism existed to tell anyone when it needed cooking.
--
-- Four columns on `orders`, all nullable, all NULL for the rows already there.
-- That is the honest state for them: nothing recorded a prep estimate at the
-- time, and every one of them is finished, so none needs a reminder or a place
-- on a board.

-- AlterTable
ALTER TABLE "orders"
    -- The prep estimate the order was scheduled against, in minutes. A snapshot,
    -- like `order_items.unit_price_amd`: a dish's `prep_min` may change, and an
    -- order has to keep saying what it was promised against.
    ADD COLUMN "prep_min" SMALLINT,
    -- When the kitchen must start: `ready_at` - `prep_min`. Stored because it is
    -- what the board sorts on, and a key computed per row is a sort the database
    -- cannot do.
    ADD COLUMN "prep_start_at" TIMESTAMPTZ(6),
    -- When to warn the branch: `prep_start_at` - PREP_REMINDER_BUFFER_MIN.
    --
    -- NULL means "as soon as possible", and that is the entire distinction
    -- between a pre-order and an ordinary one. Nothing needs reminding about an
    -- order that is already the kitchen's problem, so the column scheduling the
    -- reminder is also the flag for having been scheduled at all.
    ADD COLUMN "reminder_at" TIMESTAMPTZ(6),
    -- Only ever read to stop the job sending twice. Which stage an order belongs
    -- to is decided by `reminder_at` against the clock, never by this — so an
    -- order still reaches the board on time in a deployment where the job is
    -- not running.
    ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(6);

-- One branch's queue, split on "is this due yet" and ordered by when it has to
-- be started.
-- CreateIndex
CREATE INDEX "orders_branch_id_reminder_at_prep_start_at_idx" ON "orders"("branch_id", "reminder_at", "prep_start_at");

-- What the reminder job scans, every minute, across every branch. Partial on
-- purpose and therefore not expressible in schema.prisma: the rows it wants are
-- a vanishing fraction of the table — pre-orders, not yet announced — and an
-- index over the whole of `orders` would be scanned past on every pass.
-- CreateIndex
CREATE INDEX "orders_reminder_due_idx" ON "orders"("reminder_at")
    WHERE "reminder_at" IS NOT NULL AND "reminder_sent_at" IS NULL;

-- CreateEnum
CREATE TYPE "StaffNotificationType" AS ENUM ('prep_due');

-- Something a branch needs telling about, addressed to the branch and not to a
-- person.
--
-- Not a staff copy of `notifications`: that table is one customer's inbox and
-- has a `user_id`. A shift is not a person — whoever is holding the tablet needs
-- to see the reminder, and which of the people assigned to the branch that is
-- changes hourly. Fanning one reminder into a row per assigned staff member
-- would make "who is on tonight" something the writer has to know, and would
-- leave it undeliverable to anyone assigned a minute later.
-- CreateTable
CREATE TABLE "staff_notifications" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "StaffNotificationType" NOT NULL,
    "order_id" UUID,
    -- The numbers the panel renders the line from — pickup code, when it is due,
    -- how long it takes. No prose: a job has no request to take a language from,
    -- so the panel translates, exactly as it already does for statuses and
    -- history entries.
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

-- One branch's bell, newest first.
-- CreateIndex
CREATE INDEX "staff_notifications_branch_id_created_at_idx" ON "staff_notifications"("branch_id", "created_at");

-- AddForeignKey
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A notification about an order that no longer exists has nothing left to say.
-- AddForeignKey
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- That one person has seen one notification.
--
-- A table rather than an `is_read` column, because the notification belongs to a
-- branch and being read is something a person does. A single flag would let the
-- first colleague to open the bell clear it for everybody else on the shift —
-- exactly the failure a kitchen notification exists to prevent.
-- CreateTable
CREATE TABLE "staff_notification_reads" (
    "notification_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notification_reads_pkey" PRIMARY KEY ("notification_id", "staff_user_id")
);

-- CreateIndex
CREATE INDEX "staff_notification_reads_staff_user_id_idx" ON "staff_notification_reads"("staff_user_id");

-- AddForeignKey
ALTER TABLE "staff_notification_reads" ADD CONSTRAINT "staff_notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "staff_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_notification_reads" ADD CONSTRAINT "staff_notification_reads_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
