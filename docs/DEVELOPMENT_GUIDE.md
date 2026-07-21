# DEVELOPMENT_GUIDE.md

> Recommendations for the team and for Cursor AI on implementing Amragrir.am.

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Backend | **NestJS** (TypeScript) |
| Database | **PostgreSQL** (+ Prisma or TypeORM) |
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
6. **Permissions — on the backend** (guards). UI only hides what's unavailable.
7. **DTO validation** via `class-validator` at the API boundary.
8. **Idempotency** for `POST /orders`, `POST /payments` (idempotency key).

### Backend
- All money calculations (subtotal, service fee, deposit, total) — **on the server**; do not trust the client.
- Business-rule checks before mutation: slot availability, capacity, working hours, restaurant status, status transitions (state machine).
- DB migrations versioned; dev seeds (4 restaurants, menu, categories from the design).
- Logging, rate-limit on `auth/*`, OTP TTL in Redis (120s).

### Frontend
- Screen = container (data/navigation) + presentational components (props).
- Server data — via an `api/` layer + cache (React Query/TanStack Query).
- Order/status state — realtime subscription + optimistic cart updates.
- Skeletons for all loads (pattern from the design).
- Accessibility: hit target ≥ 44px, contrast, dark-theme support.

### Git / process
- Branches: `feat/*`, `fix/*`, `chore/*`; PR with review.
- Conventional commits. CI: lint + typecheck + tests.
- Tests: unit (services), e2e (critical flows: order, booking, payment).

---

## 4. Implementation priorities (roadmap)

1. **Customer MVP:** auth+OTP, catalog, restaurant+menu, basket, pre-order (pickup), checkout, payment, tracking, orders.
2. Table booking (dine-in) + deposit.
3. Favorites, search, filters, referrals, rewards.
4. `apps/admin` — owner-facing screens first (orders, menu, tables, reservations) — needed early to seed demo restaurants/menus for 1–3.
5. `apps/admin` — admin-only screens (analytics, promos, user/restaurant management).

### Open questions (confirm with product)
- Exact `ready_at` calculation by kitchen load.
- Deposit refund / no-show policy.
- Reward points accrual rates.
- SMS and acquiring provider for Armenia.
- Referral discount stacking rules (up to 25%).
