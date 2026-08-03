# SCREENS.md

> Detailed description of every screen. Screens correspond to the `screen` state in the design. Navigation switches `screen` + active tab (`tab`). Screens with the bottom tab bar: `home`, `search`, `orders`, `favorites`, `profile`.

Field legend: **Purpose** · **User** · **Elements** · **Actions** · **Transitions** · **API data**.

---

## 0. Auth

**Purpose:** log in or register before accessing the app (auth-gate).
**User:** new or returning guest.
**Elements:** logo + tagline, Login / Sign up switch, "Full name" field (register only), "Phone number" field (placeholder `99 123 456`), OTP note, "Continue" button, "OR" divider, social buttons (Apple, Google), "Continue as guest", Terms/Privacy text.
**Actions:** enter phone/name → Continue (send OTP); pick social login; continue as guest; toggle login/register.
**Transitions:** Continue → (OTP screen → ) Home. Guest/social → Home. `authed:true`.
**API:** `POST /auth/send-code`, `POST /auth/verify-code`, `POST /auth/social`, `POST /auth/guest`. On register — profile creation (`name`, `phone`).

> In the current prototype the SMS-code step is not rendered as a separate screen — **add an OTP screen** between sending the code and Home (see USER_FLOW).

---

## 1. Home

**Purpose:** quickly find a nearby restaurant and start a pre-order.
**User:** authenticated guest on the home tab.
**Elements:** greeting + "What to eat today?" question, dark-theme button, search bar (button → Search), location selector (`Yerevan · Northern Ave`), cuisine category rail (horizontal scroll), filter rail + filters FAB with a count badge, "Nearby restaurants" section + "See all", restaurant card list (skeletons while loading ~950ms → loaded cards).
**Actions:** open search; pick a category; open filters; open a restaurant; toggle theme; change location.
**Transitions:** search bar / See all → Search; category → Home (filtered by category); card → Restaurant; FAB → Filter sheet.
**API:** `GET /restaurants?lat&lng&sort&filters` (nearby list), `GET /categories`, user geolocation/address. Card fields: name, rating, reviews, cuisine, price level, distance, prepMin, open/closed, services[], photo.

---

## 2. Search

**Purpose:** find a restaurant/cuisine/dish.
**User:** looking for something specific.
**Elements:** title, search input, "Browse by cuisine" (2×N category grid with emoji), "Popular near you" (tags: Lunch deals, Sushi, Poke bowls, Ramen, Cold brew, Vegan).
**Actions:** type a query; pick a category (→ Home with filter); tap a popular tag.
**Transitions:** category/tag → Home (filtered) → Restaurant.
**API:** `GET /search?q=`, `GET /categories`, `GET /search/popular` (popular queries/tags).

---

## 3. Restaurant

**Purpose:** explore the restaurant and build a basket.
**User:** having chosen a restaurant.
**Elements:** 270px photo header + back + favorite, name, meta (cuisine · price · distance), rating card (★ + "reviews"), badges (⏱ prep time, 📍 distance, "Open now"), menu tabs (Popular / Mains / Sides / Drinks), dish list (photo, name, description, kcal · prep, price, `＋` button), sticky "View basket" CTA with count and total (if basket not empty).
**Actions:** back; favorite; switch menu tab; add dish (`＋`); go to basket.
**Transitions:** back → Home; View basket → Basket.
**API:** `GET /restaurants/{id}` (profile), `GET /restaurants/{id}/menu?category=` (items with price, kcal, prep, photo, dietary tags), `POST /favorites` / `DELETE /favorites/{id}`.

---

## 4. Basket

**Purpose:** review and edit the order before choosing a time.
**User:** having collected items.
**Elements:** back + title + restaurant name; restaurant banner (photo, rating, meta, prep, distance); item list (photo, name, price each, total, ± stepper); "＋ Add more items"; summary (Subtotal, Service, Total); sticky "Choose time · total" CTA. Empty state: 🧺 icon + title + description + "Browse restaurants".
**Actions:** change quantity (±); add more; go back; proceed to time selection.
**Transitions:** back → Restaurant; Add more → Restaurant; Choose time → Pre-order; Browse (empty) → Home.
**API:** client-side basket (or `GET/PATCH /cart`); compute `subtotal`, `serviceFee`, `total`. Basket tied to a single `restaurant_id`.

---

## 5. Pre-order (When & how)

