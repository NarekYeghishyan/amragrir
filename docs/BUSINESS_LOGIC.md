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

- The restaurant declares supported services: `pickup`, `dinein`, `reserve` (`restaurants.services`). **[from design]** (e.g. Sunny Table: pre-order and booking; Greenhouse: a counter with tables, pre-order and walk-in seating).
- Dine-in **mode** is available only if the restaurant supports `reserve` — that mode *is* the booking, and it carries a `reservationId`.
- Pickup — released by **pickup code** at the express counter.

**The stored value and the name a guest reads are not the same word.** The mode
is `pickup` everywhere it is stored, sent or queried; every client *calls* it
**Pre-Order** (hy `Պատվիրել նախապես`, ru `Заказать заранее`), and its two
sub-modes read **Takeaway** (`take_away`) and **Eat at the Restaurant**
(`eat_in`). Renaming the label was deliberately not a rename of the value: the
database column, the `service` filter and every `POST /orders` body still carry
`pickup`, so nothing about this is a migration. Change the wording in
`packages/i18n` and it changes everywhere; there is no second copy.

### Two ways of seating somebody, and an address does one of them

A pre-order is the guest collecting the food themselves. What happens next is
either **Takeaway** — they leave with it, bagged — or **Eat at the Restaurant**:
they sit down with what they collected, plated. Which of those is on offer
follows from how this address gets somebody into a seat, and there are exactly
two ways:

- **`dinein` — the room seats whoever arrives.** A khorovats place with tables,
  a pizzeria, a bakery with a window seat. There is no table to hold and nothing
  to put a deposit on, so the guest pre-orders, **pays for the food exactly as
  any pre-order**, and eats it there off a plate instead of out of a bag. That
  order is a `pickup` order with `pickup_option = eat_in`; the only thing the
  sub-mode tells the kitchen is to plate rather than bag. **Both endings are
  real, and both buttons are live.**
- **`reserve` — the table is held in advance.** Eating in here is a date, a
  slot, a table and a deposit against the bill: the booking flow, in `dine_in`
  mode with a `reservationId`, not a checkbox on a pre-order. **Its pre-order is
  Takeaway and nothing else.**

**The two exclude each other.** Both mean "you can eat here" and they differ
only on what the guest does first, so declaring both would advertise two answers
to one question and leave the pre-order screen unable to say whether "Eat at the
Restaurant" means *press this* or *go and book*. An address that both holds
tables and seats walk-ins declares `reserve`: the booking is the stronger
promise, and a guest who has one is not helped by also being told they might get
lucky.

So:

- **Takeaway is what a pre-order *is*.** It needs no flag: every place offering
  a pre-order offers it, and there is no configuration in which it is off.
- **Eating in is declared, not derived.** It used to be offered wherever
  `reserve` was absent, which quietly assumed every place without bookings had
  somewhere to sit — a hatch on a street corner does not, and it was offering
  "Eat at the Restaurant" to people with nowhere to eat it. Having a dining room
  is a fact about a place, and facts about a place are declared. (There is still
  no `eat_in` *service*: `dinein` says the room exists, and the per-order choice
  lives in `orders.pickup_option`.)
- **Nothing requires anything.** A service can be switched off without taking
  another with it, which is what makes "we have stopped seating people" sayable.
- **The panel chooses rather than refuses.** Turning `dinein` on turns `reserve`
  off and the other way round (`toggleService`), so no switch is ever disabled.
  The rule is not softened by that: a `PATCH` body naming both is still refused
  with a 422.
- **The guest is shown the rule, not just its result.** At a booking restaurant
  the clients still draw "Eat at the Restaurant" beside Takeaway — dimmed,
  dashed, reading "only by booking a table" — and pressing it switches the
  basket to dine-in and opens the calendar. Hiding it would leave somebody to
  discover the rule by not finding it.

The whole of it:

| Declared | Dine-in mode | Pre-Order → Takeaway | Pre-Order → Eat at the Restaurant |
|---|---|---|---|
| `pickup` | ❌ | ✅ | ❌ — nowhere to sit |
| `pickup`, `dinein` | ❌ | ✅ | ✅ — paid as a pre-order, no deposit |
| `pickup`, `reserve` | ✅ | ✅ | → book a table |
| `dinein` | ❌ | ❌ | ✅ — nothing to carry out |
| `reserve` | ✅ | ❌ | ❌ |
| `dinein`, `reserve` | — | — | **refused: two ways of seating somebody** |

**Enforced in two places, from one rule.** `checkServices` in
`@amragrir/shared` (`service-offering.ts`) answers whether a set of services
describes a real place. `PATCH /restaurant/restaurants/{id}/services` and
`PATCH /restaurant/branches/{id}/services` both refuse one that does not with a
422; the back office reads the same function per row, and `toggleService` keeps
every click on a legal set. Neither restates the rule, so the panel cannot offer
what the API is about to refuse.

**A walk-in eat-in order carries no deposit and no table.** It is priced,
charged and tracked as the pre-order it is — `RESERVATION_DEPOSIT_AMD` belongs
to the booking flow, and there is no held table to secure. `orders.table_no` and
`orders.reservation_id` stay null, exactly as on a Takeaway order.

**`reserve` is what kind of place this is; `reservations_enabled` is whether it
is taking bookings this week.** The two are deliberately different questions. A
restaurant that has paused its bookings is still a restaurant — its pre-order
stays Takeaway only, and the dead button now leads to a calendar that says "not
taking bookings" rather than turning the place into one that seats walk-ins for
an afternoon. Pausing bookings is not a way to acquire a dining room; only
`dinein` says there is one.
 
**These are answered per branch.** `restaurants.services` is the **default**;
a branch that answers for itself (`services_overridden`) overrides it, and the
rules above then judge that one address — the branch with the dining room takes
bookings and hands out bags, whether or not the counter in the mall down the
road does. What a guest is offered, and what an order is validated against, is
always the branch's resolved set (`resolveBranchOffering`). The same is true of
`reservations_enabled`, which moved down with them because `reserve` is one of
them. See ROLES_AND_PERMISSIONS.md for who sets which level.

### What the guest chooses, and what the kitchen sees

The services above are what a restaurant *offers*. What one order *is* lands in
**`orders.pickup_option`**: `take_away` or `eat_in`, and **null exactly when the
order is dine-in** — a CHECK constraint holds it to that (DATABASE.md §5).

- **Nothing chosen means `take_away`.** Every pre-order restaurant hands food
  over, so the default is the ending that always exists — and a client that has
  never heard of the field still places the order it always placed.
- **`eat_in` is refused at a branch that takes bookings**, checked when the
  basket is priced *and* when the order is created. Not trusted from the basket:
  a basket outlives the page it was built on, and a branch can start taking
  bookings between choosing it and paying.
- **Refusal keys off `reserve`, not off `dinein`** — deliberately wider than
  what the screen *shows*. `pickupOptionsFor` wants the dining room declared
  before it offers to seat anybody, but a restaurant is created with an empty
  `services` and many never fill it in; refusing an order on the strength of a
  field nobody got round to would break orders those places have always taken.
  Showing less than is allowed is a screen being careful. Refusing more than is
  forbidden is a screen breaking orders.
- **A dine-in order may not carry one at all.** Food brought to a table it is
  already sitting at is neither taken away nor collected.
- **The clients offer the choice only when there are two of them.** `POST
  /cart/quote` answers with `pickupOptions`; one button is not a question. It
  also answers with `eatInRequiresBooking`, which is what keeps the second
  button on the screen — dead, pointing at the calendar — where there is only
  one ending to choose.
