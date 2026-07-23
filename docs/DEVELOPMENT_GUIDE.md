# DEVELOPMENT_GUIDE.md

> Recommendations for the team and for Cursor AI on implementing Amragrir.am.

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Backend | **NestJS** (TypeScript) |
| Database | **PostgreSQL** + **Prisma** (ORM/migrations — chosen over TypeORM) |
| Cache / queues / OTP | **Redis** |
| Mobile | **React Native + Expo** (expo-router) |
| Web | **Next.js** (App Router) — customer-facing; public restaurant/menu pages need SEO |
| Admin / back office | **React + Vite** (SPA, no SSR) — internal tool for `owner` + `admin` roles combined |
| Realtime | WebSocket (NestJS Gateway) / polling fallback |
| Auth | JWT (access + refresh), OTP via SMS |
| Files | S3-compatible storage (dish/restaurant photos) |
| Payments | Acquiring provider + Apple Pay / Google Pay |
| i18n | shared dictionary package hy/ru/en |

---

## 2. Architecture

Monorepo (**pnpm workspaces + Turborepo**):

```
amragrir/
├── apps/
│   ├── api/          # NestJS backend
│   ├── mobile/       # React Native Expo — customer app
│   ├── web/          # Next.js — customer-facing web
│   └── admin/        # React + Vite SPA — owner + admin back office
├── packages/
│   ├── shared/       # types, DTOs, enums, business constants
│   ├── i18n/         # dictionaries hy/ru/en
│   ├── ui/           # reusable UI primitives (web + admin)
│   └── config/       # eslint/tsconfig/prettier bases
└── docs/             # this documentation
```

`apps/admin` serves both the `owner` and `admin` roles (see
ROLES_AND_PERMISSIONS.md) behind role-based access control in a single app —
split into two apps later only if scale requires it. It has no public pages,
so it skips Next.js/SSR in favor of a plain Vite SPA; `apps/web` keeps Next.js
because its restaurant/menu pages are public and need SEO.

- **Backend — modular NestJS architecture** (one module per domain): `auth`, `users`, `restaurants`, `branches`, `menu`, `categories`, `cart`, `orders`, `reservations`, `payments`, `favorites`, `referrals`, `reviews`, `notifications`, `owner`, `admin`.
- Each module: `*.controller.ts`, `*.service.ts`, `*.repository`/prisma, `dto/`, `entities/`, `*.guard.ts`.
- **Layers:** Controller (HTTP/validation) → Service (business logic) → Repository (data access). Business rules — in the Service only.
- **Shared types and enums** (order/reservation statuses, roles, service mode) — in `packages/shared`, imported by the backend and clients. **Single source of truth.**
- **Realtime:** `OrdersGateway` pushes status updates; the client subscribes to its order.

### Client structure (mobile)

```
apps/mobile/
├── app/                 # expo-router (screens = routes)
│   ├── (auth)/          # auth-gate, otp
│   ├── (tabs)/          # home, search, orders, favorites, profile
│   ├── restaurant/[id]
│   ├── basket, preorder, checkout, tracking
│   └── referral, settings
├── components/          # domain + primitives (see COMPONENTS.md)
├── theme/               # light/dark tokens (see DESIGN_SYSTEM.md)
├── i18n/, hooks/, api/  # REST + WS client
└── store/               # state (Zustand/Redux Toolkit)
```

---

## 3. Development rules

### General
1. **TypeScript strict** everywhere. No `any` without reason.
2. **Shared enums/types** from `packages/shared` — do not duplicate statuses as strings.
3. **Money — integers in AMD** (`*_amd`). Formatting only in UI (`formatMoney`).
4. **i18n:** no hardcoded strings in UI — dictionary keys only. `hy` is the default language.
5. **Theme tokens:** colors/radii/spacing — from `theme`, do not hardcode hex (see DESIGN_SYSTEM.md).
   **A raw colour value belongs in exactly one file: `packages/ui/src/tokens.ts`.**
   Web and admin read the CSS variables generated from it; mobile imports the
   objects. Copying a palette per app is how a brand colour ends up different on
   the phone and the website with nothing to catch it.
6. **Permissions — on the backend** (guards). UI only hides what's unavailable.
7. **DTO validation** via `class-validator` at the API boundary.
8. **Idempotency** for `POST /orders`, `POST /payments` (idempotency key).

### Backend
- All money calculations (subtotal, service fee, deposit, total) — **on the server**; do not trust the client.
- Business-rule checks before mutation: slot availability, capacity, working hours, restaurant status, status transitions (state machine).
- DB migrations versioned; dev seeds cover the design's fixtures (categories, restaurants, menu, tables).
- Logging, rate-limit on `auth/*`, OTP TTL in Redis (120s).

### API conventions

These are contracts, not preferences — clients depend on them. Full reference
in API_DOCUMENTATION.md.

- **Every route lives under `/v1`.** Breaking a published response shape means a
  new version, not an edit.
- **One error envelope everywhere:** `{ "error": { code, message, details? } }`,
  produced centrally by `AllExceptionsFilter` — never hand-roll an error body in
  a controller. `code` is a stable machine-readable string; `message` is for
  humans and may change; `details` carries field errors (`{ fields: [...] }`) or
  documented extras (`{ retryAfter }`).