**Purpose:** choose mode (Pickup/Dine-in), time and booking parameters.
**User:** ready to place the order.
**Elements:**
- Title "When & how", subline (restaurant · prep time).
- Mode select: **Pickup** (Grab & go at counter) / **Dine In** (Reserve a table).
- **For Dine-in** (block appears): month calendar (prev/next month, days, unavailable days `disabled`), "Reservation time" slot grid, "Guests" select (chips + stepper), "Table deposit" card (amount = guests × rate, breakdown, "credited to bill" note, info note).
- **For all/Pickup:** "Food ready at" time slot grid.
- "⚡ ready summary" panel + kitchen note.
- sticky "Continue to checkout · total" CTA.
**Actions:** pick Pickup/Dine-in; page months; pick booking date/time; change guest count; pick ready time; continue.
**Transitions:** back → Basket; Continue → Checkout.
**API:** `GET /restaurants/{id}/availability?date=` (available slots, capacity), `GET /restaurants/{id}/tables` (for dine-in), deposit calc `deposit = guests × depositPerGuest`.
**Which "Food ready at" times are offered.** The earliest is `earliestReadyAt`
from `POST /cart/quote` — now plus the prep estimate — and taking it is an
ordinary order, which is what the screen does when the customer picks nothing.
Anything further out is a **pre-order** (BUSINESS_LOGIC.md §4): up to
`ORDER_MAX_LEAD_DAYS` ahead, and inside the branch's opening hours, which is what
stops a pickup being booked for 04:00 next Sunday. Both limits are enforced by
`POST /orders` with a **422**, so a picker that offers a time the server refuses
is a bug in the picker — the earliest is handed back in the refusal for exactly
that case. A pre-order is accepted the moment it is paid for rather than waiting
on somebody at the restaurant, and the branch is warned before it has to start.

---

## 6. Checkout

**Purpose:** confirm details and pay.
**User:** confirming the order.
**Elements:** back + title; item summary (qty, name, amount); Subtotal + Service; "Ready at" block (time ⚡), method (Pickup/Table), for dine-in — Table deposit + credit note; "Payment" section (Apple Pay, Google Pay, Credit Card — with radio dot); a line saying that paying places the order and cannot be undone; sticky "Pay · total" CTA.
**Actions:** pick payment method; back; pay.
**Note:** the design's fourth method, *Cash at the counter*, and its "Place
order" variant of the CTA are gone — every order is paid for online before the
kitchen receives it (BUSINESS_LOGIC.md §5).
**Transitions:** back → Pre-order; Place order → Tracking (`placed:true`, `secondsLeft:480`).
**API:** `POST /orders` (create), `POST /payments` (process), `GET /payment-methods`. Response contains `order_id`, `pickup_code`, `ready_at`, status.

---

## 7. Order Tracking

**Purpose:** show progress and the pickup code.
**User:** having placed an order.
**Elements:** "Order confirmed" + restaurant name + animated checkmark; ring progress with "Ready in mm:ss" timer (start 480s = 8 min) + "arrives HH:MM"; status steps (Confirmed → Preparing → Almost ready → Ready); QR/pickup-code card + instruction ("Show this at the counter" / for dine-in — "table #12"); "Done" button.
**Actions:** wait for readiness; return home.
**Transitions:** Done → Home. (From Orders you can return to Tracking via the active order.)
**API:** `GET /orders/{id}` + realtime (WebSocket/polling) of status and `ready_at`. Fields: status, seconds_left/ready_at, scheduled, pickup_code, table_no.
**A pre-order tracks differently.** `scheduled: true` means the customer chose
the time, so the ring counts down to a promise rather than running a timer that
has not started — "for Tue 13:00", not "ready in 4,320 min". It also arrives
already **Confirmed**: paying for a pre-order accepts it, so the first step of
the tracker is complete from the moment the payment goes through.

---

## 8. Orders

**Purpose:** active and past orders.
**User:** on the Orders tab.
**Elements:** title; "Active" section — card with progress bar, "Preparing" status, name, "arrives HH:MM", timer (if there is an active order); otherwise empty "No active orders" block. "Past orders" section — rows (photo, name, date, items, amount, "Reorder" button).
**Actions:** open active order (→ Tracking); reorder a past order.
**Transitions:** active card → Tracking; Reorder → Restaurant/Basket prefilled.
**API:** `GET /orders?status=active`, `GET /orders?status=past`, `POST /orders/{id}/reorder`.

---

## 9. Favorites

**Purpose:** quick access to saved restaurants.
**User:** on the Favorites tab.
**Elements:** title; card list (photo, name, meta, ⏱ prep, ★ rating).
**Actions:** open a restaurant.
**Transitions:** card → Restaurant.
**API:** `GET /favorites`, `DELETE /favorites/{id}`.

