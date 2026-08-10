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
| services | text[] | `{pickup, dinein, reserve}`. **Not every combination is legal** — `dinein` and `reserve` exclude each other, being the two ways of seating somebody (BUSINESS_LOGIC.md §2). The rule is `checkServices` in `@amragrir/shared`, enforced by `PATCH /restaurant/restaurants/{id}/services`; there is no CHECK constraint, because the vocabulary is a code-side enum and the array would need one per rule. Stored de-duplicated and in that order — nothing reads it positionally, so the order is for whoever opens the row. **`eat_in` used to be a member and is not one now:** whether a place seats people is `dinein`, and what one guest chose lives in `orders.pickup_option`; the `20260805090000_eat_in_derives_from_bookings` migration strips the value from every row, and `20260805170000_dinein_excludes_reserve` repairs rows that declared both seatings. |
| cover_url | text NULL | The picture on the restaurant's card, its banner and the thumbnail beside an order — an **absolute** URL, like `menu_items.photo_url` and for the same reason. Written by `PATCH /restaurant/restaurants/{id}/cover` (`restaurant:write` — a `restaurant_manager` may not, see ROLES_AND_PERMISSIONS.md), which stores the URL that `POST /uploads/restaurant-cover` answered with. The seed is the other writer, planting a demo photograph per restaurant (`prisma/restaurant-covers.ts`; `refreshSeedCovers`, run on its own as `pnpm --filter @amragrir/api db:photos`); the endpoint overwrites a seeded value freely, and the seed rewrites only a cover that is empty or one it planted — never one somebody chose. Nullable and staying that way: a restaurant without a picture is an ordinary state, every client already falls back, and an explicit `null` through that endpoint is how a cover is taken down. The seed prints `restaurantsWithoutCover` on every run. |
| created_at / updated_at | timestamptz | |

---

## 3. restaurant_branches

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK→restaurants.id | |
| name | varchar(160) | e.g. "Northern Ave" |
| address | text | |
| cover_url | text NULL | **This branch's own photograph, or NULL to wear the restaurant's.** Branches of one chain are different places — one has a dining room, one is a counter in a mall — so the parent is the *default* rather than the answer. There is deliberately no "explicitly blank" state: a branch with none falls back, because a blank card beside a business that has a picture is worse than showing the business's. Set by `PATCH /restaurant/branches/{id}/cover` (`branch:write`). |
| services | text[] NOT NULL DEFAULT '{}' | What this branch offers, **when `services_overridden` is true** — meaningless otherwise. The `checkServices` rules (BUSINESS_LOGIC.md §2) now judge one address rather than the business. |
| services_overridden | boolean NOT NULL DEFAULT false | Whether `services` above is this branch's answer or the restaurant's. A flag rather than a nullable array for two reasons: **Prisma scalar lists cannot be null**, and `{}` is already a legitimate value — every restaurant is created having declared nothing, so a branch must be able to override a pickup parent with a genuinely empty set. A CHECK (`services_overridden OR cardinality(services) = 0`) holds the array to the flag, so a stale set cannot sit behind a `false` looking like an answer. |
| reservations_enabled | boolean NULL | Whether this branch takes bookings, or NULL to follow the restaurant's. Moved down with the services because `reserve` is one of them: a branch offering `reserve` under a business flag saying otherwise would be two answers to "can I book a table here". |
| city | varchar(80) DEFAULT 'Yerevan' | |
| lat / lng | numeric(9,6) | geolocation |
| phone | varchar(20) | |
| open_hours | jsonb | When food is served, by day. Shape: `{ "mon": { "open": "10:00", "close": "23:00" }, "sun": { "closed": true } }`, plus an optional `default` entry. **A closing time at or before the opening one runs past midnight** — `12:00`–`02:00` reads as minutes 720–1560 — which is what makes a late-night branch expressible; it used to produce zero bookable times and no explanation. |
| booking_hours | jsonb NULL | When **tables may be held**, or NULL to take bookings whenever the kitchen is open. Same shape as `open_hours`. A second document rather than a reinterpretation of the first, because they answer different questions: a kitchen serving from 10:00 that only books its dining room for dinner previously had to misstate the opening hours that appear on the public card. The fall-through only skips a level that said *nothing* — a `booking_hours` marking Monday `closed` closes Monday, whatever `open_hours` says. |
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

