-- A dining room stops needing a booking, and starts excluding one.
--
-- The rule this migrates to (BUSINESS_LOGIC.md §2): `dinein` and `reserve` are
-- two ways of seating somebody, and an address does one of them.
--
--   * `reserve` — the table is held in advance. Eating in is the booking flow:
--     a date, a slot, a table and a deposit against the bill. The order carries
--     a `reservationId` and runs in `dine_in` mode.
--   * `dinein` — the room seats whoever arrives. There is nothing to hold and
--     nothing to put a deposit on, so the guest pre-orders, pays for the food
--     like any pre-order, and eats it there off a plate. That is a `pickup`
--     order with `pickup_option = eat_in`; the only thing it tells the kitchen
--     is to plate rather than bag.
--
-- This reverses the direction of 20260805090000, which made `dinein` *require*
-- `reserve` — a rule that left a dining room without bookings unsayable, and
-- with it the commonest kind of place in this market: the one with tables and
-- no calendar.

-- Rows that declare both are now illegal. Fixed by dropping `dinein` and
-- keeping `reserve`, which is the behaviour-preserving direction: while both
-- were declared, `takesBookings` was already true, so `pickupOptionsFor`
-- already answered take-away alone and the eat-in button was already drawn
-- dead pointing at the calendar. A guest sees exactly what they saw yesterday.
--
-- Dropping `reserve` instead would have been the destructive choice — it would
-- take a restaurant's bookings off the app, cancel the path its deposits run
-- through, and silently change what every one of its dine-in orders means.
--
-- `array_remove` rather than a rewrite, so an unrelated service in the same
-- array — one this build has never heard of, which `canonicalServices`
-- deliberately keeps — survives untouched.
UPDATE "restaurants"
SET "services" = array_remove("services", 'dinein')
WHERE 'dinein' = ANY ("services") AND 'reserve' = ANY ("services");

UPDATE "restaurant_branches"
SET "services" = array_remove("services", 'dinein')
WHERE 'dinein' = ANY ("services") AND 'reserve' = ANY ("services");

-- Nothing is added anywhere. A row that declares `pickup` alone stays that way,
-- even though it used to offer eating in and no longer does: whether a place
-- has tables is a fact about the place, and this migration does not know it.
-- Guessing would put "Eat at the Restaurant" on hatches with nowhere to sit,
-- which is the mistake the old inference made in the first place. The seed
-- declares `dinein` for the demo addresses that have a room; a real one says so
-- through the panel, where somebody who has seen the place decides.
--
-- `orders.pickup_option` is untouched, and the `PickupOption` enum keeps both
-- of its values. What a guest *chose* is still recorded per order, and
-- rewriting history to match a rule that did not exist when the order was
-- placed would be a lie about what happened.