- **The kitchen is told.** The order board marks an eat-in order and nothing
  else — every other pickup order is take-away, so labelling all of them would
  bury the one that needs a plate rather than a bag. This is the whole point of
  recording it: the counter is too late to ask.

---

## 3. Table booking (Reservation)

### Every number here belongs to the restaurant (implemented)

The rules below used to be constants in `packages/shared`, identical for a wine
bar with four tables and a hall that seats a hundred, and changeable by nobody
but a deploy. They are now **defaults at the bottom of a three-level chain**:

```
platform constants  →  restaurant  →  branch
```

Each level answers field by field, and `NULL` means *inherit*. Not row by row:
a branch that overrides only its seating length goes on inheriting the chain's
deposit, and a chain that raises its deposit moves that branch with it.
Whole-row precedence would mean touching one field silently froze the other
seven at whatever they happened to be that day.

| Setting | Default | What it decides |
|---|---|---|
| `seatingMinutes` | 90 | How long one booking holds its table — why 19:00 and 19:30 collide |
| `slotMinutes` | 10 | Spacing of the times offered |
| `maxGuests` | 12 | Largest party one booking may ask for |
| `maxLeadDays` | 30 | How far ahead the calendar runs |
| `minLeadMinutes` | 60 | How close to the sitting a booking may still be made |
| `depositPerGuestAmd` | 2000 | The deposit, per guest |
| `freeCancelHours` | 2 | How far ahead cancelling still returns the deposit |
| `autoConfirm` | `true` | Whether a paid booking confirms itself |

**The resolution happens in exactly one function** — `resolveBookingPolicy` in
`@amragrir/shared` — asked by the availability calendar, by the endpoint that
accepts a booking, by the back office and by the tests. The functions in
`reservations/slots.ts` take the resolved policy as a **required** argument
rather than reading a constant: an optional parameter defaulting to the
platform's value would compile at every call site that forgot a branch's
policy, and the symptom — a calendar offering times the endpoint then refuses —
is the one thing that module exists to prevent.

Two of these are new rather than moved. `minLeadMinutes` had no previous
answer at all: a table could be claimed a minute before the guest walked in.
`autoConfirm` is `true` because by the time a booking exists the guest has had
money held and the server has already picked their table — `pending` would be a
status meaning "we have your money and have not said yes". A restaurant that
wants to read every booking first turns it off.

**`maxGuests` is a default, not a ceiling.** The platform's limit is 200, and it
guards against a slipped finger in a number field rather than against a business
decision. A branch that takes an event for a hundred raises its cap and enters
one `tables` row seating a hundred — a banquet hall. Seating a single party
across several tables is deliberately **not** supported: it would move
exclusivity off `UNIQUE (table_id, active_slot)` and onto a join table, which is
its own piece of work.

### Changing any of this, once bookings exist (implemented)

Every setting that **narrows** what a branch offers is checked against the
bookings already on the books before it is saved — removing a table, shrinking
one, moving the booking hours, marking a day shut. The save answers `409` with
the list; repeating it with `?force=true` goes through and **cancels nothing**.
Behind each of those bookings is a guest with plans and a deposit already taken,
so a person rings them; a panel that quietly undid them is not one worth having.

**A conflict is "we could not seat them", never "we would not sell that now".**
Getting that line wrong in the generous direction puts a warning on every save,
and a warning that is always there is a warning nobody reads. So a table that
has gone or shrunk below the party, and a day or an hour the branch would be
shut, are conflicts — while a booking that no longer lands on a narrowed slot
grid, sits past a shortened horizon, or exceeds a lowered party cap is not: the
table is still there, still big enough, on a day the branch is still open.

The policy numbers therefore produce **no** conflicts at all, and that follows
from the snapshots rather than from leniency: the seating, the deposit and the
cancellation window are frozen onto each booking, and the rest describe what is
offered next.

### When bookings are taken (implemented)

Three sources, most specific first — resolved by `bookingWindowFor`, the one
function both the calendar and the booking endpoint ask:

1. **A dated closure** (`branch_closures`) — a holiday, a private hire, a short
   day. The most specific thing anybody said, said about this exact date.
2. **`booking_hours`** — when tables may be *held*, for a kitchen that serves
   longer than it books.
3. **`open_hours`** — most kitchens book every hour they are open and should not
   have to restate their week to say so.

The fall-through only skips a level that said *nothing*: `booking_hours` marking
Monday closed closes Monday, rather than deferring to an `open_hours` that has
the kitchen working.

**A night may run past midnight.** A closing time at or before the opening one
is read onto the opening day's number line — 12:00–02:00 becomes minutes
720–1560 — so every piece of arithmetic downstream keeps working by ordinary
comparison. Before this, such a branch was offered **zero** bookable times and
nothing said why. It also means a booking's *service date* can differ from its
calendar date: 01:00 on Tuesday belongs to Monday's shift, and `serviceDateOf`
is what stops it being filed under the wrong day's sheet and gated against a
Tuesday the kitchen may be shut for. `00:00–00:00` reads as the whole day.

**The service date is written on the booking** (`reservations.service_date`),
not worked out again whenever the book is read. `assertBookable` already
resolves it to decide which hours the time is legal under, so the row records
the day it was accepted for. Reading it back any other way went wrong in the
one case the whole idea exists for: the staff book asked for `reserved_for`
between local midnight and local midnight, so the 00:30 party booked for
Tuesday night appeared on **Wednesday's** page — where the shift still working
at 00:30 never looked, and above a service that had not opened. Storing it also
keeps the answer stable: a branch that shortens its night next month changes
what it offers from then on, and does not move guests already in the book to a
different day.

### Rules **[proposed based on design]**

- The restaurant can **enable/disable** booking (`reservations_enabled`). **[from design: `reserve` field]**
- **Deposit:** `deposit = guests × depositPerGuest`, where `depositPerGuest` defaults to **2000֏** and is set per restaurant or per branch. **[from design]**
- The deposit is **fully credited** toward the final bill ("credited to bill"), it is **not** an extra fee. **[from design]**
- A booking cannot be made for a **past date/time** (past days are `disabled` in the calendar). **[from design]**
- A booking cannot be made **outside business hours** / when `open=false`. **[proposed]**
- Seats are **capacity-limited** — the booking passes an availability check. **[proposed]**
- Guest count: minimum 1; step ±1; suggested chips + stepper. The stepper stops at the **smaller** of the branch's `maxGuests` and its largest table, both of which come back on the availability answer rather than from a constant. **[from design]**
- Defaults: `guests = 2`, `reserveTime = '12:30'`. **[from design]**

### How a table is held (implemented)

- **A booking is a seating, not an instant.** It occupies the branch's
  `seatingMinutes` (90 by default), which is why 19:00 and 19:30 conflict on
  the same table. Slots are offered every `slotMinutes` (**10** since
  2026-08-08; it was 30), and the last one is a full seating before closing —
  offering 22:30 when the kitchen shuts at 23:00 sells a table nobody can use.
  - **Each booking is measured by the seating it was made under**, stored in
    `reservations.seating_minutes`. A branch that has since changed its seating
    has bookings of both lengths on the books, and measuring them against one
    number would either free a table that is still occupied or hold one that is
    not.
  - **The spacing is the grain of the offer, not the length of the booking.**
    Only the first number moved: a party still keeps the table 90 minutes, so
    19:00 and 19:10 collide exactly as 19:00 and 19:30 did. What changed is that
    somebody who wants 19:20 can now ask for it. A 10:00–23:00 day therefore
    offers about 70 starts where it offered 21.
  - **One generator, so the offer and the gate cannot drift.** `isSlotBoundary`
    decides whether a requested instant is legal by regenerating the day from
    `slotsFor` rather than by testing the minute against a copy of the spacing —
    which is why changing this number needed no change to `POST /reservations`.
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

