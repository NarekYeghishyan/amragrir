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

**Status:** `apps/api` is scaffolded (Phase 0 — foundation: NestJS + Prisma
schema + health + docker-compose + seed). `apps/mobile`, `apps/web`,
`apps/admin` are still placeholder READMEs with their scaffold commands. See
[docs/DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md) for the full
architecture and build order.

## Getting started

```bash
corepack pnpm install
docker compose up -d                 # Postgres + Redis (needs Docker Desktop)
```

Then follow [apps/api/README.md](./apps/api/README.md) to migrate, seed and run
the backend (`GET http://localhost:3000/v1/health` to smoke-test).

## Tooling

pnpm workspaces + Turborepo.

- Package scripts run per-package: `corepack pnpm --filter @amragrir/api <script>`.
- `allowBuilds` in `pnpm-workspace.yaml` whitelists Prisma's install scripts
  (pnpm blocks postinstall by default).
- **Known issue:** `turbo run build` fails with *"Unable to find package
  manager binary"* when pnpm is provided only through the corepack shim. Until
  pnpm is on PATH as a real binary (`corepack enable` with admin rights, or a
  global install), run builds per-package with `--filter` instead.
