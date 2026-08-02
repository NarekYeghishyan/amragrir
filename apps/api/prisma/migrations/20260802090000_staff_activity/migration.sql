-- What a staff member did, and where they did it.
--
-- `audit_log` has existed since the first migration and has had exactly one
-- writer: `staff.impersonate`. That was enough while the only question it
-- answered was "who signed in as whom". It is not enough for "who dropped the
-- price on this dish", which is the question a restaurant actually asks, and
-- which nothing in this database could answer until now.
--
-- Two changes make the table readable *by person* rather than only by entity:
--
-- 1. **Scope columns.** Every list in the back office is filtered to the
--    caller's reach (`staff/scope.ts`), and a person's activity must be too — a
--    restaurant admin who can see that somebody works for them must not thereby
--    see what that person did for a different restaurant. `entity_id` alone
--    cannot express that: it is polymorphic, so scoping through it would mean a
--    join per `entity` value at read time. Storing the restaurant and the branch
--    on the row turns the reach filter into two `IN` lists over one table.
--
--    Both are written wherever both are known: a menu item hangs off a branch,
--    and that branch belongs to a restaurant, so a price change carries both and
--    is reachable by the branch's manager *and* the restaurant's admin without a
--    join either way.
--
--    Both NULL means platform scope — an action over no restaurant, visible only
--    to a reader whose reach is unscoped. `staff.impersonate` is exactly that,
--    so the rows already in this table get the right visibility by doing nothing.
--
-- 2. **`acting_staff_id`.** `order_events` already records both the account that
--    was acted as and the super admin behind it, because recording only the
--    first credits the change to somebody who was not at the keyboard. This
--    table had no way to say that, so an impersonated price change would have
--    been filed against the innocent party. Same column, same meaning, same
--    ON DELETE SET NULL.

-- Scope, for the reach filter. Nullable because a platform action is over no
-- restaurant, and because rows written before this migration have no scope to
-- infer — leaving them platform-only is the honest answer, not a guess.
ALTER TABLE "audit_log" ADD COLUMN "restaurant_id" UUID;
ALTER TABLE "audit_log" ADD COLUMN "branch_id" UUID;

-- The real human behind an impersonated session. Null in the ordinary case.
ALTER TABLE "audit_log" ADD COLUMN "acting_staff_id" UUID;

-- Unlike `entity_id`, these are real references. `entity_id` is deliberately
-- FK-free because it points at whichever table `entity` names and the row it
-- describes may legitimately be gone; the scope columns are different in kind —
-- they decide who may *read* the row, and an access-control column that can hold
-- an id matching nothing is a column that silently hides or reveals history.
--
-- SET NULL rather than CASCADE, for the reason the actor columns already use: an
-- entry outlives the thing it happened to. A deleted branch narrows its rows to
-- the restaurant they still name; a deleted restaurant narrows them to platform
-- readers. Both are a loss of precision. Neither is a loss of the fact.
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_acting_staff_id_fkey" FOREIGN KEY ("acting_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- No new index for the feed. It reads one person newest-first, which is
-- `audit_log(actor_staff_id, created_at)` scanned backwards — that index already
-- exists, and the actor predicate is selective enough that the scope columns are
-- a filter on the handful of rows it returns rather than something to index.

-- A dish leaves the menu without leaving the database.
--
-- `menu_items` rows were deleted outright, and only ever for a dish that had
-- never been ordered: `order_items` references this table, so a dish anyone had
-- bought could not be removed at all — the API refused with a 409 telling the
-- restaurant to mark it unavailable instead.
--
-- That refusal existed solely because of the foreign key. With the row kept and
-- flagged instead, the reference stays valid, so the restriction has no reason
-- left and the API drops it: any dish can now come off the menu, ordered or not.
--
-- This is a different state from `is_available`, and the two must not be
-- conflated. `is_available = false` is "sold out tonight" — a shift may set it
-- and it comes back. `deleted_at` is "off the menu" — it needs `menu:write` and
-- nothing brings it back through the panel.
--
-- Every read path filters on it, including the two that matter most: the public
-- menu, and the item lookup that order placement validates against. A soft
-- delete that still lets a customer order the dish is not a delete.
ALTER TABLE "menu_items" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- No index on it. A partial index on `deleted_at IS NULL` would suit the reads
-- exactly, and Prisma cannot express one — it would be dropped by the next
-- generated migration and show as drift until somebody re-added it by hand.
-- `menu_items(branch_id, menu_tab)` already narrows to a single branch's menu;
-- deleted dishes are a filter on that, and a rounding error in its size.
