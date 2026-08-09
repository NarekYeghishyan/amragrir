-- Eating in stops being a service, and a dining room starts needing a booking.
--
-- The rule this migrates to (BUSINESS_LOGIC.md §2): what separates the two kinds
-- of place this app serves is whether they take table bookings.
--
--   * A counter — a shawarma window, a khorovats place, a coffee bar — takes no
--     bookings. A guest ordering ahead says whether they will eat it there or
--     take it with them, and the kitchen plates it or bags it accordingly. Both
--     halves of that choice are real, and neither is configured.
--   * A restaurant takes bookings. Eating in there is a table, a seating and a
--     deposit — the booking flow — so its pickup is take-away and nothing else.
--
-- Two consequences for stored rows, one each way.

-- 1. `eat_in` is no longer a service anybody declares.
--
-- It is derived from the absence of `reserve` now, so a row still carrying the
-- value would be a second, stale answer to a question that has moved. Dropping
-- it changes nothing a guest is offered: every row that carries it has no
-- `reserve` beside it (a place with both was legal and never seeded), and such a
-- place offers both endings under the new rule anyway.
--
-- `array_remove` rather than a rewrite, so an unrelated service in the same
-- array — one this build has never heard of, which `canonicalServices`
-- deliberately keeps — survives untouched.
UPDATE "restaurants"
SET "services" = array_remove("services", 'eat_in')
WHERE 'eat_in' = ANY ("services");

UPDATE "restaurant_branches"
SET "services" = array_remove("services", 'eat_in')
WHERE 'eat_in' = ANY ("services");

-- 2. `dinein` now requires `reserve`, so any row with waiters and no booking is
-- a combination the panel and the API both refuse from today.
--
-- Fixed by adding the booking rather than removing the dining room, because
-- those are not equally cautious: dropping `dinein` would take a room full of
-- tables off the app, while adding `reserve` only says the tables can be asked
-- for. And it does not start taking bookings on anybody's behalf — a booking
-- needs `reservations_enabled` as well (reservations.service.ts), which this
-- leaves exactly as it found it. A restaurant that had bookings switched off
-- keeps them off and simply reads as what it is.
--
-- No seeded row is in this state; this is for a database somebody edited before
-- the rule existed.
UPDATE "restaurants"
SET "services" = "services" || ARRAY['reserve']
WHERE 'dinein' = ANY ("services") AND NOT ('reserve' = ANY ("services"));

UPDATE "restaurant_branches"
SET "services" = "services" || ARRAY['reserve']
WHERE 'dinein' = ANY ("services") AND NOT ('reserve' = ANY ("services"));

-- `orders.pickup_option` is untouched, and the `PickupOption` enum keeps both of
-- its values. What a guest *chose* is still recorded per order — the kitchen
-- reads it to know whether to plate or to bag — and rewriting history to match a
-- rule that did not exist when the order was placed would be a lie about what
-- happened.
