# DATABASE.md

> Proposed DB schema (**PostgreSQL**). Identifier type — `UUID` (pk default `gen_random_uuid()`). Money — stored as **AMD integer** (`integer`, dram has no minor unit). Timestamps — `timestamptz`. All tables have `created_at`, `updated_at`.

The schema is derived from the design; missing entities are proposed as architectural recommendations.

---

## ER — relationships (overview)

```
users 1─* orders                users 1─* reservations
users 1─* favorites             users 1─* reviews
users 1─* notifications         users 1─1 referrals (own code)
restaurants 1─* branches        branches 1─* tables
branches 1─* menu_items         categories 1─* menu_items
orders 1─* order_items          orders 1─0..1 payments
orders 1─0..1 reservations      reservations 1─0..1 tables
reservations 1─0..1 payments    (a payment settles an order XOR a reservation)
restaurants 1─* reviews         menu_items *─* dietary_tags
```

---

## 1. users

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| phone | varchar(20) UNIQUE NULL | primary login identifier; **nullable** — a guest account exists before any phone is known, and the column is filled on OTP verification (guest → customer upgrade) |
| phone_verified | boolean DEFAULT false | verified via OTP |
| name | varchar(120) | full name |
| email | varchar(160) UNIQUE NULL | optional |
| avatar_url | text NULL | |
| language | varchar(2) DEFAULT 'hy' | hy / ru / en |
| dark_mode | boolean DEFAULT false | |
| notif_push | boolean DEFAULT true | |
| notif_promo | boolean DEFAULT false | |
| reward_points | integer DEFAULT 0 | |
| role | enum(`customer`,`owner`,`staff`,`admin`) DEFAULT 'customer' | **only `customer` is used.** Staff are a separate table (`staff_users`, §16) — a customer record can no longer be promoted. `owner`/`staff`/`admin` remain in the enum type because dropping a value out from under existing rows is not a migration; nothing reads them. |
| referred_by | uuid FK→users.id NULL | who invited |
| is_guest | boolean DEFAULT false | guest account |
| created_at / updated_at | timestamptz | |

---

## 2. restaurants

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| slug | varchar UNIQUE | e.g. `sunny` |
| name | varchar(160) NOT NULL | |
| cuisine | varchar(120) | localizable (i18n table) |
| price_level | smallint | 1..4 ($..$$$$) |
| rating_avg | numeric(2,1) DEFAULT 0 | cached average |
| reviews_count | integer DEFAULT 0 | |
| owner_id | uuid FK→users.id **NULL** `ON DELETE SET NULL` | **historical.** Who administers a restaurant is a `restaurant_admin` row in `staff_assignments` (§17) — a set, not a single id, which is what makes two administrators or a handover expressible. Kept as the only record of the original owner for restaurants whose owner had no email and so could not be migrated into `staff_users`. Deleting that user empties the column rather than refusing: the restaurant does not depend on them any more, and a record of who it once was is not worth blocking a deletion for. |
| reservations_enabled | boolean DEFAULT false | enable/disable booking |
| services | text[] | {pickup, dinein, reserve} |
| cover_url | text NULL | |
| created_at / updated_at | timestamptz | |

---

## 3. restaurant_branches

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK→restaurants.id | |
| name | varchar(160) | e.g. "Northern Ave" |
| address | text | |
| city | varchar(80) DEFAULT 'Yerevan' | |
| lat / lng | numeric(9,6) | geolocation |
| phone | varchar(20) | |
| open_hours | jsonb | schedule by day |
| is_open | boolean DEFAULT true | current status |
| avg_prep_min | smallint | average prep time |
| created_at / updated_at | timestamptz | |

---

## 4. tables

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→restaurant_branches.id | |
| table_no | varchar(10) | e.g. "12" |
| seats | smallint | capacity |
| zone | varchar(40) NULL | hall/terrace |
| is_active | boolean DEFAULT true | |

---

## 5. categories

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| key | varchar(40) UNIQUE | pizza, sushi, healthy… |
| icon | varchar(8) | emoji/icon |
| sort_order | smallint | |
| name_i18n | jsonb | {hy,ru,en} |

---