---

## 10. Profile

**Purpose:** account, statistics, section entry points.
**User:** authenticated.
**Elements:** avatar + name + email; stats (Reward pts 340, Orders 28, Coupons 3); referral card "Refer & earn 2%"; language switch (hy/ru/en); rows: Payment methods, Favorite restaurants, Order history, Rewards & coupons, Settings.
**Actions:** open referral; change language; go to a section.
**Transitions:** referral → Referral; rows → corresponding screens (Settings, Favorites, Orders …).
**API:** `GET /me` (profile, stats, points, coupons), `PATCH /me/language`.

---

## 11. Referral

**Purpose:** invite friends and get a discount.
**User:** program participant.
**Elements:** back; hero card "Give 2%, get 2%"; personal code/link (`amragrir.am/i/ARAM5`) + Copy button; "Share invite" button; stats (Friends joined 3, Discount earned 6%); "How it works" (3 steps).
**Actions:** copy code; share.
**Transitions:** back → Profile.
**API:** `GET /referrals/me` (code, link, statistics), `POST /referrals/share`.

---

## 12. Settings

**Purpose:** manage preferences and account.
**User:** authenticated.
**Elements:** back + title; Preferences (Dark mode toggle, Push notifications toggle, Promotional emails toggle); Language (segmented hy/ru/en); Account (Edit profile, Payment methods, Delivery addresses); About (Help center, Terms of Service, Privacy policy); "Log out" button (destructive); version "2.4.0".
**Actions:** toggle theme/notifications/promo; change language; open sections; log out.
**Transitions:** back → Profile; Log out → Auth.
**API:** `PATCH /me/settings` (flags), `PATCH /me/language`, `POST /auth/logout`.

---

## 13. Filter Sheet (modal)

**Purpose:** refine the restaurant results.
**User:** from Home via the FAB.
**Elements:** bottom sheet: Sort by (Recommended/Nearest/Fastest/Top rated), Price per person (range 4000–24000֏), Max distance (range 0.5–5 km), Minimum rating (Any/★ options), Dietary (Vegetarian, Vegan, Halal, Gluten-free), Service (Pickup, Dine-in, Reserve), Reset / "Show N results" buttons.
**Actions:** set sort/price/distance/rating/diet/service; reset; apply.
**Transitions:** close/apply → Home (updated list).
**API:** parameters passed to `GET /restaurants` (sort, priceMax, distMax, minRating, dietary[], service[]).

---

## 14. The web app's screens

These are the same screens on `apps/web`, and they differ enough to be worth
writing down. Numbering follows the app screens above: web `Basket` is the same
concept as §4, and where behaviour differs the reason is given rather than the
difference alone.

**What is the same.** The steps, the vocabulary and the rules: one restaurant
per basket, the deposit credited rather than added, cancellation only while
unpaid, online payment only, `hy` by default.

**What is different, and why:**

| | App | Web |
|---|---|---|
| Basket | client state | httpOnly cookie of ids + quantities; re-priced by `POST /cart/quote` on every render |
| Checkout | screen | the design's slide-over via an intercepting route, and the identical component as a full page on direct load |
| Confirmation | toast over the placing screen | `/[lang]/orders/{id}` — it carries the pickup code, which has to survive a reload |
| Payment | Apple Pay, Google Pay, Card | **Card only.** Wallets are shown disabled ("available in the app"): they need a browser payment SDK the web does not have |
| Tracking | WebSocket | `GET /orders/{id}` polled every 10s; the socket needs a handshake the httpOnly token cannot do from the page |
| Pre-order times | full slot picker | earliest from `earliestReadyAt` plus the next few quarter-hours; the server refuses anything outside opening hours with a 422 |
| Basket badge | always | needs JavaScript — see `apps/web/README.md` for why the count is a separate readable cookie |

**Every step works with JavaScript disabled.** Each action is a `<form>` posting
to a Server Action followed by a redirect: quantities, coupon, mode, table
booking, sign-in, payment and cancellation. The badge and the tracking
auto-refresh are the only enhancements, and neither is on the path.

**Routes:** `/[lang]/cart`, `/preorder`, `/checkout`, `/signin`, `/orders`,
`/orders/{id}`, plus `/session` (a route handler that mints or refreshes a token
and bounces back, because a page render may not write a cookie). All are
`noindex, follow` **and** disallowed in `robots.txt` — `noindex` is only read
after a fetch, and these pages do real work per request for a client that can
never have a basket.
