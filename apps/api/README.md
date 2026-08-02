# @amragrir/api

NestJS backend for all three clients (mobile, web, admin).

## Stack

NestJS 11 + PostgreSQL (Prisma 6) + Redis (cache/queues/OTP — wired in Phase 1).
See [docs/DEVELOPMENT_GUIDE.md](../../docs/DEVELOPMENT_GUIDE.md) and
[docs/API_DOCUMENTATION.md](../../docs/API_DOCUMENTATION.md).

## Local development

Prerequisites: Node ≥ 20, pnpm (via `corepack`), and **Docker Desktop** for
Postgres + Redis.

```bash
# 1. Install workspace deps (from the repo root)
corepack pnpm install

# 2. Start Postgres + Redis
docker compose up -d            # from the repo root

# 3. Configure env
cp apps/api/.env.example apps/api/.env

# 4. Create the schema and generate the client
corepack pnpm --filter @amragrir/api exec prisma migrate dev --name init
corepack pnpm --filter @amragrir/api exec prisma generate

# 5. Seed demo data (categories, 22 restaurants / 76 branches, menus, tables,
#    ~250 staff accounts, and ~5 orders per branch with their full history)
corepack pnpm --filter @amragrir/api db:seed

# 6. Run
corepack pnpm --filter @amragrir/api dev
```

API is served at `http://localhost:3000/v1`. Smoke test: `GET /v1/health`
returns `{ "status": "ok", "db": "up", "time": ... }`.

**`dev` recompiles this app, not the packages it imports.** `@amragrir/shared`
is resolved as a built package (`dist/`), so a change to an enum or a status
table there does not reach a running API until that package is rebuilt —
`nest start --watch` watches `apps/api/src` and nothing else. The symptom is
specific and confusing: the API rejects a value the client is certain is valid,
because it is validating against the old copy of the enum. `turbo run dev` now
depends on `^build` so this is handled; if you are running the app's own script
directly, rebuild first:

```bash
corepack pnpm --filter @amragrir/shared build
```

`pnpm start` is worse in the same way — it runs `dist/main.js`, a build of
**this** app that nothing rebuilds for you. Use `dev` unless you mean to test a
production build, and run `build` before `start` when you do.

## Structure (current)

```
prisma/
├── schema.prisma     # all tables — implements docs/DATABASE.md
├── seed.ts           # dev seed: 2 restaurants from the design + 20 demo chains, staff
├── categories.ts     # the menu categories the seed plants — importable without
│                     #   running it, which is what lets them be checked
├── menu-photos.ts    # the photograph each demo dish points at, and the trade
│                     #   hotlinking it makes
├── refresh-photos.ts # `db:photos`: gives every demo dish the picture for what
│                     #   it is, on a database that is already up
├── seed-orders.ts    # dev seed: orders per branch + the history each one collected
└── seed-activity.ts  # dev seed: audit_log — what each staff member has been doing
public/
└── menu/             # placeholder dish photos, one per category — the fallback
                      #   for MENU_PHOTOS=local (see its own README)
src/
├── main.ts           # bootstrap: /v1 prefix, ValidationPipe, error filter, CORS,
│                     #   and the two image mounts (/uploads, /static)
├── app.module.ts     # module wiring; global guards + idempotency interceptor
├── config/           # env.validation.ts — fail-fast env schema
├── prisma/           # global PrismaModule + PrismaService
├── redis/            # global RedisModule — OTP storage, refresh-token registry
├── sms/              # SmsSender interface + dev console sender
├── auth/             # OTP, JWT issue/rotate, guards, decorators
├── users/            # GET/PATCH /me, settings, language
├── catalog/          # public: categories, restaurants, menu, tables
├── orders/           # cart quote, orders (pickup), pricing, codes, WS gateway
├── payments/         # PaymentProvider interface + dev provider, /payments, deposits
├── reservations/     # availability, table booking, deposit lifecycle
├── restaurant/       # kitchen queue, status transitions, branches, menu CRUD,
│                     #   and one dish's change history
├── staff/            # back-office identity: invites, roles, reach, activity
├── uploads/          # POST /uploads/menu-photo — raw-body image upload, sniffed
│                     #   by magic number and written to UPLOAD_DIR
├── audit/            # writing `audit_log` — the read side lives with each
│                     #   thing it is about (staff activity, menu history)
├── admin/            # metrics, role changes, restaurants, promo coupons
├── favorites/        # saved restaurants
├── referrals/        # referral codes, coupons, reward points
├── health/           # GET /v1/health (liveness + DB/Redis reachability)
└── common/           # error filter, i18n resolution, idempotency interceptor
```