## 6. menu_items

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→restaurant_branches.id | |
| category_id | uuid FK→categories.id | |
| menu_tab | enum(`popular`,`mains`,`sides`,`drinks`) | tab on the page |
| name_i18n | jsonb | {hy,ru,en} |
| desc_i18n | jsonb | {hy,ru,en} |
| price_amd | integer NOT NULL | price in dram |
| calories_kcal | integer NULL | |
| prep_min | smallint | prep time |
| photo_url | text NULL | absolute URL of the dish's picture; required by the API on create |
| dietary_tags | text[] | {vegetarian,vegan,halal,gluten_free} |
| is_available | boolean DEFAULT true | sold out tonight — reversible by a shift |
| deleted_at | timestamptz NULL | off the menu for good; set means gone from every read |
| created_at / updated_at | timestamptz | |

> **Soft-deleted, because `order_items` references it.** An order that can no
> longer say what was bought is not an order, so taking a dish off the menu sets
> `deleted_at` and leaves the row.
>
> This replaced a refusal: deleting a dish that had ever been ordered used to
> return 409 ("mark it unavailable instead") because the foreign key made a real
> delete impossible. Keeping the row removes that objection — the reference stays
> valid, past orders still resolve — so **any dish can now be removed, ordered or
> not**.
>
> **Not the same state as `is_available`.** That one is "sold out tonight", a
> shift may set it on `menu:availability`, and it comes back. `deleted_at` needs
> `menu:write` and nothing in the panel undoes it (the row supports an undelete
> if one is ever wanted; no endpoint offers it).
>
> **Every read filters it**, via `LIVE_MENU_ITEM` in `apps/api/src/common/menu-visibility.ts`
> — one exported constant rather than `deleted_at IS NULL` written out six times,
> so a new read path is a grep away from the list that needs it. Two of the six
> are not cosmetic: the public menu would show customers a withdrawn dish, and
> the lookup order placement validates against would let them buy one. The branch
> `menuItemCount` filters it too, or "12 dishes" would never move down again.
>
> No index on `deleted_at`. A partial index on `deleted_at IS NULL` would suit
> the reads exactly and Prisma cannot express one, so it would be dropped by the
> next generated migration and show as drift; `menu_items(branch_id, menu_tab)`
> already narrows to a single branch's menu.
>
> **`photo_url` is required to add a dish but nullable in the column.** The rule
> is enforced at the write — `CreateMenuItemDto` refuses a creation without one,
> and no PATCH can blank it. The column stays nullable because a `NOT NULL`
> migration would have to invent a value for every row that predates the rule,
> from inside SQL that cannot know the deployment's `API_PUBLIC_URL` — the
> address a stored photo is absolute against. The seed fills those rows in
> instead (`refreshSeedPhotos`, also runnable on its own as
> `pnpm --filter @amragrir/api db:photos`), and prints `menuItemsWithoutPhoto` on
> every run so the claim that every dish has one is re-checked rather than
> assumed. That script rewrites a row with no photograph or one the seed put
> there, and never one a restaurant uploaded.
>
> **The value is an absolute URL, not a path.** Uploaded photos live under
> `UPLOAD_DIR` and are served at `API_PUBLIC_URL/uploads/menu/<uuid>.<ext>`;
> demo dishes point at photographs hosted elsewhere (`prisma/menu-photos.ts`),
> or at `API_PUBLIC_URL/static/menu/<category>.svg` under `MENU_PHOTOS=local`.
> Every client — site, app, panel — therefore renders a dish's picture without
> knowing where the API keeps files, and a row's host is not something the schema
> assumes.

---

