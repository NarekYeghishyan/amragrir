# @amragrir/admin

Internal back office for the `owner` and `admin` roles (see
[docs/ROLES_AND_PERMISSIONS.md](../../docs/ROLES_AND_PERMISSIONS.md)) — one
RBAC-gated React + Vite SPA, no SSR, no public surface.

## Running it

The panel talks to the local API, so start that first:

```bash
docker compose up -d                        # from the repo root
pnpm --filter @amragrir/api dev             # API on :3000
pnpm --filter @amragrir/admin dev           # panel on :5173
```

Sign in as the seeded demo owner: **`+37400000000`**. The OTP is printed to the
**API** log (`[SMS] [dev] to +374...: Amragrir: 1234`).

Point it elsewhere with `VITE_API_URL=https://api.example.com/v1 pnpm build`.

## Screens

```
src/
├── App.tsx              # three tabs, no router (see below)
├── api.ts               # client + endpoints, token storage, refresh
├── order-stream.ts      # one socket for the whole board
├── format.ts            # money, countdown, i18n label picking
└── screens/
    ├── SignIn.tsx       # phone → OTP
    ├── Orders.tsx       # live kitchen queue + status buttons
    ├── Menu.tsx         # price, availability, create, delete
    └── Branches.tsx     # the open/closed switch
```

## Decisions worth knowing

**No router.** Three tabs and nothing to deep-link — local state already does
it. Add one when a screen needs to be linkable.

**Status buttons come from `ORDER_STATUS_FLOW` in `@amragrir/shared`,** not from
a list written here. The buttons shown are exactly the moves the API accepts, so
the panel cannot offer one that 422s. `paid` is filtered out because only a
payment makes an order paid.

**Tokens live in `localStorage`, and that is a trade-off.** Any script on the
page can read them, where an httpOnly cookie could not. Accepted because this is
an internal tool with no third-party embeds, and the alternative needs cookie
auth on the API — **revisit before exposing this beyond the restaurant's own
network.** Persisting at all is not optional: access tokens last 15 minutes and
a kitchen panel stays open all shift.

**Refresh is single-flight.** Refresh tokens are single-use and rotated, so two
requests expiring at once would each try to spend the same one and the loser
would be logged out. Everyone waits on the same promise.

**Nothing is set optimistically on the order board.** Advancing a status waits
for the server's broadcast, so what is on screen is what was recorded — a
kitchen acting on a status that did not actually save is worse than a moment of
latency.
