# API_DOCUMENTATION.md

> Amragrir.am REST API. Base: `https://api.amragrir.am/v1`. Format — JSON. Auth — `Authorization: Bearer <accessToken>` (JWT). Locale — `Accept-Language: hy|ru|en` header. Amounts — integers in AMD (`*_amd`).

Common error response:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```
Status codes: 200/201 ok, 400 validation, 401 unauthorized, 403 forbidden, 404 not found, 409 conflict (e.g. slot taken), 422 business rule, 429 rate limited.

`code` values: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `BUSINESS_RULE`, `RATE_LIMITED`, `INTERNAL_ERROR`. `details` carries
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
- **Body:** `{ "phone": "+37499123456" }` — any Armenian spelling is accepted
  (`99123456`, `099123456`, `+374 99 123 456`) and normalised to E.164.
- **Response 200:** `{ "sent": true, "expiresIn": 120 }`
- **400** invalid/non-Armenian number. **429** resend requested inside the
  60s cooldown, with `retryAfter` in the payload.

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
Accepted and validated, but **not yet applied** — referral attribution lands
with the referrals module (see BUSINESS_LOGIC.md §7).

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

### GET /restaurants
Nearby list with filters (Home feed).
- **Query:** `lat, lng, sort(recommended|nearest|fastest|top_rated), distMax, minRating, dietary[]=vegan…, service[]=pickup|dinein|reserve, category, q, page, limit`
- Array params accept either `?dietary=vegan,halal` or repeated `?dietary=vegan&dietary=halal`.
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
- **`priceMax` is not implemented** — the design's price-per-person filter has
  no backing column (see DEVELOPMENT_GUIDE.md open questions).
- **Response 200:**
```json
{ "items": [ {
  "id","slug","name","cuisine","priceLevel":2,"rating":4.8,"reviewsCount":1200,
  "distanceKm":0.4,"prepMin":12,"isOpen":true,"services":["pickup","dinein","reserve"],
  "coverUrl","reservationsEnabled":true } ],
  "total": 24, "page": 1 }
```

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
- **Query:** `date=YYYY-MM-DD` (Yerevan local calendar), `guests` (1–12, default 2)
- **Response 200:**
```json
{ "branchId","date":"2026-07-28","guests":2,
  "slots":[ { "time":"19:00","at":"2026-07-28T15:00:00.000Z","available":true } ],
  "depositAmd":4000,"maxSeats":6,"reservationsEnabled":true }
```
- `time` is Yerevan local (what the picker shows); `at` is the instant to send
  back when booking.
- A slot is available when **at least one table big enough is free for the
  whole 90-minute seating** — which is why booking 19:00 also closes 19:30.
- Slots in the past are never `available`.
- An empty `slots` array is a real answer, not an error: the restaurant does
  not take bookings (`reservationsEnabled: false`), the day is closed, or no
  table seats that party (compare `guests` with `maxSeats`).

---

## Categories / Search

### GET /categories · *implemented, public*
Ordered by `sortOrder`. `name` is resolved from `Accept-Language` (default `hy`).
- **Response 200:** `{ "items": [ { "id","key":"sushi","icon":"🍣","name":"Sushi" } ] }`

### GET /search
- **Query:** `q, lat, lng`
- **Response 200:** `{ "restaurants": [...], "dishes": [...] }`

### GET /search/popular
- **Response 200:** `{ "tags": ["Lunch deals","Sushi","Poke bowls","Ramen","Cold brew","Vegan"] }`

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
- **Body:** `{ "branchId", "serviceMode": "pickup", "items": [ { "menuItemId", "qty" } ] }`
- **Response 200:**
```json
{ "branchId","restaurantName","serviceMode":"pickup",
  "items":[ { "menuItemId","name","unitPriceAmd","qty","lineTotalAmd" } ],
  "unavailable":[ { "menuItemId","reason":"not_on_menu|sold_out" } ],
  "subtotalAmd":14200,"serviceFeeAmd":360,"depositAmd":0,"totalAmd":14560,
  "prepMin":15,"earliestReadyAt":"2026-07-21T18:12:15.556Z",
  "branchIsOpen":true,"canOrder":true }
```
- Prices, names and prep times are re-read from the database; the request
  carries ids and quantities only.
- A dish that is missing or sold out is **reported in `unavailable`, not
  thrown**, so the basket screen can flag the line. `canOrder` is the single
  answer to "may this become an order".
- A closed restaurant still returns prices, with `branchIsOpen: false`.
- `prepMin` is the **slowest dish**, not the sum — a kitchen cooks in parallel.

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
{ "branchId","serviceMode":"pickup",
  "items":[{"menuItemId","qty"}],
  "readyAt":"2026-07-25T12:30:00+04:00",
  "notes": null }
```
- `readyAt` is optional and defaults to now + `prepMin`. Earlier than the
  kitchen can manage → **422** carrying `{ "earliestReadyAt" }`; further ahead
  than 7 days → **422**.