## 7. orders

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| code | varchar(12) UNIQUE | pickup code |
| user_id | uuid FK→users.id | |
| branch_id | uuid FK→restaurant_branches.id | |
| service_mode | enum(`pickup`,`dine_in`) | |
| status | enum(`created`,`paid`,`confirmed`,`preparing`,`almost_ready`,`ready`,`completed`,`cancelled`) | |
| subtotal_amd | integer | |
| service_fee_amd | integer | |
| deposit_amd | integer DEFAULT 0 | for dine_in |
| total_amd | integer | |
| ready_at | timestamptz | target ready time |
| prep_min | smallint NULL | the prep estimate this order was scheduled against — a snapshot, like `order_items.unit_price_amd` |
| prep_start_at | timestamptz NULL | when the kitchen must begin: `ready_at` − `prep_min`. Stored because the board sorts on it |
| reminder_lead_min | smallint NULL | how long before `ready_at` the branch is warned. Defaults to `prep_min` + `PREP_REMINDER_BUFFER_MIN`; a shift may move it |
| reminder_at | timestamptz NULL | when that warning falls due: `ready_at` − `reminder_lead_min` |
| reminder_sent_at | timestamptz NULL | set by the reminder job once it has told the branch |
| reservation_id | uuid FK→reservations.id NULL | if dine_in |
| notes | text NULL | |
| created_at / updated_at | timestamptz | |

**`reminder_at` is what makes an order a pre-order.** Null means it was placed
for as soon as possible: the warning would land in the past, and there is nobody
to warn about an order the kitchen already has. So the column that schedules the
warning is also the flag for having been scheduled — the same doubling-up
`reservations.active_slot` uses, and for the same reason: two columns that must
always agree eventually will not. `reminder_lead_min` is null exactly when
`reminder_at` is; they are written together and cleared together.

`reminder_sent_at` is only ever read to stop the job telling a branch twice —
**never** to decide which stage an order is in. The back office splits its board
on `reminder_at` against the clock, so an order still arrives on time in a
deployment where the job is not running. It is cleared again when a shift
lengthens the notice past the point the warning already went out.

All five are null on rows written before pre-ordering existed, which is the
honest answer for them: nothing recorded a prep estimate at the time, and every
one of those orders is finished. `prep_start_at` sorts **nulls last** for that
reason — a finished order has no claim on the front of a queue.

Indexed as `(branch_id, reminder_at, prep_start_at)` — one branch's queue, split
on "is this due yet" and ordered by when it has to be started — plus a partial
index on `reminder_at WHERE reminder_at IS NOT NULL AND reminder_sent_at IS
NULL`, which is what the job scans every minute. The partial one is not
expressible in `schema.prisma` and lives in the migration.

---

## 8. order_items

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK→orders.id ON DELETE CASCADE | |
| menu_item_id | uuid FK→menu_items.id | |
| name_snapshot | varchar(160) | name at order time |
| unit_price_amd | integer | price at order time |
| qty | smallint NOT NULL | |
| line_total_amd | integer | qty × unit_price |

---

## 8a. order_events

Everything that ever happened to an order, in the order it happened. `orders.status`
says **where** an order is; this says **how it got there and who moved it** — two
different questions, and the second only has an answer if it is written down as it
happens, because a status column overwrites its own history on every UPDATE.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK→orders.id ON DELETE CASCADE | the order owns its history |
| type | enum(`created`,`status_changed`,`payment`,`reminder_set`) | `payment` is an attempt that moved no status — a decline; `reminder_set` is a shift retiming a pre-order's warning, which moves no status either |
| from_status / to_status | enum(OrderStatus) NULL | both null on `payment`; `from_status` null on `created` |
| actor_type | enum(`customer`,`staff`,`system`) | which identity acted |
| actor_user_id | uuid FK→users.id NULL ON DELETE SET NULL | set when `actor_type = customer` |
| actor_staff_id | uuid FK→staff_users.id NULL ON DELETE SET NULL | set when `actor_type = staff` |
| acting_staff_id | uuid FK→staff_users.id NULL ON DELETE SET NULL | the real human behind an impersonated session; null in the ordinary case |
| detail | jsonb NULL | per-type extras: dish count and total on a placement, method/status/amount on anything touching money, the old and new notice on a `reminder_set` |
| created_at | timestamptz | |

**`reminder_set` records something no column can.** `orders.reminder_lead_min`
is overwritten in place, so without an entry there would be no record that the
warning ever moved, or of who moved it. Its `detail` carries both the new notice
and the one it replaced (`reminderLeadMin`, `previousReminderLeadMin`), because
"somebody set it to 45" is not an answer to "why did this go out so early". Its
`from_status` and `to_status` are both null: the order stays where it is, and the
food is still promised for the same minute.

