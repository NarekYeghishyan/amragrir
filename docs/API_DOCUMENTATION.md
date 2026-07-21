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

### GET /restaurants/{id}/availability — **not implemented**
Available slots for a date. Lands with the reservations module.
- **Query:** `date=YYYY-MM-DD, guests=2, mode=dine_in|pickup`
- **Response 200:**
```json
{ "date":"2026-07-25",
  "slots":[ {"time":"12:30","available":true},{"time":"13:00","available":false} ],
  "capacityLeft": 6 }
```

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

### Realtime status — **not implemented**
- **WS:** `wss://api.amragrir.am/v1/orders/{id}/stream` → events `{ "status","secondsLeft","readyAt" }`. Fallback — poll `GET /orders/{id}` every 5–10s.
- Until then `GET /orders/{id}` already returns `secondsLeft`, so polling works.

---

## Reservations

### POST /reservations
- **Body:** `{ "branchId","reservedFor":"2026-07-25T19:00:00+04:00","guests":4 }`
- **Response 201:** `{ "id","status":"pending","depositAmd":8000,"tableNo" }`
- **409** if slot/capacity unavailable.

### GET /reservations
- **Query:** `status`
- **Response 200:** `{ "items":[ { "id","restaurantName","reservedFor","guests","status","depositAmd" } ] }`

### POST /reservations/{id}/cancel
- **Response 200:** `{ "status":"cancelled","depositRefunded":true|false }`

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

> For roles `owner`/`staff`/`admin` (see ROLES_AND_PERMISSIONS).

- `GET /owner/orders?status=` — incoming orders.
- `PATCH /owner/orders/{id}/status` — change status (`confirmed→preparing→ready…`).
- `GET|POST|PATCH|DELETE /owner/menu-items` — manage the menu.
- `PATCH /owner/branches/{id}` — hours, `isOpen`, `reservationsEnabled`.
- `GET|POST|PATCH /owner/tables` — manage tables.
- `GET /owner/reservations` + `PATCH /owner/reservations/{id}/status`.
- `GET /admin/*` — manage users, restaurants, moderate reviews, metrics.