**The terms travel with the booking, not with the branch.** Both `deposit_amd`
and `free_cancel_hours` are snapshotted onto the row when it is made, so a
restaurant that later raises its deposit or lengthens its cancellation window
has made an offer to whoever books next — never an edit to an agreement somebody
has already paid on.

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
- **A prep time of `0` is a declaration, not an unfilled column.** Some things
  are handed over rather than cooked — bottled water, a canned drink, a cake on
  the counter — and a basket holding only those is ready now. Beside food it
  changes nothing, because the estimate is the maximum. Only a dish that says
  nothing (`null`) reaches the fallbacks above.
- A requested `ready_at` earlier than that estimate is rejected; so is one more
  than `ORDER_MAX_LEAD_DAYS` ahead. A minute of slack is allowed for clock skew
  between the quote and the order.

### Ordering for later (pre-orders)

A customer either takes the earliest the kitchen can manage — the ordinary path,
unchanged — or picks a time: in an hour, this evening, next Tuesday. Picking one
makes it a **pre-order**, and four things follow from that.

**What is stored.** `orders.prep_min` is the estimate the order was scheduled
against (a snapshot, like the line prices); `orders.prep_start_at` is
`ready_at` less that estimate, the moment the kitchen has to begin; and
`orders.reminder_at` is when the branch is warned. The rules are one pure
function, `apps/api/src/orders/scheduling.ts`, shared by the basket quote and by
order creation so the two cannot disagree about which times are legal.

**What makes an order a pre-order is `reminder_at`, and nothing else.** The
reminder is `ready_at` less the notice below; for an order wanted as soon as
possible it lands in the past, so the column is null — there is nobody to warn
about an order the kitchen already has. An order is a pre-order exactly when
there is still time to warn somebody about it, so the column that schedules the
warning is also the flag for having been scheduled. This means a basket that
echoes back the `earliestReadyAt` a quote just gave it is *not* a pre-order,
which is the correct answer: that is "now", written as a timestamp.

**A pre-order must fall inside the branch's opening hours** (`open_hours`, read
by `apps/api/src/common/open-hours.ts`, defaulting to `DEFAULT_OPEN_HOURS`).
Checked only for a genuine pre-order: an order placed ten minutes before closing
whose food is ready five minutes after is an ordinary thing to sell, and gating
that on hours would refuse a customer standing in a shop that is open. What the
check exists to stop is a pickup booked for 04:00 next Sunday.
*Open in the branch admin: nothing yet writes `open_hours` — the default is the
live path. Until a branch can set its own, every branch is treated as open
10:00–23:00.*

**Paying for a pre-order confirms it.** `paid` means "waiting for the restaurant
to accept it", and that is only a question worth asking about work in front of
somebody: nobody presses Confirm on Monday for a Saturday order, and until
somebody did, the diner's screen would say the restaurant had not looked at it.
So the same transaction that takes the money moves the order to `confirmed`,
recorded in `order_events` with a **`system`** actor — a diner cannot accept an
order on a restaurant's behalf, and no member of staff was there. Ordinary
orders are untouched: they still wait on the Paid tab for a person.

**The branch is warned before it has to start.** `orders.reminder_lead_min` is
how many minutes before `ready_at` that happens, defaulting to
`defaultReminderLeadMin(prep_min)` — the prep estimate plus
`PREP_REMINDER_BUFFER_MIN`, because a notification arriving exactly when work
must begin is a deadline that has already passed, not a warning.