The `paid → confirmed` move a pre-order gets on payment is recorded here as an
ordinary `status_changed` with actor_type **`system`** — a diner cannot accept an
order on a restaurant's behalf, and no member of staff was there.

**Not `audit_log`.** That table's actor is a `staff_users` row, and most of what
happens to an order is done by the customer who placed it or by the payment
provider — every one of those rows would carry a NULL actor, which is precisely
the question this table exists to answer. Three actor columns rather than one
nullable id for the same reason: a customer and a staff member are different
tables, not two flavours of "user".

**Written in the same transaction as the change it records.** The `created` entry
is nested inside the order's own INSERT; a status change is written inside the
transaction that performs it, so the optimistic status match aborts both together
and no entry can claim a move that lost a race. Nothing logs after the fact.

`acting_staff_id` is what keeps the trail honest under impersonation: the staff
token's `sub` is the account *being acted as*, so recording only that would put
the change against somebody who was not at the keyboard.

Orders that predate the table were backfilled with a single `created` entry from
`orders.created_at`, marked `detail.backfilled = true`. Their creation time is
real; the rest of their history was never recorded, and the panel says so rather
than implying otherwise.

**`detail.reconstructed = true`** marks an entry inferred from the order row
rather than witnessed: the dev seed writes one for any order whose history does
not reach its current status, using `orders.status` and `orders.updated_at` and
attributing it to `system`. The status and the time come from the database; the
actor is genuinely unknown, and naming a plausible one would turn an audit trail
into fiction. Everything the API itself has moved is skipped, because its history
already accounts for where it is.

---

## 8b. staff_notifications / staff_notification_reads

Something a branch needs telling about, addressed to the **branch** rather than
to a person. One kind so far: a pre-order is about to need cooking.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→restaurant_branches.id ON DELETE CASCADE | who is being told |
| type | enum(`prep_due`) | what kind of thing this is |
| order_id | uuid FK→orders.id NULL ON DELETE CASCADE | what it is about, when it is about an order |
| payload | jsonb NULL | the numbers the panel renders the line from — pickup code, when it is due, the prep estimate, the notice, the dish count |
| created_at | timestamptz | |

**Not a staff-side copy of `notifications` (§12).** That table has a `user_id`
and is one customer's inbox. This one has a `branch_id`, because a shift is not
a person: whoever is holding the tablet needs to see that a pre-order is coming
up, and which of the people assigned to the branch that is changes hourly.
Fanning one reminder out into a row per assigned staff member would make "who is
on tonight" something the writer has to know, and would leave it undeliverable
to somebody assigned five minutes later.

**Nothing here is prose.** A reminder is written by a job, and a job has no
request to take a language from — writing a sentence at 3am would pick a
language for a reader who has not arrived yet. The row carries the type and the
numbers; the back office renders them through its own dictionary, exactly as it
does order statuses and history entries.

Reach follows the same rule as the rest of the back office: a row is readable by
an account whose **`orders:read`** scope covers its branch. Every notification
that exists is about an order, so a permission of its own would be one nobody
could hold without also holding that one.

`staff_notification_reads` is `(notification_id, staff_user_id, read_at)`, keyed
on the pair. A join table rather than an `is_read` column, because the row above
belongs to a branch and being read is something a *person* does — a single flag
would let the first colleague to open the bell clear it for everyone else on the
shift, which is precisely the failure a kitchen notification exists to avoid.

Indexed as `(branch_id, created_at)` — one branch's bell, newest first.

---

## 9. reservations

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| branch_id | uuid FK→restaurant_branches.id | |
| table_id | uuid FK→tables.id NULL | assigned table |
| reserved_for | timestamptz | booking date+time |
| guests | smallint NOT NULL | guest count |
| deposit_amd | integer | deposit |
| deposit_credited | boolean DEFAULT false | credited to bill |
| status | enum(`pending`,`confirmed`,`seated`,`completed`,`cancelled`,`no_show`) | |
| active_slot | timestamptz NULL | mirrors `reserved_for` while the booking holds the table |
| created_at / updated_at | timestamptz | |