- `serviceMode: "dine_in"` → **422** until table booking ships.
- **`couponCode` and `reservation` are not accepted** — unknown fields are
  rejected with **400** rather than silently ignored, so a client cannot
  believe a discount was applied when it was not.
- A dish that is missing or sold out → **422** with
  `details.unavailable[]`. The same dish twice → **400** (combine the
  quantities; merging silently would hide a broken basket).
- **Response 201:**
```json
{ "id","code":"AMR-42774033","pickupCode":"4033","status":"created",
  "serviceMode":"pickup","restaurantName","branch":{ "id","name","address" },
  "items":[ { "id","menuItemId","name","unitPriceAmd","qty","lineTotalAmd" } ],
  "subtotalAmd","serviceFeeAmd","depositAmd","totalAmd",
  "readyAt","secondsLeft","tableNo":null,"reservationId":null,
  "notes","payment":null,"createdAt" }
```
- `pickupCode` is the **last four digits of `code`** — derived, never stored,
  so the two can never disagree.
- Item names are **snapshots** taken in the caller's language at purchase
  time; an order records what was bought at the price it was bought.

### GET /orders
- **Query:** `status=active|past, page, limit` (limit capped at 50)
- **Response 200:** `{ "items":[ { "id","code","restaurantName","coverUrl","date","itemsCount","totalAmd","status","readyAt","secondsLeft" } ], "total", "page" }`
- `itemsCount` counts **dishes, not lines** — "3 items" means three things to eat.

### GET /orders/{id}
- **Response 200:** the same object `POST /orders` returns.
- `secondsLeft` counts down to `readyAt`, never goes negative, and is `null`
  once the order is `ready`, `completed` or `cancelled`.

### POST /orders/{id}/cancel
Allowed while `created`, `paid` or `confirmed` — once the kitchen starts, the
food is spent.
- **Response 200:** the full order with `status: "cancelled"`.
- A captured payment is **refunded first**: if the provider refuses, the
  customer keeps an order rather than having neither order nor refund.
- **422** if the order has moved past `confirmed`. **409** if it changed
  underneath the request.

### POST /orders/{id}/reorder — **not implemented**
Lands with the orders-history screen.

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
- **Single-instance only today.** Fan-out is an in-process emitter, so a socket
  on instance A would not hear a change made on instance B; that becomes Redis
  pub/sub before the API is scaled out.

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

- **422** without one, for a booking that is not active, or for one at a
  different restaurant. **409** if that booking already has an order
  (`orders.reservation_id` is unique). Another guest's booking is **404**.
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
- **Response 200:** `{ "methods":["apple_pay","google_pay","card","cash"], "default":"apple_pay" }`

### POST /payments · **requires `Idempotency-Key`**
Requires a verified phone.
- **Body:** `{ "orderId","method":"apple_pay|google_pay|card|cash","token":"…" }`
- **There is no amount field.** The server charges the order's `totalAmd`; the
  client says *which* order and *how*, never *how much*.
- `token` is an opaque wallet/card token from the client SDK — raw card data
  must never reach this server. `cash` needs none.
- **Response 201:** `{ "id","status","amountAmd","method","orderStatus" }`
- **`cash`** captures nothing (`status: "pending"`, settled at the counter) but
  still moves the order to `paid`, otherwise the kitchen never sees it.
- **Declined** → **422**, the attempt is recorded as `failed`, and the order
  stays `created` so the customer can retry on the same row.
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

### GET /favorites → `{ "items":[ restaurant… ] }`
### POST /favorites → **Body:** `{ "restaurantId" }`
### DELETE /favorites/{restaurantId} → **204**

---

## Referrals

### GET /referrals/me
- **Response 200:** `{ "code":"ARAM5","link":"amragrir.am/i/ARAM5","invitedCount":3,"discountEarnedPct":6 }`

### POST /referrals/share
- **Body:** `{ "channel":"link|whatsapp|telegram" }` → `{ "shared": true }`

---

## Reviews

### GET /restaurants/{id}/reviews → `{ "items":[ { "rating","comment","author","date" } ], "avg":4.8 }`
### POST /restaurants/{id}/reviews → **Body:** `{ "orderId","rating":5,"comment" }`

---

## Notifications

### GET /notifications → `{ "items":[ { "id","type","title","body","isRead","createdAt" } ], "unread": 2 }`
### PATCH /notifications/{id}/read → **204**
### POST /devices → register push token: `{ "platform":"ios|android","token" }`