`UNIQUE (branch_id, table_no)`. Two tables numbered 5 in one room is not a
configuration, it is a typo — and the moment it is discovered is the moment
somebody is standing with a guest looking for table 5. Scoped to the branch,
because table 5 exists at every address a chain has. The migration that added
it refuses to run against existing duplicates and names them, rather than
guessing which is the one on the terrace.

**A "table" is a bookable unit, not a piece of furniture.** A branch that takes
an event for a hundred people enters a row with `seats = 100` — a banquet hall —
and every existing mechanism (smallest-fit assignment, exclusivity, deposit)
applies unchanged. What is deliberately *not* supported is seating one party
across several rows; see BUSINESS_LOGIC.md §3.

---

## 4a. booking_policies

Booking rules for one restaurant **or** for one branch. Every column is
nullable, and NULL means *inherit*: the chain is platform constants → restaurant
→ branch, resolved field by field in exactly one place (`resolveBookingPolicy`
in `@amragrir/shared`).

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK→restaurants.id NULL UNIQUE | |
| branch_id | uuid FK→restaurant_branches.id NULL UNIQUE | |
| seating_minutes | smallint NULL | How long one booking holds its table. This is what makes 19:00 and 19:30 collide. |
| slot_minutes | smallint NULL | Spacing of the times offered — the grain of the offer, not the length of the booking. |
| max_guests | smallint NULL | Largest party one booking may ask for. Not derived from the biggest table: a branch may cap parties below what it could physically seat. |
| max_lead_days | smallint NULL | How far ahead the calendar runs. |
| min_lead_minutes | smallint NULL | How close to the sitting a booking may still be made. |
| deposit_per_guest_amd | integer NULL | Held, never charged as an extra — BUSINESS_LOGIC.md §3. |
| free_cancel_hours | smallint NULL | Cancel this far ahead and the deposit comes back. |
| auto_confirm | boolean NULL | Whether a paid booking confirms itself. |
| created_at / updated_at | timestamptz | |

`CHECK ((restaurant_id IS NULL) <> (branch_id IS NULL))` — a policy belongs to
exactly one owner. Without it the table admits an orphan row no resolution path
can ever read, and a row belonging to both, which would be two inheritance
levels claiming the same values. **One table for both levels**, the same shape
`payments` uses for order-or-reservation: two tables with identical columns
would be the same schema written twice, and every future field added twice.

A row is created lazily, on the first save. Its absence and a row of all NULLs
mean the same thing, and neither is a state anything special-cases.

---

## 4b. branch_closures

One day a branch does not run on its usual hours — a holiday, a private hire, a
short day before New Year. Read **before** `booking_hours` and `open_hours`.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK→restaurant_branches.id | |
| date | date | The local calendar date in Yerevan. A day off has no timezone — it is whatever the people unlocking the door call today. |
| kind | enum(`closed`,`custom_hours`) | |
| opens_minutes / closes_minutes | smallint NULL | Minutes from local midnight, set exactly when `kind = custom_hours`. `closes_minutes` may exceed 1440 for a night ending after midnight. |
| reason | varchar(200) NULL | Shown back in the panel — "closed" with no reason attached is a row nobody dares delete. |
| created_by_staff_id | uuid NULL | Nullable: a closure written by a seed has no staff member behind it, and inventing one is worse than admitting there was none. |
| created_at | timestamptz | |

