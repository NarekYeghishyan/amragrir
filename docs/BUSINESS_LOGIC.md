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
- **Cancellation is allowed only while the order is unpaid** (`created`).
  Paying commits the order: from `paid` onwards there is no way out of the
  queue for either side — not the customer, and not the restaurant. An unpaid
  order is a basket somebody walked away from, and dropping it costs nobody
  anything; a paid one has a charge behind it, and this platform performs no
  refunds for orders.
  *Consequence to be aware of:* a branch that cannot fulfil a paid order has no
  in-product way to call it off or return the money — that is a support
  conversation, not a button.

### Order statuses

```
created    — order created (before payment)
paid       — paid for online; the only way an order reaches the kitchen
confirmed  — accepted by restaurant
preparing  — being prepared
almost_ready (almost) — almost ready
ready      — ready for pickup / to serve
completed  — handed over/eaten
cancelled  — cancelled
```

Tracking steps in UI: **Confirmed → Preparing → Almost ready → Ready**. **[from design]**

Transitions: `created → paid → confirmed → preparing → almost_ready → ready →
completed`; `cancelled` is reachable from `created` alone. Every status after
the payment has one move available, which is the next one — with one exception.

**`preparing → ready` is allowed, skipping `almost_ready`.** That stage is a
warning to whoever works the counter rather than a step in cooking, and plenty
of dishes are plated in one motion and never wait at the pass. The board offers
both moves on a preparing order: *Almost ready* as the ordinary step, *Ready*
beside it. It is one transition, not two applied in sequence — the order never
sat in `almost_ready`, so `order_events` records `preparing → ready` and records
it once. The consequence worth knowing is that the *Almost ready* stage counts
only the orders somebody deliberately flagged, not everything on its way out.

The transition table lives in `packages/shared/src/order-status.ts`
(`ORDER_STATUS_FLOW`, `canTransitionOrder`, `isOrderCancellable`) rather than
in the API, because the owner panel decides which buttons to show from the same
table — two copies would drift. Status changes match on the **current** status
in the `WHERE` clause, so a cancel racing a payment loses instead of
overwriting it.

**Every order keeps its history.** The status column above says where an order
is now and overwrites its own past on each update, so each move is also written
to `order_events` (DATABASE.md §8a) — in the same transaction as the move
itself, naming who made it: the customer, a staff member, or the system. The
placement and every payment attempt, including a decline that moves no status,
are recorded the same way. That is what makes "when did this come in, and who
confirmed it" answerable at the counter rather than a matter of memory.

---

## 5. Payment

- Methods: **Apple Pay, Google Pay, Credit Card** — all of them online.
- **Cash was removed.** The design had it as "Place order" without online
  payment: the charge was skipped, the payment recorded `pending`, and the
  order moved to `paid` anyway so the kitchen would receive it. Two things were
  wrong with that. Nothing in the platform ever settled those rows — there was
  no path that turned a pending cash payment into a captured one — so `paid`
  meant "in the queue" for some orders and "actually paid for" for others. And
  an order the kitchen cooks before any money is taken is one the platform
  cannot make good on. Every order is now paid for before it reaches a kitchen.
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

**For an order:** a charge either `captured` or `failed`. `pending` is no longer
reachable — it was the cash state — and `refunded` is not either, since a paid
order cannot be cancelled. A `failed` attempt on an order the customer then
drops is closed off as `cancelled`. Rows written before cash was removed still
carry `pending`; they are recognisable by `provider_ref = 'legacy_cash'`.

**For the deposit:** `authorized` at booking, `captured`/`credited` at
completion, `refunded` if cancelled within the window. This is the one place a
hold and a reversal still happen — a reservation may be cancelled, an order may
not.

---

## 6. Catalog and search

- **Cuisine categories [from design]:** Pizza, Burgers, Healthy, Sushi, Grill, Asian, Breakfast, Lunch, Pasta, Drinks, Desserts.
- **Dish menu tabs [from design]:** Popular, Mains, Sides, Drinks.
- **Restaurant status:** `open` / `closed` (affects ability to order). **[from design]**
- **Sort [from design]:** Recommended, Nearest, Fastest (by prep), Top rated.
- **Filters [from design]:** price/person (4000–24000֏), max distance (0.5–5 km), min rating, dietary (Vegetarian/Vegan/Halal/Gluten-free), service (Pickup/Dine-in/Reserve). Active filters are counted in a badge; results recompute the `results count`.
- **Price per person is derived, not stored:** the average price of a branch's
  *available* dishes. There is no per-person column, and adding one would mean
  keeping a denormalised figure in step with every menu edit. This is an
  approximation and is documented as one.
- **Search returns restaurants and dishes as two lists**, not one blended one:
  "Sushi" is both a cuisine and a dish, and someone looking for a place to eat
  wants different rows from someone looking for a specific plate. Dish search
  matches **any language**, so typing "Burger" on a Russian phone still finds
  «Бургер».
- **Quick filters on Home [from design]:** Near Me, Ready in 15 min, Open Now, Reserve Table, Pickup, Dine In, Special Offers, Highest Rated.

### A dish joining the menu

**A dish needs a photograph before it can be added.** A menu is a list somebody
reads with their eyes: an entry with no picture sits under the ones that have
one and does not get ordered, and the restaurant that added it rarely comes back
to fix it. So the picture is asked for at the one moment somebody is definitely
thinking about the dish — `POST /restaurant/menu-items` refuses a creation
without `photoUrl`, and the panel's "Add a dish" form will not submit without it.