---

## Owner / Admin (restaurant panel)

> For roles `owner`/`admin` (see ROLES_AND_PERMISSIONS). **`staff` is refused**
> — the schema has no user-to-branch link, so there is nothing to scope them
> by, and lending them the owner's reach in the meantime would be worse than
> making them wait.

### GET /owner/orders · *implemented*
The kitchen queue.
- **Query:** `status=active|past, branchId, page, limit` (capped at 50)
- Scoped to the branches the caller owns; `admin` sees everything. `branchId`
  **narrows** that scope and never widens it, so passing someone else's branch
  id returns nothing rather than their orders.
- **Ordered oldest first** — a kitchen works a queue, not a stack.
- **Response 200:** `{ "items":[ { "id","code","pickupCode","status","serviceMode","branch","customerName","itemsCount","totalAmd","paymentStatus","readyAt","secondsLeft","createdAt","items":[{"name","qty"}],"notes" } ], "total", "page" }`

### PATCH /owner/orders/{id}/status · *implemented*
- **Body:** `{ "status": "confirmed|preparing|almost_ready|ready|completed|cancelled" }`
- **`paid` is not settable.** Only a payment makes an order paid; a panel that
  could set it could mark an unpaid order as settled.
- Legality comes from the shared state machine, so skipping a step is **422**.
- Cancelling here refunds a captured payment, exactly as the customer's cancel does.
- Every change is broadcast to anyone watching the order.
- **Response 200:** the full order (same shape as `GET /orders/{id}`).

### GET /owner/branches · *implemented*
The branches the caller may act on, with a dish count.
- **Response 200:** `{ "items":[ { "id","restaurantId","restaurantName","name","address","city","phone","isOpen","avgPrepMin","menuItemCount" } ] }`

### PATCH /owner/branches/{id} · *implemented*
- **Body (any):** `{ "isOpen", "avgPrepMin", "address", "phone" }`
- `isOpen: false` makes `POST /orders` return **422** for that branch — this is
  the switch a shift uses to stop the queue.
- **`reservationsEnabled` is not accepted here.** It lives on the *restaurant*,
  not the branch, so setting it from a branch endpoint would silently change
  every other branch too. It lands with the reservations module.
- **`openHours` is not editable yet** — the column exists but nothing reads it;
  it arrives with opening-hours validation.

### Menu management · *implemented*

> These return the **raw `*_i18n` objects**, unlike the public menu endpoint
> which resolves one language. The owner is editing all three; resolving would
> make the other two invisible and silently unsaveable.

- `GET /owner/menu-items?branchId=&menuTab=` → `{ "items":[ … ] }`
- `POST /owner/menu-items` — **Body:** `{ "branchId","menuTab","nameI18n":{"hy","ru"?,"en"?},"descI18n"?,"priceAmd","caloriesKcal"?,"prepMin"?,"photoUrl"?,"dietaryTags"?,"isAvailable"? }`
- `PATCH /owner/menu-items/{id}` — any of the above except `branchId`; moving a
  dish between branches would change who owns it, which is a different
  operation, not an edit.
- `DELETE /owner/menu-items/{id}` → **204**

Rules worth knowing:
- **`nameI18n.hy` is required.** It is the fallback every other language
  resolves to, so a dish without it would render nameless for most visitors.
- **Blank translations are dropped** before storing — an empty string is not a
  translation, and it would beat the `hy` fallback.
- **A dish that has ever been ordered cannot be deleted** → **409**, telling the
  owner to set `isAvailable: false` instead. `order_items` points at it, and an
  order that can no longer say what was bought is not an order.
- **Changing a price does not touch existing orders**: every order item stores
  the price it was bought at.

### GET /owner/reservations · *implemented*
The book for a service, chronological.
- **Query:** `branchId?, date=YYYY-MM-DD?` (local day), `status?`, `page`, `limit`
- Defaults to everything still active. `date` is a **Yerevan** calendar day —
  a restaurant's "today" is not UTC's.
- **Response 200:** the reservation object plus `customerName` and
  `customerPhone`.

### PATCH /owner/reservations/{id}/status · *implemented*
- **Body:** `{ "status": "confirmed|seated|completed|no_show|cancelled" }`
- Legality comes from `RESERVATION_STATUS_FLOW`, so the panel can only offer
  moves the API accepts. **422** otherwise.
- `confirmed` and `seated` **leave the deposit alone**; only an ending decides
  the money, per the table in BUSINESS_LOGIC.md §3.

### Not implemented yet
- `GET|POST|PATCH /owner/tables` — manage tables.
- `GET /admin/*` — manage users, restaurants, moderate reviews, metrics.
