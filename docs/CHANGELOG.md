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

## 2026-07-21 — Initial documentation set

- Added the full `/docs` set derived from the app design: PROJECT_OVERVIEW,
  BUSINESS_LOGIC, USER_FLOW, ROLES_AND_PERMISSIONS, DESIGN_SYSTEM, SCREENS,
  COMPONENTS, DATABASE, API_DOCUMENTATION, DEVELOPMENT_GUIDE, AI_CONTEXT.
- Added `.cursor/rules/project-rules.md` and root `CLAUDE.md` so both Cursor
  and Claude Code keep docs synchronized with the implementation on every
  change, plus this CHANGELOG to track what changed and why.
