# API_DOCUMENTATION.md

> Amragrir.am REST API. Base: `https://api.amragrir.am/v1`. Format — JSON. Auth — `Authorization: Bearer <accessToken>` (JWT). Locale — `Accept-Language: hy|ru|en` header. Amounts — integers in AMD (`*_amd`).

Common error response:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```
Status codes: 200/201 ok, 400 validation, 401 unauthorized, 403 forbidden, 404 not found, 409 conflict (e.g. slot taken), 422 business rule.

---

## Authentication

### POST /auth/send-code
Send an OTP to the phone.
- **Body:** `{ "phone": "+37499123456" }`
- **Response 200:** `{ "sent": true, "expiresIn": 120 }`

### POST /auth/verify-code
Verify the code, return tokens.
- **Body:** `{ "phone": "+37499123456", "code": "1234" }`
- **Response 200:** `{ "accessToken", "refreshToken", "isNewUser": true, "user": { … } }`
- If `isNewUser` → next `PATCH /me` for profile (name).

### POST /auth/social
- **Body:** `{ "provider": "apple|google", "idToken": "…" }`
- **Response 200:** `{ "accessToken", "refreshToken", "user" }`

### POST /auth/guest
- **Response 200:** `{ "accessToken", "user": { "isGuest": true } }`

### POST /auth/refresh
- **Body:** `{ "refreshToken" }` → **200:** `{ "accessToken", "refreshToken" }`

### POST /auth/logout
- **Response 204**

---

## Profile / Me

### GET /me
- **Response 200:**
```json
{ "id","name","phone","email","avatarUrl","language":"hy","darkMode":false,
  "rewardPoints":340,"ordersCount":28,"couponsCount":3 }
```

### PATCH /me
- **Body (any):** `{ "name", "email", "avatarUrl" }`

### PATCH /me/settings
- **Body:** `{ "notifPush": true, "notifPromo": false }`

### PATCH /me/language
- **Body:** `{ "language": "hy|ru|en" }`

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
