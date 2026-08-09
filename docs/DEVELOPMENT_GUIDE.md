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
| Admin / back office | **React + Vite** (SPA, no SSR) — internal tool for every staff role |
| Realtime | WebSocket (NestJS Gateway) / polling fallback |
| Auth | JWT (access + refresh). Customers: OTP via SMS. Staff: email + password (scrypt), invitation only |
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
│   └── admin/        # React + Vite SPA — staff back office
├── packages/
│   ├── shared/       # types, DTOs, enums, business constants
│   ├── i18n/         # dictionaries hy/ru/en (root = customer, /admin = back office)
│   ├── ui/           # reusable UI primitives (web + admin)
│   └── config/       # eslint/tsconfig/prettier bases
└── docs/             # this documentation
```

`apps/admin` serves every staff role (see ROLES_AND_PERMISSIONS.md) in a single
app, with each screen gated on the permission it needs rather than on a role —
split into two apps later only if scale requires it. It has no public pages,
so it skips Next.js/SSR in favor of a plain Vite SPA; `apps/web` keeps Next.js
because its restaurant/menu pages are public and need SEO.

Each of its screens has its own URL (`/orders`, `/restaurants/:id`, … — the
table is in `apps/admin/README.md`), routed client-side by `src/router.tsx`
over the History API rather than by a routing library. **Wherever it is hosted,
every path has to serve `index.html`** (`try_files $uri /index.html;` in nginx,
or the platform's SPA/rewrite setting): without that, a reload or a pasted link
on any screen but the root is a 404 from the static host. `vite dev` and
`vite preview` do this already, so the failure only ever shows up in a real
deployment.

- **Backend — modular NestJS architecture** (one module per domain): `auth`, `users`, `restaurants`, `branches`, `menu`, `categories`, `cart`, `orders`, `reservations`, `payments`, `favorites`, `referrals`, `reviews`, `notifications`, `restaurant`, `staff`, `uploads`, `admin`, `email`.
- **Images are files the API serves itself**, from two mounts outside `/v1`:
  `/uploads/…` (what staff upload, `UPLOAD_DIR`, git-ignored) and `/static/…`
  (artwork committed in `apps/api/public`). Both are absolute against
  `API_PUBLIC_URL`, which is what a row stores — so no client needs to know
  where files live. Local disk is deliberate and single-instance; the URL is
  built in `UploadsService` alone, so moving to object storage is one change.
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
   See §5 for how a language is chosen per app and how plurals are formed.
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
- DB migrations versioned; dev seeds cover the design's fixtures (categories, restaurants, menu, tables) **plus staff, orders and each order's history, and what the staff have been doing** — a screen with nothing on it cannot be checked. Seeded data is derived from a stable key, never randomised: a bug found on one seeded database has to reproduce on another.
- **A seed that describes a change must make it.** `seed-activity.ts` writes the `audit_log` entries the People screen's activity panel reads, and actually soft-deletes the dish each `menu_item.delete` names and closes the branch each `branch.status` names. A seeded audit trail that describes changes the database does not reflect is worse than an empty one — the value of that table is that it can be believed.
- **Seeded data has to look like the thing it stands for.** Demo dishes carry a photograph of that dish (`prisma/menu-photos.ts`, hotlinked; `MENU_PHOTOS=local` for the committed placeholders) and demo restaurants a cover of what they sell (`prisma/restaurant-covers.ts`, same terms), because a menu and a home feed are lists somebody reads with their eyes and a screen full of grey boxes cannot be judged. Every URL in both tables was fetched and looked at before it was written down — a search for "cola" returned a bottle among sugar skulls, and one for "burger restaurant interior" the lavatory of a Burger King. **A seed may never overwrite what a user chose:** `db:photos` rewrites a missing or seeded picture and never an uploaded one.
- **Hotlinked test data must be checked against the client that will fetch it, not against your browser.** Both tables draw from TheMealDB and TheCocktailDB only. Wikimedia Commons was dropped after a day: it answers 403 to a `User-Agent` that is a bare library name, which is what React Native sends, so half the pictures were blank in `apps/mobile` and perfect on the site — and blank is also how the app draws "there is no picture", so the failure was invisible from both ends. Check a new image URL with `curl -A okhttp/4.9.2` before adding it; the specs enforce the host list.
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
    URL and forwards it as `Accept-Language`. A crawler sends one header, so
    header negotiation alone would leave two of the three languages unindexed.
    Anything meant to be *found* needs a URL per language, linked with
    `hreflang`. Armenian is the default and is **unprefixed** — it lives at the
    bare domain (`/`, `/r/sunny-table`), with only `/ru` and `/en` carrying a
    segment.
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

**On the web (`apps/web`) the first three read differently, and the difference
is the rule.** That app exists to be crawled, so its pages are server-rendered
and pre-rendered, and it has no client data layer at all:

- **The browser never calls the API.** Reads happen in server components; writes
  are Server Actions driven by `<form action={…}>`. There is no
  `NEXT_PUBLIC_API_URL`, so the API's address is not in the bundle, and no CORS
  is involved. The same rule decides third-party keys, and the app currently
  ships **no public one at all**: the location picker's map is Yandex's public
  widget in an iframe, which takes no key, and `YANDEX_GEOCODER_API_KEY` cannot
  be domain-restricted — so the picker calls `GET /[lang]/geocode` on this app
  and that route holds it. It is optional, and `apps/web/.env.example` says what
  the app does without it.
- **Tokens and the basket live in httpOnly cookies**, never in `localStorage`
  and never in the page. A token in reach of a script is a token an injected
  script can take, and a basket in reach of the page is a basket the customer
  can re-price. The basket cookie holds ids and quantities only; every total
  comes from `POST /cart/quote` on each render.
- **No optimistic cart updates.** The server is the only place a total is
  computed, so there is nothing to be optimistic with.
- **Every flow must work with JavaScript disabled.** A form post and a redirect
  is the default; a client component is the exception and needs a reason.
  Anything that reads a cookie on the server opts its whole route tree out of
  pre-rendering — which is why the basket badge is drawn in the browser from a
  separate, deliberately readable count cookie.
- **Per-visitor pages get `noindex` *and* a `robots.txt` disallow.** `noindex`
  is only read after a fetch; a page that prices a basket per request should not
  be fetched by a crawler at all.

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
- **Line endings are LF in the working tree, not only in the repository** —
  `.gitattributes` pins `* text=auto eol=lf`. `packages/ui/src/tokens.spec.ts`
  compares the generated `tokens.css` files to `renderTokensCss()` byte for
  byte, so a Windows checkout with `core.autocrlf=true` and no attributes file
  turned that guard into a failure about invisible characters after every
  branch switch. Do not remove it, and do not "fix" a failing token test by
  normalising line endings inside the assertion — the assertion is the point.

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

## 5. Languages (hy / ru / en)

Three languages everywhere, `hy` the default and the fallback. `packages/i18n`
holds the dictionaries behind **two entry points**, because the two vocabularies
have almost nothing in common and would collide on short keys like `menu` and
`search`:

| Import | Holds | Used by |
|---|---|---|
| `@amragrir/i18n` | customer strings | `apps/web` (and `apps/mobile` when it lands) |
| `@amragrir/i18n/admin` | back-office strings | `apps/admin` |

Separate modules rather than one file with prefixes, so the server-rendered
customer site does not ship several hundred staff strings to every visitor.

**`hy` is the reference in both.** `TranslationKey` / `AdminTranslationKey` are
`keyof typeof hy`, and each dictionary is checked with `satisfies`, so a key
added to one language and forgotten in another is a **compile error** — not an
Armenian word surfacing in an English page.

### How each app decides which language to show

| App | Source | Why |
|---|---|---|
| `apps/api` | `Accept-Language` header | One process serves everyone; see §3 "API conventions". |
| `apps/web` | the URL — the bare domain is `hy`, then `/ru`, `/en` | A crawler sends one header, so header negotiation alone leaves two languages unindexed. Needs a URL per language with `hreflang`. The default language is unprefixed (`/r/x`, not `/hy/r/x`) because it is most of the traffic; `/hy/…` 308s to it so one page keeps one address. |
| `apps/admin` | a stored choice (`amragrir.language`), then the browser's, then `hy` | Internal, behind a sign-in, nothing to index. Staff work a shift in one language, so the choice sits in storage next to the theme and is switched from the account menu (and from the sign-in card, which is in front of anyone who cannot yet read the panel). |

Where the language is part of the URL, **switching it is a navigation, and it
must land on the page the visitor is already reading.** `apps/web`'s header
switch builds its links with `translatedPath()` (`lib/site.ts`), which swaps the
language segment and keeps the rest of the address; the query string rides along
with it. It accepts both the published path (`/cart`) and the internal one the
middleware rewrites to (`/hy/cart`), so a link is the same whether it was built
during the render or in the browser.

That switch is a **document load** (`<a>`, not `<Link>`) and has to be. Changing
the `[lang]` segment remounts the root layout, and React 19 re-acquires the
`<html>` singleton by stripping every attribute on it first — including
`data-theme`, which the layout's pre-paint script sets from `localStorage` and
React therefore never puts back. The rule this leaves: **anything set on `<html>`
outside React survives only until the next remount of it**, so it must be
re-applied by something that runs on every document load, not once per session.

The admin panel sends its choice as `Accept-Language` on every request, so the
API's error messages and `*_i18n` columns come back in the same language the
screen is in. Anything the API said is shown verbatim; the panel only translates
failures it invents itself (see `ApiError.messageKey`).

### Plurals

Never build a count message by hand — the three languages do not agree on what
"plural" means:

- **English** — `one` is exactly 1.
- **Armenian** — `one` covers **0 and 1**.
- **Russian** — `one` covers 1, 21, 101…; `few` covers 2–4; `many` the rest.

`t.plural(key, count)` selects through `Intl.PluralRules` over `_one` / `_few` /
`_many` / `_other` suffixed keys and passes `{count}` in for you. Armenian and
English define only the two categories they select; Russian adds its two.

**A `_one` string may only hardcode the digit "1" in English.** In Armenian it
would report zero branches as one; in Russian it would report twenty-one as one.
Everywhere else the string carries `{count}`.

---

## 6. Implementation priorities (roadmap)

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