**It is uploaded, not linked.** Whoever adds a dish has a photograph of it on
the machine in front of them, not a URL — asking for an address would be asking
them to go and host it first. The panel uploads the file
(`POST /uploads/menu-photo`, max 5 MB, JPEG/PNG/WebP) and stores the URL that
comes back. An edit may swap the picture for a better one but cannot remove it.

**Every dish in the demo data has one, and it is a photograph of that dish.**
The seed points each one at a real picture hosted elsewhere — recipe photos from
TheMealDB/TheCocktailDB, freely-licensed photographs from Wikimedia Commons —
falling back to a photograph of its category where no picture of the dish itself
could be found. Hotlinked rather than downloaded: no images in the repository
and no licences to carry, at the cost of depending on somebody else's servers,
which `MENU_PHOTOS=local` trades back for the committed placeholders.

`pnpm --filter @amragrir/api db:photos` applies the same table to a database
that is already running. It rewrites a dish with no photograph or one the seed
put there, and **never** one a restaurant uploaded — that is the only picture in
the table anybody actually chose.

### A dish changing

**Everything about a dish is editable except which branch it belongs to.**
Moving a dish between branches would change who owns it — that is a different
operation, not an edit, and `PATCH /restaurant/menu-items/{id}` has no
`branchId`. Everything else — the photograph, the names, the price, the tab, the
prep estimate — can be corrected from the panel's row, so a wrong picture or a
missing translation does not mean deleting the dish and adding it again.

**A price change does not reach orders already placed.** Every order item stores
the price it was bought at (§4), so a menu edit never rewrites what somebody was
charged.

**Two blanks that mean opposite things.** Emptying the prep time (`prepMin:
null`) takes the estimate off the dish and the branch's average stands in —
an estimate can turn out to be wrong. Emptying the photograph is refused: a dish
is required to have one, so an edit may swap the picture but never remove it.

### A dish leaving the menu

Two different states, and conflating them loses a real distinction:

| | `is_available = false` | `deleted_at` set |
|---|---|---|
| Means | sold out tonight | off the menu |
| Who | a shift (`menu:availability`) | `menu:write` |
| Comes back | yes, in a tap | no route offers it |
| Shown to customers | yes, marked sold out | no |

**Deleting is soft.** `order_items` references `menu_items`, and an order that
can no longer say what was bought is not an order — so the row stays and every
read filters it out. Past orders are unaffected either way: each order item
stores the name and unit price it was bought at, so history is never rewritten
by a menu change.

**Any dish can be removed, ordered or not.** Deleting one that had ever appeared
in an order used to be refused outright, because the foreign key made it
impossible. Keeping the row removes that objection, so a restaurant can retire a
dish that sold — previously only possible by hiding it forever behind the
sold-out flag.

**A withdrawn dish cannot be ordered.** It is absent from the public menu, from
search filters, from the branch's dish count, and from the lookup that prices an
order — where it comes back as `not_on_menu`. A soft delete that still let a
customer buy the dish would not be a delete.

---

## 7. Referral program

- **"Give 2%, get 2%"** model: the invited friend gets 2% on their first order, the inviter gets 2% on the next order. **[from design]**
- Discounts **stack up to 25%** (maximum). **[from design]**
- The user has a **personal code/link** (e.g. `amragrir.am/i/ARAM5`). **[from design]**
- Referrer is credited **after the invitee's first paid order**. **[proposed]**
- Statistics: friends invited, discount earned. **[from design]**

### How this is implemented

- The code is generated on **first read** of `GET /referrals/me` — most accounts
  never open the screen, and a code nobody has seen is a row nobody needs. The
  alphabet omits `0/O` and `1/I/L`, because these codes get read aloud.
- **Attribution happens at signup** (`referralCode` on `verify-code`) and only
  for a genuinely new account: re-verifying an existing phone with a friend's
  code would otherwise mint a discount.
- An unknown or self-referring code is **ignored, not rejected** — the signup
  succeeds without attribution rather than failing on a typo.
- **The inviter is paid when the invitee first pays**, not at signup: otherwise
  inviting a hundred throwaway numbers would earn the full 25% for free. The
  `users.referred_by` link is cleared in the same transaction, which is what
  makes the credit once-per-invitee rather than once-per-order.
- **Stacking is accumulation into one coupon**, not a pile of 2% ones: the
  design shows a single "discount earned" figure, and the 25% cap is
  meaningless unless something adds up to be capped. A spent coupon starts
  again from 2%.
- A coupon is **claimed** when an order is created (a conditional update, so
  two simultaneous orders cannot both spend it), **returned** if that order is
  cancelled, and only *previewed* — never spent — by a basket quote.
- The discount applies to the **subtotal**, not the total: the service fee is
  the platform's, and a referral discount is a discount on food. It is rounded
  down, so rounding never costs the customer.

---

## 8. Rewards and coupons

- The profile stores: **reward points** (e.g. 340), **orders count** (28), **coupons** (3). **[from design]**
- Points accrual mechanic **[proposed]:** X points per paid order / % of amount; redeemed as a discount. Align rates with product.

### How this is implemented

- **Accrual only.** One point per 100֏ of order **subtotal**, credited when the
  order is paid. On the subtotal so the platform's own fee does not mint points.
- **Redemption is deliberately not implemented.** The design shows a balance but
  no redemption screen, and inventing a second rate would invent an economy
  nobody agreed to. Points accumulate and display; spending them needs a product
  decision (see DEVELOPMENT_GUIDE.md open questions).
- Awarding points and crediting a referrer happen **after** the payment has
  committed, and a failure in either is logged rather than raised — loyalty
  bookkeeping must never tell a customer their successful payment failed.

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
