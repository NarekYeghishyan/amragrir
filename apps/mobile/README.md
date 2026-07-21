# @amragrir/mobile

Customer app — the primary product surface. Expo SDK 57 + expo-router.

> **Before writing code here, read `AGENTS.md`.** Expo changes between SDKs;
> the versioned docs at <https://docs.expo.dev/versions/v57.0.0/> are the
> authority, not memory of an older SDK.

## Running it

The app talks to the local API, so start that first
(see [apps/api/README.md](../api/README.md)):

```bash
docker compose up -d                        # from the repo root
pnpm --filter @amragrir/api dev             # API on :3000
pnpm --filter @amragrir/mobile dev          # then press i / a / w
```

`extra.apiUrl` in `app.json` points at `http://localhost:3000/v1`. On a
**physical device** `localhost` is the phone itself — change it to your
machine's LAN address (e.g. `http://192.168.1.5:3000/v1`).

Signing in locally: the dev SMS sender prints the OTP to the **API** log —
`[SMS] [dev] to +374...: Amragrir: 1234`.

## What exists (Phase 3 slice)

```
app/                     # expo-router: file = route
├── _layout.tsx          # Stack + SafeArea + SessionProvider
├── index.tsx            # home — categories rail + nearby restaurants
├── auth.tsx             # phone → OTP
└── restaurant/[id].tsx  # restaurant detail + menu tabs
src/
├── api/                 # client (error envelope → ApiError), typed endpoints
├── components/          # RestaurantCard
├── theme/               # tokens from DESIGN_SYSTEM.md + useTheme (light/dark)
├── session.tsx          # guest session on launch, sign-in upgrades it
└── format.ts            # money/distance display only — never recomputed here
```

Screens still to build, per [docs/SCREENS.md](../../docs/SCREENS.md): search,
basket, pre-order, checkout, tracking, orders, favorites, profile, referral,
settings.

## Conventions

- **No raw colours in components** — read `useTheme()`; tokens live in
  `src/theme/tokens.ts`.
- **No hand-built URLs in screens** — add a typed call to `src/api/endpoints.ts`.
- **Money is formatted, never computed** here; the server owns every total.
- Statuses and business constants come from `@amragrir/shared`.