Modules to come, per DEVELOPMENT_GUIDE.md §2: `reservations`, `favorites`,
`referrals`, `reviews`, `notifications`, `admin`.

## Live order status

`ws://localhost:3000/v1/orders/stream` — plain WebSocket. Authenticate in the
first message, because a browser cannot set headers on a handshake:

```json
{ "event": "subscribe", "data": { "token": "<accessToken>", "orderId": "…" } }
```

The reply is the order's current state; every later change arrives the same
way. Fan-out is an in-process emitter (`order-events.service.ts`) — **that is
the file to change before running a second API instance**, since a socket on
one instance would not hear a change made on another.

To move an order through the kitchen locally, sign in as the seeded owner
(`+37400000000`, OTP in the API log) and
`PATCH /v1/owner/orders/{id}/status`.

## Money notes

- **Pricing lives in `orders/pricing.ts`** as pure functions, and both the cart
  quote and order creation call it — that is what makes a quote and the order
  it becomes impossible to disagree.
- **`POST /orders` and `POST /payments` require an `Idempotency-Key` header.**
  Add `@Idempotent(scope)` to any new endpoint that creates money or an
  obligation; the interceptor is registered globally and inert without it.
- **The dev payment provider approves everything** and logs it. Send
  `"token": "decline"` (or `depositToken` when booking) to force a decline and
  exercise the failure path. Replace the `useClass` in `PaymentsModule` when an
  acquirer is chosen.
- **Deposits are holds, not sales** — `DepositsService` uses
  `authorize`/`capture`/`release`, and `depositOutcomeFor` in
  `@amragrir/shared` decides which applies. Do not add a second copy of that
  rule to a new caller.
- **Booking runs in a serializable transaction with a retry.** If you touch
  `claimTable`, keep both: the isolation level is what makes "check then
  insert" indivisible, and serialization failures are expected under
  contention, not bugs.

## Auth notes

- **Every endpoint requires a bearer token unless marked `@Public()`** — both
  `JwtAuthGuard` and `RolesGuard` are registered globally, so a new endpoint is
  protected by default.
- Gate an endpoint with `@Roles(Role.Owner)` and/or `@RequiresVerifiedPhone()`;
  read the caller with `@CurrentUser()`.
- In dev the OTP is **printed to the server log** by `ConsoleSmsSender`
  (`[SMS] [dev] to +374...: Amragrir: 1234`) — that is how you complete a login
  locally. Replace the `useClass` in `SmsModule` when a provider is chosen.

## Seed data

Two restaurants are drawn from the design (`sunny-table`, `greenhouse`, one
branch each). Twenty more exist to make the clients testable at a realistic
shape: **2 chains of 10 branches, 4 of 5, 6 of 3 and 8 of 2 — 74 branches.**

The spread is deliberate. A dataset where every restaurant has one branch
cannot show whether the back office's restaurant-then-branch pickers, its
branch filter or its pagination work at all; one where they all have ten is
just as unrepresentative of a market that is mostly single-site restaurants.
Ten of the 74 open closed, so the "Closed" badge has something to render.

Everything is **derived from the index, never randomised** — a seed that
produces different data on each run makes a bug found this morning
unreproducible this afternoon. Menus are shared by kind (`MENUS`) rather than
written per restaurant: a pizza place sells pizza whichever pizza place it is,
and twenty hand-written menus would be twenty chances to typo a price. Every
branch gets its own copy, because a menu item hangs off a branch — that is what
lets one branch sell out a dish while the rest carry on.

Re-running is safe: restaurants upsert by slug, and one that already has a
branch is skipped whole.

**Every dish gets a picture**, because a dish cannot be added without one. There
is no photography behind demo data, so each points at the placeholder for its
category (`public/menu/<category>.svg`) and `backfillMenuPhotos` fills in
anything left over from before the rule — including menus this seed planted in
an earlier run. The summary line prints `menuItemsWithoutPhoto`, which should
always be `0`.

