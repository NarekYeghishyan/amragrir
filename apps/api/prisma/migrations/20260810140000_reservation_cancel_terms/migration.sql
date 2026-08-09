-- A booking keeps the cancellation terms it was made under.
--
-- `deposit_amd` was already snapshotted; `free_cancel_hours` was read live from
-- the branch's policy. That is half a promise frozen and half of it floating:
-- the two together are one sentence — *this much money, returnable until then* —
-- and a branch moving its cancellation window from two hours to twenty-four
-- moved it for people who had already paid, changing the terms of an agreement
-- after the guest accepted them.
--
-- The same argument as `seating_minutes` in the previous migration, applied to
-- money rather than to time on a table: a policy change is an offer to whoever
-- books next, never an edit to what somebody already holds.
--
-- NULL on existing rows and left that way. Nothing recorded this for them, and
-- a backfill would be inventing a fact about a booking; readers fall back to the
-- resolved policy, which is exactly what decided those bookings at the time.

ALTER TABLE "reservations" ADD COLUMN "free_cancel_hours" SMALLINT;