- **Status codes carry meaning:** 400 validation · 401 unauthenticated ·
  403 authenticated-but-not-allowed · 404 missing · 409 conflict (slot taken,
  duplicate email) · 422 business rule violated · 429 rate limited.
- **Secure by default:** `JwtAuthGuard` is global; a new endpoint is protected
  unless it declares `@Public()`. Never disable the guard globally to "make it
  work" — mark the specific route.
- **List endpoints paginate** and return `{ items, total, page }`. Always cap
  `limit` server-side; an uncapped list is a denial-of-service waiting to happen.
- **Localised columns** (`name_i18n`, `desc_i18n`) are resolved **server-side**
  from `Accept-Language`, falling back to `hy`. Clients receive a plain string,
  never the raw JSON blob.
  - **A public web page is the exception**: `apps/web` puts the language in the
    URL (`/hy`, `/ru`, `/en`) and forwards it as `Accept-Language`. A crawler
    sends one header, so header negotiation alone would leave two of the three
    languages unindexed. Anything meant to be *found* needs a URL per language,
    linked with `hreflang`.
- **Never return internals.** No stack traces, driver errors, or connection
  strings in responses — the exception filter collapses unknown errors to a
  generic 500.
- **Anything that creates money or an obligation requires an
  `Idempotency-Key`** — `@Idempotent(scope)` on the handler, and the header is
  mandatory, not advisory. A phone that loses signal after the server created
  the order will retry; without a key the customer is charged twice. The stored
  response is scoped to the endpoint *and* the caller, and a failed request
  releases its key so a transient error cannot burn it.

### Security baseline

- **Never trust the client** for amounts, roles, ownership, or prices. Re-read
  and recompute server-side.
- **Distinguish token kinds.** Access and refresh tokens are signed with the
  same secret, so each carries a `typ` claim that is verified. Without it a
  long-lived refresh token works as a bearer credential.
- **Refresh tokens are single-use and revocable** (registered in Redis by id).
  A signed token you cannot revoke stays valid until it expires.
- **Secrets and codes are never stored in a readable form** — OTP codes are
  hashed at rest so a cache dump does not hand over live logins.
- **Rate-limit anything unauthenticated and anything that costs money** (SMS).
  Per-resource cooldowns are not a substitute for a per-IP ceiling: a per-phone
  cooldown does nothing against one host spraying thousands of numbers.
- **Own the resource in the query, not in a check afterwards.** `WHERE id = ?
  AND user_id = ?` has no path that loads another user's row; a fetch-then-
  compare does, and one early `return` removes it. It also answers 404 rather
  than 403, which does not confirm the id exists.
- **A privilege change must end the sessions it applies to.** Claims in a token
  are a snapshot; the token cannot be recalled, so revoke the refresh tokens and
  let the short access TTL close the gap. A short access lifetime is not
  ceremony — it is the size of the window in which a demoted account still has
  its old powers.
- **Guard a status change on the status you read.** Business checks run against
  a snapshot; by the time the write lands, another request may have moved the
  row. Put the expected status in the `WHERE` clause so the loser of a race
  fails instead of overwriting.
- **When "check then insert" must be indivisible, say so to the database.** Two
  guests booking the last table both pass a `findMany` check and both insert.
  A serializable transaction makes Postgres abort one — which means the code
  must **retry**, since serialization failures are contention, not bugs. Back
  it with a unique constraint too: the constraint is what still holds if the
  isolation level is ever relaxed.
- **Take money in the order that leaves the customer whole.** Hold or reverse
  funds *before* the status write, so a failure leaves them with the booking
  they paid for rather than neither booking nor money — and log the window
  where both cannot be satisfied as needing manual reconciliation.
- **Config fails fast.** Required env vars are validated at boot; the process
  refuses to start rather than failing at the first request.
- **No PII in logs.** Phone numbers are masked (`+374******56`). Logs get IDs,
  not personal data.

### Observability

- `GET /v1/health` reports liveness plus each dependency (`db`, `redis`) and
  stays **200 with a `down` marker** rather than throwing — an orchestrator must
  be able to tell "process up, dependency unreachable" from a crash.
- Log at the boundary of meaningful operations with identifiers that allow
  tracing a request; keep bodies and credentials out.

### Frontend
- Screen = container (data/navigation) + presentational components (props).
- Server data — via an `api/` layer + cache (React Query/TanStack Query).
- Order/status state — realtime subscription + optimistic cart updates.
- Skeletons for all loads (pattern from the design).
- Accessibility: hit target ≥ 44px, contrast, dark-theme support.

### Testing

- **Test business rules, not the framework.** Value is in "the deposit is
  credited, not charged", "a used OTP cannot be replayed", "a guest cannot
  order" — not in proving that Nest injects a dependency.
- **A green build is not a working app.** `typecheck` and `build` pass on code
  that cannot boot: a mistyped env var, a stale compiled artifact, a missing
  runtime import. Before calling anything done, **run it and exercise the real
  endpoint.** Both of Phase 0's boot failures passed CI-grade checks.
