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

## 2026-07-21 — Initial documentation set

- Added the full `/docs` set derived from the app design: PROJECT_OVERVIEW,
  BUSINESS_LOGIC, USER_FLOW, ROLES_AND_PERMISSIONS, DESIGN_SYSTEM, SCREENS,
  COMPONENTS, DATABASE, API_DOCUMENTATION, DEVELOPMENT_GUIDE, AI_CONTEXT.
- Added `.cursor/rules/project-rules.md` and root `CLAUDE.md` so both Cursor
  and Claude Code keep docs synchronized with the implementation on every
  change, plus this CHANGELOG to track what changed and why.