**A shift may move that notice**, between `REMINDER_LEAD_MIN_MINUTES` and
`REMINDER_LEAD_MAX_MINUTES` (`PATCH /restaurant/orders/{id}/reminder`,
`orders:advance`). The estimate is the slowest dish on the ticket and knows
nothing about the coals a skewer wants lighting first, so thirty minutes of
cooking can be forty-five minutes of notice. This is the **only** thing about a
placed order anybody may change, and it changes nothing the customer was
promised: `ready_at` stands, the price stands. Moving it recomputes
`reminder_at`, re-arms `reminder_sent_at` when the new moment is still ahead,
and writes a `reminder_set` entry to `order_events` naming who did it and what
the notice was before — the column is overwritten in place, so that entry is the
only record it ever moved. A lead longer than the time remaining is legal and
means "warn me now"; a terminal order and an order placed for as soon as
possible are both refused, the latter because it has no warning to move.

**An immediate order is announced the moment it is paid for**, as an
`order_placed` row for the branch. It is the one order that reached nobody
before: it stops at `paid` waiting for a human to accept it, while the diner
watches a screen saying the restaurant has not looked at their order yet, and it
appeared on the board silently — and a board is not something anybody watches,
which is the whole reason the bell exists for the other kind.

The trigger is `paid` and not `confirmed`: `confirmed` is the *answer* to this
notification, and announcing it would be telling a shift about a decision it had
just taken. A pre-order raises nothing here, because paying accepts one outright
— it is announced later, by the reminder below, when the work is in front of
somebody. The test is `reminder_at` alone, the same fact `payments.service.ts`
decides acceptance on, so the two can never disagree about what kind of order
this was.

**A booking speaks to both sides.** To the **branch**, a `pending` booking
raises `booking_placed` — the same rule as `order_placed`: somebody is waiting
on a human decision. A booking that confirmed itself raises nothing and simply
appears in the book.

To the **guest**, three of the six booking statuses earn a notification:
**`confirmed`, `cancelled`, `no_show`**. The three that do not:

- **`pending`** is the guest's own act; they are looking at the screen that says
  the restaurant is reading it.
- **`seated`** and **`completed`** happen with the guest in the room. Telling
  somebody they are sitting at their table is the clearest case of a
  notification nobody needs.

`no_show` is the uncomfortable one and it is sent deliberately: it is the status
that can keep a deposit, and finding that out silently on a card statement weeks
later is worse than being told.

**Who moved it matters as much as where it moved to.** The producer sits on the
staff path only, so a guest who cancels their own booking is not told what they
just did — the same rule that keeps `created` silent on an order.

**A guest is also reminded before the sitting**, `BOOKING_REMINDER_LEAD_MINUTES`
(three hours) ahead. Three hours rather than the evening before: a reminder the
previous day cannot serve a table booked this morning for tonight, and three
hours is still time to set off — or to cancel and free the table for somebody
else, which is the restaurant's interest in it too.

This one is a scheduled job rather than a producer, because it is the only thing
a guest is told that nobody *did*: every other booking notification has a mover
and a moment, and this has neither. It sends only for a `confirmed` booking — a
`pending` one may still be refused, and reminding somebody about a table that is
then turned down is worse than saying nothing — and **never for a sitting that
has already begun**, so a backlog after an outage cannot deliver "your table is
soon" at midnight.

**Nor for a guest who booked inside the window.** A table taken at five for
seven is already within its own lead when it is made, so the sweep would say
"your table is soon" a minute after somebody chose it — telling them what they
have just done, which is what `created` is kept silent on an order to avoid. The
test is where the booking was made relative to its own reminder point, not how
recently: a reminder is for somebody who booked far enough ahead to have
forgotten.

A reminder does not move the booking, so its row carries `reminder: true` beside
the unchanged status, and both clients read that marker *before* they look
anything up by status. Without it the bell would say "Your table is booked" to
somebody who booked it three weeks ago.

**The warning itself** is raised by the API's one scheduled job
(`OrderRemindersService`, every minute, Redis-locked so one instance sends),
which writes a `staff_notifications` row for the branch and announces it on the
socket. See DATABASE.md §8b.

**Telling the customer.** Every move an order makes is also announced to whoever
placed it, as a row in `notifications` (DATABASE.md §12) and a push on the same
socket — the bell in the web header and in the app. `CustomerNotificationsService`
subscribes to the order event stream rather than being called from the places
that move an order, so a fourth one is announced for free.

