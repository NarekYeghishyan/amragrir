# Amragrir.am

Monorepo for the Amragrir.am food pre-ordering + table-booking platform.

Start with [docs/README.md](./docs/README.md) — the documentation index — and
[docs/AI_CONTEXT.md](./docs/AI_CONTEXT.md) if you're an AI developer working
on this repo.

## Layout

```
apps/
├── api/      # NestJS backend
├── mobile/   # React Native (Expo) — customer app
├── web/      # Next.js — customer-facing web
└── admin/    # React + Vite — owner + admin back office
packages/
├── shared/   # enums, statuses, business constants — single source of truth
├── i18n/     # hy/ru/en dictionaries
├── ui/       # shared web UI primitives (web + admin)
└── config/   # eslint/tsconfig/prettier bases
```

Each `apps/*` currently has a placeholder `README.md` with its scaffold
command — none are scaffolded yet. See
[docs/DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md) for the full
architecture and build order.

## Tooling

pnpm workspaces + Turborepo. `corepack pnpm install` (or plain `pnpm install`
once `corepack enable` has been run with sufficient permissions).
