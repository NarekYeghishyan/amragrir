# Changelog

> Every product/business-logic/schema/API/UI change gets a dated entry here —
> see "Keeping documentation in sync" in [AI_CONTEXT.md](./AI_CONTEXT.md) for
> which doc file to update alongside it. Loosely follows
> [Keep a Changelog](https://keepachangelog.com/). Dates: `YYYY-MM-DD`.

## [Unreleased]

- **Referral discount rate changed from 5% to 2%** (both give and get side of "Give X%, get X%"). Stacking cap stays at 25%. Updated: BUSINESS_LOGIC.md, PROJECT_OVERVIEW.md, USER_FLOW.md, SCREENS.md, API_DOCUMENTATION.md (example `discountEarnedPct`), AI_CONTEXT.md.
- **Repo moved from docs-only to a monorepo skeleton.** `git init`; pnpm workspaces + Turborepo (dropped Nx as an alternative — committed to one tool); added `apps/{api,mobile,web,admin}` and `packages/{shared,i18n,ui,config}`. `apps/*` are placeholders (package.json + README with the real scaffold command) — none are scaffolded yet.
- **New decision: dedicated `apps/admin`.** Owner + admin roles combined into one RBAC-gated React+Vite SPA (no SSR — internal tool only), separate from the customer-facing `apps/web` (Next.js, kept for public-page SEO). Previously the architecture doc had no explicit home for the owner/admin panels. Updated: DEVELOPMENT_GUIDE.md (stack table, monorepo tree, roadmap items 4–5).
- `packages/shared/src/{enums,constants}.ts` now hold the real statuses/roles/business constants transcribed from BUSINESS_LOGIC.md and DATABASE.md (including the referral rate above), so `apps/api`/`apps/mobile`/`apps/web`/`apps/admin` have one place to import them from instead of redefining as strings.

### Phase 0 — API foundation (apps/api scaffolded)

- **`apps/api` is now a real NestJS 11 app** (was a placeholder): `/v1` global prefix, global `ValidationPipe`, a unified error filter emitting `{ error: { code, message, details } }` per API_DOCUMENTATION.md, env validation (fail-fast), CORS, and a `GET /v1/health` liveness + DB-reachability check.
- **Prisma schema** (`apps/api/prisma/schema.prisma`) implements all 15 tables + enums from DATABASE.md (users, restaurants, branches, tables, categories, menu_items, orders, order_items, reservations, payments, reviews, notifications, favorites, referrals, coupons) with the recommended indexes and cascade rules.
- **Committed to Prisma** over TypeORM (DEVELOPMENT_GUIDE.md stack table updated from "Prisma or TypeORM").
- **Local infra:** root `docker-compose.yml` (Postgres 16 + Redis 7) and `apps/api/.env.example`.
- **Dev seed** (`apps/api/prisma/seed.ts`): 11 cuisine categories + 2 demo restaurants (Sunny Table — all services + tables; Greenhouse — pickup only) with branches and menu, idempotent.
- **`packages/shared` now builds to CommonJS `dist`** so the CJS NestJS app can consume it; added a build script.
- **Verified end-to-end against a live database:** initial migration `20260721123512_init` applied to Postgres, seed loaded (11 categories, 2 restaurants, 2 branches, 9 menu items, 4 tables), and the running API returns `GET /v1/health` → `{"status":"ok","db":"up"}` with 404s in the documented error envelope.
- **Two bugs the smoke test caught** (build and typecheck both passed while the app could not boot):
  - `PORT` from `.env` arrives as a string and `enableImplicitConversion` did not coerce it, so env validation failed on `isInt` — fixed with an explicit `@Type(() => Number)`.
  - `incremental: true` combined with nest-cli's `deleteOutDir` produced stale builds (dist wiped, cache reporting files unchanged, so `src/prisma/*` was never re-emitted and the app crashed on a missing module) — removed `incremental`.
- **Known issue:** `turbo run build` can't locate pnpm when it's only a corepack shim; use per-package `--filter` builds until pnpm is on PATH (documented in root README).

### Phase 0 (cont.) — lint + test tooling closed out

- **`lint` and `test` were declared but non-functional** — the scripts existed in `apps/api/package.json` while eslint and jest were never installed, so both failed with "not recognized". DEVELOPMENT_GUIDE.md requires "CI: lint + typecheck + tests", so this was a real gap, not a cosmetic one.
- Installed and wired **eslint 9 (flat config)** — `packages/config` now ships its base config via an `exports` map (`@amragrir/config/eslint`) and declares `@eslint/js` + `typescript-eslint`; `apps/api/eslint.config.mjs` extends it and declares Jest globals for specs. Verified linting 11 files, 0 errors.
- Installed and wired **jest + ts-jest**, with `setupFiles: ["reflect-metadata"]` (decorator metadata is loaded by `main.ts` at runtime, but specs have no such entry point — without it every decorated class throws `Reflect.getMetadata is not a function` under test).
- **First 12 tests, all passing:**
  - `env.validation.spec.ts` — regression cover for the string-`PORT` boot failure above, plus range/missing-var cases.
  - `health.controller.spec.ts` — asserts the endpoint stays 200 with `db:'down'` rather than throwing when the DB is unreachable.
  - `shared-wiring.spec.ts` — proves `@amragrir/shared` actually resolves from the CommonJS API build. It was declared as a dependency but imported nowhere, so the wiring had never been exercised; this also pins the enum strings against the Prisma schema so the two can't drift.
- `tsconfig.build.json` already excluded `**/*.spec.ts`; confirmed `dist` still emits exactly the 8 production files.

### Phase 1 — Auth + Users

- **`users.phone` is now nullable** (migration `nullable_phone_for_guests`). DATABASE.md described it as `NOT NULL` *and* described guest accounts, which cannot both hold — a guest has no phone. It is filled on OTP verification, which is what lets a guest upgrade in place instead of creating a second account. DATABASE.md corrected.
- **OTP auth over Redis:** `POST /auth/send-code` and `/verify-code`. Codes are stored **hashed** (a Redis dump must not hand over live logins), are **single-use**, expire in 120s, are rate-limited by a 60s resend cooldown (**429** with `retryAfter`), and are **burned after 5 wrong attempts** — a 4-digit code is otherwise brute-forceable inside its window.
- **Phone normalisation:** every Armenian spelling (`99123456`, `099123456`, `+374 99 123 456`, `0037499123456`) collapses to one E.164 value. `users.phone` is unique and OTP keys derive from it, so two spellings of one number would otherwise become two un-mergeable accounts.
- **JWT access + refresh** (`@nestjs/jwt`): 15 min / 30 days. Refresh tokens are registered in Redis by id, are **single-use (rotated)** and **revocable** — otherwise a signed token would stay valid for its full 30 days after logout. Claims are re-read from the DB on refresh so a changed role or verification status takes effect.
- **Guest sessions** (`POST /auth/guest`) — anonymous account, no phone, browsing and basket only.
- **Both guards are global:** `JwtAuthGuard` (opt out via `@Public()`) and `RolesGuard` (`@Roles()`, `@RequiresVerifiedPhone()`). Secure by default — a new endpoint is protected unless it says otherwise. ROLES_AND_PERMISSIONS.md updated with implementation status.
- **`GET /me`, `PATCH /me`, `/me/settings`, `/me/language`** — all return the full profile so clients never need a follow-up read; duplicate email surfaces as **409**, unknown language as **400**.
- **SMS is behind a `SmsSender` interface** with a dev sender that logs the code. The Armenian provider stays an open question; swapping it in is a one-line change in `SmsModule`.
- **`POST /auth/social` deliberately not implemented** — verifying Apple/Google id tokens needs provider credentials that do not exist yet. Marked as such in API_DOCUMENTATION.md so the gap is not mistaken for an oversight. `referralCode` is likewise accepted but not yet applied (needs the referrals module).
- **Health check now also probes Redis** (`{"status":"ok","db":"up","redis":"up"}`).
- **49 tests passing.** Covers OTP rules (hashing, single use, cooldown, attempt burning, per-phone scoping), phone normalisation, role/phone-verification guards, and env validation. Verified end-to-end against the running API: registration, wrong code, replay rejection, `/me` reads and writes, refresh rotation, old-token revocation, logout, and guest sessions.

### Phase 1 review — three defects found and fixed

A self-review of the auth code before building on top of it turned up three real
problems, each confirmed against the running API before and after the fix:

- **Security: a refresh token was accepted as an access token.** Both kinds are
  signed with the same secret and nothing distinguished them, so a 30-day
  refresh token worked as a bearer credential on any endpoint — and because it
  carries no `role`, `RolesGuard` read `undefined` and would have waved it
  through anything not naming an explicit role. Both token kinds now carry a
  `typ` claim that is verified; tokens without one (older builds) are rejected.
- **Guest upgrade never worked, though the docs said it did.** `verifyCode`
  looked the user up by phone alone; a guest has none, so it always created a
  *second* account and orphaned whatever the guest had collected. It now honours
  an optional bearer on `verify-code` and upgrades that row in place. If the
  phone already belongs to someone, the caller is signed into that account and
  the guest session is abandoned rather than the two being merged implicitly.
- **429 responses were mislabelled `INTERNAL_ERROR` and dropped `retryAfter`.**
  `TOO_MANY_REQUESTS` was missing from the status→code map, and the error filter
  rebuilt the body from `message` alone, discarding context the client was
  documented to receive. Added `RATE_LIMITED`, and extra fields attached by a
  thrower are now forwarded in `details`.

Also closed a gap DEVELOPMENT_GUIDE.md mandates: **per-IP rate limiting on
`auth/*`** (`@nestjs/throttler`, 120 req/min globally and 10/min on auth). The
existing OTP cooldown is per phone number and does nothing against one host
spraying thousands of different numbers. In-memory storage is fine for a single
instance — switch to the Redis adapter before scaling out.

**79 tests passing** (up from 49), including regression cover for each defect
above. API_DOCUMENTATION.md updated with the error-code list, rate limits, token
non-interchangeability, and the real guest-upgrade semantics.

### DEVELOPMENT_GUIDE.md expanded

Added the conventions this codebase actually follows, several of them learned
the hard way earlier in this changelog:

- **API conventions** — `/v1` versioning, the single error envelope, what each
  status code means, secure-by-default routing, mandatory pagination with a
  server-side cap, server-side resolution of localised columns, and never
  returning internals.
- **Security baseline** — never trust the client, distinguish token kinds,
  revocable refresh tokens, secrets/codes hashed at rest, rate-limit anything
  unauthenticated or costly, fail-fast config, no PII in logs.
- **Observability** — health reports each dependency and stays 200 with a
  `down` marker.
- **Testing** — test business rules rather than the framework; **a green build
  is not a working app**, so exercise the running endpoint; every bug fix gets a
  regression test carrying the reason it exists.
- **Definition of Done** — an eight-point checklist ending in "docs updated" and
  "anything deliberately left out is written down".
- Roadmap reworked into a status table with the rationale for the two orderings
  that are easy to get wrong (catalog before any client; owner screens before
  dine-in).

### Phase 2 — Catalog (read-only)

- **`GET /categories`, `/restaurants`, `/restaurants/{id}`, `/restaurants/{id}/menu`, `/restaurants/{id}/tables`** — all public, no token at all, since browsing is open to unauthenticated visitors and the web app needs these pages crawlable.
- **List rows are branches, not restaurants.** A branch is what a guest travels to and what carries hours, coordinates and prep time; the restaurant supplies name, rating and services.
- **`{id}` accepts a branch id, a restaurant id, or a slug** — clients hold whichever the previous screen gave them, and guessing wrong should not be a 404.
- **Localisation resolved server-side** from `Accept-Language` (`hy` default, falling back through `hy` to any populated translation). Clients receive plain strings, never the raw `*_i18n` JSON.
- **Filters:** rating, declared services, free-text over name and cuisine, plus category and dietary — the latter two select branches having *at least one matching menu item*, since they describe dishes rather than the restaurant.
- **Sorting:** recommended, fastest, top-rated in SQL; `nearest` needs coordinates and is computed and paged in the application. Without coordinates `nearest` falls back to the default order rather than inventing a meaningless one. Distance uses Haversine in `geo.ts` — **move it into the query (PostGIS) before the catalog grows**, noted in the source.
- **`limit` capped at 50** server-side.
- **`priceMax` deliberately not implemented** — the design's price-per-person filter has no backing column; recorded as an open question rather than faked.
- **122 tests passing** (up from 79). Verified live against the seed: 11 categories in Armenian and Russian, distance sort (0.4 km vs 1.4 km from Republic Square), each filter, menu tabs, tables, plus 404 and validation paths.

### Phase 2 review — eleven defects fixed before building a client on top

A code review of the catalog and auth-fix branches found real problems in the
endpoints the mobile app is about to consume. Fixed here rather than after a
client had been written against them:

- **The "near me" query was unbounded.** With `sort=nearest` or `distMax`, the query ran with no `take` and no geographic predicate — every branch in the table was fetched, joined and distance-mapped in Node before slicing to one page. On a public, unauthenticated endpoint that is a memory-exhaustion vector, and it broke the pagination rule added to DEVELOPMENT_GUIDE in the same branch. Now narrowed in SQL by a bounding box (`geo.boundingBox`, using the `(lat, lng)` index) with a hard candidate cap, and `sort=nearest` without `distMax` applies an implicit 5 km radius — an order-ahead product has no use for a result 40 km away.
- **Rate limiting would have failed in production.** `ThrottlerGuard` keys on the client IP, but Express reports the *proxy's* address unless told how many hops to trust. Behind nginx/ALB every user would have shared one bucket, so the 10/min `/auth/*` limit would lock out the entire world. Added `TRUST_PROXY_HOPS` (default 0, since blindly trusting a forwarded header lets a caller spoof their IP).
- **A requested sort was silently discarded.** Passing `distMax` disabled the SQL `ORDER BY` while the in-app sort only ran for `nearest`, so `?distMax=2&sort=fastest` returned arbitrary order while the UI claimed fastest-first.
- **A restaurant id or slug resolved to an arbitrary branch.** `findFirst` had no ordering, so a multi-branch restaurant could serve a different branch's menu and prices on each request. Now deterministic (oldest branch); documented.
- **`distMax` compared the rounded display distance**, letting a branch 2.04 km away pass a 2 km filter. Now filtered on the true distance and rounded only for display.
- **Tables were ordered by a varchar**, listing table 10 immediately after table 1. Now numeric-aware, with non-numeric labels ("A1", "Terrace-2") sorted after.
- **Concurrent verification of the same phone returned a 500.** The find-then-create is not atomic; the loser hit the unique index and P2002 went unhandled. It now falls back to reading the row the winner created.
- **`dinein` vs `dine_in` drift.** Service values were hardcoded string literals in a DTO, spelled differently from `ServiceMode` in `packages/shared` — the exact duplication AI_CONTEXT.md forbids. Added `RestaurantService` to shared, documenting *why* the two vocabularies differ rather than letting them silently diverge.
- Also: the two copies of the `Authorization` header parser collapsed into one helper; `findOne` no longer returns an undocumented `language` field and has a real return type instead of `Record<string, unknown>`; `tables()` is typed; the list's `findMany` and `count` now run in parallel instead of sequentially.

**132 tests passing**, each fix carrying a regression test that names what broke.
Verified live: `distMax=5&sort=fastest` now orders Greenhouse (10 min) ahead of
Sunny Table (12 min), where before the order was arbitrary.

Deliberately not changed: the error filter still forwards any extra key a
thrower attaches (it needs a decision on whitelisting versus the current
convenience), and the catalog DTO tests still bypass class-transformer, so the
query-array parsing has no direct coverage.

### Phase 3 — First mobile slice

`apps/mobile` is now a real Expo app (SDK 57, expo-router) rendering live data
from the API: **auth → home → restaurant → menu**.

- **Read the versioned Expo docs rather than writing from memory.** The template ships an `AGENTS.md` warning that Expo has changed; SDK 57 pairs React 19.2 with React Native 0.86, and the router setup was taken from the current installation guide instead of an older recollection.
- **Screens:** `index` (greeting, category rail, nearby restaurants sorted by distance), `auth` (phone → OTP, two steps), `restaurant/[id]` (cover, rating, hours, menu tabs backed by `MenuTab` from `@amragrir/shared`).
- **`src/theme`** transcribes DESIGN_SYSTEM.md into tokens with a `ThemeColors` interface, so adding a colour to one theme without the other is a compile error rather than an `undefined` at runtime. Components read `useTheme()`; no raw hex anywhere else.
- **`src/api`** is the only place that talks to the server: it decodes the error envelope into a single `ApiError` type (network failures included, so screens have one error shape), and exposes typed calls rather than letting screens build URLs.
- **A guest session is created on launch**, so browsing works before sign-in; verifying a phone sends that bearer along and the server upgrades the same account. Token persistence is deliberately absent — it needs secure storage, which lands with checkout.
- **Money is formatted, never computed** on the client, per DEVELOPMENT_GUIDE.md.
- **14 tests** on the display helpers, and the app **bundles cleanly (788 modules)** — which is what proves `@amragrir/shared` resolves through pnpm's symlinks in Metro, the one genuinely uncertain part of the setup.
- **`pnpm` now has to be a real binary on PATH.** Both Turborepo and `expo install` shell out to it and fail with the corepack shim; installing it globally also cleared the `turbo run build` "known issue" recorded earlier.

**Not verified:** rendering, navigation and gestures on a device or simulator —
that needs a human to run `pnpm --filter @amragrir/mobile dev`. Every endpoint
the app calls was exercised directly, and the bundle builds, but no screen has
been seen on screen.

### Phase 4 — Basket, orders (pickup), payment, idempotency

The API can now take money for food. `POST /cart/quote`, `POST /orders`,
`GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/cancel`,
`GET /payment-methods`, `POST /payments`.

- **The basket stays on the client; the server owns the arithmetic.** A cart
  table would need syncing and conflict rules for state that is per-device and
  throwaway. `POST /cart/quote` prices a basket instead, and shares its pricing
  code with order creation — the quote and the order cannot disagree because
  they are the same function. API_DOCUMENTATION's "optional server-side cart"
  is now a decision rather than an open question.
- **Nothing about money comes from the client.** The order request carries ids
  and quantities; prices, names and prep times are re-read from the database.
  `POST /payments` has **no amount field at all** — the server charges the
  order's total.
- **Unknown fields are rejected, not ignored.** `couponCode` is documented in
  the design but unimplemented, so sending it is a 400. Accepting and dropping
  it would let a customer believe a discount applied.
- **Idempotency is mandatory on both money endpoints**, not advisory. A phone
  that loses signal after the server created the order will retry; without a
  key that is a second order. Redis-backed, scoped to endpoint **and** caller
  (a guessed key must not return someone else's order), fingerprinted on the
  body (same key + different basket → 409), and released on failure so a
  transient error cannot burn a key.
- **A quote reports problems; an order refuses them.** A sold-out or unknown
  dish comes back in `unavailable[]` with `canOrder: false` so the basket
  screen can flag the line, but the same basket sent to `POST /orders` is a
  422. A closed restaurant still gets prices.
- **The order state machine lives in `packages/shared`** (`ORDER_STATUS_FLOW`,
  `canTransitionOrder`, `isOrderCancellable`) because the owner panel will
  decide which buttons to render from the same table. Payment asks the machine
  whether `created → paid` is legal instead of checking statuses by hand.
- **Ownership is in the query, not a guard.** Every order lookup filters on
  `userId`, so no code path loads another user's order and then decides — and
  the answer is 404, not 403, which would confirm the id exists.
- **Two race windows closed** — both found by asking what happens between the
  check and the write, not by a failing test. `POST /payments` and
  `/orders/{id}/cancel` now match the **current** status in the `WHERE` clause,
  so paying cannot un-cancel a cancelled order and a cancel cannot land on an
  order the kitchen already started. The loser gets a 409. Added to
  DEVELOPMENT_GUIDE's security baseline as a rule.
- **Cancelling refunds before it cancels.** If the provider refuses, the
  customer keeps an order rather than having neither order nor refund; the
  remaining window (refunded, then the status write fails) is logged as
  needing manual reconciliation rather than pretended away.
- **`PaymentProvider` mirrors `SmsSender`** — nothing outside `PaymentsModule`
  names a provider. The dev implementation approves everything, and declines
  when the token is `decline`, so the declined path is reachable instead of
  written and never run. A decline records a `failed` payment and leaves the
  order `created`, so the customer retries on the same row.
- **Cash captures nothing but still commits the order** to `paid` — otherwise
  the kitchen never receives it (BUSINESS_LOGIC §5).
- **Pickup code is derived, not stored** — the last four digits of
  `orders.code` (`AMR-42774033` → `4033`), so the two can never disagree. With
  only 10,000 values a busy branch would repeat one about one time in eight at
  50 active orders, so generation also avoids clashing with an active order at
  the same branch. Best-effort by design and documented as such: only
  `orders.code` carries a unique constraint. **No schema change was needed.**
- **Prep estimate is the slowest dish, not the sum** — a kitchen cooks in
  parallel. Falls back to the branch average, then to a constant, so an
  unfilled column never schedules an order for "right now".
- **205 tests passing** (up from 132), including regression tests for both race
  windows.

**Verified against the running API**, not just the suite: sign-in, quote
(subtotal matched the menu prices), order creation, a replayed
`Idempotency-Key` returning the *same* order id, 409 on key reuse with a
different basket, 400 without a key, card capture, 409 on paying twice, the
active-orders list, cancel-with-refund, a declined card followed by a
successful cash retry, and the rule checks (dine-in 422, duplicate line 400,
`readyAt` too soon 422 with `earliestReadyAt`, qty over the cap 400, unknown
dish 422, coupon field 400). Cross-user isolation checked with two verified
accounts: every route answers 404 for the other's order.

Unrelated fix found while running the checks: **`apps/mobile` no longer
typechecked.** TypeScript 6 (Expo SDK 57) stopped pulling every
`node_modules/@types` package into the global scope automatically, so the spec
files lost `describe`/`it`/`expect` after a patch bump. Naming `"types":
["jest"]` in `apps/mobile/tsconfig.json` restores them. Confirmed the failure
exists on the previous commit too, so it is not a Phase 4 regression.

**Not built:** the basket, checkout and tracking **screens**. Phase 4 shipped
the API only — the endpoints exist and have been exercised, but nothing on a
phone calls them yet. Also deferred: `POST /orders/{id}/reorder`, dine-in
orders (422 until table booking), coupons and referral discounts, opening-hours
validation on `readyAt`, and the WebSocket order stream (`GET /orders/{id}`
already returns `secondsLeft`, so polling works meanwhile).

### Phase 5 (API) — Live order tracking, and the owner API that makes it move

- **Pulled the owner's status API forward from Phase 6.** Tracking with nothing
  able to change a status is untestable theatre — the same reasoning the
  roadmap already gives for putting owner screens before dine-in, applied one
  phase earlier. `GET /owner/orders` and `PATCH /owner/orders/{id}/status` ship
  here; the owner *screens* stay in Phase 6. Roadmap and rationale updated.
- **`wss://…/v1/orders/stream`** — plain `ws`, not socket.io, because React
  Native and every browser already ship a WebSocket client and the app needs no
  extra dependency for it.
  - **Authentication is the first message, not the handshake.** A browser
    cannot set an `Authorization` header on a WebSocket, and a token in the
    query string ends up in every access log on the way. A `subscribe` message
    carries it instead — which also lets one socket follow several orders, as
    the orders list screen needs.
  - **`subscribe` replies with the current state**, not only future changes. A
    client opening the tracking screen after the order moved would otherwise
    show stale data until the next transition — and for a finished order there
    isn't one.
  - Subscriptions authorise per order through the same visibility rule the REST
    endpoints use, and answer `Order not found` for both "missing" and "not
    yours", since a distinguishable error confirms the id exists.
  - 30s ping/pong sweep: a socket killed by a dropped mobile connection is
    otherwise never collected, because TCP alone can keep a dead peer open for
    hours. Disconnect and shutdown both release the emitter listener.
- **Status changes are published from one place.** `OrdersService.transition`
  now performs every move — customer cancel, owner advance — so the refund rule
  and the broadcast exist once and cannot drift. It matches on the status it
  read, so a change that lands in between loses with a 409 rather than being
  overwritten.
- **`paid` is not a status the panel may set.** Only a payment makes an order
  paid; a restaurant able to set it could mark an unpaid order as settled. The
  legality of every other move comes from the shared state machine, not a list
  written in the owner module.
- **The owner queue is scoped by a Prisma filter, not a check afterwards** —
  owner sees their restaurants' branches, admin sees all. A `branchId` query
  parameter narrows that scope and can never widen it, so passing someone
  else's branch id returns nothing rather than their orders. Ordered oldest
  first: a kitchen works a queue, not a stack.
- **`staff` is refused rather than approximated.** The schema has no
  user-to-branch link, so there is nothing to scope them by; lending them the
  owner's reach until that table exists would be worse than making them wait.
  Written down in ROLES_AND_PERMISSIONS rather than left as a silent gap.
- **Global guards now step aside for WebSocket contexts.** `JwtAuthGuard` and
  `RolesGuard` read `request.user`, which does not exist for a socket message —
  without this the gateway would have thrown on every frame. Both carry a test.
- **`OrderEventsService` is an in-process emitter and says so in its own
  docblock**: it is the first thing that breaks on a second API instance, and
  swapping it for Redis pub/sub is a change to that one file.
- **227 tests passing** (up from 205), including gateway tests for the snapshot
  reply, cross-order isolation, invalid tokens and listener cleanup.

**Verified live, end to end:** a customer placed an order, a socket subscribed
*before* payment, and the owner walked the order through the kitchen. The
socket received `created → paid → confirmed → preparing → almost_ready →
ready → completed` without a single poll. Also checked: a customer gets 403 on
the owner queue, the owner gets 422 skipping a step and 400 attempting `paid`,
a stranger's socket subscription gets `Order not found`, and a garbage token
gets `Invalid or expired token`.

### Phase 5 (mobile) — Basket, checkout and live tracking screens

`apps/mobile` now covers the whole ordering path: **auth → home → restaurant →
basket → checkout → tracking**.

- **`src/cart.tsx` holds the basket, and its rules are a reducer** rather than
  state scattered through screens, so they can be tested without rendering
  anything. Adding a dish from a second restaurant replaces the basket
  (BUSINESS_LOGIC §4) — but the *screen asks first*, because that is a decision
  only the customer can make. Quantity zero removes a line, and the last line
  leaving also forgets the restaurant, otherwise an empty basket would still
  claim a branch and prompt about "switching" from nothing.
- **No total is ever computed on the phone.** The basket carries menu prices
  only so a single line can be rendered before the quote returns; every
  subtotal, fee and total on screen is the answer to `POST /cart/quote`.
- **The idempotency key is created once per checkout attempt and kept in a
  ref** — deliberately *not* regenerated when placing the order fails. That is
  the entire point: a customer tapping "Place order" again after a dropped
  connection replays the first response instead of ordering twice.
- **Tracking loads over REST first and treats the socket as an optimisation.**
  If the stream never connects the screen still renders. It also shows
  `reconnecting…` rather than a countdown that has quietly stopped being live —
  a frozen timer looks exactly like a stuck order.
- **The stream client reconnects with backoff.** A phone loses its connection
  constantly — backgrounding, a tunnel, a lift — so this is not an optional
  extra; without it the tracking screen silently stops updating. Retry lives in
  `onclose` only, since `onerror` is always followed by one and handling both
  would schedule two reconnects per failure.
- The countdown ticks locally between server updates so it moves every second
  instead of jumping at each status change; any value from the server replaces
  it.
- Tracking has no back button: the order exists, and swiping back to checkout
  would offer to place it again.
- **32 mobile tests** (up from 14), covering the cart rules and the countdown
  formatting, and the app **bundles cleanly (1.2 MB web bundle)**.

**Not verified:** rendering, navigation and gestures on a device or simulator —
that still needs a human running `pnpm --filter @amragrir/mobile dev`. Every
endpoint and the exact WebSocket subscribe frame these screens use were
exercised directly against the running API, and the bundle builds, but **no
screen has been seen on screen.**

### Phase 6 — Back office: owner menu API and the `apps/admin` panel

`apps/admin` is now a real React + Vite SPA (was a placeholder README): sign in,
live kitchen queue, menu editing, and the open/closed switch.

**API — branch settings and menu management**

- `GET /owner/branches`, `PATCH /owner/branches/{id}`,
  `GET|POST|PATCH|DELETE /owner/menu-items`, scoped by the same Prisma filter as
  the order queue (`branchScopeFor`, `menuScopeFor` alongside `orderScopeFor`),
  so ownership is part of every query rather than a check afterwards.
- **The owner endpoints return raw `*_i18n` objects**, unlike the public menu
  which resolves one language. The owner is editing all three; resolving would
  make the other two invisible and silently unsaveable.
- **`nameI18n.hy` is required** — it is the fallback every other language
  resolves to, so a dish without it renders nameless for most visitors.
- **Blank translations are dropped before storing.** An empty string is not a
  translation and it beats the `hy` fallback in `localize()`, which would leave
  the dish nameless in exactly the language someone chose.
- **A dish that has ever been ordered cannot be deleted** → 409 telling the
  owner to mark it unavailable instead. `order_items` points at it, and an order
  that can no longer say what was bought is not an order. No soft-delete column
  was added: `isAvailable` already means "not on the menu".
- **`reservationsEnabled` is refused on a branch** — it lives on the restaurant,
  so accepting it here would silently change every other branch. Documented
  rather than quietly half-implemented.
- **Changing a price does not touch existing orders** (order items store what
  they were bought at), with a test that asserts nothing else is written.
- **241 API tests** (up from 227).

**Panel**

- **Status buttons are derived from `ORDER_STATUS_FLOW`**, not written out
  again — the panel can only offer moves the API accepts, so it cannot show a
  button that 422s. `paid` is filtered out because only a payment makes an
  order paid.
- **Nothing is optimistic.** Advancing a status waits for the server's
  broadcast; a kitchen acting on a status that did not save is worse than a
  moment of latency.
- **One socket for the whole board**, re-subscribing every watched order after a
  reconnect — a reconnected socket knows nothing about old subscriptions, so
  tracking them separately is what stops it silently watching nothing.
- **Token refresh is single-flight.** Refresh tokens are single-use and rotated,
  so two requests expiring together would each spend the same one and the loser
  would be logged out. This is not theoretical for a panel left open all shift
  with a 15-minute access token.
- `localStorage` for tokens, with the trade-off written down in the README
  rather than left implicit: readable by any script on the page, accepted for an
  internal tool, **revisit before exposing it beyond the restaurant's network.**
- No router — three tabs and nothing to deep-link. 12 tests, 207 kB bundle.

**Two build problems this uncovered, both worth recording**

- **`@amragrir/shared` was CommonJS only**, which Rollup could not take named
  exports from, so the panel would not build. It now ships **both** builds with
  an `exports` map (CJS for the NestJS API, ESM for Vite). TypeScript resolves
  types next to the resolved JavaScript file, so the ESM build emits its own
  declarations — pointing the ESM condition at the CommonJS `.d.ts` looks
  tidier but simply does not resolve.
- **Deleting `dist` did not force a rebuild.** `tsconfig.tsbuildinfo` sat
  outside it and reported everything current, so `tsc` emitted nothing and every
  consumer failed with "cannot find module" — the same class of stale-build trap
  as Phase 0's `incremental` + `deleteOutDir`. The build info now lives inside
  `dist`, so removing it genuinely resets the build.
- `esbuild` added to `allowBuilds` in `pnpm-workspace.yaml` (pnpm blocks install
  scripts by default; Vite needs the platform binary it places).

**Verified live against the running API:** the branch switch (and a 422 when
ordering from a closed branch), creating a dish with partial translations and
seeing the public endpoint resolve `ru` and fall back to `hy` for the
description, price and availability edits, a 422 when ordering a dish just
marked sold out, a 409 deleting an ordered dish, a successful delete of an
unordered one, and every scoping and validation path (403 for a customer, 404
for a branch the owner does not own, 400 for a missing Armenian name and for
`reservationsEnabled`).

**Not verified:** the panel has not been opened in a browser. It typechecks,
builds, and every request it makes was exercised directly — but no screen has
been seen.

### Phase 7 — Table booking and deposits

`GET /restaurants/{id}/availability`, `POST /reservations`, `GET /reservations`,
`GET /reservations/{id}`, `POST /reservations/{id}/cancel`, dine-in orders, and
the owner's booking book.

**A booking is a seating, not an instant.** It holds a table for 90 minutes,
which is why 19:00 and 19:30 conflict on the same table — modelling a booking
as a point in time would have sold the same table twice with no error anywhere.
Slots are offered every 30 minutes, and the last one is a full seating before
closing: offering 22:30 when the kitchen shuts at 23:00 sells a table nobody
can use.

**Availability is answered per party size.** "19:00 is free" is meaningless
without knowing whether it is free for two or for eight. The server also picks
the table — always the smallest that fits, so a pair does not consume the only
six-seater — because letting a client name one means trusting it to have read
availability correctly.

**Times are Yerevan local, deliberately.** A guest choosing "19:00" means 19:00
at the restaurant; generating slots in UTC would have offered times four hours
off. Armenia is UTC+4 all year (no DST since 2012), so the offset is a named
constant — expanding beyond Armenia becomes a visible change to that line
rather than a silent hour-off bug in every booking.

**Exclusivity is enforced twice, and the second one nearly introduced a bug.**
The "is this table free" check and the insert that makes it not free run in one
**serializable** transaction, with a retry, because serialization failures are
contention rather than errors. A unique index backs it up — but the obvious
`(table_id, reserved_for)` would have blocked a table and time **forever** once
anyone cancelled. It is keyed on a new `active_slot` column that mirrors
`reserved_for` while the booking is live and goes NULL when it ends; Postgres
treats NULLs in a unique index as distinct, so cancelling frees the slot.

**A deposit is held, not charged.** That distinction is the entire product
promise — cancel in time and the money was never taken — so `PaymentProvider`
gained `authorize`/`capture`/`release` alongside `charge`/`refund`. What
happens at the end is one function in `shared` (`depositOutcomeFor`) that both
the guest's cancel and the owner panel call, so they cannot disagree about who
keeps the money: released if cancelled ≥2h ahead, captured on a late
cancellation or a no-show, captured and credited when the guest actually ate.
A booking that fails after the hold succeeds releases it; a booking whose
deposit is declined is not made at all.

**`no_show` is reachable only from `confirmed`.** A table nobody promised to
hold cannot be a no-show, and the deposit rule depends on that distinction.

**Schema:** `payments.order_id` is now nullable with a new nullable
`reservation_id`, plus a `CHECK` that exactly one is set — Prisma cannot
express it, so it is raw SQL in the migration. Without it, "nullable order_id"
would quietly permit an orphan payment no reconciliation could attribute to
anything. A separate `deposits` table would have duplicated every provider
field and status transition for no gain.

**Dine-in orders** now exist: `serviceMode: "dine_in"` requires a
`reservationId` the caller owns, at the same branch, still active, without an
order already. The quote gains `dueNowAmd` — the meal minus the deposit
already held — while `totalAmd` stays the meal, because the deposit is credited
rather than charged twice.

**A latent hole the tests caught:** `quote` took `userId` as optional, so a
dine-in basket could skip the reservation check entirely by omitting it. Made
required.

**307 tests** (up from 241), including the slot arithmetic, every deposit
outcome, and the cancel-frees-the-slot regression.

**Verified live**, including the two things unit tests cannot prove:
- **Two simultaneous requests for the last free table: exactly one booked, one
  got a 409.**
- **Filling all four tables at 17:00 closed 16:00 through 18:00 and left 15:30
  and 18:30 open** — the seating window, end to end.

Plus: the deposit held at booking (`authorized`), untouched through
`confirmed`/`seated`, captured and credited on `completed`; a no-show capturing
it; a cancellation releasing it and the freed slot immediately rebookable; the
dine-in order showing 8760 total with 4000 held and 4760 due at the table; and
every rule and scoping path (off-grid time, past time, oversized party,
pickup-only restaurant, declined deposit, another guest's booking → 404, a
customer reading the owner book → 403).

**Not built:** the booking, availability and reservation screens in
`apps/mobile`, and the booking book in `apps/admin`. This is the API only.
Deferred and written down: per-restaurant seating lengths, real `open_hours`
(availability falls back to a documented 10:00–23:00), and table management
(`/owner/tables`).

### Phase 8 — Favourites, search, filters, referrals and rewards

`GET|POST|DELETE /favorites`, `GET /search`, `GET /search/popular`,
`GET /referrals/me`, `GET /coupons`, plus `couponCode` on quotes and orders.

- **The referral program now actually pays out.** `referralCode` on
  `verify-code` was accepted and ignored since Phase 1; it now attributes the
  account and issues the newcomer's 2% coupon. Guards that matter: attribution
  only for a genuinely **new** account (re-verifying an existing phone with a
  friend's code would be a discount generator), self-referral ignored, and an
  unknown code ignored rather than failing a signup over a typo.
- **The inviter is paid on the invitee's first *paid* order**, not at signup —
  otherwise inviting a hundred throwaway numbers earns the full 25% for free.
  `users.referred_by` is cleared in the same transaction, which is what makes
  the credit once-per-invitee rather than once-per-order. Verified live: a
  second paid order left the figure unchanged.
- **Stacking is accumulation into one coupon**, not a pile of 2% rows. The
  design shows a single "discount earned" figure, and a 25% cap is meaningless
  unless something adds up to be capped. A spent reward restarts at 2% —
  flagged as an open question, since the other reading is defensible.
- **A quote previews a coupon; an order claims it.** Pricing a basket must not
  spend the coupon the guest is only looking at. The claim is a conditional
  update (`usedAt: null` in the filter), so two orders submitted at once cannot
  both apply it — the loser gets a 422 instead of a double discount.
- **Cancelling an order returns the coupon**, and an order that fails to insert
  releases the coupon it just claimed. Both have tests.
- **A rejected coupon code is reported, not swallowed.** The quote carries
  `coupon: { code, applied: false }` so the basket can say so, rather than
  quietly charging full price — the same reasoning that made unknown fields a
  400 in Phase 4.
- **Discounts apply to the subtotal, not the total** (the service fee is the
  platform's), are capped at 25%, and round **down** so rounding never costs the
  customer.
- **Reward points: accrual only.** One point per 100֏ of subtotal, on payment.
  **Redemption is deliberately unbuilt** — the design shows a balance but no way
  to spend it, and inventing a rate would invent an economy nobody agreed to.
  Written into the open questions rather than guessed at.
- Points and referral credit run **after** the payment commits, and each failure
  is logged rather than raised: loyalty bookkeeping must never tell a customer
  their successful payment failed.
- **The price-per-person filter is implemented**, closing an open question left
  since Phase 2. Derived as the average price of a branch's available dishes
  rather than a stored column that every menu edit would have to keep in step;
  documented as the approximation it is. A range matching nothing returns an
  empty list rather than silently dropping the filter.
- **Dish search matches any language.** It runs over the whole `name_i18n` blob,
  so "bowl" finds «Боул с киноа» and "боул" finds "Quinoa Bowl" — verified both
  directions live. Restaurants and dishes come back as two lists, because
  "Sushi" is both a cuisine and a dish.
- **Popular tags are static and labelled as such.** Real popularity needs query
  logging that does not exist; a table nothing writes to would look like a
  feature and return nothing.
- **Favourites are idempotent both ways** — a double tap is not an error, and
  removing something absent leaves the caller in the state they asked for. They
  carry a `branchId` so a card links somewhere orderable.
- Schema: `orders.coupon_id` + `orders.discount_amd` (stored, not recomputed —
  a referral coupon's percentage grows, and a past order must keep saying what
  was actually charged), and `coupons` unique on `(user_id, code)` because a
  coupon code is personal. `ON DELETE SET NULL`, so deleting a coupon can never
  delete the order that used it.
- **349 tests** (up from 307).

**One bug found by the live run, not by the suite:** the discount was applied to
the total but missing from the order response, so the app could not show "you
saved 168֏". Fixed, with a regression test. The suite had asserted the maths and
the storage but never the shape of the reply.

**Also caught by lint, not by tests:** `AuthModule` imported `ReferralsModule`
without adding it to `imports`, which typechecks and passes every unit test but
fails at boot. Another instance of "a green build is not a working app".

**Verified live:** cross-language dish search, the price filter against real
menu averages (both restaurants average under 4 500֏, so `priceMin=4500`
correctly returns nothing), idempotent favourites, signup attribution, the
coupon surviving a quote and being spent by an order, 422 on reuse, the coupon
coming back after a cancellation, 84 points for an 8 400֏ subtotal, the inviter
credited exactly once, and 403 for guests on favourites and referrals.

**Not built:** the favourites, search and referral **screens** in `apps/mobile`,
and `POST /referrals/share` (sharing happens in the OS share sheet; there is
nothing for the server to do until share analytics are wanted).

### Phase 9 — `apps/web`: the public, indexable front door

`apps/web` is now a real Next.js 15 app (was a placeholder README): restaurant
listings, search, and the restaurant/menu pages the whole thing exists for.

- **The design follows from one rule: the HTML that leaves the server already
  contains the content.** Verified by stripping every `<script>` from a
  restaurant page — the name, menu and prices are still there. That is the
  reason this app is Next.js and not another Vite SPA.
- **Language moved into the URL, and this was the phase's real decision.** The
  app was first built the way the API works, negotiating `Accept-Language`.
  That is wrong here for one specific reason: a crawler sends a single header,
  so only one of the three languages would ever be indexed — defeating the
  purpose of building the app. Every page now lives under `/hy`, `/ru` or
  `/en`, linked with `hreflang` and `x-default`. `Accept-Language` is still
  consulted once, in middleware, to decide where a visitor at `/` lands.
  Recorded as an API convention in DEVELOPMENT_GUIDE.md, since it is the one
  place the project's own "resolve from the header" rule does not apply.
- **An unknown prefix is a 404, not a silent fallback** — `/de/r/x` must not
  serve Armenian at a URL that then gets indexed.
- **Pages are pre-rendered per restaurant per language** (`generateStaticParams`),
  with `dynamicParams` left on so a restaurant added after the build is still
  served and then cached. Data revalidates every 60s: short because `isOpen` is
  on these pages, where names and prices would tolerate hours.
- **JSON-LD `Restaurant` with the full menu**, so results can show the rating,
  address and price range rather than a bare link. Optional blocks are omitted
  rather than emitted empty — `aggregateRating` with a zero review count is
  invalid structured data, and a broken block costs more than a missing one.
- **`sitemap.xml` is generated from the API**, every restaurant × every
  language with alternates, and pages through the 50-item cap rather than
  assuming one request returns everything. A hand-kept list would go stale the
  first time a restaurant was added — the failure nobody notices.
- **Search is `noindex, follow`.** Per-query pages are near-infinite and
  duplicate the listings; `follow` keeps the restaurant links discoverable.
- **`packages/i18n` went from three empty `{}` files to real dictionaries** —
  only the keys web actually uses, per that package's own rule against
  speculative keys. `dictionaries` is now typed so every language must define
  the same keys: adding a string to one file and forgetting the others is a
  compile error rather than an Armenian word in an English page.
- 23 web tests, plus a live check of the rendered HTML: negotiation, three
  languages, canonical, hreflang, JSON-LD, title, description, robots, sitemap,
  404, and the no-JavaScript check.

**A bug the tests caught, in code from Phase 6.** `formatAmd` used
`toLocaleString('en-US').replace(/,/g, ' ')` — but the separator depends on the
runtime's ICU data: the same call returns `5,800` in one Node process and
`5 800` (U+202F, a narrow no-break space) in another, where the replace
silently does nothing. Both `apps/web` and `apps/admin` now group digits
directly, so the output is identical on every machine. The admin test had been
passing by luck.

**Not built:** the ordering and booking flow on web. It exists in
`apps/mobile`, and duplicating checkout, payment and tracking would be a second
implementation of the riskiest code in the product for no new capability — the
restaurant pages link to the app instead. Written down rather than silently
skipped.

### Phase 10 — Platform administration (the last roadmap phase)

`GET /admin/metrics`, `/admin/metrics/reconciliation`, `/admin/users`,
`PATCH /admin/users/{id}/role`, `POST /admin/restaurants`, `POST /admin/promos`,
plus three admin-only tabs in `apps/admin`.

- **Changing a role revokes every session that account holds.** This is the
  piece that mattered. Access tokens carry `role` so a guard never has to touch
  the database — which means a demoted account keeps its old powers until the
  token expires, and a token cannot be recalled. Revoking the refresh tokens
  bounds that window to the 15-minute access TTL instead of leaving it open for
  30 days. Added `RedisService.deleteByPattern`, using **SCAN and not KEYS**:
  `KEYS` walks the whole keyspace in one blocking call and stalls every other
  client.
- **Four refusals on a role change**, each protecting a state the platform
  cannot recover from: your own role (an admin who demotes themselves loses the
  panel), a guest or unverified account (staff powers to an anonymous device),
  the last administrator (nobody could restore one), and an owner who still has
  restaurants (they would be unmanageable). `guest` is rejected as a target
  role because it is the `is_guest` flag, not a database role.
- **Revenue counts `paid` and later only.** A `created` order is an abandoned
  basket and a `cancelled` one was refunded; counting either would misreport
  the business in both directions. Aggregates run in SQL and in parallel —
  pulling orders into Node to sum them works on seed data and falls over on a
  real month.
- **A reconciliation view** for payments and orders that disagree. Empty is the
  expected answer, and it is where the "refunded but failed to cancel" case
  from Phase 4 surfaces instead of living only in a log line.
- **Phone numbers are masked in the admin user list.** An admin screen is not a
  reason to hand out every number in full — the same instinct as "no PII in
  logs".
- **Promos demand exactly one kind of discount**, cap percentages at the same
  25% as stacked referrals, target only verified non-guest accounts, and report
  what was actually created rather than what was asked for. Re-issuing a code
  tops up accounts that joined since and skips those who already hold it.
- **Creating a restaurant refuses an owner id that is not an owner** — it would
  produce a restaurant whose "owner" cannot open it in the panel. The slug is
  constrained to lowercase hyphenated words because it becomes a public URL on
  `apps/web`.
- The panel's admin tabs are gated on the role from `GET /me`, and each screen
  is guarded on `isAdmin` as well as on the active tab, so a stale tab value in
  a demoted session cannot render an admin screen. The API enforces all of it
  independently; the UI only avoids offering dead ends.
- A **demo admin** (`+37400000001`) joins the demo owner in the seed. There is
  no bootstrap path for the first admin otherwise, and creating one by hand in
  SQL is how a production credential ends up undocumented.
- **379 tests** (up from 349).

**A bug the tests caught:** `abandonedPct` could go negative. The three counts
behind it are separate queries, so an order cancelled between them makes the
arithmetic underflow — and a dashboard reading "-60% abandoned" is worse than a
rounding error. Clamped, with a test that names the race.

**Verified live**, including every refusal: the metrics against real seeded
data, masked phones, a promotion revoking the old refresh token (401 on reuse),
the promoted user's pre-promotion token still being refused by the owner queue
until they sign in again, all four role guards, duplicate and malformed slugs,
a customer as owner id, promo validation, a promo actually discounting an order
(4 200 → 420 off), and 403 for customer, guest and owner on every admin route.
The last-administrator guard is covered by unit test rather than live, because
the self-change refusal fires first when an admin targets themselves.

**Deliberately not built**, and written down rather than skipped quietly:
- **Review moderation.** There is no review API at all — moderating content that
  cannot be created would be theatre.
- **Editable platform settings** (fees, deposit rates). They live in
  `packages/shared/src/constants.ts`; making them editable means moving pricing
  into the database, which changes how every order is priced rather than adding
  a screen. It stays an open question with the numbers it affects.

### Design tokens moved into `packages/ui`

The palette was hand-copied into three files — `apps/mobile/src/theme/tokens.ts`,
`apps/admin/src/styles.css` and `apps/web/src/app/globals.css`. Changing the
accent colour meant three edits, and nothing caught a missed one: the phone and
the website could disagree about the brand colour with every test still green.
`packages/ui` had existed since the first commit for exactly this and was empty.

- **One source:** `packages/ui/src/tokens.ts`. Mobile imports the objects
  (React Native needs numbers, not CSS strings); web and admin `@import` a
  `tokens.css` **generated** from it.
- **The generated files are checked in, and a test compares them against the
  generator.** Editing the source and forgetting to regenerate fails the test
  rather than shipping a mismatch. Verified by deliberately corrupting a
  generated file and watching the test go red, then restoring it — a drift test
  nobody has seen fail is not evidence of anything.
- App-specific values that are *not* design-system tokens stay in that app's own
  stylesheet, layered on top: web keeps its wider corner radius, the back office
  its tighter one. Admin's `--bad` and `--hit` now alias the generated
  `--destructive` and `--hit-target` instead of restating the values.
- The generator emits both themes plus `[data-theme]` overrides, so an explicit
  theme choice beats the system preference — the apps offer a switch.
- 10 tests, including "both themes define the same keys" and "these four values
  match what DESIGN_SYSTEM.md quotes", so a silent edit makes the documentation
  wrong rather than merely stale.

Also fixed while looking at the web app: **every internal link was a plain
`<a href>`, so each click reloaded the page.** The comment justifying it claimed
crawlers need real anchors — true, but `next/link` renders exactly the same
`<a href>` into the HTML while also giving client-side navigation. The
justification was simply wrong, and the site gave up navigation for nothing.
All internal links now use `next/link`; `tel:` stays a plain anchor because it
leaves the app. The search form became the site's only client component,
progressively enhanced: `action`/`method` still work with JavaScript off, and
`router.push` upgrades the same submit to a client navigation. Re-verified that
the HTML still carries real `href`s, that content survives with every `<script>`
stripped, and that canonical, `hreflang` and JSON-LD are untouched.

### Reconciled with the Claude Design artifacts

Unpacked both artifacts and diffed them against the code. Findings, in order of
how much they matter:

- **There are two artifacts, not one.** The mobile app (820×1020, 12 screens) is
  the one `DESIGN_SYSTEM.md` and `SCREENS.md` were transcribed from. A **web
  landing** (1280×860) is new and had never been looked at.
- **Business numbers are unchanged** — service fee `0.9`, the `n×400/10×10`
  money formula, `2%`, `25%`, `480s`. Nothing implemented needs revisiting.
- **The palette matches exactly**, all 26 values, except four opacities where
  the two artifacts disagree with *each other* (`shadow`, `glass`). Recorded in
  DESIGN_SYSTEM.md with the mobile artifact named as authoritative, since it is
  the fuller design and what every app already matches.
- **Two tokens were missing** and are now in `packages/ui`: `glass` (translucent
  surface over photos) and `placeholder2` (the skeleton shimmer needs both
  stops — with one, the gradient has nowhere to travel). `--stage` was
  deliberately **not** added: it is the backdrop around the phone in the
  mockup, design-tool chrome rather than a product surface.
- **The web design contradicts a Phase 9 decision.** It contains a cart,
  ready-time pills, payment methods and an order-confirmed modal — ordering on
  the web, which Phase 9 explicitly deferred on the grounds that it would be a
  second implementation of the riskiest code. Surfaced rather than quietly
  resolved either way; hero and footer were built first by agreement, and
  ordering stays open.

Built from the web design:

- **Hero** — the promo badge, headline, subheading and CTA, in all three
  languages with the artifact's own copy. The CTA is an in-page anchor to the
  restaurant list, so it works with JavaScript off.
- **Footer** — three columns, blurb, copyright and "Made in Armenia". The
  column items render as **plain text, not links**: every destination the design
  lists (About us, Careers, Gift cards, Terms) is a page that does not exist,
  and a footer of dead links on the one app built for crawlers is worse than a
  footer of labels. They become links when the pages do.
- `packages/i18n` gained 13 keys × 3 languages, taken verbatim from the
  artifact rather than translated afresh.

Verified live in all three languages, and that the hero and footer text still
survive with every `<script>` stripped.

- **A light/dark toggle** on the web, matching the design's per-screen switch.
  It cost almost nothing because the tokens already carry it: the CSS generator
  emits `:root[data-theme='…']` blocks that beat `prefers-color-scheme`, so the
  toggle sets one attribute on `<html>` and stores the choice. A pre-paint inline
  script in the layout applies the stored theme before the first frame, so there
  is no flash of the wrong theme; `<html suppressHydrationWarning>` plus a
  neutral SSR glyph keep React from flagging the attribute the script writes.
  Still outstanding from the web design: the quick-filter chips, and the
  ordering flow (the open product question above).

- **Pre-merge review caught a bug that broke the mobile app while every test,
  typecheck and web build stayed green.** `packages/ui/src/index.ts` re-exported
  `./tokens.js` and `./css.js` with the `.js` extension (added earlier so Node
  could run the *compiled* CSS generator from `dist`). But `apps/mobile` imports
  `@amragrir/ui` **from source** — its `main` is `src/index.ts` — and Metro does
  not map a `./tokens.js` specifier to `tokens.ts` ("Unable to resolve module
  ./tokens.js"), so the app failed to bundle. Nothing caught it: the TS compiler
  and Vitest both resolve the extension, the web/admin builds never touch this
  barrel, and the mobile tests do not import the theme chain. Fix: the barrel now
  re-exports `./tokens` with **no** extension and no longer re-exports the CSS
  generator at all — it is web/build-only (its compiled form is imported directly
  by `scripts/build-css.mjs` and the drift test), and re-exporting it also dragged
  css.ts's own `./tokens.js` import into the mobile graph. Added two guard tests
  (no `.js` extensions in the barrel; the generator is not re-exported) and
  confirmed the fix by bundling for Android end-to-end: **1244 modules, exported
  cleanly** — the same command that had failed.

- **The live smoke caught a second bug the earlier "verification" had missed:
  the pre-paint theme script was broken on every page.** `THEME_KEY` was exported
  from `ThemeToggle.tsx`, a `'use client'` module, and the Server-Component layout
  imported it to inline into the `<head>` script. A Server Component importing a
  value from a client module gets a **client-reference proxy**, not the string —
  and interpolating it (`getItem('${THEME_KEY}')`) stringified the proxy, so the
  rendered script read `getItem('function () { throw new Error("Attempted to call
  THEME_KEY() from the server …") }')`: malformed JavaScript that threw at parse
  time and applied no theme. The flash-of-wrong-theme guard the whole toggle was
  built around silently did nothing, and the stored choice never survived a
  reload (the toggle wrote `amragrir.theme`; the script read garbage). The prior
  check had confirmed the script's *position* but never its *content*. Fix:
  `THEME_KEY` (and the `Theme` type) moved to a plain module `src/lib/theme.ts`
  that both the server layout and the client toggle import, so the server gets
  the literal. Added guard tests (the key module carries no `'use client'`
  directive; the layout imports the key from `@/lib/theme`, not the component)
  and re-verified live: the rendered script now reads
  `getItem('amragrir.theme')`, with no proxy leak, before `<body>`.

## 2026-07-21 — Initial documentation set

- Added the full `/docs` set derived from the app design: PROJECT_OVERVIEW,
  BUSINESS_LOGIC, USER_FLOW, ROLES_AND_PERMISSIONS, DESIGN_SYSTEM, SCREENS,
  COMPONENTS, DATABASE, API_DOCUMENTATION, DEVELOPMENT_GUIDE, AI_CONTEXT.
- Added `.cursor/rules/project-rules.md` and root `CLAUDE.md` so both Cursor
  and Claude Code keep docs synchronized with the implementation on every
  change, plus this CHANGELOG to track what changed and why.
