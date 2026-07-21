# BUSINESS_LOGIC.md

> Amragrir.am business rules. Values extracted from the design are marked **[from design]**; missing logic is proposed as an architectural recommendation **[proposed]** — align with product before implementing.

---

## 1. Pricing and money

- **Currency:** Armenian dram (**֏ / AMD**). **[from design]**
- Internal prices are defined in arbitrary units and converted to dram by `money(n) = round(n × 400 / 10) × 10` — i.e. rate ≈ **1 unit = 400֏**, rounded to 10֏. **[from design]** In production, store prices directly in **AMD (integer, dram has no minor unit)**.
- **Service fee:** fixed `0.9 units` ≈ **360֏** per order. **[from design]** → move to platform/restaurant config.
- **Total:** `total = subtotal + serviceFee`. For dine-in the deposit is **not added** to total as an extra charge — it is credited (see §3).

---

## 2. Service mode

Each order has a mode: **`pickup`** or **`dine_in`**. **[from design]**

- The restaurant declares supported services: `pickup`, `dinein`, `reserve`. **[from design]** (e.g. Sunny Table: all three; Greenhouse: pickup only).
- Dine-in mode is available only if the restaurant supports `reserve`/`dinein`.
- Pickup — released by **pickup code** at the express counter.

---

## 3. Table booking (Reservation)

Rules **[proposed based on design]**:

- The restaurant can **enable/disable** booking (`reservations_enabled`). **[from design: `reserve` field]**
- **Deposit:** `deposit = guests × depositPerGuest`, where `depositPerGuest = 5 units` ≈ **2000֏**. **[from design]**
- The deposit is **fully credited** toward the final bill ("credited to bill"), it is **not** an extra fee. **[from design]**
- A booking cannot be made for a **past date/time** (past days are `disabled` in the calendar). **[from design]**
- A booking cannot be made **outside business hours** / when `open=false`. **[proposed]**
- Seats are **capacity-limited** — the booking passes an availability check. **[proposed]**
- Guest count: minimum 1; step ±1; suggested chips + stepper. **[from design]**
- Defaults: `guests = 2`, `reserveTime = '12:30'`. **[from design]**

### Reservation statuses

```
pending    — created, awaiting confirmation (deposit held)
confirmed  — confirmed by restaurant / automatically
seated     — guest arrived and was seated (optional)
completed  — visit finished, deposit credited to bill
cancelled  — cancelled by guest/restaurant
no_show    — guest did not arrive (deposit policy applies)
```

Transitions: `pending → confirmed → seated → completed`; `cancelled` possible from `pending`/`confirmed`; `confirmed → no_show`.

**Cancellation/no-show policy [proposed]:** free cancellation window (e.g. 2 hours before) → deposit refunded; otherwise/no-show → deposit held per restaurant policy.

---

## 4. Food order (Order)

- An order is tied to **one restaurant** (basket does not mix restaurants). **[from design]**
- **Food ready at** — user chooses the ready time; the kitchen synchronizes prep. **[from design]**
- Each dish has a **prep time** (min) and calories — used for estimation and planning. **[from design]**
- **Countdown** after placing: starts at `480 seconds` (8:00 min) to readiness (demo value). **[from design]** In production `ready_at` is computed from the chosen time and current kitchen load.
- **Pickup code** generated per order; for dine-in — table number. **[from design]**

### Order statuses

```
created    — order created (before payment)
paid       — paid (or confirmed for cash/on-site payment)
confirmed  — accepted by restaurant
preparing  — being prepared
almost_ready (almost) — almost ready
ready      — ready for pickup / to serve
completed  — handed over/eaten
cancelled  — cancelled
```

Tracking steps in UI: **Confirmed → Preparing → Almost ready → Ready**. **[from design]**

Transitions: `created → paid → confirmed → preparing → almost_ready → ready → completed`; cancellation possible before `preparing` (policy TBD).

---

## 5. Payment

- Methods: **Apple Pay, Google Pay, Credit Card, Cash**. **[from design]**
- Cash (`cash`) → "Place order" without online payment (pay on site); others → "Pay now". **[from design]**
- Default method: `apple`. **[from design]**

### Payment statuses [proposed]

```
pending → authorized → captured → refunded / failed / cancelled
```

For the deposit: `authorized` at booking, `captured`/`credited` at completion, `refunded` if cancelled within the window.

---

## 6. Catalog and search

- **Cuisine categories [from design]:** Pizza, Burgers, Healthy, Sushi, Grill, Asian, Breakfast, Lunch, Pasta, Drinks, Desserts.
- **Dish menu tabs [from design]:** Popular, Mains, Sides, Drinks.
- **Restaurant status:** `open` / `closed` (affects ability to order). **[from design]**
- **Sort [from design]:** Recommended, Nearest, Fastest (by prep), Top rated.
- **Filters [from design]:** price/person (4000–24000֏), max distance (0.5–5 km), min rating, dietary (Vegetarian/Vegan/Halal/Gluten-free), service (Pickup/Dine-in/Reserve). Active filters are counted in a badge; results recompute the `results count`.
- **Quick filters on Home [from design]:** Near Me, Ready in 15 min, Open Now, Reserve Table, Pickup, Dine In, Special Offers, Highest Rated.

---

## 7. Referral program

- **"Give 2%, get 2%"** model: the invited friend gets 2% on their first order, the inviter gets 2% on the next order. **[from design]**
- Discounts **stack up to 25%** (maximum). **[from design]**
- The user has a **personal code/link** (e.g. `amragrir.am/i/ARAM5`). **[from design]**
- Referrer is credited **after the invitee's first paid order**. **[proposed]**
- Statistics: friends invited, discount earned. **[from design]**

---

## 8. Rewards and coupons

- The profile stores: **reward points** (e.g. 340), **orders count** (28), **coupons** (3). **[from design]**
- Points accrual mechanic **[proposed]:** X points per paid order / % of amount; redeemed as a discount. Align rates with product.

---

## 9. Localization and settings

- Languages: **hy (default), ru, en** — switch on the fly. **[from design]**
- Theme: **light / dark**. **[from design]**
- Settings flags: push notifications (on by default), promo emails (off by default). **[from design]**

---

## 10. Key constants (for config)

| Constant | Value | Source |
|---|---|---|
| Unit→AMD rate | ×400, rounded to 10֏ | design |
| Service fee | ≈360֏ (0.9 units) | design |
| Deposit per guest | ≈2000֏ (5 units) | design |
| Countdown start | 480 s (8 min) | design (demo) |
| Default guests | 2 | design |
| Referral discount | 2%, stacks to 25% | design |
| Filter price range | 4000–24000֏ | design |
| Distance range | 0.5–5 km | design |

> Move all numeric business constants to config/settings, do not hardcode.
