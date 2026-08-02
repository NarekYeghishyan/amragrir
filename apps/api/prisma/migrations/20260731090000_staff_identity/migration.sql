-- Staff identity, separated from customers.
--
-- Until now a restaurant owner was a `users` row with `role = 'owner'` — the
-- same row that carries reward points, favourites and an order history, and one
-- UPDATE away from any customer in the table. Staff now live in their own table,
-- sign in with email and a password, and hold roles over a scope rather than a
-- single enum value.
--
-- `users.role` and `restaurants.owner_id` are deliberately left in place: the
-- `/owner` and `/admin` endpoints still read them, and they come out together
-- once those move onto staff tokens.

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('super_admin', 'platform_admin', 'restaurant_admin', 'restaurant_manager', 'branch_staff');

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    -- Null until an invite is accepted: the account can be listed and assigned
    -- a role, but cannot be signed into.
    "password_hash" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignments" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "role" "StaffRole" NOT NULL,
    "restaurant_id" UUID,
    "branch_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "role" "StaffRole" NOT NULL,
    "restaurant_id" UUID,
    "branch_id" UUID,
    -- Only the hash. The raw token lives in the email and nowhere else, so a
    -- leaked database does not hand over usable invitations.
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_staff_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    -- Not a foreign key: it points at whichever table `entity` names, and that
    -- row may legitimately be gone.
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE INDEX "staff_assignments_staff_user_id_idx" ON "staff_assignments"("staff_user_id");
CREATE INDEX "staff_assignments_restaurant_id_idx" ON "staff_assignments"("restaurant_id");
CREATE INDEX "staff_assignments_branch_id_idx" ON "staff_assignments"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_hash_key" ON "staff_invites"("token_hash");
CREATE INDEX "staff_invites_email_idx" ON "staff_invites"("email");

-- CreateIndex
CREATE INDEX "audit_log_actor_staff_id_created_at_idx" ON "audit_log"("actor_staff_id", "created_at");
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: a grant outlives whoever granted it, and losing the
-- name is better than losing the row.
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "restaurant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_staff_id_fkey" FOREIGN KEY ("actor_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Constraints Prisma cannot express ────────────────────────────────────────

-- The role decides which scope columns must be filled. Without this a malformed
-- row is a privilege bug rather than a validation error: a `branch_staff` with
-- no branch would be scoped to nothing, and the filter that reads it would have
-- to guess. Mirrored in ROLE_SCOPE (packages/shared/src/staff-roles.ts), which
-- fails first with a readable message.
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_scope_check" CHECK (
    (role IN ('super_admin', 'platform_admin') AND restaurant_id IS NULL AND branch_id IS NULL)
 OR (role = 'restaurant_admin' AND restaurant_id IS NOT NULL AND branch_id IS NULL)
 OR (role IN ('restaurant_manager', 'branch_staff') AND branch_id IS NOT NULL AND restaurant_id IS NULL)
);

-- An invite carries the role it will grant, so it carries the same shape.
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_scope_check" CHECK (
    (role IN ('super_admin', 'platform_admin') AND restaurant_id IS NULL AND branch_id IS NULL)
 OR (role = 'restaurant_admin' AND restaurant_id IS NOT NULL AND branch_id IS NULL)
 OR (role IN ('restaurant_manager', 'branch_staff') AND branch_id IS NOT NULL AND restaurant_id IS NULL)
);

-- Makes "stored lowercased" true rather than a convention the next writer has
-- to remember. The unique index above is case-sensitive, so without this
-- `Ann@x.am` and `ann@x.am` would be two accounts.
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_email_lowercase_check" CHECK (email = lower(email));
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_email_lowercase_check" CHECK (email = lower(email));

-- One assignment per person per scope. Three partial indexes rather than one
-- @@unique because Postgres treats NULLs as distinct: a plain unique on
-- (staff_user_id, role, restaurant_id, branch_id) would happily store the same
-- super admin five times.
CREATE UNIQUE INDEX "staff_assignments_platform_key"
    ON "staff_assignments"("staff_user_id", "role")
    WHERE restaurant_id IS NULL AND branch_id IS NULL;

CREATE UNIQUE INDEX "staff_assignments_restaurant_key"
    ON "staff_assignments"("staff_user_id", "role", "restaurant_id")
    WHERE restaurant_id IS NOT NULL;

CREATE UNIQUE INDEX "staff_assignments_branch_key"
    ON "staff_assignments"("staff_user_id", "role", "branch_id")
    WHERE branch_id IS NOT NULL;

-- An email may hold only one invite that is still open. Re-inviting replaces it
-- rather than leaving two live tokens for the same address.
CREATE UNIQUE INDEX "staff_invites_open_email_key"
    ON "staff_invites"("email")
    WHERE accepted_at IS NULL;

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Existing owners and admins become staff accounts with `password_hash` NULL:
-- they exist, they keep their restaurants, and they cannot sign in until they
-- set a password through the invite flow. That is the correct state for an
-- account whose only credential used to be a phone number.
--
-- Accounts with no email address cannot be carried over — there is nothing to
-- migrate them onto — and need a fresh invite. `gen_random_uuid()` is built in
-- from Postgres 13.

INSERT INTO "staff_users" ("id", "email", "name", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(),
       lower(u."email"),
       COALESCE(u."name", split_part(lower(u."email"), '@', 1)),
       true,
       now(),
       now()
FROM "users" u
WHERE u."role" IN ('owner', 'admin')
  AND u."email" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;

-- Each restaurant's owner becomes its restaurant_admin.
INSERT INTO "staff_assignments" ("id", "staff_user_id", "role", "restaurant_id", "created_at")
SELECT gen_random_uuid(), s."id", 'restaurant_admin', r."id", now()
FROM "restaurants" r
JOIN "users" u ON u."id" = r."owner_id"
JOIN "staff_users" s ON s."email" = lower(u."email")
WHERE u."email" IS NOT NULL
ON CONFLICT DO NOTHING;

-- A migrated administrator becomes a super_admin rather than a platform_admin:
-- somebody has to be able to appoint the others, and after this migration there
-- is no other route into the platform roles.
INSERT INTO "staff_assignments" ("id", "staff_user_id", "role", "created_at")
SELECT gen_random_uuid(), s."id", 'super_admin', now()
FROM "users" u
JOIN "staff_users" s ON s."email" = lower(u."email")
WHERE u."role" = 'admin'
  AND u."email" IS NOT NULL
ON CONFLICT DO NOTHING;