`UNIQUE (table_id, active_slot)` is what makes a table exclusive. It is keyed on
`active_slot` rather than `reserved_for` because Postgres treats NULLs in a
unique index as distinct: ending a booking sets `active_slot = NULL`, which
**frees the slot for rebooking**, where a constraint on `reserved_for` would
have blocked that table and time forever. The overlap check (a seating spans
several slots) runs in a serializable transaction; this index is the guarantee
that survives if that isolation level is ever relaxed.

---

## 10. payments

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK→orders.id UNIQUE NULL | set for a food payment |
| reservation_id | uuid FK→reservations.id UNIQUE NULL | set for a table deposit |
| method | enum(`apple_pay`,`google_pay`,`card`) | online only; `cash` was dropped from the type by `20260803090000_online_payments_only` |
| amount_amd | integer | |
| status | enum(`pending`,`authorized`,`captured`,`refunded`,`failed`,`cancelled`) | an *order* payment now only ever reaches `captured`, `failed` or `cancelled` — `pending` was the cash state and `authorized`/`refunded` belong to deposits |
| provider_ref | varchar(120) NULL | provider transaction id — or `legacy_cash`, which is how a payment that predates the enum change is still recognisable after its method was rewritten to `card` |
| created_at / updated_at | timestamptz | |

A payment settles **exactly one** of the two, enforced by
`CHECK ((order_id IS NULL) <> (reservation_id IS NULL))` — Prisma cannot
express it, so it lives in the migration. Without it, "nullable order_id" would
quietly permit an orphan payment that no reconciliation could attribute to
anything. A separate `deposits` table was the alternative and would have
duplicated every provider field and status transition for no gain.

Deposits use `authorized` → `captured` (kept or credited) or `cancelled`
(released). `refunded` is for money that was actually taken first, which for a
deposit never happens.

---

## 11. reviews

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| restaurant_id | uuid FK→restaurants.id | |
| order_id | uuid FK→orders.id NULL | |
| rating | smallint CHECK (1..5) | |
| comment | text NULL | |
| created_at | timestamptz | |

---

## 12. notifications

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| type | enum(`order`,`reservation`,`promo`,`referral`,`system`) | |
| title | varchar(160) | |
| body | text | |
| payload | jsonb NULL | deep-link data |
| is_read | boolean DEFAULT false | |
| created_at | timestamptz | |

---

## 13. favorites

| Field | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK→users.id |
| restaurant_id | uuid FK→restaurants.id |
| created_at | timestamptz |
| UNIQUE(user_id, restaurant_id) | |

---

## 14. referrals

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id UNIQUE | code owner |
| code | varchar(16) UNIQUE | e.g. ARAM5 |
| invited_count | integer DEFAULT 0 | |
| discount_earned_pct | integer DEFAULT 0 | accrued, max 25 |
| created_at | timestamptz | |

---

## 15. coupons

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| code | varchar(20) | |
| discount_pct | smallint NULL | |
| discount_amd | integer NULL | |
| source | enum(`referral`,`reward`,`promo`) | |
| valid_until | timestamptz NULL | |
| used_at | timestamptz NULL | |

---

# Staff side

Separate from `users` on purpose: a person who manages a restaurant should not
carry reward points, favourites and an order history on the same row, and no
customer record should be one `UPDATE` away from staff powers. Someone who both
manages a restaurant and eats at one has two accounts.

## 16. staff_users

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| email | varchar(160) UNIQUE NOT NULL | the login. Always lowercased — a CHECK constraint (`email = lower(email)`) keeps it true, since the unique index is case-sensitive |
| email_verified_at | timestamptz NULL | set when an invitation is accepted |
| password_hash | text NULL | **null until the invite is accepted**: the account can be listed and given a role, but cannot be signed into. scrypt, parameters stored in the hash |
| name | varchar(120) NOT NULL | |
| phone | varchar(20) NULL | contact only — never a login |
| is_active | boolean DEFAULT true | deactivation rather than deletion, because `audit_log` still has to name them |
| last_login_at | timestamptz NULL | |
| created_at / updated_at | timestamptz | |

## 17. staff_assignments

