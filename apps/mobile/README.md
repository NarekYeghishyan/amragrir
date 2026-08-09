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

`extra.apiUrl` in `app.json` holds **a LAN address, not `localhost`** — on a
physical device `localhost` is the phone itself, so it has to be the dev
machine's address. The fallback in `src/api/client.ts` is `localhost:3000`; the
value in `app.json` overrides it and is what actually gets used.

**That address is committed, and DHCP moves it.** When the app renders its
chrome but every screen says "Cannot reach the server", check this first — the
IP in `app.json` is probably the machine's *old* one. `curl http://<that
ip>:3000/v1/health` from the dev machine settles it in a second.

**Changing it needs `--clear`.** Metro bakes the resolved config into the
bundle and caches the result, so editing `app.json` and restarting is not
enough — the old address is served from cache and the symptom looks identical
to not having edited it at all:

```bash
pnpm --filter @amragrir/mobile exec expo start --clear
```

The web target is a real one here (`react-native-web` is a dependency and
`app.json` sets `web.bundler: metro`), which is the quickest way to look at a
change without a device: `pnpm --filter @amragrir/mobile web`. The first bundle
takes about ten seconds and is ~4.6 MB.

Signing in locally: the dev SMS sender prints the OTP to the **API** log —
`[SMS] [dev] to +374...: Amragrir: 1234`.

## What exists

The whole ordering path: **auth → home → restaurant → basket → checkout →
live tracking**.

```
app/                     # expo-router: file = route
├── _layout.tsx          # Stack + SafeArea + Session + Cart providers
├── index.tsx            # home — categories rail + nearby restaurants
├── auth.tsx             # phone → OTP
├── restaurant/[id].tsx  # detail, menu tabs, add to basket
├── basket.tsx           # lines + quantities, priced by the server
├── checkout.tsx         # payment method, place order
└── tracking/[id].tsx    # live status, countdown, pickup code + its QR
src/
├── api/                 # client (error envelope → ApiError), typed endpoints
├── cart.tsx             # the basket — client-side by design (see below)
├── order-stream.ts      # WebSocket status updates with reconnect
├── components/          # RestaurantCard
├── theme/               # tokens from DESIGN_SYSTEM.md + useTheme (light/dark)
├── session.tsx          # guest session on launch, sign-in upgrades it
└── format.ts            # money/distance/countdown display only
```

Screens still to build, per [docs/SCREENS.md](../../docs/SCREENS.md): search,
pre-order (time picker), orders list, favorites, profile, referral, settings.

## Conventions

- **No raw colours in components** — read `useTheme()`; tokens live in
  `@amragrir/ui` (re-exported by `src/theme/tokens.ts`), which is also what
  generates the web and back-office stylesheets.
- **No hand-built URLs in screens** — add a typed call to `src/api/endpoints.ts`.
- **Money is formatted, never computed** here; the server owns every total.
  The basket carries menu prices only so a single line can be shown before the
  quote returns — the subtotal, fee and total on screen always come from
  `POST /cart/quote`.
- Statuses and business constants come from `@amragrir/shared`.

## Two things that are easy to get wrong here

**The idempotency key is created once per checkout attempt and held in a ref**
(`app/checkout.tsx`). If "Place order" fails on a flaky connection and the
customer taps again, the same key replays the first response instead of
creating a second order. Generating it inside the request would defeat the
entire mechanism — so it is deliberately *not* regenerated in the catch block.

**The tracking screen loads over REST first and treats the socket as an
optimisation.** If the stream never connects the screen still renders, and it
says `reconnecting…` rather than showing a countdown that quietly stopped
being live — a frozen timer looks exactly like a stuck order.
