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

# 5. Seed demo data (categories, 2 restaurants, menu, tables)
corepack pnpm --filter @amragrir/api db:seed

# 6. Run
corepack pnpm --filter @amragrir/api dev
```

API is served at `http://localhost:3000/v1`. Smoke test: `GET /v1/health`
returns `{ "status": "ok", "db": "up", "time": ... }`.

## Structure (current)

```
prisma/
├── schema.prisma     # all tables — implements docs/DATABASE.md
└── seed.ts           # dev seed from the design
src/
├── main.ts           # bootstrap: /v1 prefix, ValidationPipe, error filter, CORS
├── app.module.ts     # config + Prisma + Redis + Auth + Users + Health, global guards
├── config/           # env.validation.ts — fail-fast env schema
├── prisma/           # global PrismaModule + PrismaService
├── redis/            # global RedisModule — OTP storage, refresh-token registry
├── sms/              # SmsSender interface + dev console sender
├── auth/             # OTP, JWT issue/rotate, guards, decorators
├── users/            # GET/PATCH /me, settings, language
├── catalog/          # public: categories, restaurants, menu, tables
├── health/           # GET /v1/health (liveness + DB/Redis reachability)
└── common/           # error filter, i18n resolution
```

Modules to come, per DEVELOPMENT_GUIDE.md §2: `cart`, `orders`, `reservations`,
`payments`, `favorites`, `referrals`, `reviews`, `notifications`, `owner`,
`admin`.

## Auth notes

- **Every endpoint requires a bearer token unless marked `@Public()`** — both
  `JwtAuthGuard` and `RolesGuard` are registered globally, so a new endpoint is
  protected by default.
- Gate an endpoint with `@Roles(Role.Owner)` and/or `@RequiresVerifiedPhone()`;
  read the caller with `@CurrentUser()`.
- In dev the OTP is **printed to the server log** by `ConsoleSmsSender`
  (`[SMS] [dev] to +374...: Amragrir: 1234`) — that is how you complete a login
  locally. Replace the `useClass` in `SmsModule` when a provider is chosen.

## Notes

- Enums/constants come from `@amragrir/shared` — do not re-declare statuses as strings.
- The `package.json#prisma.seed` config triggers a deprecation warning on
  Prisma 6 (Prisma 7 wants `prisma.config.ts`); harmless for now.