One role, over one scope. A manager of two branches holds two rows — which is
what makes "manage these two, not the third" expressible, and is why this is a
table rather than a column.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| staff_user_id | uuid FK→staff_users.id ON DELETE CASCADE | |
| role | enum(`super_admin`,`platform_admin`,`restaurant_admin`,`restaurant_manager`,`branch_staff`) | |
| restaurant_id | uuid FK→restaurants.id NULL | set for `restaurant_admin` |
| branch_id | uuid FK→restaurant_branches.id NULL | set for `restaurant_manager` and `branch_staff`. The restaurant is reached by joining the branch, so the two columns can never disagree |
| created_by | uuid FK→staff_users.id NULL ON DELETE SET NULL | a grant outlives whoever granted it |
| created_at | timestamptz | |

Two constraints Prisma cannot express, both in the migration:

- **`staff_assignments_scope_check`** — platform roles carry neither id,
  `restaurant_admin` a restaurant, branch roles a branch. Without it a malformed
  row is a privilege bug rather than a validation error. Mirrored by `ROLE_SCOPE`
  in `packages/shared`, which fails first with a readable message.
- **Three partial unique indexes** (`…_platform_key`, `…_restaurant_key`,
  `…_branch_key`) giving one assignment per person per scope. A plain
  `@@unique` would not do: Postgres treats NULLs as distinct, so the same super
  admin could be stored five times.

## 18. staff_invites

How a staff account comes into existence. There is no sign-up.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| email | varchar(160) NOT NULL | lowercase, same CHECK as above |
| role | enum(StaffRole) | |
| restaurant_id / branch_id | uuid NULL | same scope shape, same CHECK constraint |
| token_hash | text UNIQUE NOT NULL | **only the digest.** The raw token lives in the email and nowhere else, so a leaked database yields no usable invitations |
| expires_at | timestamptz NOT NULL | 7 days by default (`STAFF_INVITE_TTL`) |
| accepted_at | timestamptz NULL | |
| invited_by | uuid FK→staff_users.id | |
| created_at | timestamptz | |

A partial unique index on `email WHERE accepted_at IS NULL` allows one open
invitation per address — re-inviting replaces the link rather than leaving two
live.

## 19. audit_log

Who did what. Once two people share a restaurant, "who marked this sold out" and
"who let this account in" stop being answerable without it.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| actor_staff_id | uuid FK→staff_users.id NULL ON DELETE SET NULL | null for system actions |
| acting_staff_id | uuid FK→staff_users.id NULL ON DELETE SET NULL | the super admin behind an impersonated session; null in the ordinary case |
| action | varchar(80) | `menu_item.create/update/availability/delete`, `branch.create/update/status`, `staff.invite/invite_revoke/assignment_revoke/impersonate`, `customer.phone_view`, `reservation.status` |
| entity / entity_id | varchar(40) / uuid NULL | **not** a foreign key: it points at whichever table `entity` names, and that row may legitimately be gone |
| restaurant_id | uuid FK→restaurants.id NULL ON DELETE SET NULL | where it happened, for the reach filter |
| branch_id | uuid FK→restaurant_branches.id NULL ON DELETE SET NULL | ditto; both written whenever both are known |
| before / after | jsonb NULL | only the fields that changed |
| ip | varchar(45) | |
| created_at | timestamptz | |

**The vocabulary lives in `packages/shared/src/activity.ts`** (`AuditAction`,
`AuditEntity`, `AUDIT_ACTION_ENTITY`), not as string literals at the call sites:
the API writes these values and the back office renders a sentence per value in
three languages, so a typo on either side would be an unreadable row rather than
a compile error. `entity` is derived from `action` through that map, so a caller
cannot pair a menu action with a staff entity.

**One action records a read.** `customer.phone_view` is written when somebody
asks `GET /admin/users/{id}/phone` for one diner's number in full — the customer
list masks every number, and a mask that lifts without a trace is decoration. It
is the only row here whose `entity` is `customer` (a `users` row, the *other*
identity), it carries no scope on either column, and `after` holds the **masked**
number: enough to say which number was read, not a second permanent readable
copy of it. There is no `before`, because nothing changed.

