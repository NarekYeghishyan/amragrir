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

**Status:** `apps/api` runs (auth, public catalog, orders and payments, live
order status over WebSocket, the owner queue that moves an order through the
kitchen, and table booking with held deposits). `apps/mobile` covers the whole
ordering path —
auth → home → restaurant → basket → checkout → live tracking — against the real
API, and `apps/admin` is a working back office (live kitchen queue, menu, the
open/closed switch). The booking screens on mobile and the booking book in the
back office are not built yet. `apps/web` is still a placeholder README with
its scaffold command. See
[docs/DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md) for the full
architecture and build order.

## Getting started

```bash
corepack pnpm install
docker compose up -d                 # Postgres + Redis (needs Docker Desktop)
```

Then follow [apps/api/README.md](./apps/api/README.md) to migrate, seed and run
the backend (`GET http://localhost:3000/v1/health` to smoke-test), and
[apps/mobile/README.md](./apps/mobile/README.md) to start the app against it.

## Tooling

pnpm workspaces + Turborepo. **pnpm must be on PATH as a real binary**
(`npm i -g pnpm`) — Turborepo and `expo install` both shell out to it and fail
with a corepack shim.

- Package scripts run per-package: `pnpm --filter @amragrir/api <script>`.
- `allowBuilds` in `pnpm-workspace.yaml` whitelists Prisma's install scripts
  (pnpm blocks postinstall by default).
