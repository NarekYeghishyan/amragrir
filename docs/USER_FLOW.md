# USER_FLOW.md

> Amragrir.am user flows. Arrows `↓` / `→` denote transitions between screens/steps.

---

## 1. Registration / Login

```
App open
        ↓
   Auth-gate (not authenticated)
        ↓
  ┌─────────────┬──────────────┬───────────────┐
  │  Register   │    Login     │  Guest / Social │
  ↓             ↓              ↓
Full name    Phone         Apple / Google
+ Phone         ↓          / Continue as guest
  ↓          SMS code (OTP)         ↓
SMS code (OTP)  ↓                   ↓
  ↓          Verify code           │
Create profile  ↓                  │
  ↓             Home ←─────────────┘
Home
```

- Phone → `POST /auth/send-code` → enter 4–6 digit code → `POST /auth/verify-code`.
- New number → "Create profile" step (name). Existing → straight to Home.
- Guest mode is limited (see ROLES_AND_PERMISSIONS): cannot place an order without phone verification.

> **Prototype gap:** the OTP entry screen needs to be added between sending and Home.

---

## 2. Finding a restaurant

```
Home
  ↓  (detect location / choose address)
Location: Yerevan · Northern Ave
  ↓
Nearby restaurants  ──(filters / categories / search)──►  refined list
  ↓
Tap a card
  ↓
Restaurant page
```

Search branches:
- **Via Search:** Home → Search → type query / category / popular tag → list → Restaurant.
- **Via category:** Home → category chip → filtered list.
- **Via filters:** Home → FAB → Filter sheet (sort/price/distance/rating/dietary/service) → Show results → list.

---

## 3. Table booking (Dine-in)

```
Restaurant
   ↓  (add dishes to basket — optional)
Basket → Choose time
   ↓
Pre-order → "Dine In" mode
   ↓
Date (calendar)
   ↓
Time (booking slot)
   ↓
Guests count
   ↓
Availability check (table/capacity availability)
   ↓
Table deposit (deposit = guests × rate, credited to bill)
   ↓
Checkout → pay deposit/order
   ↓
Reservation confirmed (Tracking: table #, time)
```

Rules: unavailable dates/slots are blocked; the deposit secures the table; the deposit is credited toward the final bill.

---

## 4. Ordering food (Pickup / pre-order)

```
Menu (Restaurant)
   ↓  Add to cart (＋)
Basket (review items, ±)
   ↓  Choose time
Pre-order → "Pickup" mode
   ↓
Food ready at (choose ready time)
   ↓
Checkout (summary + payment method)
   ↓
Payment (Apple / Google / Card / Cash)
   ↓
Order confirmation (Tracking)
   ↓
Live countdown → Ready → Pickup by code at counter
```

---

## 5. Tracking and pickup

```
Order placed
   ↓
Tracking: Confirmed → Preparing → Almost ready → Ready
   ↓ (countdown, start 8:00 min)
Pickup code / QR ready
   ↓
User arrives → shows code at the counter (or sits at table #)
   ↓
Done → Home
```

The active order is available from the **Orders** tab (card with timer → Tracking).

---

## 6. Reorder

```
Orders → Past orders
   ↓  Reorder
Basket is prefilled with the past order's items
   ↓
Pre-order → Checkout → …
```

---

## 7. Referral program

```
Profile → "Refer & earn 2%" card
   ↓
Referral: personal code / link
   ↓  Copy / Share invite
Friend registers with the code and places a first order
   ↓
Both get 2% (stacks up to 25%)
```

---

## 8. Language / theme switch

```
Profile or Settings
   ↓
Language: hy / ru / en  (switch on the fly)
Dark mode: toggle (light / dark)
```

---

## 9. Managing favorites

```
Restaurant → ♥ (add/remove)
   ↓
Favorites (tab) → list → Restaurant
```

---

## 10. Transition map (summary)

```
Auth → Home
Home ⇄ Search ⇄ Orders ⇄ Favorites ⇄ Profile   (bottom tab bar)
Home → Restaurant → Basket → Pre-order → Checkout → Tracking → Home
Home → Filter sheet → Home
Profile → Referral / Settings
Orders → Tracking (active)
Settings → Auth (Log out)
```