**The table is read two ways.** By **person** — `GET /staff/{id}/activity`,
scanning `(actor_staff_id, created_at)` backwards and merging `order_events`
in — and by **thing**, over `(entity, entity_id)`: `GET
/restaurant/menu-items/{id}/history` is every row about one dish, oldest first,
which is what finally makes "who put this on the menu, and who moved the price"
answerable on the screen the price is on. The second read needs no scope filter
of its own, because the entity it is about is checked against the caller's reach
first and a menu item cannot change branch. See ROLES_AND_PERMISSIONS.md, "Who
can read it".

> **Scope columns are what make the table readable by person.** Every list in
> the back office is filtered to the caller's reach, and a person's activity has
> to be too — a restaurant admin who can see that somebody works for them must
> not thereby see what that person did for a different restaurant. `entity_id`
> alone cannot express that: it is polymorphic, so scoping through it would mean
> a join per `entity` value at read time.
>
> Both columns are written wherever both are known — a menu item names its
> branch, and that branch names its restaurant — so a branch-level action is
> reachable by the branch's manager *and* the restaurant's admin without a join
> either way. **Both null means platform scope:** an action over no restaurant,
> readable only by an account whose reach is unscoped. `staff.impersonate` is
> exactly that.
>
> Unlike `entity_id` these are real foreign keys, because they decide who may
> *read* the row and an access-control column holding an id that matches nothing
> hides or reveals history by accident. `ON DELETE SET NULL` rather than
> `CASCADE`, for the reason the actor columns already use: an entry outlives the
> thing it happened to. A deleted branch narrows its rows to the restaurant they
> still name; a deleted restaurant narrows them to platform readers. Both are a
> loss of precision, neither is a loss of the fact.

> **`before` is what makes a deletion readable.** For the entities that are hard
> deleted — a revoked `staff_assignments` row, a withdrawn `staff_invites` row —
> it is the only remaining record of what the thing was. A revoked role is
> deliberately not soft-deleted: it has to be *gone* from the permission path
> rather than filtered out of it, because the one query that forgot the filter
> would leave somebody holding a role that was taken away.

> **Orders are the exception, and deliberately not through this table:** they
> have their own `order_events` (§8a), because their actor is usually a customer
> or the payment provider rather than a staff member — every one of those rows
> would carry a NULL `actor_staff_id`, which is what this table exists to avoid.
> `GET /staff/{id}/activity` merges the two at read time rather than writing
> status changes to both, so there is one record of each fact.

---

## Indexes (recommended)

- `restaurant_branches(lat, lng)` — geo search (or PostGIS `geography`).
- `menu_items(branch_id, menu_tab)`, `menu_items(category_id)`.
- `orders(user_id, status)`, `orders(branch_id, status)`, `orders(code)`.
- `order_events(order_id, created_at)` — the timeline is always read for one
  order, oldest first.
- `orders(branch_id, reminder_at, prep_start_at)` — one branch's queue, split on
  "is this due yet" and ordered by when it has to be started.
- `orders(reminder_at) WHERE reminder_at IS NOT NULL AND reminder_sent_at IS
  NULL` — partial, and what the reminder job scans every minute across every
  branch. The rows it wants are a vanishing fraction of the table, and an index
  over the whole of `orders` would be scanned past on every pass.
- `staff_notifications(branch_id, created_at)` — one branch's bell, newest
  first; `staff_notification_reads(staff_user_id)`.
- `reservations(branch_id, reserved_for)`, `reservations(user_id)`.
- `favorites(user_id)`, `notifications(user_id, is_read)`.
- `staff_assignments(staff_user_id)`, `(restaurant_id)`, `(branch_id)` — every
  scope filter reads one of the three.
- `audit_log(actor_staff_id, created_at)` — also what the activity feed reads,
  scanned backwards for one person newest-first. The scope columns are a filter
  on the handful of rows that returns rather than something to index.
- `audit_log(entity, entity_id)` — what a per-entity history reads, one row set
  per thing: `GET /restaurant/menu-items/{id}/history` is this index. Both
  columns, because `entity_id` is not a foreign key and two tables can hand out
  the same uuid.
- OTP/session uniqueness — in Redis, not in PG. Staff refresh tokens and
  password-reset tokens live there too (`staff_refresh:*`, `staff_reset:*`).