### Staff

The platform comes **staffed**, not with two demo logins: every restaurant gets
its own `restaurant_admin`, every branch a `restaurant_manager` and two
`branch_staff` — roughly 250 accounts across the branches above. Without them
the back office is true but empty: the People tab holds two rows, a restaurant's
own page can only ever show one group, and nothing exercises a role scoped to a
*branch*, which is most of what the permission model is for.

It staffs **whatever is in the database**, not just the seeded restaurants — one
added by hand through the panel gets a team on the next run.

| Address | Role |
|---|---|
| `admin@amragrir.local` | `super_admin` — every tab |
| `owner@amragrir.local` | `restaurant_admin` on every seeded restaurant |
| `admin@<restaurant>.amragrir.local` | that restaurant's own admin |
| `manager.<branch>@<restaurant>.amragrir.local` | that branch's manager |
| `staff1.<branch>@<restaurant>.amragrir.local` | a shift on that branch |

All share the dev password. Sign in as `staff1.tigran-mets@karas.amragrir.local`
to see what a shift actually gets: one branch, no People tab, no platform.

The shape is deliberately imperfect, because a directory where everyone is
identical proves nothing. **Every third branch of a chain is covered by the
manager next door** — one person, two rows, which is the case a page listing
"who works here" has to render honestly. Roughly one in seven has never signed
in and one in twenty-nine is deactivated, so the "never signed in" and
"Deactivated" states have something to render. Three invitations are left
**unaccepted**, because the People tab has a whole section for those and a
section that is never populated in dev is one nobody notices is broken.

Names and sign-in dates are derived from a hash of the address, so re-running
finds the same people rather than renaming the staff. Addresses come from the
restaurant and branch rather than a counter, which is what makes the whole thing
idempotent — accounts are created with `skipDuplicates`, so one whose password
somebody has since changed is left exactly as it is.

### Orders, and the history behind each one

`seed-orders.ts` gives **every branch four to seven orders** — roughly 420 across
the seeded platform — placed by a dozen demo diners (`+3747700000…`). Without
them the order board is empty on a fresh database, and nothing about the queue,
the status flow, the payment states or the History dialog can be looked at
without typing orders in through the API one at a time.

The spread is the point, again. Every branch gets **at least one order waiting
and one in the kitchen**, so no stage tab is empty; the rest are mostly
completed with some cancelled. Roughly a third of the orders at a
reservation-capable branch are **dine-in**, with a real booking, a real table
and a per-head deposit — credited against the bill, never added to it. Payments
land on all three methods and every one of them is `captured`, because that is
the only outcome the API produces now that cash is gone; a cancelled order is
one that was never paid for, so none of them carries a refund. Item names are
snapshotted **in the diner's own language**, so the board carries the mix of
Armenian, Russian and English that a real one would.

Each order is written with the `order_events` it would have collected: placed by
the customer, paid by the customer, and moved through the kitchen by somebody who
actually works at that branch. About one order in seven had a **card refused
before one worked**, and some sit unpaid after a refusal nobody retried — the
case `order_events.type = 'payment'` exists for. A few carry an **impersonated**
session, so the "acting as" line has something to render.

### What the staff have been doing

`seed-activity.ts` fills `audit_log`, which the services write as changes happen
— so a fresh database has an empty one and the People screen's activity panel
has nothing to render. Every sentence that panel can build is unreachable until
somebody spends an afternoon clicking through the back office.

It writes **every action type**: dishes added, re-priced, marked sold out and
taken off the menu; branches opened, closed, re-phoned and re-estimated; people
invited, invitations withdrawn, roles revoked; and one impersonation. One entry
per restaurant is made **by the super admin while acting as a manager**, because
nothing else in dev produces the line that names both people. The order half of
the feed needs nothing here — `seed-orders.ts` already writes `order_events`
with staff actors, so the merge has both sides.

**The entries are made true, not just written.** The dish each `menu_item.delete`
names really is soft-deleted, and the branch each closure names really is closed.
A seeded audit trail describing changes the database does not reflect is worse
than an empty one, because the whole value of the table is that it can be
believed.