`UNIQUE (branch_id, date)` — one answer per day; a second edit replaces the
first rather than sitting beside it where only the query plan decides which
wins. `CHECK` ties the two minute columns to `kind`, so a `closed` row cannot
carry times that would read, to anyone opening the table by hand, as a day that
is open.

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
| code | varchar(12) UNIQUE | the order's **name**: `AMR-` + 8 digits. Printed on the ticket, read out over the phone, scanned off the board, typed into a support note. It identifies an order; it proves nothing about one |
| pickup_code | varchar(6) UNIQUE | the order's **proof**: the six digits a guest shows to collect it, and the only thing that lets the counter move it to `completed`. Generated in its own right — **not derived from `code`** — and never sent to a staff endpoint. See the note below |
| user_id | uuid FK→users.id | |
| branch_id | uuid FK→restaurant_branches.id | |
| service_mode | enum(`pickup`,`dine_in`) | |
| pickup_option | enum(`take_away`,`eat_in`) NULL | Where a pickup order ends up. **Set exactly when `service_mode = 'pickup'`**, enforced by the CHECK below. `eat_in` is only accepted from a branch that does **not** take table bookings (BUSINESS_LOGIC.md §2) — at a restaurant, eating in is a booked table; the kitchen reads it, because a bag and a plate are not the same order to pack. Backfilled to `take_away` for the pickup orders that predate it — the only ending on offer at the time, so not a guess. Rows written under the old rule keep whatever they recorded: what a guest chose is what happened, and rewriting it would be a lie about history. |
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

**`orders_pickup_option_matches_service_mode`** — `(service_mode = 'pickup') =
(pickup_option IS NOT NULL)`. A CHECK rather than NOT NULL, because the column is
required for one value of `service_mode` and forbidden for the other: a dine-in
order has a table instead, and "took it away from the table it is sitting at" is
not a state worth being able to store. Written as an equality between two
booleans so it states the whole rule in one line. Prisma has no CHECK support, so
it lives in `20260804090000_pickup_option/migration.sql` and here — not in
`schema.prisma`.

### `pickup_code` — the collection code

**It is not derived from `code`, and that is the whole design.** Until
`20260808090000_independent_pickup_code` the pickup code *was* the last four
digits of `orders.code` — computed in the API, never stored, on the argument
that two stored identifiers can come to disagree. True, and beside the point:
the order number is printed on the ticket, read out over the phone and scanned
off the board, so every place it appears was a place the collection code leaked
with it. `AMR-24919119` told you `9119`, and `9119` was all the counter ever
asked for. A proof derived from a public name proves nothing.

So it is drawn independently (`randomInt` over the whole space — this is a
credential, not a serial number), stored, and:

- **Never sent to a staff endpoint.** Not on the kitchen board, not on the
  platform-admin customer screen, not in a `prep_due` notification payload. The
  panel's only dealing with it is the other direction — typed into the handover
  dialog and checked by the API. A card that printed the code would mean a
  counter can close an order without a guest being present, which is exactly the
  situation this replaced.
- **Searchable, but only whole.** `GET /restaurant/orders?q=` matches it on
  equality, never as a substring, so a guest who remembers only their six digits
  can be found and the box cannot be walked digit by digit into somebody else's
  code.
- **Backfilled for every order, history included** — the column is NOT NULL and
  the check reads it directly, so a row without one is a row nobody can ever
  close. The migration assigns them as a bijection over the space rather than a
  sequence, so the backfilled codes are as unguessable as new ones.

