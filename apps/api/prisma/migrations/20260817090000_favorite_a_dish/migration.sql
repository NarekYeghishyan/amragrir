-- A favourite can also be a **dish**.
--
-- Until now the heart saved one thing: the address. That was the right subject
-- for a card on the feed, and the wrong one everywhere the app is actually
-- showing food — a filtered card wearing the plates that matched, a menu row.
-- Somebody pressing the heart over a photograph of khinkali means the khinkali.
--
-- Its own table rather than two nullable columns on `favorites`: the two are
-- listed separately, counted separately and removed separately, and a table
-- where exactly one of two columns is filled is a check constraint standing in
-- for a type. The branch is not stored here at all — `menu_items.branch_id`
-- already says which kitchen, so a saved dish is one address's dish by
-- construction (DATABASE.md §13).

-- CreateTable
CREATE TABLE "favorite_menu_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One heart per person per dish, so a double tap saves it once — the same rule
-- `favorites` follows, and what lets the endpoint be idempotent.
CREATE UNIQUE INDEX "favorite_menu_items_user_id_menu_item_id_key" ON "favorite_menu_items"("user_id", "menu_item_id");

-- CreateIndex
CREATE INDEX "favorite_menu_items_user_id_idx" ON "favorite_menu_items"("user_id");

-- AddForeignKey
ALTER TABLE "favorite_menu_items" ADD CONSTRAINT "favorite_menu_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade: a dish hard-deleted from the database takes its hearts with it.
-- Taking one *off the menu* is a soft delete (`menu_items.deleted_at`) and does
-- not reach here — the row survives, and the list filters it out, so a dish
-- withdrawn and put back is still saved.
ALTER TABLE "favorite_menu_items" ADD CONSTRAINT "favorite_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
