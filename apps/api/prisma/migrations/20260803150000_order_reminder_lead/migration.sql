-- The notice a branch gives itself on a pre-order, and the shift's ability to
-- change it.
--
-- `reminder_at` was arithmetic nobody could see or move: ready time, less the
-- prep estimate, less a constant. That is a reasonable default and a poor rule.
-- The estimate is the slowest dish on the menu, and the person working the pass
-- knows things it does not — a skewer wants the coals lit before it wants
-- cooking, and forty-five minutes of notice on a thirty-minute dish is a
-- judgement, not an error.
--
-- So the lead becomes a column. `reminder_at` stays as it was, still the single
-- flag for "this is a pre-order" and still what the board and the job read; what
-- changes is that it is now derived from a number somebody can name and set.

-- AlterTable
ALTER TABLE "orders"
    -- Minutes before `ready_at`, not before `prep_start_at`. It is the number a
    -- person reads back — "warn me forty minutes before it is due" — and the
    -- alternative describes the same instant in a way nobody can hold in their
    -- head.
    --
    -- NULL exactly when `reminder_at` is NULL: they are written together and
    -- cleared together, because a lead with nothing to lead means nothing and a
    -- reminder with no lead could not be explained.
    ADD COLUMN "reminder_lead_min" SMALLINT;

-- Backfill, so the pair above holds for every row that already has a reminder.
-- These orders were scheduled by the old arithmetic, and this states what that
-- arithmetic came to for each of them rather than assuming today's constant —
-- the two agree now, and a row is a record of what was decided, not of what the
-- rule happens to say later.
UPDATE "orders"
SET "reminder_lead_min" = ROUND(EXTRACT(EPOCH FROM ("ready_at" - "reminder_at")) / 60)
WHERE "reminder_at" IS NOT NULL
  AND "ready_at" IS NOT NULL;

-- A shift changing that notice is the one thing about a pre-order somebody can
-- alter after it is placed, and `reminder_lead_min` is overwritten in place — so
-- without an entry of its own there would be no record that it ever moved, or of
-- who moved it. Not a status change: the order stays where it is and the food is
-- still promised for the same minute.
-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'reminder_set';