**Unique across the table, not per branch — which caps the platform at
1,000,000 orders, ever.** Per-branch uniqueness would be enough for the check to
be correct, since a code is only compared against the one order in front of
somebody. Global uniqueness buys something else: a mistyped code can never
quietly *be* a different live order's, here or at another branch, so "wrong
code" is always the answer. Past a million orders the unique index refuses the
insert and order creation fails loudly — which is the intended failure, the
alternative being to silently reuse somebody's proof of purchase. The two ways
out are widening the column or scoping uniqueness to the branch, and both are
decisions for a person rather than something the code should work around.

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
| payload | jsonb NULL | the numbers the panel renders the line from — order code, when it is due, the prep estimate, the notice, the dish count. **Never the pickup code:** a bell is a screen a shift leaves open, and that is the last place to print the one thing the counter has to ask a guest for |
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
| service_date | date NOT NULL | **Which day's book this booking belongs on** — the service day, not the calendar day of `reserved_for`. The two differ only where a night runs past midnight, and there they differ in the way that costs a table: a branch open 12:00–02:00 offers 00:30 as the last start of *Tuesday's* evening, and that instant's own calendar date is Wednesday. Filtering the book by calendar date put those guests on Wednesday's page — invisible to the shift still working when they walked in, and sitting above a service that had not opened. Stored rather than recomputed for the reason `seating_minutes` is: it is decided by the hours in force when the booking was taken, and a branch that shortens its night next month must not move guests already in the book to another day. A derived filter also could not answer at all for a list spanning branches whose nights end at different times. Backfilled to the local calendar date, which is exact rather than approximate — until the migration before it, a window closing earlier than it opened produced a slot loop whose body never ran, so no booking has ever been taken past midnight on this platform. |
| guests | smallint NOT NULL | guest count |
| seating_minutes | smallint NULL | **How long this booking holds its table, snapshotted when it was made** — the same reason `orders.prep_min` is a snapshot. A branch that lengthens its seating from 90 to 120 has changed what it offers from now on; it has not changed what it already promised four people for Friday. Read live instead, a longer seating would stretch every accepted booking backwards and two that sat comfortably an hour apart would begin to overlap on one table — an overlap nothing would catch, because the unique index below guards the *start instant* and the serializable transaction that checks intervals committed weeks ago. NULL on rows written before the column existed; readers fall back to the resolved policy, exactly as they did when there was nothing else to read. |
| deposit_amd | integer | deposit |
| free_cancel_hours | smallint NULL | **How many hours before the sitting this booking's deposit stops being refundable, snapshotted when it was made.** One promise with `deposit_amd`: *this much money, returnable until then*. Half of it was frozen and half read live, so a branch moving its cancellation window from two hours to twenty-four moved it for people who had already paid — changing the terms of an agreement after the guest accepted them. Refunds are decided from this column. NULL on rows written before it existed; readers fall back to the resolved policy, which is what decided them at the time. |
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

Indexes: `(branch_id, reserved_for)` for availability, which asks about an
interval around a slot, and `(branch_id, service_date)` for the staff book,
which only ever asks "this branch, this service day". Neither answers the
other's question — a date column cannot express an interval, and an interval
cannot express a night that ends after midnight.

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

The customer's bell. One account's rows, read by that account and nobody else —
**not** a customer-side copy of `staff_notifications` (§8b): that table is
addressed to a *branch* and read by whoever is on shift, which is why it needs a
separate `staff_notification_reads` table to answer "have *I* seen this". Here
the reader is the row's owner, so `is_read` is a column.

| Field | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users.id | |
| type | enum(`order`,`reservation`,`promo`,`referral`,`system`) | |
| title | varchar(160) NULL | the words, **when the server wrote them** — see below |
| body | text NULL | |
| payload | jsonb NULL | what the row is about; for `order`: `{ orderId, code, status }` |
| is_read | boolean DEFAULT false | |
| created_at | timestamptz | |

**`title`/`body` are null for everything a client can draw itself**, which is
every `order` row. Those carry `payload` and the client renders the line from
the dictionary it already ships for its tracking screen — the map is
`ORDER_STATUS_COPY` in `@amragrir/i18n`, shared so the web and the app cannot
word the same fact differently.

They were `NOT NULL` until the bell was actually built, and the first thing
turning it on asked was: *in which language is `title` stored?* Every answer
that fills the column is wrong the same way — the row is frozen in whatever
language the reader preferred that day, so changing language in Settings leaves
the bell half-translated. The API cannot render it properly either: it compiles
to CommonJS under Node resolution and `@amragrir/i18n` ships TypeScript that
only a bundler reads.

So the columns mean what they should have meant: **prose the server authored**,
for the kinds with no key in any dictionary (`promo`, `system`), and null for
the kinds that describe themselves. It is §8b's conclusion — "the row carries
the numbers" — reached from the other direction: that table has no known reader
to pick a language for, this one has exactly one reader who is allowed to change
their mind.

Rows are written by `CustomerNotificationsService`, which subscribes to the
order event stream rather than being called from the three places that move an
order. Which statuses earn a row is BUSINESS_LOGIC.md §4.

**Deletion here is hard, and it is the exception in this schema.** Everywhere
else a removal is soft, because the row is a fact somebody may later have to
account for — an order, a staff assignment, a menu item that was on sale at the
time. A notification is not that. It is a *message about* a fact, and the fact
lives in `orders` and `order_events`, untouched by the cross in the bell. A
`deleted_at` column here would mean keeping rows nobody can ever read again, to
preserve a second copy of information that is preserved properly elsewhere.

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
