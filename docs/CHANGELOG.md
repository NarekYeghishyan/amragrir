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

## 2026-07-21 — Initial documentation set

- Added the full `/docs` set derived from the app design: PROJECT_OVERVIEW,
  BUSINESS_LOGIC, USER_FLOW, ROLES_AND_PERMISSIONS, DESIGN_SYSTEM, SCREENS,
  COMPONENTS, DATABASE, API_DOCUMENTATION, DEVELOPMENT_GUIDE, AI_CONTEXT.
- Added `.cursor/rules/project-rules.md` and root `CLAUDE.md` so both Cursor
  and Claude Code keep docs synchronized with the implementation on every
  change, plus this CHANGELOG to track what changed and why.
