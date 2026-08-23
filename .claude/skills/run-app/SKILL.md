---
name: run-app
description: Start this monorepo's apps and confirm they actually work — API, mobile (Expo), web, admin. Use when asked to run, start, launch, or screenshot any app here, to bring up the local stack, or to check a change in the real app rather than in tests. Covers startup order, the port coupling between the API and app.json, and how to verify a running app without a device.
---

# Running the apps

**Do not rediscover any of this.** On a checkout that is already set up — the
usual case — go straight to the commands below; the traps that matter for that
path are distilled into this file. Open a README when a step actually fails,
when this is a first run, or for detail deliberately left out here:

- [apps/api/README.md](../../../apps/api/README.md) — §Local development:
  first-run env/migrate/seed, and what `free-port.mjs` will and won't kill
- [apps/mobile/README.md](../../../apps/mobile/README.md) — §Running it: the
  stale-LAN-IP symptom, why editing `app.json` needs `--clear`, and where the
  dev OTP is printed

They are the authority. Anything here that contradicts them is a bug **here** —
correct this file, never write a third copy.

## Order

Infrastructure, then API, then a client. A client started first renders its
chrome and then says "Cannot reach the server", which reads as a broken app.

```bash
docker compose up -d                        # Postgres + Redis, from repo root
pnpm --filter @amragrir/api dev             # API on :3000
pnpm --filter @amragrir/mobile web          # Expo/Metro on :8081
```

`pnpm --filter @amragrir/web dev` (:3001) and `pnpm --filter @amragrir/admin dev`
(:5173) are independent of the mobile app — start them only if asked.

On a first run, or when `docker compose down -v` has dropped the volume, the
API also needs its `.env`, migrations and seed — that is step 3-5 of the API
README. Otherwise skip them, but confirm rather than assume:

```bash
pnpm --filter @amragrir/api exec prisma migrate status   # "up to date" = skip
```

## The port is not free to choose

`extra.apiUrl` in `apps/mobile/app.json` is a **committed LAN address** with a
port in it. The mobile app reads it through `Constants.expoConfig` and has no
env override, so an API started on any other port leaves every mobile screen
dead while web and admin stay fine — the failure looks like a mobile bug.

Match the API's port to that value, or change the value and restart Metro with
`--clear` (the mobile README explains why a plain restart is not enough).

Verify **on the address the app uses**, not on localhost — localhost passing
proves nothing about what a phone can reach:

```bash
curl http://<host from app.json>/v1/health   # {"status":"ok","db":"up","redis":"up"}
```

## Confirming it actually runs

A dev server that answers on its port has proved only that it booted. Metro in
particular serves the HTML shell fine while the bundle fails to compile.

**Bundle compiles** — 200 and megabytes, not a Metro error payload:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8081/apps/mobile/node_modules/expo-router/entry.bundle?platform=web&dev=true&transform.routerRoot=app"
```

**It renders** — react-native-web is a real target here, so headless Chrome is
the fastest way to see a screen with no device attached. Give it a virtual time
budget; the app needs to mount and fetch:

```bash
chrome --headless=new --disable-gpu --window-size=430,900 \
  --virtual-time-budget=30000 --screenshot=out.png http://localhost:8081/
```

Then **look at the image**. A dark rectangle with a tab bar and no content is a
failure, not a pass. Routes work as paths (`/orders`, `/favorites`), so a second
screenshot at another route is the cheapest navigation check there is.

Signing in needs the OTP, which the dev sender prints to the **API** log, not
the app's.

## Known non-issues — do not "fix" these

- **`<button> cannot contain a nested <button>`** on web. The favourite button
  in `RestaurantCard.tsx` sits inside the card's own Pressable, deliberately.
  It is correct on native; only react-native-web's mapping of Pressable to
  `<button>` trips React DOM's validator.
- **`expo start` reporting an available SDK update.** Upgrading is its own task
  with its own testing — see `apps/mobile/AGENTS.md`.

## Scope

Starting an app is not a change to the codebase, so it needs no CHANGELOG entry
and no doc sync. Editing `app.json` or a README while getting one to run does —
see the sync map in [docs/AI_CONTEXT.md](../../../docs/AI_CONTEXT.md).

This file is agent tooling rather than product documentation, so like
`.cursor/rules/project-rules.md` it sits outside that map and changing it needs
no CHANGELOG entry. If it ever disagrees with the two READMEs, **they win** and
this is the file that gets corrected.