Timestamps are wrapped into a three-week window rather than jittered around a
per-action base, and the offset comes from a digest rather than the string hash
used elsewhere. Both matter for a feed somebody is meant to look at: too little
spread and the newest page is twenty-five deletions in a row, and a weak hash
put a whole seed's worth of entries into four distinct days.

Idempotent in a stronger sense than the rest of the seed: every row's id is
derived from what it describes, so a re-run **replaces exactly its own rows** and
cannot touch an entry the running application wrote. Changing the shape of the
seeded timeline and re-running therefore updates it, instead of silently keeping
whatever the first run produced.

Orders that already existed get history too. The `order_events` migration
backfilled a `created` entry for each; the seed adds one more where a history
does not reach its order's current status, taken from `orders.status` and
`orders.updated_at`, attributed to `system` and flagged `detail.reconstructed` so
the dialog prints a note saying it was inferred. Guessing a name there would be
worse than admitting the gap.

Idempotent like the rest: an order's code is derived from its branch key, so a
re-run finds the ones it made last time and adds nothing. **Deterministic, not
random** — the same key produces the same orders on every database, which is what
makes a bug found on one reproducible on another. A branch with no menu items
gets no orders, because there is nothing to order.

## Images

Two mounts, both outside `/v1` — these are files, not an API version.

- **`/uploads/…`** serves `UPLOAD_DIR` (default `./uploads`, git-ignored). Menu
  photos land there through `POST /v1/uploads/menu-photo`: the image is sent as
  the **raw body** under its own `Content-Type`, sniffed by magic number, and
  written as `<uuid>.<ext>` — the sniffed type picks the extension, so what the
  request claimed never decides what the file is served as. Local disk is the
  honest shape of this deployment; the URL is built in one place
  (`UploadsService`) so an object store is one change.
- **`/static/…`** serves `public/`, which is committed. `public/menu/*.svg` are
  the placeholder dish photos — the fallback, since the seed hotlinks real
  photography now (below).

Both are absolute against **`API_PUBLIC_URL`**, because that is what a dish
stores. Change it after photos exist and the old ones point at the old host.

### Demo dishes get real photographs

`prisma/menu-photos.ts` maps each seeded dish to a photograph of that dish —
recipe photos from TheMealDB/TheCocktailDB, freely-licensed pictures from
Wikimedia Commons — and each category to one for the dishes it has no picture
of. They are **hotlinked, not downloaded**: no images in the repository, no
licences to carry, and the demo menu looks like a menu instead of a wall of
gradients. The cost is that they live on somebody else's servers, so
**`MENU_PHOTOS=local`** seeds the committed placeholders instead for a demo with
no way out to the internet.

Every URL in that table was fetched and looked at before it was written down. A
keyword search for "cola" returned a bottle among sugar skulls and one for
"lemonade" a museum's empty pitcher — a menu is a list somebody reads with their
eyes, and test data that looks wrong teaches the wrong thing about the screens
built on it.

Two things to know before these reach a browser: **Wikimedia rate-limits
bursts** (a page loading a dozen thumbnails is ordinary traffic; a script
fetching forty of them in a row gets 429s), and **`next/image` refuses hosts it
was not told about** — when `apps/web` starts rendering menus, those hosts need
an `images.remotePatterns` entry in `next.config.ts`, or `MENU_PHOTOS=local`.

```bash
pnpm --filter @amragrir/api db:photos     # a database that is already up
```

Gives every demo dish the picture for what it is, without re-seeding anything
else. The seed calls the same function, so a fresh database and a running one
end up saying the same thing. It rewrites a row with **no** photograph or one
this seed put there, and **never** a photograph somebody uploaded — that is the
one image in the table anybody actually chose. Idempotent; a second run says so.

Both directories are resolved **next to `dist/`, not inside it** — `public/` is
not copied by the build, so any deployment that ships only `dist/` has to bring
`apps/api/public` with it, and `UPLOAD_DIR` has to be a volume that survives a
deploy or every uploaded photo 404s on the next one.

## Notes

- Enums/constants come from `@amragrir/shared` — do not re-declare statuses as strings.
- The `package.json#prisma.seed` config triggers a deprecation warning on
  Prisma 6 (Prisma 7 wants `prisma.config.ts`); harmless for now.
