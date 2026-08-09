-- A branch answers for itself: its own photograph, its own services, its own
-- bookings.
--
-- These three lived on `restaurants` and covered every branch of a business at
-- once. That was the wrong shape: branches of one chain are genuinely different
-- places — one has a dining room and one is a counter in a mall, one is
-- photographed and one is not — and a single row could not say so.
--
-- **The restaurant keeps all three as the default**, so this migration
-- backfills nothing and changes no answer. A branch that has not spoken for
-- itself resolves to the business's value exactly as before; a branch that has
-- overrides it. `resolveBranchOffering` in `@amragrir/shared` is the one place
-- that resolution happens, so the API and the back office cannot disagree
-- about it.

-- AlterTable
ALTER TABLE "restaurant_branches"
    -- NULL means "wear the restaurant's". There is deliberately no way to say
    -- "explicitly no cover" at branch level: a branch without its own
    -- photograph falling back to the business's is better than a blank card
    -- beside a business that has one.
    ADD COLUMN "cover_url" TEXT,

    -- Empty rather than NULL, because Prisma cannot express a nullable scalar
    -- list. Which is also why the flag below exists rather than NULL doing the
    -- work: `{}` is already a legitimate value — every restaurant is created
    -- having declared nothing — so a branch must be able to override a parent
    -- that offers pickup with a genuinely empty set, and "declared nothing"
    -- has to stay distinguishable from "has not declared".
    ADD COLUMN "services" TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN "services_overridden" BOOLEAN NOT NULL DEFAULT false,

    -- NULL means "follow the restaurant". Moved down with the services because
    -- `reserve` is one of them, and a branch offering `reserve` under a
    -- business flag saying it takes no bookings would be two answers to "can I
    -- book a table here".
    ADD COLUMN "reservations_enabled" BOOLEAN;

-- A branch that has not overridden its services has no business storing any.
--
-- Without this the two columns can drift into a state nothing reads but
-- everything has to reason about: a leftover array behind a `false` flag looks
-- like an answer when the row is opened by hand, and the next person to write
-- the resolution gets it wrong in the direction of trusting it. The flag is the
-- switch; this holds the array to it.
ALTER TABLE "restaurant_branches"
    ADD CONSTRAINT "restaurant_branches_services_match_override"
    CHECK ("services_overridden" OR cardinality("services") = 0);

-- Finding the branches that answer for themselves, which is what the catalog
-- filter now asks per row: a service filter matches an overriding branch on its
-- own array and every other branch on its parent's.
CREATE INDEX "restaurant_branches_services_overridden_idx"
    ON "restaurant_branches" ("services_overridden");
