-- A menu has two axes, and `menu_tab` was pretending to be both.
--
-- "Popular / Mains / Sides / Drinks" is how one kitchen lays out its own page.
-- "Pizza / Sushi / Healthy" is how a city looks for dinner before it has picked
-- a kitchen. The first was an enum of four values every restaurant on the
-- platform had to fit into; the second lived in `categories`, was optional on a
-- dish, and had no way at all to be set from the back office — so every dish a
-- real restaurant typed in was invisible to every filter on the home screen,
-- with nothing to report and nothing to fix.
--
-- After this migration the first axis is `branch_menu_sections`, a branch's own
-- headings, as many as its menu names. The second stays `categories`, closed and
-- platform-owned. A section may point at a category, and then its dishes inherit
-- one for free; a dish may override. "Popular" stops being a section at all and
-- becomes `menu_items.is_popular` — a bestseller is popular *and* pizza, and the
-- enum made it choose.

-- ── the platform vocabulary gets an owner and a retirement ──────────────────
--
-- `is_active` rather than a delete: a category dishes point at cannot be removed
-- without orphaning them out of every filter, so retiring one hides the chip and
-- leaves the data alone.
ALTER TABLE "categories"
    ADD COLUMN "is_active"  BOOLEAN     NOT NULL DEFAULT true,
    ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── a branch's own headings ─────────────────────────────────────────────────
--
-- `legacy_tab` is scaffolding for this file only and is dropped at the bottom:
-- it is how the rows below find the section they came from without matching on
-- a translated name.
CREATE TABLE "branch_menu_sections" (
    "id"          UUID         NOT NULL,
    "branch_id"   UUID         NOT NULL,
    "category_id" UUID,
    "name_i18n"   JSONB        NOT NULL,
    "sort_order"  SMALLINT     NOT NULL DEFAULT 0,
    -- Soft-deleted, exactly like `menu_items`: withdrawn dishes keep pointing at
    -- their heading, and `order_items` keep pointing at them.
    "deleted_at"  TIMESTAMPTZ,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_tab"  TEXT,

    CONSTRAINT "branch_menu_sections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menu_items"
    ADD COLUMN "section_id" UUID,
    ADD COLUMN "is_popular" BOOLEAN NOT NULL DEFAULT false;

-- ── Mains, Sides and Drinks become real rows, per branch ────────────────────
--
-- Only for branches that actually used the tab: a kitchen that never listed a
-- side does not want an empty "Sides" heading appearing on its page because the
-- enum happened to contain the word. Soft-deleted dishes count — they still need
-- a section to point at, and `section_id` is about to be NOT NULL.
--
-- `category_id` stays NULL on all three. None of them names a kind of food, and
-- every dish carried here already has whatever category it had.
INSERT INTO "branch_menu_sections" ("id", "branch_id", "name_i18n", "sort_order", "legacy_tab")
SELECT gen_random_uuid(), used."branch_id", tab."name_i18n", tab."sort_order", tab."tab"
FROM (SELECT DISTINCT "branch_id", "menu_tab"::text AS "tab" FROM "menu_items" WHERE "menu_tab" <> 'popular') used
JOIN (VALUES
    ('mains',  1::smallint, '{"hy":"Հիմնական","ru":"Основные","en":"Mains"}'::jsonb),
    ('sides',  2::smallint, '{"hy":"Խորտիկներ","ru":"Закуски","en":"Sides"}'::jsonb),
    ('drinks', 3::smallint, '{"hy":"Ըմպելիք","ru":"Напитки","en":"Drinks"}'::jsonb)
) AS tab("tab", "sort_order", "name_i18n") ON tab."tab" = used."tab";

UPDATE "menu_items" i
SET "section_id" = s."id"
FROM "branch_menu_sections" s
WHERE s."branch_id" = i."branch_id"
  AND s."legacy_tab" = i."menu_tab"::text;

-- ── "Popular" stops being a place and becomes a property ────────────────────
UPDATE "menu_items" SET "is_popular" = true WHERE "menu_tab" = 'popular';

-- The dishes that were only ever in the Popular tab still have to live
-- somewhere, and the truest answer to where is the category they already carry:
-- a bestselling Margherita belongs under a "Pizza" heading, not under a
-- "Mains" one it was never filed in. One section per (branch, category) that
-- needs one, named and mapped from the category itself, and placed above the
-- three above because it is what the kitchen is known for.
INSERT INTO "branch_menu_sections" ("id", "branch_id", "category_id", "name_i18n", "sort_order")
SELECT gen_random_uuid(), need."branch_id", need."category_id", c."name_i18n", 0
FROM (
    SELECT DISTINCT "branch_id", "category_id"
    FROM "menu_items"
    WHERE "section_id" IS NULL AND "category_id" IS NOT NULL
) need
JOIN "categories" c ON c."id" = need."category_id";

UPDATE "menu_items" i
SET "section_id" = s."id"
FROM "branch_menu_sections" s
WHERE i."section_id" IS NULL
  AND i."category_id" IS NOT NULL
  AND s."branch_id" = i."branch_id"
  AND s."category_id" = i."category_id";

-- A popular dish with no category at all — possible for anything typed into the
-- back office, which never had a category field — has nothing to name a shelf
-- after. It goes under Mains, created for the branch if it has none.
INSERT INTO "branch_menu_sections" ("id", "branch_id", "name_i18n", "sort_order", "legacy_tab")
SELECT DISTINCT gen_random_uuid(), i."branch_id", '{"hy":"Հիմնական","ru":"Основные","en":"Mains"}'::jsonb, 1, 'mains'
FROM "menu_items" i
WHERE i."section_id" IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM "branch_menu_sections" s
      WHERE s."branch_id" = i."branch_id" AND s."legacy_tab" = 'mains'
  );

UPDATE "menu_items" i
SET "section_id" = s."id"
FROM "branch_menu_sections" s
WHERE i."section_id" IS NULL
  AND s."branch_id" = i."branch_id"
  AND s."legacy_tab" = 'mains';

-- ── the enum goes ───────────────────────────────────────────────────────────
DROP INDEX "menu_items_branch_id_menu_tab_idx";

ALTER TABLE "menu_items"
    ALTER COLUMN "section_id" SET NOT NULL,
    DROP COLUMN "menu_tab";

DROP TYPE "MenuTab";

ALTER TABLE "branch_menu_sections" DROP COLUMN "legacy_tab";

-- ── keys and indexes ────────────────────────────────────────────────────────
ALTER TABLE "branch_menu_sections" ADD CONSTRAINT "branch_menu_sections_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_menu_sections" ADD CONSTRAINT "branch_menu_sections_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restrict, not cascade. Deleting a heading must never delete the food under it:
-- `order_items` point at these rows, and an order that cannot say what was
-- bought is not an order. The panel moves the dishes first, or the delete fails.
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "branch_menu_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "branch_menu_sections_branch_id_sort_order_idx" ON "branch_menu_sections"("branch_id", "sort_order");
CREATE INDEX "branch_menu_sections_category_id_idx" ON "branch_menu_sections"("category_id");
CREATE INDEX "menu_items_branch_id_section_id_idx" ON "menu_items"("branch_id", "section_id");
CREATE INDEX "menu_items_section_id_idx" ON "menu_items"("section_id");