- **Every bug fix gets a regression test** that fails on the old code, with a
  comment saying what broke — that comment is why the test may not be deleted.
- Levels: unit for service rules (fast, mock the DB), e2e for critical flows
  (order, booking, payment). Prefer a handful of meaningful e2e tests over
  many shallow ones.

### Git / process
- Branches: `feat/*`, `fix/*`, `chore/*`; PR with review. Do not commit to
  `main` directly.
- Conventional commits. CI: lint + typecheck + tests.
- Commit messages explain **why**, not what — the diff already shows what.

---

## 4. Definition of Done

A change is done when **all** of these hold. "It compiles" is not on the list.

1. Business rules checked against BUSINESS_LOGIC.md; permissions enforced on
   the backend, not just hidden in the UI.
2. Input validated at the boundary (DTO + `class-validator`).
3. Types, statuses and constants come from `packages/shared` — nothing
   redeclared as a string literal.
4. `lint`, `typecheck` and `test` all pass.
5. New rules have tests; fixed bugs have regression tests.
6. **The running app was exercised** — the actual endpoint or screen, not just
   the test suite.
7. Affected docs updated per AI_CONTEXT.md's sync map, plus a CHANGELOG.md entry.
8. Anything deliberately left out is written down (in the docs, not only in the
   commit) so a gap is not mistaken for an oversight.

---

## 5. Implementation priorities (roadmap)

Order is chosen so each step can be exercised end-to-end before the next
depends on it — build thin vertical slices, not horizontal layers.

| # | Scope | Status |
|---|---|---|
| 0 | API foundation: NestJS, Prisma schema, Postgres/Redis, health, seed | ✅ done |
| 1 | Auth: OTP, JWT sessions, guards, `/me` | ✅ done |
| 2 | Catalog (read-only): categories, restaurants, branches, menu | ✅ done |
| 3 | First mobile slice: auth → home → restaurant → menu on the real API | ✅ done |
| 4 | Basket + orders (pickup), payment, idempotency | ✅ done (API) |
| 5 | Order tracking: realtime status, countdown + the owner **API** that moves it | ✅ done |
| 6 | `apps/admin` — owner **screens** (incoming orders, status changes, menu) | ✅ done |
| 7 | Table booking (dine-in) + deposit | ✅ done (API) |
| 8 | Favorites, search, filters, referrals, rewards | ✅ done (API) |
| 9 | `apps/web` (Next.js) on the same API | ✅ done |
| 10 | `apps/admin` — admin screens (analytics, promos, management) | ✅ done |

Rationale for the two orderings that are easy to get wrong:

- **Catalog before any client.** A client with nothing real to render proves
  nothing; the seed already provides data for it.
- **Owner screens before dine-in.** Once real orders exist, a human has to move
  them through their statuses, otherwise nothing ever reaches `ready`.
- **The owner's status *API* moved forward into Phase 5**, ahead of its
  screens. Tracking with nothing able to change a status is untestable
  theatre — the same reasoning as the point above, applied one phase earlier.
  The owner *screens* stay in Phase 6.

`apps/mobile` now covers the whole ordering path (auth → home → restaurant →
basket → checkout → tracking). What remains unproven on every mobile phase so
far is the same thing: **no screen has been run on a device or simulator.**
Types, tests and the bundle all pass, and every endpoint was exercised
directly, but that is not the same as having seen it.

### Open questions (confirm with product)
- Exact `ready_at` calculation by kitchen load.
- ~~Deposit refund / no-show policy.~~ **Answered provisionally** (2h free
  window, held after that and on a no-show, credited on completion) — the
  numbers are `[proposed]` and want product's confirmation, but the mechanism
  is built.
- Seating length (90 min) and slot interval (30 min) — currently platform-wide
  constants; a steakhouse and a coffee bar do not turn tables at the same rate,
  so these likely belong on the restaurant.
- Real opening hours. `open_hours` exists but nothing writes it, so availability
  falls back to a documented 10:00–23:00 default.
- ~~Reward points accrual rates.~~ **Answered provisionally:** 1 point per 100֏
  of subtotal, credited on payment. **Redemption is still open and deliberately
  unbuilt** — the design shows a balance but no way to spend it, and inventing a
  redemption rate would invent an economy nobody agreed to.
- Referral coupon validity (90 days) and whether a spent reward should restart
  from 2% or keep its accumulated percentage. Currently it restarts.
- Whether "price per person" should stay an average of all available dishes, or
  weight mains, or become a stored figure the owner sets.
- Popular search tags are static; real ones need query logging.
- SMS and acquiring provider for Armenia — the app depends on the `SmsSender`
  and `PaymentProvider` interfaces only, so choosing one is a provider swap,
  not a rewrite. Both currently resolve to console implementations that move
  nothing.
- Refund window and cancellation fee for a paid pickup order — cancellation
  currently refunds in full up to `confirmed`.
- Referral discount stacking rules (up to 25%).
- Price-per-person filter (design: 4000–24000֏) has no backing column; it needs
  either a stored average or derivation from menu prices.
