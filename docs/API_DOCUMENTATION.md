# API_DOCUMENTATION.md

> Amragrir.am REST API. Base: `https://api.amragrir.am/v1`. Format — JSON. Auth — `Authorization: Bearer <accessToken>` (JWT). Locale — `Accept-Language: hy|ru|en` header. Amounts — integers in AMD (`*_amd`).

Common error response:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```
Status codes: 200/201 ok, 400 validation, 401 unauthorized, 403 forbidden, 404 not found, 409 conflict (e.g. slot taken), 413 payload too large (uploads), 415 unsupported media type (uploads), 422 business rule, 429 rate limited.

`code` values: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `BUSINESS_RULE`,
`RATE_LIMITED`, `INTERNAL_ERROR`. `details` carries
field errors as `{ "fields": [...] }` on validation failures, and any extra
context the endpoint documents (e.g. `{ "retryAfter": 60 }` on a 429).

**Rate limiting:** 120 requests/min per IP globally, 10/min on `/auth/*`.
Exceeding either returns 429 `RATE_LIMITED`.

---

## Authentication

> **Implemented** except `POST /auth/social` (see below). Every other route in
> this doc is still a specification.
>
> Endpoints are authenticated by default; only the routes marked *public* below
> may be called without a bearer token. Access tokens last 15 min, refresh
> tokens 30 days and are **single-use** (rotated on every refresh, revocable at
> logout).
>
> The two token kinds are **not interchangeable** — each carries a `typ` claim
> and presenting a refresh token as a bearer credential is rejected with
> `Not an access token`.

### POST /auth/send-code · *public*
Send an OTP to the phone.
- **Body:** `{ "phone": "+37499123456" }` — normalised to E.164, in two
  readings tried in that order:
  1. **A whole international number**, for any country in `PHONE_COUNTRIES`
     (`packages/shared`) — currently Armenia `+374`, Russia `+7`, Georgia
     `+995`, USA `+1`, France `+33`, Germany `+49`, Iran `+98`, UAE `+971`.
     The national trunk prefix is dropped (`+7 8 912…` → `+7912…`).
  2. **A bare national number, read as Armenian** — the market, and what
     somebody typing their own number means. So `99123456`, `099123456`,
     `99 123 456` and `+374 99 123 456` all still collapse to `+37499123456`.
- The sign-in form is built from that same list, so it cannot offer a country
  this endpoint would refuse.
- **Response 200:** `{ "sent": true, "expiresIn": 120 }`
- **400** for a number that is neither of the two readings — a wrong length for
  its country, or a country not on the list. **429** resend requested inside
  the 60s cooldown, with `retryAfter` in the payload.

### POST /auth/verify-code · *public*
Verify the code, return tokens. Creates the account on first verification.
- **Body:** `{ "phone": "+37499123456", "code": "1234", "name"?, "referralCode"? }`
- **Response 200:** `{ "accessToken", "refreshToken", "isNewUser": true, "user": { … } }`
- `name` is optional and used by the register branch of the auth screen.
- **Accepts an optional `Authorization` header.** If a guest presents their
  token and the phone is not yet taken, that same account is upgraded in place
  (`isGuest → false`) so nothing they collected is lost. If the phone already
  belongs to an account, the caller is signed into that one and the guest
  session is abandoned — merging two populated accounts is a product decision,
  not something done implicitly.
- **401** wrong, expired or already-used code. The code is single-use, and is
  burned after 5 wrong attempts (a 4-digit code would otherwise be
  brute-forceable inside its window).

### POST /auth/social · *public* — **not implemented yet**
- **Body:** `{ "provider": "apple|google", "idToken": "…" }`
- **Response 200:** `{ "accessToken", "refreshToken", "user" }`
- Deferred: verifying Apple/Google id tokens needs provider credentials that
  do not exist yet. The design's social buttons stay non-functional until then.

### POST /auth/guest · *public*
Anonymous session — browsing and basket only.
- **Response 200:** `{ "accessToken", "refreshToken", "user": { "isGuest": true, "phone": null } }`
- Verifying a phone later upgrades this same account rather than creating a
  second one, so a guest never loses state on sign-up.

### POST /auth/refresh · *public*
- **Body:** `{ "refreshToken" }` → **200:** `{ "accessToken", "refreshToken" }`
- The supplied token is consumed; claims are re-read from the DB so a changed
  role or verification status takes effect on the next refresh.
- **401** if the token is expired, malformed, already used, or revoked.

### POST /auth/logout · *public*
- **Body:** `{ "refreshToken" }`
- **Response 204.** Revokes that refresh token. Logging out with an already
  invalid token is not an error.

### `referralCode` on verify-code
**Applied.** Attributes the new account to the inviter and issues the
newcomer's 2% welcome coupon. Only for a genuinely new account — re-verifying
an existing phone with a friend's code changes nothing, or it would be a
discount generator. An unknown or self-referring code is ignored rather than
failing the signup.

---

## Profile / Me

> **Implemented.** All routes require a bearer token; guests included, since
> they may read and adjust their own profile (language/theme) before verifying.
> Every route returns the same full profile object, so a client never needs a
> follow-up `GET /me` after a write.

### GET /me
- **Response 200:**
```json
{ "id","name","phone","email","avatarUrl","language":"hy","role":"customer",
  "isGuest":false,"phoneVerified":true,"darkMode":false,"notifPush":true,
  "notifPromo":false,"rewardPoints":340,"ordersCount":28,"couponsCount":3 }
```
- `phone` is `null` for a guest. `ordersCount` and `couponsCount` are computed
  (unused coupons only), not stored.

### PATCH /me
- **Body (any):** `{ "name", "email", "avatarUrl" }`
- **409** if the email belongs to another account.

### PATCH /me/settings
- **Body (any):** `{ "notifPush": true, "notifPromo": false, "darkMode": false }`
- `notifPush` is enforced server-side: with it off, an order still records a
  notification (the bell keeps the history) but nothing is delivered — no socket
  frame, and no push once `POST /devices` exists. See BUSINESS_LOGIC.md §4.

### PATCH /me/language
- **Body:** `{ "language": "hy|ru|en" }` — **400** on any other value.

---

## Restaurants

> **Implemented and public** — no token required at all. Browsing is open to
> unauthenticated visitors (ROLES_AND_PERMISSIONS.md) and the web app needs
> these pages crawlable.
>
> Each item is a **branch**: that is what a guest travels to, and what carries
> hours, coordinates and prep time. `id` is the branch id; `slug` identifies the
> restaurant. Localised fields are resolved from `Accept-Language` (default `hy`).
>
> A restaurant therefore appears once per branch. Callers that show restaurants
> rather than branches — anything without coordinates to tell two branches of a
> chain apart — pass `groupByRestaurant=1` on the listing below; `/search`
> already collapses.

### GET /restaurants
Nearby list with filters (Home feed).
- **Query:** `lat, lng, sort(recommended|nearest|fastest|top_rated), distMax, minRating, openNow, groupByRestaurant, dietary[]=vegan…, service[]=pickup|dinein|reserve, category, q, page, limit`
- Array params accept either `?dietary=vegan,halal` or repeated `?dietary=vegan&dietary=halal`.
- **`openNow`** (`1`/`true`) returns only branches currently open (filters on the
  branch `isOpen`). Any other value is treated as off, so a malformed flag never
  400s — it simply applies no filter.
- **`groupByRestaurant`** (`1`/`true`) collapses the list to **one row per
  restaurant**, and makes `total` a count of restaurants rather than branches.
  Off by default. For a caller that renders restaurants rather than branches:
  the web listing has one page per restaurant and no coordinates, so ungrouped
  it drew a five-branch chain as five identical cards that all linked to the
  same page. The app's home feed sends `lat`/`lng`, tells its branches apart by
  distance, and should not group.
  - Collapsing happens **after** filtering and ordering, so the branch kept is
    the best one under the active query — the fastest under `sort=fastest`, an
    open one under `openNow`.
  - With no branch-level sort in play the kept branch is the oldest, which is
    the one `GET /restaurants/{id}` resolves a slug to. A card and the page it
    opens therefore describe the same address, hours and prep time.
- **Ties are broken by `created_at`, then `id`,** under every sort. A chain's
  branches share one rating, so `ORDER BY rating` ties across all of them, and
  tied rows in an unspecified order make `page`/`limit` drop and repeat rows
  between pages.
- `distanceKm` is `null` unless `lat`/`lng` are supplied; `distMax` and
  `sort=nearest` are ignored without them (`nearest` then falls back to the
  default ordering rather than inventing one).
- **`sort=nearest` without `distMax` applies an implicit 5 km radius.** This is
  an order-ahead product, and an unbounded "near me" query would scan the whole
  table. Pass an explicit `distMax` to widen or narrow it.
- `distMax` is matched against the true distance; `distanceKm` in the response
  is the same value rounded to 100 m for display.
- `category` and `dietary` select restaurants having **at least one matching
  menu item**, not attributes of the restaurant row.
- `limit` is capped at **50**; exceeding it is a 400.
- **`priceMin` / `priceMax`** filter on typical spend **per person**, derived as
  the average price of a branch's *available* dishes times
  `SPEND_ITEMS_PER_PERSON` (2). There is no stored per-person column; this is an
  approximation, and a range that matches nothing returns an empty list rather
  than silently dropping the filter. The multiplier was added 2026-08-10 — until
  then this compared a per-person budget against one dish's average, which is a
  different quantity and put every branch below the range any client would draw
  (BUSINESS_LOGIC.md §"Catalog").
- **Response 200:**
```json
{ "items": [ {
  "id","restaurantId","slug","name","cuisine","priceLevel":2,"rating":4.8,"reviewsCount":1200,
  "distanceKm":0.4,"prepMin":12,"isOpen":true,"services":["pickup","dinein","reserve"],
  "coverUrl","reservationsEnabled":true } ],
  "total": 24, "page": 1 }
```
- **`id` is the branch; `restaurantId` is the business.** They are not
  interchangeable: a basket and `GET /restaurants/{id}` are addressed by the
  branch, while a favourite is stored against the restaurant, so a card's heart
  posts `restaurantId` to `POST /favorites`. `GET /search` has always returned
  both for the same reason.

### GET /restaurants/{id}
Restaurant profile + branch.
- `{id}` accepts a **branch id, a restaurant id, or a restaurant slug** —
  clients hold whichever the previous screen supplied. When a restaurant id or
  slug matches several branches the oldest is returned, deterministically; pass
  a branch id to address a specific one.
- **Response 200:** restaurant object + `branch { id, name, address, city, lat, lng, phone, openHours, isOpen, prepMin }`.
- **404** if nothing matches.

### GET /restaurants/{id}/menu
- **Query:** `menuTab=popular|mains|sides|drinks, category`
- `name` and `desc` are resolved from `Accept-Language`; clients never see the
  raw `*_i18n` JSON.
- **Response 200:**
```json
{ "items": [ { "id","name","desc","priceAmd":5800,"caloriesKcal":520,
  "prepMin":12,"photoUrl","dietaryTags":["vegetarian"],"isAvailable":true,
  "menuTab":"popular","categoryId" } ] }
```

### GET /restaurants/{id}/tables
Tables (for dine-in). Inactive tables are omitted.
- **Response 200:** `{ "tables": [ { "id","tableNo":"12","seats":4,"zone" } ] }`

### GET /restaurants/{id}/availability · *implemented, public*
Bookable times for a local date, **answered per party size**.
- **Query:** `date=YYYY-MM-DD` (Yerevan local calendar), `guests` (1–200, default 2)
- **Response 200:**
```json
{ "branchId","date":"2026-07-28","guests":2,
  "slots":[ { "time":"19:00","at":"2026-07-28T15:00:00.000Z","available":true } ],
  "depositAmd":4000,"maxSeats":6,"maxGuests":12,"reservationsEnabled":true }
```
- `time` is Yerevan local (what the picker shows); `at` is the instant to send
  back when booking.
- A slot is available when **at least one table big enough is free for the
  whole seating** — which is why booking 19:00 also closes 19:30. The seating
  length, the spacing of the times, the deposit and the two caps below all come
  from the branch's booking policy (BUSINESS_LOGIC.md §3), not from a platform
  constant.
- **`maxSeats` and `maxGuests` are different refusals.** The first is what the
  furniture allows — the largest single table here. The second is what the house
  accepts, and a branch may cap parties below what it could seat. Clients stop
  their stepper at the smaller of the two; "no table here seats nine" and "we
  take parties up to eight" want different words in front of a guest.
- The `guests` query is bounded by the **platform ceiling** of 200, not by any
  restaurant's answer — a branch that runs a banquet hall has to be askable
  about eighty. Whether *this* branch takes that party is what `maxGuests` says.
- Slots too soon to give the branch its notice (`minLeadMinutes`, an hour by
  default) are never `available`, and neither are slots in the past.
- An empty `slots` array is a real answer, not an error: the restaurant does
  not take bookings (`reservationsEnabled: false`), the day is closed — by its
  weekly hours or by a dated closure — the party is over `maxGuests`, or no
  table seats it (compare `guests` with `maxSeats`).

---

## Categories / Search

### GET /categories · *implemented, public*
Ordered by `sortOrder`. `name` is resolved from `Accept-Language` (default `hy`).
- **Response 200:** `{ "items": [ { "id","key":"sushi","icon":"🍣","name":"Sushi" } ] }`

### GET /search · *implemented, public*
- **Query:** `q` (required), `lat`, `lng`
- **Response 200:** `{ "restaurants": [...], "dishes": [...], "query" }`
- Two lists rather than one blended one — "Sushi" is both a cuisine and a dish.
- Restaurants match on name and cuisine; `distanceKm` is filled in when
  `lat`/`lng` are supplied.
- **One row per restaurant**, always — no flag, unlike the listing above.
  Name and cuisine are both restaurant columns, so every branch of a match
  qualifies, and five branches of one chain would otherwise fill five of the
  twenty slots the other matches need. The branch returned is the one
  `GET /restaurants/{id}` resolves the slug to.
- **Dishes match in any language.** The search runs over the whole `name_i18n`
  blob, so "Burger" finds «Бургер»; the returned `name` is then resolved from
  `Accept-Language`. An empty query returns empty lists, not everything.

### GET /search/popular · *implemented, public*
- **Response 200:** `{ "tags": ["Lunch deals","Sushi","Poke bowls","Ramen","Cold brew","Vegan"] }`
- **Static, deliberately.** Real popularity needs query logging that does not
  exist yet; a table nothing writes to would look like a feature and return
  nothing.

---

## Cart

> **The basket lives on the client.** It is per-device, throwaway state that
> the server gains nothing by storing, and a server-side cart would need
> syncing and conflict rules for no benefit. What the server does own is the
> **arithmetic** — hence the quote endpoint below. No client ever computes a
> total.

### POST /cart/quote · *implemented*
Prices a basket without creating anything. **Any bearer token, guests
included** — filling a basket is allowed before verification; only ordering
is not.
- **Body:** `{ "branchId", "serviceMode": "pickup", "pickupOption": "take_away|eat_in", "items": [ { "menuItemId", "qty" } ] }`
- **Response 200:**
```json
{ "branchId","restaurantName","serviceMode":"pickup",
  "pickupOption":"take_away","pickupOptions":["take_away","eat_in"],
  "eatInRequiresBooking":false,"reservationsEnabled":false,
  "items":[ { "menuItemId","name","unitPriceAmd","qty","lineTotalAmd" } ],
  "unavailable":[ { "menuItemId","reason":"not_on_menu|sold_out" } ],
  "subtotalAmd":14200,"serviceFeeAmd":360,"depositAmd":0,"totalAmd":14560,
  "prepMin":15,"earliestReadyAt":"2026-07-21T18:12:15.556Z",
  "branchIsOpen":true,"canOrder":true }
```
- Prices, names and prep times are re-read from the database; the request
  carries ids and quantities only.
- **`pickupOption` is optional and defaults to `take_away`** — the ending every
  pickup restaurant offers, so a client that has never heard of the field still
  prices the basket it always priced. Null in the response for a dine-in basket,
  and sending one on a dine-in basket is a **422**: food brought to a table it is
  already sitting at is neither taken away nor collected.
- **`eat_in` is a 422 at a branch that takes table bookings**
  (BUSINESS_LOGIC.md §2) — eating in there is a booked table, not an ending on a
  pickup order. Checked here as well as at `POST /orders`, so a basket built
  before the branch started taking bookings is refused on the screen the guest
  is looking at rather than at the payment.
- **`pickupOptions` is what to draw the choice from** — the endings this
  restaurant offers, in reading order. Sent rather than left to the client to
  derive from `services`, because deriving the same answer twice is how the two
  stop agreeing. Fewer than two entries is not a choice, and the clients render
  no live pair.
- **`eatInRequiresBooking` says to draw the other one dead.** True where eating
  in exists but is reached by booking a table — the clients then render "eat at
  the restaurant" beside take-away, dimmed, and pressing it switches the basket
  to `dine_in` rather than choosing an ending. Without it the option would
  simply vanish at every restaurant, and the guest would be left to work out the
  rule from its absence.
- **`reservationsEnabled` says whether the booking mode is worth offering at
  all** — `reserve` declared **and** bookings not paused, the same pair
  `GET /restaurants/{id}/availability` and `POST /reservations` gate on. False
  makes `dine_in` a dead end, so a client draws no booking control rather than
  one whose only destination is "this restaurant does not take bookings".

  **Not the same question as `eatInRequiresBooking`**, which is why both are
  sent. That one is the *declaration*: it stays true while a booking restaurant
  has its bookings paused, and it is false at a place declaring `reserve` alone
  (there is no pickup pair for a dead half to sit under). A client that tried to
  drive the booking mode from it would offer a calendar in the first case and
  hide it in the second.

  Sent rather than derived, like the two above: the switch is not in `services`
  at all, so a client could not work this out even in principle.
- A dish that is missing or sold out is **reported in `unavailable`, not
  thrown**, so the basket screen can flag the line. `canOrder` is the single
  answer to "may this become an order".
- A closed restaurant still returns prices, with `branchIsOpen: false`.
- `prepMin` is the **slowest dish**, not the sum — a kitchen cooks in parallel.
  A dish declaring `0` counts as having declared: a basket of nothing but
  bottled drinks quotes `prepMin: 0`, where only dishes that declare `null`
  fall through to the branch average and then to `DEFAULT_PREP_MIN`.

---

## Orders

> **Implemented for pickup.** Every route requires a **verified phone**
> (`403` for guests) and only ever sees the caller's own orders — ownership is
> part of the query, so another user's order is `404`, never `403`.

### POST /orders · **requires `Idempotency-Key`**
Create a pre-order.
- **Headers:** `Idempotency-Key: <8-128 chars>` — **required**, not optional.
  A retry after a dropped connection would otherwise create a second order.
  Same key + same body → the first response is replayed. Same key + different
  body → **409**. Missing → **400**.
- **Body:**
```json
{ "branchId","serviceMode":"pickup","pickupOption":"take_away",
  "items":[{"menuItemId","qty"}],
  "readyAt":"2026-07-25T12:30:00+04:00",
  "notes": null }
```
- `pickupOption` follows the same rules as on the quote above: optional,
  defaults to `take_away`, **422** for `eat_in` at a branch that takes table
  bookings and for any value at all on a dine-in order. It is stored on the
  order, put on the `created` history entry, and shown to the branch on its
  board — a bag and a plate are not the same order to pack, and the counter is
  too late to ask.
- `readyAt` is optional and defaults to now + `prepMin`. Earlier than the
  kitchen can manage → **422** carrying `{ "earliestReadyAt" }`; further ahead
  than 7 days → **422**; outside the branch's opening hours → **422** carrying
  `{ "readyAt" }`.
- **Naming a time far enough ahead makes it a pre-order** (BUSINESS_LOGIC.md §4):
  the order records `prepMin`, `prepStartAt`, `reminderAt` and
  `reminderLeadMin`, sits on the back office's **Scheduled** stage rather than
  its live board, is **confirmed automatically when it is paid for**, and the
  branch is warned `reminderLeadMin` minutes before it is due. Echoing back the
  `earliestReadyAt` a quote just gave you is *not* a pre-order — that is "now",
  written as a timestamp — and the opening-hours check is skipped for it, since
  an order placed ten minutes before closing whose food is ready five minutes
  after is an ordinary thing to sell.
- `serviceMode: "dine_in"` → **422** until table booking ships.
- **`couponCode` and `reservation` are not accepted** — unknown fields are
  rejected with **400** rather than silently ignored, so a client cannot
  believe a discount was applied when it was not.
- A dish that is missing or sold out → **422** with
  `details.unavailable[]`. The same dish twice → **400** (combine the
  quantities; merging silently would hide a broken basket).
- **Response 201:**
```json
{ "id","code":"AMR-42774033","pickupCode":"730914","status":"created",
  "serviceMode":"pickup","restaurantName","branch":{ "id","name","address" },
  "items":[ { "id","menuItemId","name","unitPriceAmd","qty","lineTotalAmd" } ],
  "subtotalAmd","serviceFeeAmd","depositAmd","totalAmd",
  "readyAt","secondsLeft","scheduled":false,"prepStartAt":null,
  "tableNo":null,"reservationId":null,
  "notes","payment":null,"createdAt" }
```
- `scheduled` is true when the customer chose a time rather than taking the
  earliest, so the tracking screen counts down to a promise instead of showing a
  timer that has not started. `prepStartAt` is when the kitchen begins — shown
  to staff, not to the diner.
- `pickupCode` is `orders.pickup_code` — **six digits, generated in its own
  right and unrelated to `code`.** It used to be the last four digits of the
  order number, which meant a receipt gave it away; it is now the proof that
  closes the order, and it is checked at handover (see
  `PATCH /restaurant/orders/{id}/status`). **This is the only family of
  endpoints that returns it** — an order belongs to the customer asking, and
  they are the audience it is for. No staff endpoint sends it at all.
- Item names are **snapshots** taken in the caller's language at purchase
  time; an order records what was bought at the price it was bought.
- **The first `order_events` row is written by this same INSERT** (nested, not a
  second call), so no order can exist without a record of having been placed.

### GET /orders
- **Query:** `status=active|past, page, limit` (limit capped at 50)
- **Response 200:** `{ "items":[ { "id","code","restaurantName","coverUrl","date","itemsCount","totalAmd","status","readyAt","secondsLeft","scheduled" } ], "total", "page" }`
- `scheduled` lets the list read "for Tue 13:00" instead of a countdown that
  would otherwise say "ready in 4,320 minutes".
- `itemsCount` counts **dishes, not lines** — "3 items" means three things to eat.

### GET /orders/{id}
- **Response 200:** the same object `POST /orders` returns.
- `secondsLeft` counts down to `readyAt`, never goes negative, and is `null`
  once the order is `ready`, `completed` or `cancelled`.

### POST /orders/{id}/cancel
**Allowed only while the order is `created`** — that is, before it has been
paid for. Paying commits the order (BUSINESS_LOGIC.md §4).
- **Response 200:** the full order with `status: "cancelled"`.
- **422 as soon as the order is `paid`**, and for every status after it. This
  endpoint never refunds anything, because there is never anything captured
  behind an order it can act on.
- **409** if the order changed underneath the request.
- A payment row may still exist — a card that was **declined** on an order the
  customer then walked away from. It is closed off as `cancelled` alongside the
  order, so nothing is left looking like a live attempt.
- **Writes `order_events`** naming the customer, with what became of that
  attempt — "cancelled" and "cancelled, and the refused card was released" are
  different answers to what the timeline is opened for.

> **No endpoint cancels a paid order**, for a customer or for staff — the
> restaurant's `PATCH /restaurant/orders/{id}/status` is bound by the same state
> machine and will 422. A branch that cannot fulfil a paid order is a support
> conversation today.

### POST /orders/{id}/reorder — **not implemented, and not wanted**
Reordering needs no endpoint. A basket is per-device state that never reaches
the server (see "Cart" above), so both clients do it by re-reading the order
with `GET /orders/{id}` and copying **ids and quantities only** into a fresh
basket — never money, so a dish that has changed price or come off the menu is
caught by `POST /cart/quote` rather than carried over from history. The web has
done this since the orders screen was built; the phone since 2026-08-10, where
the button had until then been labelled "Reorder" and opened the tracking
screen.

### Realtime status · *implemented*

**`wss://api.amragrir.am/v1/orders/stream`** — plain WebSocket (not socket.io;
React Native and every browser already ship a client).

One socket, one connection, any number of orders — the orders list screen shows
several countdowns at once.

**Authentication is the first message, not the handshake.** A browser cannot
set an `Authorization` header on a WebSocket, and a token in the query string
is written into every access log along the way.

```json
→ { "event": "subscribe",   "data": { "token": "<accessToken>", "orderId": "…" } }
← { "event": "order",       "data": { "orderId","code","status","readyAt","secondsLeft" } }
→ { "event": "unsubscribe", "data": { "orderId": "…" } }
← { "event": "error",       "data": { "message": "…" } }
```

- The reply to `subscribe` is the **current state**, not just a promise of
  future ones — a client opening the tracking screen after the order moved
  would otherwise render stale data until the next change, which for a
  finished order never comes.
- An order the caller may not read answers `Order not found` — the same text as
  one that does not exist, since a distinguishable error confirms the id.
- The server pings every 30s; a socket that misses two is dropped. Clients
  should reconnect and re-subscribe.
- **Polling is still supported and returns the same fields.** This is an
  optimisation, not the only way to follow an order.
- **Fan-out crosses instances.** Each process serves the sockets it holds from
  its own emitter and republishes the event on Redis pub/sub, so a socket on
  instance A hears a change made on B. Local delivery deliberately does *not*
  travel through Redis: a broker that is down costs the other instances, never
  the sockets a process is already holding. Each process drops its own echo, so
  one change is one delivery.

---

## Reservations

> **Implemented.** Every route requires a **verified phone** and sees only the
> caller's own bookings — another guest's is `404`, never `403`.

### POST /reservations · **requires `Idempotency-Key`**
Books a table and **holds** the deposit.
- **Body:** `{ "branchId","reservedFor":"2026-07-28T15:00:00.000Z","guests":4,"depositMethod"?,"depositToken"?,"notes"? }`
- **No amount field** — the deposit is `guests × 2000֏`, computed server-side.
- `reservedFor` must land **exactly on an offered slot**; anything else is
  **422** with the local time it resolved to. That is what stops a client
  booking 19:07 and bypassing availability.
- The **server picks the table** — always the smallest that fits.
- **Response 201:**
```json
{ "id","status":"pending","branch":{ "id","name","address" },"restaurantName",
  "reservedFor","localTime":"19:00","localDate":"2026-07-28","guests":2,
  "tableNo":"1","depositAmd":4000,"depositStatus":"authorized",
  "depositCredited":false,"freeCancellationUntil","orderId":null,"createdAt" }
```
- **409** when no table is free at that time — including when two requests race
  for the last one; exactly one wins.
- **422** for a past time, beyond 30 days ahead, a party larger than any table
  (with `maxSeats`), a restaurant that does not take bookings, or a **declined
  deposit**. A booking whose deposit cannot be held is not made.

### GET /reservations
- **Query:** `status=upcoming|past, page, limit`
- **Response 200:** `{ "items":[ … ], "total", "page" }` — same object as above.

### GET /reservations/{id}
- **Response 200:** the same object.

### POST /reservations/{id}/cancel
- **Response 200:** the booking with `status: "cancelled"`.
- The deposit is **released** (`depositStatus: "cancelled"` — never charged, so
  the guest sees a hold disappear rather than a charge and a refund) when
  cancelling at least 2 hours ahead, and **captured** after that.
- Cancelling **frees the slot**, so the table can be booked again immediately.
- **422** once the guest has been seated.

### Dine-in orders

A dine-in order is food brought to a table, so it needs a booking:
`POST /cart/quote` and `POST /orders` take `serviceMode: "dine_in"` **plus
`reservationId`**.

- **`POST /orders` is 422 without one.** `POST /cart/quote` is **not**:
  choosing "dine in" and booking the table are two steps, so between them
  there is a real basket that is dine-in with no `reservationId`, and the
  customer is looking at it. A quote prices it as food alone (`depositAmd: 0`,
  `tableNo: null`). Pricing is not committing — the same split as
  `preview`/`claim` for coupons.
- Whenever a `reservationId` **is** supplied it is checked in full, on both
  endpoints alike: **422** for a booking that is not active or one at a
  different restaurant, **409** if it already has an order
  (`orders.reservation_id` is unique), **404** for another guest's booking.
  Quoting is not a way around any of these.
- `canOrder` does not fall to `false` for a dine-in basket with no booking
  yet. It reports on the basket's *contents* — a closed branch, a sold-out
  line — and the missing booking is a step in the flow, blocked on the screen
  that books the table.
- The quote gains **`dueNowAmd`** — the meal total minus the deposit already
  held — and `tableNo`. `totalAmd` is unchanged: the deposit is credited, not
  charged twice (BUSINESS_LOGIC.md §3). `dueNowAmd` never goes below zero.

---

## Payments

> **Implemented against a development provider** that approves everything and
> moves no money — an acquirer for Armenia is still an open question. Nothing
> outside `PaymentsModule` names a provider, so swapping one in is a
> `useClass` change.

### GET /payment-methods · *public*
- **Response 200:** `{ "methods":["apple_pay","google_pay","card"], "default":"apple_pay" }`
- **Online only.** `cash` was removed: it captured nothing, moved the order to
  `paid` anyway, and nothing in the platform ever settled it (BUSINESS_LOGIC.md
  §5). A client that still sends it gets **400** from the DTO.

### POST /payments · **requires `Idempotency-Key`**
Requires a verified phone.
- **Body:** `{ "orderId","method":"apple_pay|google_pay|card","token":"…" }`
- **There is no amount field.** The server charges the order's `totalAmd`; the
  client says *which* order and *how*, never *how much*.
- `token` is an opaque wallet/card token from the client SDK — raw card data
  must never reach this server.
- **Response 201:** `{ "id","status","amountAmd","method","orderStatus" }`
- **Every method goes through the provider**, so a successful call means the
  money was taken (`status: "captured"`) and the order is `paid`. There is no
  method that places an order without paying for it.
- **A pre-order comes back `confirmed`, not `paid`.** Paying for one accepts it,
  in the same transaction — nobody presses Confirm on Monday for a Saturday
  order, and until somebody did, the diner would be watching a screen that said
  the restaurant had not looked at it. Recorded as a second `order_events` row
  with actor `system`, and announced as its own status change so no watcher sees
  a jump the state machine has no edge for. Ordinary orders are untouched: they
  still wait on the board's **Paid** stage for a person.
- **Declined** → **422**, the attempt is recorded as `failed`, and the order
  stays `created` so the customer can retry on the same row.
- **Writes `order_events`** in the payment's own transaction: a `status_changed`
  entry for the move to `paid`, or a `payment` entry for a decline — which moves
  no status and would otherwise leave the order's timeline with an unexplained
  twenty-minute gap.
- **409** if the order is already paid, or if it is in a status that cannot
  become `paid` (cancelled, preparing…). The order state machine decides, not
  an ad-hoc check.
- In development, sending `"token": "decline"` forces a decline, so the failure
  path is reachable rather than written and never run.

### Idempotency

`POST /orders` and `POST /payments` require an `Idempotency-Key` header
(8–128 characters, typically a UUID the client generates once per attempt and
keeps across retries).

- The stored response is scoped to **the endpoint and the authenticated user**,
  so a guessed key cannot return someone else's order.
- Records live for **24 hours**.
- A failed request **releases** its key immediately — a transient error must
  not permanently burn a key.
- Concurrent duplicate → **409** while the first is still running.

---

## Favorites

> **Implemented.** All routes require a **verified phone** — favourites belong
> to an account, and a guest session is per-device and would lose them.

### GET /favorites
- **Response 200:** `{ "items":[ { "restaurantId","branchId","slug","name","cuisine","priceLevel","rating","reviewsCount","coverUrl","prepMin","isOpen","services","addedAt" } ] }`
- `branchId` is included so a card links straight to a page that can be ordered
  from; it is `null` for a restaurant that has no branch yet.

### POST /favorites
- **Body:** `{ "restaurantId" }` → **200** `{ "favorited": true }`
- **Idempotent** — favouriting twice is what a double tap does, not an error.
- **404** if the restaurant does not exist.

### DELETE /favorites/{restaurantId} → **204**
- Also idempotent: removing something absent leaves the caller in the state
  they asked for.

---

## Referrals and coupons

> **Implemented.** Both routes require a verified phone.

### GET /referrals/me
- **Response 200:**
```json
{ "code":"ARAM5","link":"amragrir.am/i/ARAM5","invitedCount":3,
  "discountEarnedPct":6,"maxStackPct":25,
  "coupon":{ "code":"FRIENDS","discountPct":6,"validUntil":"…" } }
```
- The code is **created on first read** — most accounts never open this screen.
- `discountEarnedPct` is the lifetime figure; `coupon` is the reward actually
  waiting to be used. They differ once a reward has been spent.

### GET /coupons
- **Response 200:** `{ "items":[ { "id","code","discountPct","discountAmd","source","validUntil" } ] }`
- Unused and unexpired only. Expired coupons are kept (history, support) but not
  offered.

### Using a coupon
`couponCode` is accepted by **`POST /cart/quote`** and **`POST /orders`**.

- A quote **prices** the coupon and never spends it; the response carries
  `{ coupon: { code, applied, discountAmd } }` so a rejected code is *shown*
  rather than silently charging full price.
- An order **claims** it. Two orders submitted at once cannot both spend one
  coupon; the loser gets **422**.
- Cancelling an order **returns** the coupon.
- The discount applies to the **subtotal** and is capped at **25%**.

### POST /referrals/share — **not implemented**
- **Body:** `{ "channel":"link|whatsapp|telegram" }` → `{ "shared": true }`
- Sharing happens in the OS share sheet; there is nothing for the server to do
  until share analytics are wanted.

---

## Reviews

### GET /restaurants/{id}/reviews → `{ "items":[ { "rating","comment","author","date" } ], "avg":4.8 }`
### POST /restaurants/{id}/reviews → **Body:** `{ "orderId","rating":5,"comment" }`

---

## Notifications

The customer's bell — the header bell on the web and the mobile app's
`/notifications` screen. What has happened to **this account's** orders, so a
visitor who is not sitting on the tracking screen still learns that the kitchen
moved. See DATABASE.md §12 for the table and §8b for why the back office's bell
is a different one.

All of these are gated on a **verified phone**, exactly like `GET /orders`: every
notification here is about an order, and ordering is what verification gates
(ROLES_AND_PERMISSIONS.md §1). A guest has nothing to be told about.

**Which moves are announced:** `confirmed`, `preparing`, `almost_ready`,
`ready`, `completed`, `cancelled`. Not `created` — the customer is the one who
just made it — and not `paid`, which is published back to back with `confirmed`
from a single payment and would buzz a phone twice for one tap. See
BUSINESS_LOGIC.md §4.

### GET /notifications · *implemented*
- **Query:** `limit` (default 30, capped at 50).
- **Response 200:** `{ "items":[ { "id","type","title","body","payload","isRead","createdAt" } ], "unread": 2 }`
- **`type`** is one of `order`, `reservation`, `promo`, `referral`, `system`.
- **`title` and `body` are null for everything the client can draw itself**,
  which is every `order` and every `reservation` row. Those carry `payload` —
  `{ "orderId", "code", "status" }` for an order, `{ "reservationId", "status",
  "reservedFor" }` for a booking — and the client renders the line from the
  dictionaries it already ships (`ORDER_STATUS_COPY` and
  `RESERVATION_NOTIFICATION_COPY` in `@amragrir/i18n`).
- **The two copy maps are separate and keyed by kind.** An order and a booking
  both have a `confirmed` status and mean different things by it, so a client
  that looked words up by status alone would draw the wrong ones. A booking row
  is announced for three statuses only — `confirmed`, `cancelled`, `no_show`;
  see BUSINESS_LOGIC.md §4 for why the other three are silent, and why a guest
  cancelling their own table is never told about it.
- **A booking reminder carries `"reminder": true`** beside an unchanged
  `confirmed` status, and clients must read that marker *before* looking words
  up by status — drawn by status it would say "Your table is booked" to somebody
  who booked it weeks ago. Its words are `RESERVATION_REMINDER_COPY`.
  They are populated only where the server wrote the prose — a promo, a system
  note — and there the API's words are all there is.
  Storing a sentence for an order would freeze it in whatever language the
  reader preferred that day, and switching language in Settings would leave the
  bell half-translated. Same conclusion as the staff bell's "numbers, never
  prose", reached from the other direction: that table has no known reader, this
  one has a reader who is allowed to change their mind.
- **`unread` counts everything unread**, not what fits on the page — a badge
  reading 30 because that is where the page ended would be a lie at 31.
- **Newest first.**

### PATCH /notifications/{id}/read · *implemented* → **204**
- What tapping one line means. Scoped to the caller, so another account's id
  marks nothing and answers **404** — the same answer as for an id that does not
  exist, because a distinguishable error would confirm it does.

### POST /notifications/read-all · *implemented* → **200**
- **Response:** `{ "read": <count> }` — what opening the bell means. A call
  rather than a PATCH per id: the set is "everything unread", not a list the
  client has to hold and send back.

### DELETE /notifications/{id} · *implemented* → **204**
- The cross on a line. **A real delete, not a flag** — see DATABASE.md §12: a
  notification is a *message about* a fact, and the fact is in `orders` and
  `order_events` either way, so there is nothing here worth soft-deleting.
- Scoped like the read above: another account's id deletes nothing and answers
  **404**, the same as an id that never existed. Deleting the same id twice is
  therefore a 404 the second time, and both clients treat that as done rather
  than as a failure.

### DELETE /notifications · *implemented* → **200**
- **Response:** `{ "deleted": <count> }` — empties the bell. **Everything, not
  only what has been read**: the gesture is "I am done with all of this", and a
  clear that quietly left the unread ones behind would look like it had failed.
- `DELETE` on the collection rather than a `POST /clear`, unlike `read-all`
  above: marking read is a state change with no verb of its own, while removing
  every member of a collection is exactly what this verb means.
- Clearing an empty bell is **200 with `{ "deleted": 0 }`**, not an error: it
  leaves the caller where they asked to be.

### `watchMe` (WebSocket) · *implemented*
- `{ "event": "watchMe", "data": { "token": "<access token>" } }` on the same
  socket as the order stream; answers `{ "event": "watchingMe" }`.
- **Customer tokens only, and a verified phone** — the same gate the REST list
  sits behind, because "may you call this" and "may you hold this open" have to
  give the same answer. Staff are addressed by branch (`watchBranches`).
- The account comes from the verified token and never from the message, so a
  socket cannot ask for somebody else's bell.
- Delivers `{ "event": "notification", "data": { …the item as `GET` returns it } }`
  — the whole row here, unlike the staff frame, because there is no reach to
  re-check: the row belongs to the one account that authenticated, so a client
  can unshift it into the list it already holds instead of re-reading. A bell
  that refetched on every push would turn one order moving through six stages
  into six list requests.
- **Both clients use this, by different routes.** `apps/mobile` holds its token
  in memory and subscribes directly. `apps/web` cannot — its session is an
  httpOnly cookie, so the page has no token for that first message — so its
  `/[lang]/notifications/stream` route handler holds this socket server-side and
  streams frames down to the browser as Server-Sent Events. The API sees one
  ordinary subscriber either way. Its 30-second poll remains as the fallback for
  a deployment where a held connection is not available.

### POST /devices — **not implemented**
- Register a push token: `{ "platform":"ios|android","token" }`. OS-level push
  is a separate piece of work: it needs FCM/APNs credentials, which live outside
  this repository. The bell above is in-app only and works whenever the site or
  the app is open.

---

## Staff authentication

> The back office. Staff are **separate accounts** from customers
> (ROLES_AND_PERMISSIONS.md): their own table, email and password rather than a
> phone OTP, and no sign-up — an account exists only because someone who
> already had one invited it.
>
> Staff tokens carry `kind: "staff"`. A customer token is refused here, and a
> staff token is refused on every customer endpoint; both are signed with the
> same secret, so this check is what keeps the two identities apart.

### POST /auth/staff/login · *public, implemented*
- **Body:** `{ "email", "password" }`
- **Response 200:** `{ "accessToken", "refreshToken", "staff": { "id","email","name","scopes":[…],"permissions":[…] } }`
- `permissions` is flattened from the roles held, so the panel renders its
  screens from the same map the API enforces.
- **Every failure answers identically (401)** — wrong password, unknown address,
  deactivated account, invitation never accepted. A login endpoint that
  distinguishes them is a way to find out who works here; an unknown address
  still burns the same time a real verification would.
- **403 when the credentials are right and the account holds no roles.** A real
  dead end, said plainly — a token here would produce a panel where everything
  403s.
- Rate limited to 10/min per IP, tighter than the global 120.

### POST /auth/staff/refresh · *public, implemented*
- **Body:** `{ "refreshToken" }` → the same shape as login.
- Re-reads assignments, so a role granted or revoked since the last refresh
  takes effect now rather than at the next sign-in.

### POST /auth/staff/logout · *public, implemented* → **204**

### POST /auth/staff/accept-invite · *public, implemented*
- **Body:** `{ "token", "password", "name"? }` → signs in, same shape as login.
- Password minimum **12 characters**, no composition rules — a length floor is
  worth more than a symbol requirement, and this is a panel where one account
  can change every price in a restaurant.
- Creating the account, setting the password and granting the role are one
  transaction: a half-accepted invite would leave an account nobody can sign
  into and a token already spent.
- **401** if the invitation expired or was already used.

### POST /auth/staff/forgot-password · *public, implemented* → **202**
- **Body:** `{ "email" }`
- **Always 202**, whether or not the address belongs to anyone.
- The link lives 30 minutes (`STAFF_RESET_TTL`).

### POST /auth/staff/reset-password · *public, implemented* → **204**
- **Body:** `{ "token", "password" }`
- **Ends every session the account holds.** Whoever reset it may have done so
  because someone else knows the old password.

### GET /auth/staff/me · *implemented*
Read from the database, not the token — a role granted a minute ago is not in
the current access token, and this is what decides which tabs render.

---

## Restaurant panel

> Was `/owner/*`. Each route names the **permission** it needs rather than a
> list of roles, and the service applies a scope filter for that same
> permission. A branch or dish outside the caller's reach is **404**, not 403.

### GET /restaurant/orders · *implemented* — `orders:read`
The kitchen queue.
- **Query:** `status, q, restaurantId, branchId, page, limit` (default 20, capped at 50)
- **`status` is the stage:** `active` (default — everything the kitchen still
  has to do) · `scheduled` · `paid` · `unpaid` · `confirmed` · `preparing` ·
  `almost_ready` · `ready` · `past` (completed or cancelled). The set of order
  statuses behind each is `QUEUE_FILTER_STATUSES` in `packages/shared` — the same
  table the panel labels its tabs from, so the two cannot disagree.
- **`scheduled` is the one stage that is a moment in time as well as a set of
  statuses.** It is the pre-orders whose hour has not come — `paid` or
  `confirmed`, exactly like an order at the counter, and told apart by
  `orders.reminder_at` still being in the future. Every other stage is
  implicitly the other half of that split, so an order placed today for next
  Tuesday does not sit in **Paid** as the oldest row there, pinned above the
  work somebody is doing now. The split is taken against the clock and never
  against `reminder_sent_at`, so an order reaches the board at its proper hour
  even where the reminder job is not running.
- **One stage per status now, in the order an order moves through them.** They
  used to be coarser: a single `new` spanning `created`, `paid` and `confirmed`,
  and a `preparing` that swallowed `almost_ready`. Accepting an order, starting
  to cook it and plating it are three different people's moments, and a stage
  that mixed them could not say how many of each were waiting. Every count is
  now a number somebody can act on.
- **`active` is the exception and remains the default** for a caller that names
  no stage. It spans the whole live queue, so the counts do **not** sum to
  `total` — a paid order is counted under both `active` and `paid`.
- **`unpaid` is the exception to that, and is exactly the `created` status** —
  an order placed and never paid for, an abandoned basket or a declined card.
  Named for what it means rather than the status behind it, because that is the
  question somebody asks. It is not a step in the flow, so it has no place on
  the strip: the panel hangs it off **Paid** as an inner filter, the one stage
  it is the opposite of. Worth reaching at all because **nothing expires those
  rows** — no job expires an unpaid basket (the reminder sweep is the API's only
  scheduled job, and it is about pre-orders), so they accumulate.
- **`q` matches the order code, the customer name, or a whole pickup code.** One
  parameter rather than three, because whoever is typing knows which of them
  they have. The first two are substring matches; the pickup code is matched
  **only when `q` is exactly six digits, and then on equality**. That asymmetry
  is deliberate: a substring match on it would answer "which orders have a 7 in
  their collection code", and repeated per digit that is the code itself,
  arrived at without anybody being told it. You can find the order you were
  given a code for, and nothing else.
- Scoped to the caller's reach; `q`, `restaurantId` and `branchId` **narrow** it
  and never widen it, so passing someone else's branch id returns nothing. The
  search is composed with `AND` for exactly this reason — the scope filter is
  itself an `OR`, and overwriting it would make the search box a way to read
  every restaurant's orders.
- **Ordered by `prep_start_at`, soonest first** — when the kitchen has to begin,
  which for an order wanted as soon as possible is `created_at` shifted by a
  constant, so the ordinary board is ordered exactly as it always was. What
  changes is that a pre-order whose hour has come slots in where it belongs
  rather than at the top. Nulls sort last: an order from before the column
  existed is a finished one, and a finished order has no claim on the front of a
  queue.
- **Response 200:** `{ "items":[ { "id","code","status","serviceMode","pickupOption","branch","customerName","itemsCount","totalAmd","paymentStatus","readyAt","secondsLeft","scheduled","prepStartAt","prepMin","reminderAt","reminderLeadMin","createdAt","items":[{"menuItemId","name","qty","lineTotalAmd"}],"notes" } ], "total", "page", "counts" }`
- **No `pickupCode`.** The board names an order by `code`. It used to carry the
  collection code and print it across every card, which is what made a handover
  check pointless: a counter that can read the code off its own screen never has
  to ask a guest for it. The panel's only dealing with that code is the other
  direction — typed into the handover dialog, checked by the API.
- **`pickupOption`** is where a pickup order ends up — `take_away` or `eat_in`,
  null on a dine-in order. The one field here the kitchen acts on *before* the
  food is ready, which is why it is on the card and not behind the History
  dialog: a bag and a plate are not the same order to pack. The panel marks only
  `eat_in`, because every other pickup order is take-away and labelling all of
  them would bury the one that is different.
- **`scheduled`** is whether this is a pre-order still waiting, taken against the
  same instant the page was selected under — so a card cannot claim to be
  scheduled while the query that fetched it disagreed. `prepStartAt` is when the
  kitchen must begin, `prepMin` the estimate it was promised against, and
  `reminderAt`/`reminderLeadMin` the warning and its notice in minutes. All null
  on an order placed for as soon as possible, and on rows written before
  pre-ordering existed.
- **Each line carries the dish it came from and what it cost.** `name` is the
  snapshot taken when the order was placed — what the diner bought, whatever
  the dish has been renamed to since — and `menuItemId` is the dish itself,
  which is what lets the panel link a line to its row on the menu. Both are
  needed: an id cannot say what was ordered, and a name cannot say what to
  open. `lineTotalAmd` is the line rather than the unit price, so a client
  showing it beside the quantity is not asking a kitchen to multiply.
- **`counts`** is one number per stage — `{ active, scheduled, paid, unpaid,
  confirmed, preparing, almost_ready, ready, past }` — taken under every filter **except**
  the stage itself. That is what lets a search say where an order is: type a code
  while looking at the live board and the counts read `active: 0, past: 1`, one
  click away, instead of an empty board with no explanation. They do **not** sum
  to `total`: `active` overlaps every working stage, so one paid order is
  counted under both `active` and `paid`.

- **A dine-in row carries its booking**: `booking: { tableNo, time, guests }`,
  null on every pickup order. The card used to say `serviceMode: "dine_in"` and
  nothing else, which is the least useful half of what the order knows — where
  these people are sitting, when they are due and how many covers to lay are all
  on the reservation the order already carries (`orders.reservation_id`), so the
  board was throwing away an answer it was holding.

### GET /restaurant/orders/{id}/history · *implemented* — `orders:read`
Everything that has happened to one order — what the card's **History** button opens.
- **Response 200:** `{ "items":[ { "id","type","fromStatus","toStatus","actor":{"type","name","email","impersonatedBy","id","impersonatedById"},"detail","at" } ] }`
- **`type`** is `created` · `status_changed` · `payment` · `reminder_set`. The
  third is an attempt that moved no status — a decline — which would otherwise
  be invisible in a timeline whose job is to explain why an order sat unpaid.
  The fourth is a shift retiming a pre-order's warning, which moves no status
  either: `orders.reminder_lead_min` is overwritten in place, so this entry is
  the only record that it ever moved or of who moved it.
- **`actor.type`** is `customer` · `staff` · `system`. `name` is null for
  `system`, for a diner who never gave one, and for an account since deleted —
  the entry outlives the actor (`ON DELETE SET NULL`). `email` is staff-only.
- **`actor.impersonatedBy`** names the real person when the account above was
  being acted as, and is null otherwise.
- **`actor.id`** is which row that actor is — a `users` id for a customer, a
  `staff_users` id for staff, following `actor.type` rather than "whichever
  column is set". Null exactly where `name` is. `impersonatedById` pairs with
  `impersonatedBy` the same way. They are what let the panel turn a name in the
  timeline into a link to that person (`/customers?person=` and
  `/people?person=`) instead of a string somebody has to go and search for.
  An id and nothing else: the screens behind them need `platform:users` and
  `staff:read`, neither of which `orders:read` implies, so whoever follows one
  is answered by those endpoints on their own permissions — and a staff id
  outside the caller's reach lists nobody.
- **`detail`** carries the per-type extras: dish count and total on a placement,
  payment method, status and amount on anything that touched money, and on a
  `reminder_set` both `reminderLeadMin` and `previousReminderLeadMin` — the new
  notice and the one it replaced, because "somebody set it to 45" is not an
  answer to "why did this go out so early". The `created` entry also carries
  `scheduled`, so a timeline says an order was placed for later rather than
  leaving somebody to subtract two timestamps. It also
  carries `backfilled: true` on the single `created` entry the migration wrote
  for orders that predate the table, and `reconstructed: true` on an entry
  inferred from the order row rather than recorded as it happened (dev seed
  only — see DATABASE.md §8a). Both are rendered as a note under the entry, so a
  reader can tell what was witnessed from what was worked out.
- **Oldest first** — a story reads forwards.
- `orders:read`, not `orders:advance`: reading the trail is part of watching the
  queue, and the person at the counter is often not the one allowed to advance
  anything. Scoped in the query, so an order outside reach is **404**.

### PATCH /restaurant/orders/{id}/status · *implemented* — `orders:advance`
- **Body:** `{ "status": "confirmed|preparing|almost_ready|ready|completed|cancelled", "pickupCode"? }`
- **`completed` requires `pickupCode`, and every other status refuses it.** That
  transition is the only one on this endpoint that is not a statement about the
  kitchen: the rest say what the restaurant has done, and this one says the food
  left the counter in somebody's hands. The evidence is the six digits the guest
  shows, checked here against `orders.pickup_code` — which no staff endpoint
  ever returns, so the panel cannot make this check itself and is not trusted
  to. Required exactly on `completed` by the DTO, so "mark it ready" stays a
  one-field request.
  - A code of the wrong shape is **400** (validation).
  - A well-formed code that is not this order's is **422** with
    `details.reason = "pickup_code_mismatch"` — a distinct reason because a
    mistyped digit is the ordinary outcome at a counter and clients word it
    themselves, in the shift's language, rather than showing the API's sentence.
  - The state machine is checked **first**: a correct code does not make
    `paid → completed` legal, and the 422 for that names the real problem.
  - **There is no override.** A guest who cannot produce their code cannot have
    the order closed — see BUSINESS_LOGIC.md §5 for why that was chosen over an
    audited escape hatch.
- **`paid` is not settable.** Only a payment makes an order paid.
- **`cancelled` is settable only from `created`** — the same rule the customer's
  cancel obeys. A branch cannot call off an order that has been paid for; the
  board stops offering the button, and the endpoint answers **422** if one is
  sent anyway.
- Scoped on `orders:advance`, not `orders:read` — a role allowed only to watch
  the queue cannot move an order in it.
- Legality comes from the shared state machine, so skipping a step is **422**.
- **`preparing → ready` is the one skip the machine allows**, and it is a single
  transition rather than two run together: `almost_ready` warns the counter that
  something is about to need handing over, and a dish plated in one motion never
  spends a moment there. One `order_events` row, reading `preparing → ready`,
  because that is what happened.
- **Writes `order_events`** in the same transaction as the move, naming the staff
  member — and, under impersonation, the super admin actually behind them.

### PATCH /restaurant/orders/{id}/reminder · *implemented* — `orders:advance`
How much notice the branch wants on one pre-order.
- **Body:** `{ "leadMin": 45 }` — minutes before the food is due, bounded by
  `REMINDER_LEAD_MIN_MINUTES`…`REMINDER_LEAD_MAX_MINUTES` (5 min – 24 h).
- **Response 200:** `{ "id", "reminderAt", "reminderLeadMin", "scheduled" }` —
  the warning alone, not the whole order. The board patches the one card it
  already has; re-sending forty fields to say one number moved would let a
  response that left before a socket update landed overwrite the status it
  delivered. `scheduled` is whether the new moment is still ahead, decided
  server-side so the panel's clock cannot put a card on the wrong tab.
- **Measured from `ready_at`, not from `prep_start_at`.** "Warn me forty-five
  minutes before it is due" is a sentence somebody can act on; the alternative
  describes the same instant in a way nobody can hold in their head. The default
  a pre-order arrives with is the prep estimate plus `PREP_REMINDER_BUFFER_MIN`.
- **Nothing the customer was promised moves.** `ready_at` stands and so does the
  price — what changes is when the kitchen hears about it, which is why this is
  `orders:advance` rather than a permission of its own: the same person, at the
  same pass, deciding about the same order.
- **422** on an order placed for as soon as possible (no warning to move) and on
  one that is `completed` or `cancelled`. **404**, not 403, outside reach —
  scoped on `orders:advance` in the query.
- A lead longer than the time remaining is **legal** and means "warn me now": the
  sweep picks it up on its next pass, and the order leaves the Scheduled stage.
- **Re-arms `reminder_sent_at`** when the new moment is still ahead — a warning
  already sent for a time somebody has since moved later was premature, and
  leaving the mark set would mean the time they chose never fires. Left alone
  when the new moment is already past: that is not a request to be told twice.
- **Writes an `order_events` row** of type `reminder_set` in the same
  transaction, naming who did it and the notice it replaced.

### GET /restaurant/restaurants · *implemented* — `branch:read`
The restaurants in reach, each with its branches nested.
- **Query:** `q, restaurantId, branchId, page, limit` (default 10, capped at 50)
- **`q` matches the restaurant's name or slug, or a branch's name, address or
  city** — one parameter, because whoever is typing knows which of the two they
  have and should not have to pick a field first.
- **Which branches come back under a card depends on what matched.** A named
  `branchId` shows alone — that is what naming it means. A search shows the
  branches that matched it, *unless* the restaurant itself is what matched, in
  which case the search was for the chain and hiding nine of its ten branches
  would be a strange way to answer.
- **`branchCount` is the restaurant's real total**, in the caller's reach,
  regardless of what a filter left in `branches`. The two differ under a
  search, and reporting the filtered length would tell somebody a five-branch
  chain has one.
- Scoping is applied first and never widened; `q` is composed with `AND` so it
  cannot overwrite the scope filter's own `OR`.
- **Response 200:** `{ "items":[ { "id","slug","name","cuisine","priceLevel","reservationsEnabled","services","branchCount","branches":[ …the branch shape below… ] } ], "total", "page" }`
- **Restaurant and branches are scoped independently.** A `branch_staff` sees
  the restaurant their branch belongs to, and only that branch under it — not
  its siblings.
- **This is the only endpoint that can show a restaurant with no branches**, and
  that is the one that needs finding: a restaurant cannot have a menu or take an
  order until it has a branch, so somebody has to be able to see it in order to
  add the first one. Grouping the flat list below client-side would leave those
  restaurants invisible.

### GET /restaurant/restaurants/{id} · *implemented* — `branch:read`
One restaurant, opened on its own.
- **Response 200:** the list's shape plus `ratingAvg`, `reviewsCount`,
  `coverUrl`, `createdAt`. `ratingAvg` is resolved to a **number** — a Prisma
  `Decimal` serialises as an object and compares wrongly against one.
- **Every branch in reach is returned**, unnarrowed: arriving here means having
  chosen this restaurant, and the search that found it has no business deciding
  which of its branches exist afterwards. `branchCount` therefore equals
  `branches.length`; the field is kept so the detail and the list rows share a
  type.
- **404, not 403**, outside the caller's reach — the reach is part of the query,
  so no path loads someone else's restaurant and then decides, and the answer
  does not confirm the id names anything.

### PATCH /restaurant/restaurants/{id}/services · *implemented* — `restaurant:write`
How the restaurant will feed people — pickup, table service, table booking.
- **Body:** `{ "services": ["pickup","reserve"] }` — values from
  `restaurants.services` (`pickup`, `dinein`, `reserve`).
- **The whole set, not the one that moved.** The rules are about *combinations*:
  "may this restaurant offer dine-in" cannot be answered without knowing whether
  it takes bookings. A body naming one service at a time would have to be judged
  against a set the caller may not have looked at since, and a whole set makes
  the request idempotent.
- **422 for a combination that is not a place** (BUSINESS_LOGIC.md §2): `dinein`
  without `reserve`, a dining room whose tables cannot be booked. The message
  names both services.
- **There is no `eat_in` to send.** Eating in after collecting the order is
  derived from the absence of `reserve`, not declared — see BUSINESS_LOGIC.md §2
  for why a switch that could disagree with the booking was removed. The value
  is outside the vocabulary now and the DTO refuses it.
- **The back office disables the switch that would break the rule**, reading the
  same `checkServices` from `@amragrir/shared` that this validates with — but a
  disabled control is a courtesy to whoever is looking at the screen, not a
  check on what reaches the database.
- **Stored de-duplicated and in a fixed order** (`pickup, dinein, reserve`).
  Nothing reads the array positionally, so the order is for whoever opens the
  row; a save that only reorders writes no activity entry.
- **Response 200:** the restaurant, in `GET /restaurant/restaurants/{id}`'s
  shape — which is what shows a caller the *stored* set, including a service
  switched off as a consequence rather than by the request.
- **`restaurant:write`, held by a restaurant admin and above and by no
  branch-level role.** This is one statement covering every branch of the
  business, so a manager setting it at one branch would be answering for the
  others. 404, not 403, outside reach.
- Recorded as `restaurant.services` in `audit_log`, with the whole array in
  `before` and `after`.

### PATCH /restaurant/restaurants/{id}/cover · *implemented* — `restaurant:write`
The photograph on the restaurant's card, on the catalog, and behind its page in
the app.
- **Body:** `{ "coverUrl": "https://api.amragrir.am/uploads/covers/<uuid>.jpg" }`
  — normally the URL `POST /uploads/restaurant-cover` just answered with, though
  any reachable absolute `http(s)` URL is accepted, trimmed, max 500 chars. The
  same rule `photoUrl` follows, and for the same reason: this column has always
  held addresses the API did not issue (the seed hotlinks them).
- **`"coverUrl": null` takes the cover down.** The one place this differs from a
  dish's photo, which cannot be blanked: the column is nullable, every client
  already draws the no-cover state, and a restaurant that wants its photograph
  gone has no other way to say so.
- **400 for an absent field.** Only an *explicit* null removes — an empty body
  would otherwise read as "take it down", which nobody sending it would have
  meant.
- **Response 200:** the restaurant, in `GET /restaurant/restaurants/{id}`'s
  shape, so a caller re-renders from what was stored rather than from what it
  sent.
- **`restaurant:write`, held by a restaurant admin and above and by no
  branch-level role.** One cover is shared by every branch, so a
  `restaurant_manager` running one branch would be choosing the picture the
  others are advertised under. 404, not 403, outside reach.
- **Setting it and uploading it are two requests** — see
  `POST /uploads/restaurant-cover`. This half is where reach is checked; the
  upload only writes a file.
- **A cover the request replaces is not deleted from disk.** The
  `restaurant.cover` entry carries the previous URL in `before`, which is what
  makes an accidental replacement recoverable.
- **A request that changes nothing writes nothing** — no update and no entry.
- Recorded as `restaurant.cover` in `audit_log`, with the URLs in `before` and
  `after`, filed against the restaurant and **no branch**: it did not happen at
  one.

### PATCH /restaurant/branches/{id}/cover · *implemented* — `branch:write`
This branch's own photograph.
- **Body:** `{ "coverUrl": "https://…" }`, or **`null` to wear the restaurant's
  again** — which is not "no picture". A branch with none falls back, and there
  is deliberately no way to be blank while the business has one.
- **`branch:write`, so a `restaurant_manager` may set it.** The same permission
  that already lets them correct this branch's address and phone: a cover is a
  statement about *this address*, and a manager answers for it. The
  restaurant-level endpoint is the chain's default and stays `restaurant:write`.
- Uploading is `POST /uploads/branch-cover`; this only decides which branch
  wears the result. **Response 200:** the branch, with `own` and `offering`.
- Recorded as `branch.cover`.

### PATCH /restaurant/branches/{id}/services · *implemented* — `branch:write`
What this branch offers.
- **Body:** `{ "services": ["dinein","reserve"] }`, or **`null` to follow the
  restaurant again**.
- **`[]` and `null` are different answers.** `[]` is this branch declaring it
  offers nothing, overriding a parent that offers pickup; `null` hands the
  question back. Emptiness could never have meant "unset" — every restaurant is
  created having declared nothing — which is why the row carries a separate
  `services_overridden` flag.
- **422 for a combination that is not a place**, judged per branch: a dining
  room at this address still needs tables somebody can book, whether or not the
  branch down the road has either. Same `checkServices` as the restaurant's.
- Recorded as `branch.services`. `after.servicesOverridden: false` is the branch
  giving the question back, which is a different event from declaring the same
  set the business happens to declare.

### PATCH /restaurant/branches/{id}/bookings · *implemented* — `branch:write`
Whether this branch takes table bookings.
- **Body:** `{ "reservationsEnabled": true | false | null }` — `null` follows the
  restaurant. Its own request rather than a field on the services, because they
  are two columns and either moves without the other.
- Moved down with the services because `reserve` is one of them: the two must
  agree per address, or a guest is offered slots the booking endpoint refuses.
- Recorded as `branch.bookings`.

---

## How a branch takes bookings

The settings behind the booking calendar — the room's tables, the hours it holds
them, the days it does not, and the numbers behind the offer. See
BUSINESS_LOGIC.md §3 for what each one means.

**Three permissions, because they are three jobs.** The furniture and the
numbers are `branch:write` (a manager's decision); when the doors are open and
which days they are not is `branch:hours`, which a shift holds — closing
tomorrow because the freezer died has to be possible at 6pm without ringing
anybody; the chain's defaults are `restaurant:write`.

**Anything that narrows what the branch offers is checked against the bookings
that already exist.** It answers `409`:

```json
{ "error": { "code": "CONFLICT",
  "message": "This change leaves bookings the branch could not honour",
  "details": {
    "conflicts": [ { "reservationId","reservedFor","localDate","localTime",
                     "guests","tableNo","customerName","reason":"table_gone" } ],
    "resolution": "Repeat the request with ?force=true to save it anyway." } } }
```

`reason` is one of `table_gone` · `table_too_small` · `day_closed` ·
`outside_hours`. Repeating the request with **`?force=true`** saves it and
**cancels nothing** — somebody still has to ring these people. A conflict is
deliberately "we could not seat them", never "we would not sell that now": a
booking that no longer lands on a narrowed slot grid, sits past a shortened
horizon, or exceeds a lowered party cap is *not* reported, because the table is
still there and the door is still open at the promised hour. Warning about those
would put a warning on every save, and a warning that is always there is one
nobody reads.

### GET /restaurant/branches/{id}/tables · *implemented* — `branch:read`
- **Response 200:** `{ "items": [ { "id","tableNo","seats","zone","isActive","upcomingBookings" } ] }`
- Inactive tables are listed too: they are the room's history, and hiding them
  makes "why can nobody book table 7" unanswerable.
- `upcomingBookings` is what makes switching one off a decision rather than a
  click.

### POST /restaurant/branches/{id}/tables · *implemented* — `branch:write`
- **Body:** `{ "tableNo","seats", "zone"? }`
- `409` when the branch already has that number — `UNIQUE (branch_id, table_no)`.
- **A table is a bookable unit, not a piece of furniture.** A branch that takes
  an event for a hundred enters one row with `seats: 100`; every existing
  mechanism then applies unchanged.
- Recorded as `table.create`.

### PATCH /restaurant/tables/{id} · *implemented* — `branch:write`
- **Body:** `{ "tableNo"?, "seats"?, "zone"?: string | null, "isActive"? }`
- Shrinking a table or switching it off can strand a booking, so those two are
  conflict-checked; a rename or a re-zone is not.
- Recorded as `table.update`, or `table.delete` when it is being switched off.

### DELETE /restaurant/tables/{id} · *implemented* — `branch:write`
A soft delete: `is_active` goes false and the row survives, because the bookings
that name it — including the ones already eaten — still have to resolve it.

### PATCH /restaurant/branches/{id}/booking-hours · *implemented* — `branch:hours`
- **Body:** `{ "bookingHours": { "mon": { "open":"18:00","close":"23:00" }, "sun": { "closed": true } } | null }`
- `null` takes bookings whenever the kitchen is open, which is what every branch
  means until it says otherwise.
- **Validated, unlike `open_hours`.** That column is parsed forgivingly because
  nothing validates it; a form is a different matter, and somebody who types
  `10:0` is told rather than silently given the platform default at dinner time.
- Recorded as `branch.booking_hours`.

### GET · POST /restaurant/branches/{id}/closures · *implemented* — `branch:read` · `branch:hours`
Dated exceptions: a holiday, a private hire, a short day.
- **Body:** `{ "date":"2026-12-31", "kind":"closed" | "custom_hours", "open"?, "close"?, "reason"? }`
- The list runs from today forward — a closure that has been and gone is history
  nobody acts on.
- `409` when that date already has an exception: a second edit replaces the
  first rather than sitting beside it.
- Recorded as `branch.closure_create`.

### DELETE /restaurant/closures/{id} · *implemented* — `branch:hours`
No force flag: giving a day back to the ordinary week cannot strand a booking
made while it was shut. Recorded as `branch.closure_delete`.

### GET /restaurant/branches/{id}/booking-policy · *implemented* — `branch:read`
### GET /restaurant/restaurants/{id}/booking-policy · *implemented* — `branch:read`
- **Response 200:** `{ "own","inherited","effective","sources","limits" }`
- **Three sets, not one number.** `own` is what this level decided (nulls are
  inheritance, not zeroes), `inherited` what it would follow if it decided
  nothing, `effective` what is in force, and `sources` names `branch` /
  `restaurant` / `platform` per field. A form given only the resolved number
  cannot show a deliberate 90 apart from an inherited one — so a manager sets it
  again to be sure, the branch acquires an override nobody wanted, and it stops
  following the chain forever.
- `limits` ships the bounds each field accepts, so the form and the API cannot
  come to disagree about them.

### PATCH /restaurant/branches/{id}/booking-policy · *implemented* — `branch:write`
### PATCH /restaurant/restaurants/{id}/booking-policy · *implemented* — `restaurant:write`
- **Body:** any of `seatingMinutes`, `slotMinutes`, `maxGuests`, `maxLeadDays`,
  `minLeadMinutes`, `depositPerGuestAmd`, `freeCancelHours`, `autoConfirm`.
- **An omitted field is left alone; an explicit `null` gives that question back
  to the level above.** A form that could only send numbers would be one from
  which inheritance, once broken, could never be restored.
- **No conflict check, deliberately.** None of these can strand a booking: the
  seating, the deposit and the cancellation window are snapshotted onto each
  booking when it is made, and the rest describe what will be offered next.
- The restaurant-level route is `restaurant:write` because it answers for every
  address the chain has, and the manager of one does not get to decide for the
  others.
- Recorded as `booking_policy.update`, with `scope` naming which level.

### GET /restaurant/branches/{id}/booking-preview · *implemented* — `branch:read`
- **Query:** `date=YYYY-MM-DD`, `guests` (default 2)
- **Response 200:** `{ "date","guests","reservationsEnabled","opens","closes",
  "closureReason","slotCount","firstSlot","lastSlot","depositAmd","maxSeats","maxGuests" }`
- What the settings would actually produce. A form full of numbers is not
  something a person can check, and the mistakes here — hours that close before
  they open, a seating longer than the evening — show up as an empty calendar
  rather than as an error. This is where they get noticed by whoever caused
  them.

### PATCH /restaurant/reservations/{id}/table · *implemented* — `reservations:advance`
- **Body:** `{ "tableId" }`
- The one place a person overrides the automatic assignment, which picks the
  smallest table that fits — right for filling a room and wrong about once an
  evening.
- The guest, the time, the deposit and its terms are left exactly alone. This is
  furniture, not a renegotiation.
- `409` when the table is taken for this booking's own seating. The check and
  the move run in one **serializable** transaction, so two people reseating two
  parties onto one table cannot both succeed.
- Each existing booking is measured by **its own** snapshotted seating, so a
  branch that has changed its seating length does not accidentally double-book.
- Recorded as `reservation.table`, with the table **numbers** in
  `before`/`after` — a year later "moved from 4 to 11" is readable and a pair of
  UUIDs is not.

### GET /restaurant/restaurants/{id}/people · *implemented* — `staff:read`
Who holds a role over the restaurant **itself** — its admins.
- **Query:** `page` (default 1), `limit` (default 50, **max 50**)
- **Response 200:** `{ "items":[ { "id","role","branchId","branchName","person":{ "id","name","email","isActive","lastLoginAt" } } ], "total", "page" }`
- **Not its branches' people.** An assignment names a restaurant or a branch and
  never both, so this is exactly the roles that reach the whole restaurant;
  `GET /restaurant/branches/{id}/people` answers for each branch. The two
  together are the whole team, asked for **where each half is read** — the
  admins beside the restaurant's own facts, a branch's staff under that branch.
  A chain of forty branches would otherwise send every one of its teams to draw
  the one somebody clicked, and page them at fifty so that a branch's staff could
  land on page two, away from the branch.
- **A row per assignment, not per person.** Somebody who manages two of the
  branches is two answers to "who works here and as what"; one row would have to
  pick a branch to name and there is no right pick. `id` is the **assignment's**.
- `branchName` is `null` here by construction — the role is held over the
  restaurant as a whole, which reaches every branch of it.
- **Ordered by role first**, which sorts by the Postgres enum's declaration
  order in `schema.prisma` — `super_admin → platform_admin → restaurant_admin →
  restaurant_manager → branch_staff`, i.e. seniority. Then by branch, then by
  name, then by id so a row cannot appear on two pages.
- **Reach and restaurant are separate `AND` terms.** The restaurant narrows what
  the caller may already see; it must never be able to stand in for the reach
  filter, or naming any id would list its staff to anybody holding `staff:read`
  anywhere.
- **Platform roles never appear.** Their assignment names no restaurant, and a
  super admin is not staff *of* a restaurant however much of it they can see.
- **A separate permission from the restaurant itself**, deliberately: a
  `branch_staff` account holds `branch:read` and not `staff:read`, so it opens
  the restaurant and does not learn who else works there. The back office asks
  for this only when the account holds it — one response with a section that is
  sometimes missing would have to mix two permissions in one guard.
- **An unreachable or unknown id returns an empty list, not 404** — the same
  answer as "nobody works here", which is the one that distinguishes nothing.

### GET /restaurant/branches · *implemented* — `branch:read`
The same branches, flat — for screens that pick one (the menu editor, invites).
- **Response 200:** `{ "items":[ { "id","restaurantId","restaurantName","name","address","city","phone","isOpen","avgPrepMin","menuItemCount" } ] }`

### GET /restaurant/branches/{id}/people · *implemented* — `staff:read`
Who works at one branch — its manager and its shifts.
- **Query:** `page` (default 1), `limit` (default 50, **max 50**)
- **Response 200:** the same row shape as the restaurant's people above.
- **Hangs off the branch rather than taking a `branchId` on the restaurant's
  list**, because the assignment is on the branch: the reach filter then guards
  this the same way it guards everything else, with no second check that the
  branch belongs to whichever restaurant somebody named.
- **A branch out of reach or unknown returns an empty list, not 403 or 404.** It
  is a collection, and an empty one says nothing about whether the branch exists.
- Same `staff:read` as the restaurant's admins, and the same reason: a
  `branch_staff` account works at the branch without being allowed to read who
  else does.

### POST /restaurant/branches · *implemented* — `branch:create`
- **Body:** `{ "restaurantId","name"?,"address"?,"city"?,"lat"?,"lng"?,"phone"?,"avgPrepMin"? }`
- **A new branch opens closed.** It has no menu yet, and one that starts taking
  orders is a kitchen selling nothing.
- **404** if the restaurant is not one the caller administers.
- Until this existed, a restaurant created through the admin panel had nowhere
  to put a menu — `POST /restaurant/menu-items` requires a `branchId`.

### PATCH /restaurant/branches/{id}/status · *implemented* — `branch:hours`
- **Body:** `{ "isOpen"?, "avgPrepMin"? }`
- `isOpen: false` makes `POST /orders` return **422** for that branch — this is
  the switch a shift uses to stop the queue.
- Separate from the PATCH below because a `branch_staff` account may stop the
  queue without being able to edit the branch's address. One endpoint gated on
  two permissions would have to decide that in the service, out of sight of the
  guard.

### PATCH /restaurant/branches/{id} · *implemented* — `branch:write`
- **Body (any):** `{ "name", "address", "phone" }`
- **`reservationsEnabled` is not accepted here.** It lives on the *restaurant*,
  so setting it from a branch endpoint would silently change every other branch.
- **`openHours` is not editable yet** — the column exists but nothing reads it.

### Menu management · *implemented*

> These return the **raw `*_i18n` objects**, unlike the public menu endpoint
> which resolves one language. The caller is editing all three; resolving would
> make the other two invisible and silently unsaveable.

- `GET /restaurant/menu-items?branchId=&menuTab=` — `menu:read`
- `POST /restaurant/menu-items` — `menu:write` — **Body:** `{ "branchId","menuTab","nameI18n":{"hy","ru"?,"en"?},"descI18n"?,"priceAmd","photoUrl","caloriesKcal"?,"prepMin"?,"dietaryTags"?,"isAvailable"? }`
- `PATCH /restaurant/menu-items/{id}` — `menu:write` — any of the above except
  `branchId`; moving a dish between branches would change who owns it.
- `PATCH /restaurant/menu-items/{id}/availability` — **`menu:availability`** —
  **Body:** `{ "isAvailable" }`. The one menu change a shift may make: it says
  what is true right now and reverses in a tap, unlike a price, which outlives
  the shift that set it.
- `DELETE /restaurant/menu-items/{id}` — `menu:write` → **204**. A **soft
  delete**: `deleted_at` is set and the row stays, because `order_items`
  references it.
- `GET /restaurant/menu-items/{id}/history` — `menu:read` — see below.

Rules worth knowing:
- **`nameI18n.hy` is required.** It is the fallback every other language
  resolves to, so a dish without it would render nameless for most visitors.
- **`photoUrl` is required on create — 400 without it.** A menu is a list
  somebody reads with their eyes, and a dish with no picture sits under the ones
  that have one and does not get ordered. An **absolute `http(s)` URL**, trimmed,
  max 500 chars — normally the one `POST /uploads/menu-photo` just answered with
  (below), though any reachable image URL is accepted.
  The PATCH may swap it for another but **cannot blank it**: `null` and `""` are
  both 400, and omitting the field is how an edit leaves the photo alone.
  Reads still type it `string | null`: the column is nullable for anything that
  predates the rule, and the seed fills those in rather than the API inventing
  a picture at read time.
- **Blank translations are dropped** before storing — an empty string is not a
  translation, and it would beat the `hy` fallback. `nameI18n` is **replaced,
  not merged**: a language left out of the object is a language removed from the
  dish.
- **`prepMin: null` clears the estimate**, and is the one field here where
  `null` is a value rather than a mistake — an estimate can turn out to be
  wrong, and a dish that could claim one but never take it back would keep a
  number the kitchen has stopped believing. The exact opposite of `photoUrl`
  above, which the same request refuses to blank. Absent still means "leave it
  alone" for both.
- **`prepMin: 0` is legal and is not `null`.** `0` says the dish needs no
  cooking — a bottle of water, a cake already on the counter — and the quote
  honours it; `null` says the dish declines to estimate and the branch's average
  stands in. The bound is `0…480`; it was `1…480` until 2026-08-07, which left
  the truest answer for a drink unsayable.
- **A PATCH that moves nothing writes no history entry.** The body is diffed
  against the stored row before anything is recorded, so a form that re-sends an
  untouched price does not fill a dish's trail with "2400 → 2400".
- **Any dish can be deleted, ordered or not.** This used to be a **409** for a
  dish that appeared in an order, telling the caller to set `isAvailable: false`
  instead — the foreign key made a real delete impossible. Soft-deleting removes
  that objection: the reference stays valid and past orders still say what was
  bought, so the refusal is gone.
- **A deleted dish is gone from every read**, including the public menu and the
  lookup order placement validates against — it comes back as `not_on_menu` in a
  quote. `GET|PATCH|DELETE` on it are **404**, so a stale panel cannot re-price
  something already withdrawn.
- **`DELETE` and `isAvailable: false` are different states.** The second is
  "sold out tonight", reversible by a shift on `menu:availability`. The first is
  "off the menu", needs `menu:write`, and no endpoint undoes it.
- **Changing a price does not touch existing orders**: every order item stores
  the price it was bought at.

### GET /restaurant/menu-items/{id}/history · *implemented* — `menu:read`
Everything that has happened to one dish — what the menu row's **History**
button opens. Who put it on the menu, every edit since, who changed the price,
and who marked it sold out.

- **Response 200:** `{ "items":[ { "id","action","actor":{"id","name","impersonatedBy","impersonatedById"},"before","after","at" } ] }`
- **`action`** is one of `menu_item.create` · `.update` · `.availability` ·
  `.delete` — the same vocabulary `audit_log` stores (see
  ROLES_AND_PERMISSIONS.md, "What is recorded"). A sold-out flip is its own
  action rather than an `.update` carrying one field, because a shift holds
  `menu:availability` and not `menu:write`.
- **`actor.name`** is null for an account since deleted — the entry outlives the
  actor (`ON DELETE SET NULL`). `actor.id` is the `staff_users` row, which is
  what lets the panel turn a name into a link to `/people?person=`; it is an id
  and nothing else, and the screen behind it needs `staff:read`, which
  `menu:read` does not imply.
- **`actor.impersonatedBy`** names the super admin really at the keyboard when
  the account above was being acted as, and is null otherwise.
- **Which of `before`/`after` is set follows the action**, and a client must not
  assume both: a creation has `after` alone (nothing preceded it), a withdrawal
  has `before` alone (what the dish was), and an edit has both.
- **On an edit, the keys of `after` are the diff.** `before` carries the dish's
  `nameI18n` as a *label* on every entry, changed or not — without it an entry
  could only say "a price changed" and the reader would have to go and look up
  which dish. A client that diffs the keys of `before` will render a phantom
  name change on every price edit.
- **No entry exists for a request that changed nothing.** Entries carry only
  fields that actually moved, diffed against the stored row rather than the
  request body.
- **Oldest first** — a story reads forwards, the same direction an order's
  timeline runs.
- **A withdrawn dish still has a history.** Unlike every other menu read, this
  one does not filter out `deleted_at` — the dish somebody took off the menu is
  precisely the one they come here to ask about. Nothing here is editable, so
  there is no path by which a stale panel writes to it.
- `menu:read`, not `staff:activity`: this is the record of one **dish**, which
  whoever may read the menu may read — the same rule that puts an order's
  timeline behind `orders:read`. `GET /staff/{id}/activity` is the record of one
  **person** across every dish they touched, and that is a different power.
- Scoped in the query, so a dish outside reach is **404**, not 403.

### GET /restaurant/reservations · *implemented* — `reservations:read`
- **Query:** `branchId?, date=YYYY-MM-DD?`, `status?`, `page`, `limit`
- `date` is a **service day**, not a calendar day — it matches
  `reservations.service_date`. For a branch that shuts before midnight the two
  are the same; for one open 12:00–02:00, the 00:30 party booked for Tuesday
  night comes back under **Tuesday**, which is the shift that will seat them,
  and not under the Wednesday its instant falls on. See BUSINESS_LOGIC.md §3.
- **Response 200:** the reservation object plus `customerName` and
  `customerPhone`.

### PATCH /restaurant/reservations/{id}/status · *implemented* — `reservations:advance`
- **Body:** `{ "status": "confirmed|seated|completed|no_show|cancelled" }`
- Legality comes from `RESERVATION_STATUS_FLOW`; **422** otherwise.
- `confirmed` and `seated` **leave the deposit alone**; only an ending decides
  the money, per BUSINESS_LOGIC.md §3.

---

## Back-office notifications

The bell in the panel's shell. What a **branch** has been told — so far, that a
pre-order is about to need cooking, raised by the reminder sweep. See
DATABASE.md §8b for why these are addressed to a branch and not to a person.

Both are gated on **`orders:read`** rather than a permission of their own: every
notification that exists is about an order, and anyone who can watch the board it
sits on can be told about it. The service scopes its queries by that same
permission, because "may you call this" and "which rows may you see" are
different questions — a branch outside reach is never selected, not merely
hidden.

### GET /staff/notifications · *implemented* — `orders:read`
- **Query:** `limit` (default 30, capped at 50). A bell shows the recent ones;
  the board is where the work is.
- **Response 200:** `{ "items":[ { "id","type","branchId","orderId","payload","createdAt","read" } ], "unread" }`
- **`type`** is `prep_due`. An enum rather than a free string so the panel's
  rendering is exhaustive — a kind added to the database and not to the bell
  would arrive as a blank row, and this makes it a compile error instead.
- **`payload` is numbers, never prose** — order code, `readyAt`, `prepStartAt`,
  `prepMin`, `reminderLeadMin`, `itemsCount`, `needsConfirming`. **Never the
  pickup code:** a bell is a screen a shift leaves open on a counter, and that
  is the last place to print the one thing a guest has to be asked for.
  A job has no request to take a language from, so the panel renders the line
  through its own dictionary, exactly as it does an order status. Fields are
  absent where the order recorded nothing.
- **`read` is whether *this* reader has seen it**, not whether anybody has. A
  branch's bell is read by people, one at a time, and a single flag would let the
  first colleague to open it clear it for the whole shift.
- **Newest first.**

### POST /staff/notifications/read · *implemented* — `orders:read` → **200**
- **Body:** `{ "ids": ["…"] }` — 1 to 50 uuids, which is the list that was on
  screen. A POST rather than a PATCH per id: a bell is cleared by opening it.
- **Response 200:** `{ "read": <count> }`
- **Scoped**, so an id belonging to an unreachable branch marks nothing — the
  ids come from a list the caller was shown, and one that did not is a probe.
- Reading something twice is not an error and does not become one.

### `watchBranches` (WebSocket) · *implemented*
- `{ "event": "watchBranches", "data": { "token": "<staff access token>" } }` on
  the same socket as the order stream; answers `watchingBranches` with the
  branches now being heard, or `"all"` for a platform-wide account.
- **Staff tokens only.** There is no branch a customer may watch, and accepting
  one here would hand a restaurant's operational feed to anybody with an account.
- Delivers `{ "event": "notification", "data": { "id","branchId","type","orderId","createdAt" } }`
  — deliberately thin. It is a signal that the bell should re-read, not the row:
  the list endpoint is where reach is checked and where "have I seen this" is
  answered, and a frame carrying the whole notification would be a second,
  unchecked way to learn what a branch was told.
- Reach is resolved once, at subscription, from the same `orders:read` scope the
  REST board is filtered by. A role granted while the socket is open is picked up
  on the next connection — which a page reload already is.

---

## Uploads

### POST /uploads/menu-photo · *implemented* — `menu:write`

Stores one dish photograph and answers with the URL to save on the dish.

- **Request:** the image **bytes as the raw body**, under their own
  `Content-Type` (`image/jpeg`, `image/png`, `image/webp`). Not multipart: one
  request carries exactly one file, so the envelope would be packaging with
  nothing to package. From a browser that is `fetch(url, { method: 'POST', body: file })`.
- **Response 201:** `{ "url": "https://api.amragrir.am/uploads/menu/<uuid>.jpg" }`
- **Max 5 MB** — `MAX_IMAGE_UPLOAD_BYTES` in `@amragrir/shared`, which the back
  office reads too so it can refuse an oversized file without sending it.
- `menu:write`, the same permission that adds the dish the photo will hang on:
  an account that cannot put a dish on the menu has no reason to be able to put
  a file on this disk.

Rules worth knowing:
- **The `Content-Type` is a hint, not a claim that is acted on.** The bytes are
  sniffed (JPEG/PNG/WebP magic numbers) and the *sniffed* type decides the
  extension the file is stored under — which in turn decides the `Content-Type`
  it is served with. Believing the header would let somebody store a page of
  HTML as `photo.png` and have the API hand it back as HTML from its own origin.
- **415** for anything that is not one of the three formats, **413** over the
  size limit, **400** for an empty body. SVG is refused along with everything
  else: it is a document with scripts in it, arriving from outside.
- **The stored name is a fresh uuid**, never the name the file arrived with —
  an uploaded name is attacker-controlled text that would otherwise become a
  path on this disk, and two restaurants uploading `photo.jpg` would be one
  overwriting the other.
- **Uploading and creating the dish are two requests.** The photo goes up while
  somebody is still typing the price, so it can be shown back to them before the
  dish exists. A form abandoned afterwards leaves the file behind; nothing
  sweeps those yet, which is the known cost of the split.

### POST /uploads/restaurant-cover · *implemented* — `restaurant:write`

Stores one restaurant cover and answers with the URL to save on the restaurant.

- **Request and refusals: identical to `POST /uploads/menu-photo` above** — raw
  bytes, sniffed rather than trusted, uuid name, 5 MB, 415/413/400. A cover is
  drawn larger, but "larger" is a rendering decision, and a second size limit
  here would be a number to keep in step with a stylesheet.
- **Response 201:** `{ "url": "https://api.amragrir.am/uploads/covers/<uuid>.jpg" }`
- **`restaurant:write`, not `menu:write`** — the permission that sets the cover,
  so an account that cannot choose a restaurant's photograph cannot put the file
  on this disk either. A `restaurant_manager` holds neither.
- **Its own directory** (`covers/`, not `menu/`). Names are uuids either way, so
  this is not preventing a collision — it keeps two kinds of image that sit
  behind different permissions separately answerable, for whoever later adds
  thumbnailing or a sweep for orphans.
- **This request grants no reach.** It writes a file and hands back a URL;
  `PATCH /restaurant/restaurants/{id}/cover` is where the caller's scope decides
  which restaurant may be given it. As with a dish, an abandoned form costs an
  orphaned image rather than a half-changed row.

### POST /uploads/branch-cover · *implemented* — `branch:write`

One branch's own photograph. **Request, refusals and directory identical to
`POST /uploads/restaurant-cover`** — the *permission* is the whole difference: a
`restaurant_manager` may photograph their branch and may not re-photograph the
business, and one endpoint would have to make that distinction in a service, out
of sight of the guard.

### Where images are served from

Both outside `/v1` — these are files, not an API version.

- `GET /uploads/…` — what was uploaded, from `UPLOAD_DIR`. Immutable and cached
  for a year: every name is a fresh uuid, so a file never changes under its URL.
- `GET /static/…` — artwork that ships with the repo, from `apps/api/public`.
  Includes `/static/menu/<category>.svg`, the placeholder photographs every
  seeded dish points at. Cached for an hour, because these keep their names
  across deploys and a corrected one has to be able to arrive.
- Both send `X-Content-Type-Options: nosniff`.
- Both are built from **`API_PUBLIC_URL`**, which is what a stored `photoUrl`
  is absolute against. Changing that value after photos exist leaves the old
  ones pointing at the old host.

---

## Staff management

> Not under `/admin`: a `restaurant_admin` hires for their own restaurant and
> holds no platform permissions. Everything here is scoped to the caller's own
> reach.

### GET /staff · *implemented* — `staff:read`
Who works here, within reach.
- **Query:** `q`, `role`, `id`, `page` (1-based, default 1), `limit` (default 20, **max 50**)
- **Response 200:** `{ "items":[ { "id","email","name","isActive","lastLoginAt","assignments":[{ "id","role","restaurantId","restaurantName","branchId","branchName" }] } ], "total", "page" }`
- **`id` narrows to one person exactly** — what a link that already knows who it
  means asks for, such as a staff name in an order's history. `q` cannot answer
  it: a `contains` over names and emails matches everyone who shares a name.
  **Alongside the reach filter, never instead of it** — holding somebody's id is
  not permission to see them, so an id from outside reach lists nobody, exactly
  as that person's name does.
- **`q` covers a name, an email, or the restaurant or branch someone is
  assigned to** — the three things the back office shows on a person's card, in
  one box.
- **A search cannot reach past the caller's reach.** The term is `AND`ed onto
  the query rather than assigned over it, and its "where they work" arm carries
  the reach filter with it, so matching a restaurant name never surfaces
  somebody by an assignment the caller may not see.
- **`role` narrows which *people* appear, not which of their roles are shown.**
  The role and the reach are required of the *same* assignment — otherwise
  filtering to managers would list somebody who manages out of reach and washes
  dishes here — but a listed person still comes back with every assignment
  within reach. This is the screen roles are revoked from, and a card showing
  one of three is how one gets taken away in the belief it was the last.
- **The assignments are filtered to the caller's reach**, not just the accounts:
  seeing that someone works here does not mean seeing everywhere else they work.
- **`restaurantId`/`restaurantName` are the restaurant the role *reaches*, not a
  copy of the `restaurant_id` column.** An assignment names a restaurant or a
  branch and never both, so for `restaurant_manager` and `branch_staff` the
  column is null and the restaurant here is the one the **branch** belongs to.
  Read raw, a shift's row said only "Northern Ave", which is a branch of three
  different restaurants. Null now means what it sounds like — a platform role,
  over no restaurant at all — and `branchId` still says which of the two columns
  the assignment actually names.
- `branchName` falls back to the branch's city, as everywhere else a branch is
  named.
- Ordered by name (`name asc`, `id asc` — a stable tiebreak, so a row cannot
  appear on two pages).

### GET /staff/invites · *implemented* — `staff:read`
Invitations still open, so a resend is a decision rather than a guess.
- **Query:** the same `q`, `role`, `page` and `limit` as `GET /staff` — the
  search on that screen is over *people*, and somebody invited last week is a
  person you are looking for who has not accepted yet. `q` matches the invited
  address or the restaurant/branch it is for. The back office pages this 10 at
  a time, against the directory's 20.
- **Response 200:** `{ "items":[…], "total", "page" }`
- Only unaccepted invitations, newest first.

### POST /staff/invites · *implemented* — `staff:invite`
- **Body:** `{ "email","role","restaurantId"?,"branchId"? }`
- The scope must match the role: platform roles take neither id,
  `restaurant_admin` a restaurant, branch roles a branch. **422** otherwise.
- **If the address already belongs to an active account, the role is granted
  immediately** and no invitation is sent — the response says
  `{ "granted": true }`. Sending a "set your password" email to someone who
  already has one trains people to click password links they did not ask for.
- **403 — you cannot grant what you do not hold.** The role's permissions must
  be a subset of the caller's, and its scope within their reach. Otherwise a
  restaurant admin could invite a `super_admin`.
- **403** for any platform role unless the caller holds `platform:staff`.

### DELETE /staff/invites/{id} · *implemented* — `staff:invite` → **204**

### DELETE /staff/assignments/{id} · *implemented* — `staff:revoke` → **204**
Takes a role away, not the account — the person may hold roles elsewhere, and
`audit_log` still has to be able to name them.
- **Ends every session that account holds.** Scopes travel in the access token,
  so the revoked role would keep working until it expired.
- **403** removing your own role, or the last `super_admin` — no route exists to
  appoint another one afterwards.

### GET /staff/{id}/activity · *implemented* — `staff:activity`
What this person has done — menu edits, the orders they moved, the people they
invited — newest first.

- **Query:** `page` (1–25), `limit` (≤50, default 20)
- **Response 200:** `{ "items": [ … ], "total", "page" }`, where each item is one
  of two shapes discriminated by `kind`:

```jsonc
// kind: "audit" — from audit_log
{ "kind": "audit", "id", "action": "menu_item.update", "entity": "menu_item",
  "entityId", "before": { "nameI18n": {…}, "priceAmd": 2400 },
  "after": { "priceAmd": 2600 },
  "where": { "restaurantId", "restaurantName", "branchId", "branchName" },
  "impersonatedBy": null, "at" }

// kind: "order" — from order_events
{ "kind": "order", "id", "type": "status_changed",
  "fromStatus": "preparing", "toStatus": "ready", "orderId", "orderCode": "A41",
  "where": {…}, "impersonatedBy": null, "at" }
```

- **Two tables, merged at read time.** Order status changes live in
  `order_events` (whose actor is usually a customer or the payment provider) and
  everything else in `audit_log`. Writing status changes to both would mean two
  records of one fact, free to drift; this merges them at the one place that
  wants them interleaved. `total` is the sum across both.
- **A union rather than a flattened shape**: an `audit` entry has an action and a
  `before`/`after` pair, an `order` entry has two statuses and a code. Merging
  them into one optional-everything object would push "which fields are actually
  set" onto every reader.
- **Scoped twice.** The person must be somebody the caller can already see in the
  directory — otherwise this reads the activity of anybody whose id you can
  guess — **and** the entries are filtered to the caller's reach, so someone who
  works for two restaurants shows each admin only their own half.
- **404** for a person outside the caller's reach; a 403 would confirm the
  account exists.
- **`page` is capped at 25**, which no other list here does. Merging two ordered
  streams by offset means fetching the whole prefix of both, so the cost grows
  with the offset rather than the page size. A date filter is the right answer
  for going further back; see ROLES_AND_PERMISSIONS.md "Not implemented yet".
- **An impersonated entry appears in both feeds** — the account acted as, and the
  super admin who did it — with `impersonatedBy` naming the latter.
- **Empty for anything that happened before this shipped.** The actions were not
  recorded, so there is nothing to backfill from; order status changes are the
  exception and go back to the `order_events` backfill.

### POST /staff/{id}/impersonate · *implemented* — `staff:impersonate` → **200**
Signs the caller in as this person, for one access TTL.
- **Response 200:** `{ "accessToken", "expiresIn", "staff": { "id","email","name","scopes":[…],"permissions":[…] } }`
- **No `refreshToken`, and that is the shape of the thing** rather than an
  omission. `/auth/staff/refresh` re-reads the target's assignments and mints a
  fresh pair from them, which would drop the impersonation marker on the way
  through: a bounded session would quietly become an unlimited one,
  indistinguishable from that person's own. With no refresh half it closes
  itself, and the back office falls back to the super admin's own session.
- **The token's `sub` is the target**, so every guard, scope filter and query
  behaves exactly as it would for them. The caller's own id travels beside it in
  `act`, which is what makes the session tellable from a real sign-in.
- **`staff` is the same shape `GET /auth/staff/me` returns**, so the panel
  renders its tabs from it without a second request.
- **403 if the caller is already acting as somebody.** Impersonation does not
  chain: `act` holds one id, so a second hop would either overwrite the real
  actor or record somebody who was themselves being acted as.
- **403** impersonating yourself, a deactivated account, or one holding no
  roles. The last two are the refusals their own password would get.
- **404** for an account outside the caller's reach — a 403 would confirm it
  exists.
- **Writes `audit_log`** (`staff.impersonate`) with the real actor, the target,
  the roles being borrowed and the IP, *before* the token is issued. The session
  carries full write access, so without that row the only record of who advanced
  an order would name the person who did not do it.
- **There is no "stop impersonating" endpoint.** The caller's own tokens were
  never revoked; the back office stashes them and puts them back.
- Only `super_admin` holds `staff:impersonate` — see ROLES_AND_PERMISSIONS.md
  for why it cannot be widened without widening every role in reach.
- **Customers cannot be impersonated.** A customer session is the other identity
  entirely, and there is nowhere to put one: `apps/web` has no sign-in.

---

## Platform administration

> `platform:*` permissions, held by `platform_admin` and `super_admin` only.

#### GET /admin/metrics — `platform:metrics`
- **Query:** `from`, `to` (ISO); defaults to the last 30 days.
- **Response 200:** orders (total, earning, cancelled, `abandonedPct`), revenue
  (gross, service fees, discounts given, average order), `byStatus`,
  `topRestaurants`, users, reservations.
- **Revenue counts `paid` and later only.** A `created` order is an abandoned
  basket and a `cancelled` one was refunded.

#### GET /admin/metrics/reconciliation — `platform:metrics`
Payments and orders that disagree. **Empty is the expected answer.**

#### GET /admin/users — `platform:users`
The **customer** list. Staff are `GET /staff`.
- **Query:** `q` (phone, name or email), `role`, `id`, `guests`, `page` (1-based, default 1), `limit` (default 20, **max 50** — above it is a 400, not a silent clamp)
- **`id` narrows to one customer exactly** — what a diner's name in an order's
  history links to. There is no search term that would find only them: names are
  shared, and the phone this screen shows is masked.
- **Anonymous sessions that never ordered are left out** unless `guests=true`
  (`1` and `true` are on; anything else is off). One `users` row is written per
  visitor to the storefront (`POST /auth/guest`), so newest-first they are the
  whole first page — accounts with no name, no number and nothing bought, with
  the people who actually order behind them. They are hidden, never deleted.
- **A guest who *has* ordered is always listed**, whatever `guests` says: it is
  somebody who bought something, which is what this list is asking. `id` is
  likewise never filtered — a link that names an account must find it.
- **Returns** `{ items, total, page }`; `total` counts everything matching `q`, not the page, which is what lets a client show how much it is not displaying. The back office pages this 25 at a time.
- Ordered newest first (`createdAt desc`, `id desc`) — a stable tiebreak, so a row cannot appear on two pages.
- **Phone numbers come back masked** (`+374******56`). The unmasked one is its
  own route below, one account at a time, and recorded.

#### GET /admin/users/{id}/phone — `platform:users`
One customer's number **in full**.
- **Response 200:** `{ "id", "phone" }` — the id travels back so a client cannot
  paste the answer against the wrong row.
- **404** for an id that belongs to nobody **and** for an account with no number
  (a guest who never verified one). Both are "there is no phone at this
  address", and telling them apart would confirm that an id exists.
- **Its own route because it is its own act.** The list masks so that a page of
  twenty-five readable numbers is not something anybody can photograph; a
  support call needs exactly one of them.
- **Every call writes `audit_log`** (`customer.phone_view`), with the *masked*
  number in `after` — the row says which number was read without being a second,
  permanent, readable copy of it. Written **before** the answer: a failure to
  record is a failure to reveal, because a number handed out with no row saying
  who asked is the gap this exists to close.
- Scope columns are both null, which keeps the row readable only by a platform
  role — the same rule `staff.impersonate` follows.

#### GET /admin/users/{id}/orders — `platform:users`
What one customer has ordered, newest first.
- **Query:** `q`, `status`, `page` (1-based, default 1), `limit` (default 10, **max 50**)
- **`q`** matches the **order code**, a **dish on the order** (the snapshot name,
  not the dish's name today), or the **restaurant/branch** it was bought at. Not
  the pickup code: this is the platform side rather than a counter, and the
  response does not carry that code either. Deliberately *not* the
  customer's name, which the order board matches and which would match every row
  here by construction.
- **`status`** is `all` (default) / `active` / `completed` / `cancelled` —
  `CustomerOrderFilter` in `packages/shared`. Not the board's `QueueFilter`:
  "new", "preparing" and "ready" are stages of work still to be done, and three
  of five stages would match nothing for all but the last hour of a diner's life.
  Not the customer app's `active`/`past` either, because that folds cancellations
  in with completions, and a cancellation is the row a support call is about.
  `all` leaves the status column out of the query rather than listing every value.
- **Response 200:** `{ items, total, page, counts }`. `counts` is one number per
  filter (`all`, `active`, `completed`, `cancelled`), **taken under `q` but not
  under `status`** — so searching a code and reading `active 0 · completed 0 ·
  cancelled 1` answers the question before anybody picks a filter. Same rule as
  the order board's per-stage counts, and `counts.all` is the sum of the group-by
  rather than of the other three, so a status no filter buckets is still counted.
- Each item carries the whole order:
  the order `code` (**not** the pickup code — no staff endpoint sends that, and
  this screen is further from a counter than the board is), status, service
  mode, the restaurant and branch **ids** as well as
  their names, every line (`menuItemId`, snapshot `name`, `qty`, `unitPriceAmd`,
  `lineTotalAmd`), the four money fields plus the total, the payment (`null` for
  an order nobody ever paid for), the booked table, the notes, `readyAt` and
  `createdAt`.
- **Rows arrive whole** rather than as a summary plus a detail route: the back
  office opens these in place, so ten rows would otherwise be eleven requests to
  read what one query already joined.
- **404** for an id that belongs to nobody. An empty page cannot tell "has never
  ordered" from "does not exist", and only the first is worth an empty state.
- **`platform:users`, not `orders:read`,** and the difference is which question
  is being asked. `GET /restaurant/orders` answers "what is this kitchen working
  on", scoped to the branches a shift can reach. This crosses every restaurant
  on the platform to answer "what has this person bought", which belongs to
  whoever may see the person at all.

#### POST /admin/restaurants — `restaurant:create`
- **Body:** `{ "slug","name","adminEmail"?,"cuisine"?,"priceLevel"? }`
- `slug` must be lowercase words separated by hyphens — it becomes a public URL
  on `apps/web`. **409** on a duplicate.
- **`ownerId` is gone.** There is no customer account to point at: a restaurant
  is administered through a `restaurant_admin` assignment. `adminEmail` invites
  the person who will run it, and the account need not exist yet.
- The invitation is sent **after** the restaurant is committed. A restaurant
  with nobody invited is a normal state an admin can fix from the staff screen;
  an invitation naming a restaurant that was never created is a dead link.

#### POST /admin/promos — `promo:issue`
- **Body:** `{ "code","discountPct"? | "discountAmd"?,"validUntil"?,"userIds"? }`
- **Exactly one** of `discountPct` / `discountAmd`; **400** otherwise.
  `discountPct` is capped at 25, the same ceiling as stacked referrals.
- Goes to every **verified, non-guest** account unless `userIds` is given.
- Re-issuing the same code **tops up accounts that joined since** and skips
  those who already hold it; the response reports what was actually created.

### Removed

- **`PATCH /admin/users/{id}/role`.** Promoting a customer into staff is no
  longer possible in either direction — that is the point of the split. Staff
  accounts are created by invitation and by nothing else.

### Not implemented yet
- `GET|POST|PATCH /restaurant/tables` — manage tables. `tables:write` exists in
  the permission map with nothing behind it.
- **Review moderation.** There is no review API at all yet.
- **Platform settings** (fees, deposit rates). They live in
  `packages/shared/src/constants.ts`; making them editable means moving pricing
  into the database.
- **TOTP two-factor** for platform roles.
