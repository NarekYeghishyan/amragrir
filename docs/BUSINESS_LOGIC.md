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

### How a table is held (implemented)

- **A booking is a seating, not an instant.** It occupies
  `RESERVATION_SEATING_MINUTES` (90), which is why 19:00 and 19:30 conflict on
  the same table. Slots are offered every `RESERVATION_SLOT_MINUTES` (30), and
  the last one is a full seating before closing — offering 22:30 when the
  kitchen shuts at 23:00 sells a table nobody can use.
- **Availability is answered per party size.** "19:00 is free" is meaningless
  without knowing whether it is free for two or for eight; a slot is available
  when at least one table big enough is free for the whole seating.
- **The server picks the table**, always the smallest that fits, so a pair does
  not consume the only six-seater. A client naming its own table would mean
  trusting it to have read availability correctly.
- **Times are Yerevan local.** `reserved_for` is an absolute instant, but a
  guest choosing "19:00" means 19:00 at the restaurant. Armenia is UTC+4 all
  year (no DST since 2012), so the offset is a constant — expanding beyond
  Armenia is a visible change to `YEREVAN_UTC_OFFSET_MINUTES`, not a silent
  hour-off bug.
- **Exclusivity is enforced twice.** The check "is this table free" and the
  insert that makes it not free run in one **serializable** transaction, and a
  unique index on `(table_id, active_slot)` backs it up. `active_slot` mirrors
  `reserved_for` while the booking is live and is set to NULL when it ends —
  Postgres treats NULLs in a unique index as distinct, so **cancelling frees
  the slot** where a constraint on `reserved_for` would have blocked that table
  and time forever.

### Deposit lifecycle (implemented)

The deposit is **held, not charged**, at booking — the difference is the
product promise: a guest who cancels in time never had money taken.

| Ending | Deposit | Why |
|---|---|---|
| Cancelled ≥ 2h before | **released** | The table can still be resold. |
| Cancelled < 2h before | **captured** | It could not be resold; that is what the deposit compensates. |
| No-show | **captured** | Same, without even the warning. |
| Completed | **captured and credited** | The guest ate; it comes off the bill rather than being an extra charge. |

`depositOutcomeFor` in `packages/shared` answers this, and both the guest's
cancel path and the owner panel call it — so the two cannot disagree about who
keeps the money. A booking that fails after the hold succeeds **releases it**;
a booking with no deposit is a table given away for nothing.

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

The table lives in `packages/shared/src/reservation-status.ts`
(`RESERVATION_STATUS_FLOW`, `canTransitionReservation`,
`isReservationCancellable`). **`no_show` is reachable only from `confirmed`** —
a table nobody promised to hold cannot be a no-show, and the deposit rule
depends on that distinction. A guest already `seated` cannot cancel.

**Cancellation/no-show policy:** free up to `RESERVATION_FREE_CANCEL_HOURS`
(2h) before the booking; after that, and on a no-show, the deposit is held.
See the deposit table in §3.

---

## 4. Food order (Order)

- An order is tied to **one restaurant** (basket does not mix restaurants). **[from design]**
  Enforced by scoping the menu lookup to the branch: a dish belonging elsewhere
  is simply "not on this menu".
- **Food ready at** — user chooses the ready time; the kitchen synchronizes prep. **[from design]**
- Each dish has a **prep time** (min) and calories — used for estimation and planning. **[from design]**
- **Prep estimate = the slowest dish, not the sum** of the dishes: a kitchen
  cooks in parallel, so ten dishes are not ten times slower. Falls back to the
  branch average, then to `DEFAULT_PREP_MIN`, so an unfilled column never
  schedules an order for "right now".
- A requested `ready_at` earlier than that estimate is rejected; so is one more
  than `ORDER_MAX_LEAD_DAYS` ahead. A minute of slack is allowed for clock skew
  between the quote and the order.
- **Countdown** after placing: starts at `480 seconds` (8:00 min) to readiness (demo value). **[from design]** In production `ready_at` is computed from the chosen time and current kitchen load.
- **Pickup code** generated per order; for dine-in — table number. **[from design]**
  It is the **last four digits of `orders.code`** (`AMR-42774033` → `4033`) —
  derived rather than stored, so the two can never disagree. `orders.code`
  carries the unique constraint; the pickup code is additionally checked
  against active orders at the same branch, because with only 10,000 possible
  values a busy branch would otherwise repeat one surprisingly often.
- **Cancellation** is allowed while `created`, `paid` or `confirmed`. A captured
  payment is refunded before the order is cancelled — if the provider refuses,
  the customer keeps an order rather than having neither order nor refund.

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

The transition table lives in `packages/shared/src/order-status.ts`
(`ORDER_STATUS_FLOW`, `canTransitionOrder`, `isOrderCancellable`) rather than
in the API, because the owner panel decides which buttons to show from the same
table — two copies would drift. Status changes match on the **current** status
in the `WHERE` clause, so a cancel racing a payment loses instead of
overwriting it.

---

## 5. Payment

- Methods: **Apple Pay, Google Pay, Credit Card, Cash**. **[from design]**
- Cash (`cash`) → "Place order" without online payment (pay on site); others → "Pay now". **[from design]**
  A cash payment is recorded as `pending` and captures nothing, but the order
  still moves to `paid` — otherwise the kitchen never receives it.
- Default method: `apple`. **[from design]**
- The **amount is always read from the order**, never from the request. The
  client chooses which order and which method; the server decides how much.
- A **declined** charge is recorded as `failed` and leaves the order `created`,
  so the customer can retry on the same payment row rather than accumulating
  abandoned records.

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
| Booking slot interval | 30 min | proposed |
| Seating length | 90 min | proposed |
| Free cancellation window | 2 h | proposed |
| Max booking lead time | 30 days | proposed |
| Max party per booking | 12 | proposed |
| Default open hours (no `open_hours` set) | 10:00–23:00 | proposed |
| Max qty per dish | 20 | proposed |
| Max dishes per order | 50 | proposed |
| Max pre-order lead time | 7 days | proposed |
| Fallback prep time | 15 min | proposed |

> Move all numeric business constants to config/settings, do not hardcode.
> They currently live in `packages/shared/src/constants.ts`; the ordering
> limits marked *proposed* have no design value behind them and should be
> confirmed with product before launch.
