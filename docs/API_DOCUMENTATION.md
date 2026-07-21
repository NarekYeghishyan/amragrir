# API_DOCUMENTATION.md

> Amragrir.am REST API. Base: `https://api.amragrir.am/v1`. Format — JSON. Auth — `Authorization: Bearer <accessToken>` (JWT). Locale — `Accept-Language: hy|ru|en` header. Amounts — integers in AMD (`*_amd`).

Common error response:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```
Status codes: 200/201 ok, 400 validation, 401 unauthorized, 403 forbidden, 404 not found, 409 conflict (e.g. slot taken), 422 business rule.

---

## Authentication

> **Implemented** except `POST /auth/social` (see below). Every other route in
> this doc is still a specification.
>
> Endpoints are authenticated by default; only the routes marked *public* below
> may be called without a bearer token. Access tokens last 15 min, refresh
> tokens 30 days and are **single-use** (rotated on every refresh, revocable at
> logout).

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

### GET /restaurants
Nearby list with filters (Home feed).
- **Query:** `lat, lng, sort(recommended|nearest|fastest|top_rated), priceMax, distMax, minRating, dietary[]=vegan…, service[]=pickup|dine_in|reserve, category, q, page, limit`
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
- **Response 200:** restaurant object + `branch { address, lat, lng, openHours, isOpen }`.

### GET /restaurants/{id}/menu
- **Query:** `menuTab=popular|mains|sides|drinks, category`
- **Response 200:**
```json
{ "items": [ { "id","name","desc","priceAmd":5800,"caloriesKcal":520,
  "prepMin":12,"photoUrl","dietaryTags":["vegetarian"],"isAvailable":true } ] }
```

### GET /restaurants/{id}/tables
Tables (for dine-in).
- **Response 200:** `{ "tables": [ { "id","tableNo":"12","seats":4,"zone" } ] }`

### GET /restaurants/{id}/availability
Available slots for a date.
- **Query:** `date=YYYY-MM-DD, guests=2, mode=dine_in|pickup`
- **Response 200:**
```json
{ "date":"2026-07-25",
  "slots":[ {"time":"12:30","available":true},{"time":"13:00","available":false} ],
  "capacityLeft": 6 }
```

---

## Categories / Search

### GET /categories
- **Response 200:** `{ "items": [ { "key":"sushi","icon":"🍣","name":"Sushi" } ] }`

### GET /search
- **Query:** `q, lat, lng`
- **Response 200:** `{ "restaurants": [...], "dishes": [...] }`

### GET /search/popular
- **Response 200:** `{ "tags": ["Lunch deals","Sushi","Poke bowls","Ramen","Cold brew","Vegan"] }`

---

## Cart (optional server-side)

> The cart can be client-side. If server-side:

### GET /cart · PATCH /cart
- **PATCH Body:** `{ "branchId", "items": [ { "menuItemId","qty" } ] }`
- **Response 200:** `{ "items":[...], "subtotalAmd", "serviceFeeAmd", "totalAmd" }`

---

## Orders

### POST /orders
Create an order (pre-order).
- **Body:**
```json
{ "branchId","serviceMode":"pickup|dine_in",
  "items":[{"menuItemId","qty"}],
  "readyAt":"2026-07-25T12:30:00+04:00",
  "reservation": { "reservedFor":"…","guests":2,"tableId":null },
  "couponCode": null, "notes": null }
```
- **Response 201:**
```json
{ "id","code":"AMR-4821","status":"created",
  "subtotalAmd","serviceFeeAmd","depositAmd","totalAmd",
  "readyAt","pickupCode":"4821","reservationId" }
```

### GET /orders
- **Query:** `status=active|past, page, limit`
- **Response 200:** `{ "items":[ { "id","restaurantName","date","itemsCount","totalAmd","status","readyAt","secondsLeft" } ] }`

### GET /orders/{id}
- **Response 200:** full order + `items[]`, `status`, `secondsLeft`, `pickupCode`, `tableNo`.

### POST /orders/{id}/reorder
- **Response 201:** a new draft order/cart with the same items.

### POST /orders/{id}/cancel
- **Response 200:** `{ "status":"cancelled" }` (if rules allow).

### Realtime status
- **WS:** `wss://api.amragrir.am/v1/orders/{id}/stream` → events `{ "status","secondsLeft","readyAt" }`. Fallback — poll `GET /orders/{id}` every 5–10s.

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

### GET /payment-methods
- **Response 200:** `{ "methods":["apple_pay","google_pay","card","cash"], "default":"apple_pay" }`

### POST /payments
- **Body:** `{ "orderId","method":"card","token":"…" }`
- **Response 201:** `{ "id","status":"captured","amountAmd" }`

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