Six of the eight statuses earn a notification: **`confirmed`, `preparing`,
`almost_ready`, `ready`, `completed`, `cancelled`**. The two that do not:

- **`created`** — the customer is the one who just created it, and is looking at
  the screen that says so.
- **`paid`** — paying publishes `paid` and `confirmed` back to back from one
  transaction (both, so the socket sees an edge the state machine has), and
  announcing both would buzz a phone twice for one tap. `confirmed` is the half
  that carries news: the kitchen has the order.

A notification interrupts somebody, so it has to earn the interruption by
telling them something they could not already see.

**The customer's own switch decides whether anybody is interrupted.**
`users.notif_push` (Settings, on by default) is read on every order that moves,
in the same statement that writes the row. What it governs is **delivery, not
the record**: the `notifications` row is written either way, and the switch
decides whether the live frame goes out over the socket — and, once
`POST /devices` exists, whether an OS-level push goes with it.

The row survives a switched-off bell on purpose. A bell is two things at once —
a nudge now, and this order's history when somebody opens it later — and "do
not notify me" answers only the first. Dropping the write instead would mean a
customer who turns notifications back on finds a hole where the last fortnight
went, which is not what they asked for.

**Pre-orders stay off the live board until their hour comes.** The back office
splits every stage on `reminder_at` against the clock — never on
`reminder_sent_at`, so an order still reaches the board on time in a deployment
where the job is not running. The job announces; it does not gatekeep.
- **Countdown** after placing: starts at `480 seconds` (8:00 min) to readiness (demo value). **[from design]** In production `ready_at` is computed from the chosen time and current kitchen load.
- **Pickup code** generated per order — **six digits, and the order is not
  closed without it.** Every order gets one, `pickup` and `dine_in` alike: one
  rule rather than two, so nobody at a counter has to remember which kind of
  order asks for a code. A dine-in order additionally has its table number,
  which is where the food goes, not what proves it was collected.

  It is **`orders.pickup_code`** — generated in its own right and stored under
  its own unique constraint, **not derived from `orders.code`**. It used to be
  the order number's last four digits (`AMR-42774033` → `4033`), which meant
  the receipt gave it away; see DATABASE.md §7 for the whole argument and for
  the 1,000,000-order ceiling global uniqueness implies.

  **The counter never sees it.** No staff endpoint returns it — not the kitchen
  board, not the platform-admin customer screen, not a `prep_due` notification.
  It reaches the back office only by being typed into the handover dialog.
  Staff *can* search by it (`GET /restaurant/orders?q=`), matched whole, so a
  guest who remembers nothing else can be found.

- **`ready → completed` requires the pickup code.** It is the one transition
  that is not a statement about the kitchen: every other status says what the
  restaurant has done, and this one says the food left the counter in somebody's
  hands. `PATCH /restaurant/orders/{id}/status` refuses `completed` without a
  matching `pickupCode` (422, `details.reason = pickup_code_mismatch`), and the
  comparison is made in the API against `orders.pickup_code`.

  **There is no override.** A guest who cannot produce their code — a dead
  phone, a friend collecting — cannot have the order closed for them, and staff
  cannot wave it through. That was chosen deliberately over an escape hatch with
  an audit entry; if it proves too rigid at a real counter the fix is a
  permission-gated override recorded in `order_events`, not a way around the
  check.
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
- **Filters [from design, built 2026-08-10]:** price/person, max distance, min
  rating, dietary (Vegetarian/Vegan/Halal/Gluten-free), service
  (Pickup/Dine-in/Reserve). Active filters are counted in a badge — the **sort
  is not counted**, because every list is sorted somehow and a badge over a feed
  nobody had narrowed would be the control lying about itself.
