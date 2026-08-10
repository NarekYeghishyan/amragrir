-- Which day's book a booking belongs on.
--
-- The staff book filtered on `reserved_for` between local midnight and local
-- midnight — the calendar day. For every branch that shuts before midnight
-- that is the right answer and this column changes nothing. For a branch open
-- 12:00–02:00 it is the wrong one, and wrong in the way that costs a table:
-- 00:30 is offered as the last start of *Tuesday's* evening, `assertBookable`
-- gates it against Tuesday's hours, and the instant's own calendar date is
-- Wednesday. Those guests landed on Wednesday's page — where the shift still
-- working at 00:30 on Tuesday night never looked, and where they sat above a
-- service that had not opened.
--
-- Stored rather than derived at read time, for the reason `seating_minutes`
-- and `free_cancel_hours` are stored: the answer comes from the hours in force
-- when the booking was taken. A branch that shortens its night next month has
-- changed what it offers from then on; it has not moved guests already in the
-- book to a different day. Derivation would also need the branch's hours in
-- every query that lists bookings, and could not answer at all for a list that
-- spans branches with different nights.
--
-- Backfilled to the local calendar date, which is exact rather than an
-- approximation: until the migration before this one, a window whose closing
-- time was less than its opening time produced a slot loop whose body never
-- ran, so no booking on this platform has ever been taken past midnight. Every
-- existing row's service day *is* its calendar day.

ALTER TABLE "reservations" ADD COLUMN "service_date" DATE;

-- Yerevan is UTC+4 with no DST. `Etc/GMT-4` is the POSIX-signed spelling of
-- that offset — the sign reads backwards, and `Etc/GMT+4` would be UTC-4.
UPDATE "reservations"
SET "service_date" = ("reserved_for" AT TIME ZONE 'Etc/GMT-4')::date
WHERE "service_date" IS NULL;

-- NOT NULL rather than nullable-with-a-fallback: a row with no service date
-- would vanish from every day's book rather than merely be filed oddly, which
-- is a worse failure than the one being fixed.
ALTER TABLE "reservations" ALTER COLUMN "service_date" SET NOT NULL;

-- The book asks one question — this branch, this service day — so it gets its
-- own index. `reservations_branch_id_reserved_for_idx` stays: availability asks
-- for an interval around a slot, which a date column cannot answer.
CREATE INDEX "reservations_branch_id_service_date_idx"
  ON "reservations" ("branch_id", "service_date");