- **Price per person is derived, not stored:** the average price of a branch's
  *available* dishes, times `SPEND_ITEMS_PER_PERSON` (**2** — a person orders a
  main and something with it). There is no per-person column, and adding one
  would mean keeping a denormalised figure in step with every menu edit. This is
  an approximation and is documented as one.
- **The multiplier is why the filter exists at all.** Without it the comparison
  was a per-person budget against *one dish's* average — a different quantity,
  dragged down by the drinks and the sides. Every branch on the platform sat
  between 1 480 and 3 900֏ by that measure while the design drew a slider from
  4 000 to 24 000, so the two ranges never overlapped: the control matched
  everything or nothing wherever it was put, and the sheet went unbuilt for a
  year because of it. The slider's ends now come from `SPEND_FILTER_MIN_AMD` /
  `SPEND_FILTER_MAX_AMD` in `packages/shared`, which the server reads too.
- **The top of the slider means "no limit", not its number.** A guest who moves
  it all the way is saying "anywhere", and sending the cap would quietly exclude
  anything above it — the same failure in a smaller form.
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
The seed points each one at a real picture hosted elsewhere — recipe photography
from TheMealDB and TheCocktailDB — falling back to a photograph of its category
where no picture of the dish itself could be found. Hotlinked rather than
downloaded: no images in the repository and no licences to carry, at the cost of
depending on somebody else's servers, which `MENU_PHOTOS=local` trades back for
the committed placeholders.

**Those two hosts only.** Wikimedia Commons was used and dropped: it answers 403
to a request whose `User-Agent` is a bare library name, which is what React
Native sends, so every Commons picture was blank in `apps/mobile` while the site
showed all of them. A new URL belongs in these tables only after it answers 200
to that agent.

**Every demo restaurant has a cover too**, on the same terms
(`prisma/restaurant-covers.ts`): a photograph of what that kitchen sends out, by
slug, falling back to one per cuisine and then to something plated for a cuisine
the table does not know. `restaurants.cover_url` is what the card, the
restaurant banner and the order thumbnail draw; it was null for every
restaurant, so all three showed their empty state. Seeding it is not the upload
feature: a restaurant sets its own cover through the back office
(`PATCH /restaurant/restaurants/{id}/cover`, `restaurant:write` — a
`restaurant_manager` may not, see ROLES_AND_PERMISSIONS.md), and that overwrites
a seeded photograph freely.

`pnpm --filter @amragrir/api db:photos` applies both tables to a database that
is already running. It rewrites a dish or a restaurant with no picture, or one
the seed put there, and **never** one a restaurant uploaded — that is the only
picture in the table anybody actually chose.

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

**And a third thing that is neither: `0`.** An empty box is the dish declining to
estimate; `0` is it estimating none, which is the honest answer for anything sold
as it stands. The panel accepts `0…480` minutes.

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
| Booking slot interval | 10 min | **confirmed 2026-08-08** (was 30, proposed) |
| Ready-time interval | 10 min | **confirmed 2026-08-08** (was 15) |
| Seating length | 90 min | proposed |
| Free cancellation window | 2 h | proposed |
| Max booking lead time | 30 days | proposed |
| Max party per booking | 12 | proposed |
| Default open hours (no `open_hours` set) | 10:00–23:00 | proposed |
| Max qty per dish | 20 | proposed |
| Max dishes per order | 50 | proposed |
| Max pre-order lead time | 7 days | proposed |
| Fallback prep time | 15 min | proposed |
| Pre-order warning buffer (added to the prep estimate) | 10 min | proposed |
| Warning notice a shift may set | 5 min – 24 h | proposed |
| Pickup code length | 6 digits | **confirmed 2026-08-08** (was 4, and derived from the order code) |

> Move all numeric business constants to config/settings, do not hardcode.
> They currently live in `packages/shared/src/constants.ts`; the ordering
> limits marked *proposed* have no design value behind them and should be
> confirmed with product before launch.
