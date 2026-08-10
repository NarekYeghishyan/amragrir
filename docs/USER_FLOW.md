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

**As built on the web** (`/[lang]/signin`, SCREENS.md §14c): the two branches
are a tab pair over **one** flow, not two. Sign-up asks for the name *before*
the code rather than as a "create profile" step after it, because
`verify-code` takes the name with the code and upgrades the guest account in
place — there is no second call to hang a third step off. The Apple/Google
branch is not built on either client: `POST /auth/social` does not exist.

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
Table booked (POST /reservations) — deposit authorised, table assigned
   ↓
Checkout → pay what is left after the deposit
   ↓
Reservation confirmed (Tracking: table #, time)
```

### 3a. A table and nothing else (web, 2026-08-07)

The flow above books a table **around a basket**, and until 2026-08-07 it was
the only one: the calendar lived on the checkout, which prices a basket, so
"Book a Table" stayed disabled until a dish was collected. `POST /reservations`
has never wanted an order, so that was a limit of the screens rather than of the
product — and a guest who wants a table for Saturday should not have to put a
burger in a basket to ask for one.

```
Restaurant (basket empty)
   ↓  "Book a Table" — posts the branch with it
Checkout — the same screen, order summary empty
   ↓  date & time, guests, deposit
   ↓  (sign-in if the phone is unverified)
POST /reservations — deposit authorised, table assigned
   ↓
"✓ Table booked", and "Order food ahead" → the restaurant's menu
   ↓
/reservations — the booking, and the button that gives it back
```

**One button and one screen, whatever is in the basket.** The press always lands
on `/checkout`; what differs is what the checkout can draw. With food it prices
a quote and offers the payment; with none it answers `booking` from `loadBasket`
and offers the booking alone. The branch travels with the press because an empty
basket names no restaurant, and without it the checkout would not know whose
table was being asked for.

### 3b. The same, on the phone (2026-08-10)

Booking on mobile existed **only** inside the pre-order funnel — basket, then
dine-in, then a slot — so the phone had the limit the web dropped in August, and
a second one on top of it: nothing on the phone ever listed a booking again.
`GET /reservations` and its cancel were in the client with nothing calling them.

```
Restaurant (nothing in the basket)
   ↓  "🪑 Book a table" — only where the restaurant declares `reserve`
      and has not paused bookings
/book/{branchId} — its own screen, the full RESERVATION_MAX_LEAD_DAYS horizon
   ↓  date, then a time (morning / afternoon / evening), guests, deposit
   ↓  "Book the table · {deposit}" — the choice above commits nothing
   ↓  (sign-in if the phone is unverified — asked before the money, not after)
POST /reservations — deposit authorised, table assigned
   ↓  replace, so back does not offer to book a second table
/booking/{id} — the table, and the button that gives it back
```

**Picking a time and booking are two presses (2026-08-10).** They were one: a
tap on a slot chip posted the reservation there and then, so a mis-tap in a grid
of seventy chips held a table and authorised a deposit, and there was no way to
change your mind short of cancelling a booking. The web has always worked the
other way round — pick, then submit — and so does the design. The same split now
runs the pre-order screen's footer, where "Book the table" used to be a *dead*
label on a disabled button naming the very thing it would not do.

**Its own screen rather than the checkout's, unlike the web.** The web reuses
the checkout because that is already where a booking's terms are settled; on the
phone the pre-order screen is a *basket* screen — quote, service mode, ready
time — and teaching it to render with no basket would have been more surface
than a second screen. What the two phone screens share is the calendar itself
(`BookingCalendar`), which is the part that must not diverge: it is one reading
of one availability answer.

**And the list.** `/bookings` from the profile, beside the order history —
upcoming and past, with the API deciding which is which.

**Adding food afterwards is a link, not a second flow** — "Order food ahead" in
the empty summary goes to the menu, and once a dish is in the basket the same
checkout prices the two together, with the deposit coming off that bill.

Cancelling is the same rule either way: free until `freeCancellationUntil`, and
after it the deposit is kept (`depositOutcomeFor` in `shared` — never an `if` on
a screen).

Rules: unavailable dates/slots are blocked; the deposit secures the table; the
deposit is credited toward the final bill.

**Three things this order gets right that are easy to get wrong.**

- **The deposit is the server's number, not `guests × rate` worked out on the
  client.** It arrives as `depositAmd` on availability and again on the quote.
  No screen in this repo does arithmetic on money (DEVELOPMENT_GUIDE.md).
- **Checkout charges `dueNowAmd`, not `totalAmd`.** The deposit was authorised
  when the table was booked; asking for the total again charges it twice.
- **The calendar here stops at the *order* horizon (7 days), not the booking one
  (30).** This path books a table for a basket, and a booking further out than
  an order can be scheduled would take a deposit for a meal the checkout then
  refuses. Booking a table with no food behind it is not bound by that.

---

## 4. Ordering food (Pickup / pre-order)

```
Menu (Restaurant)
   ↓  Add to cart (＋)
Basket (review items, ±)
   ↓  Choose time
Pre-order → "Pre-Order" mode (stored as `pickup`)
   ↓  where `dinein`: Takeaway / Eat at the Restaurant (both live, no deposit)
   ↓  where `reserve`: Takeaway only — "Eat at the Restaurant" is drawn
   ↓  dead and switches to Dine-in, where the table is booked
Food ready at (choose ready time — pickup only; dine-in takes the table's hour)
   ↓
Checkout (summary + payment method)
   ↓
Payment (Apple / Google / Card — online only)
   ↓  the charge goes through; the order can no longer be cancelled
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
User arrives → shows the code at the counter (or sits at table #)
   ↓
Staff scan or type it → API checks it → order is `completed`
   ↓
Done → Home
```

The active order is available from the **Orders** tab (card with timer → Tracking).

**The last step is the only thing that closes an order.** The back office cannot
mark one collected on its own: `ready → completed` carries the guest's six-digit
code, and the API compares it with `orders.pickup_code` before anything is
written (BUSINESS_LOGIC.md §5). No staff screen shows that code, so a counter
genuinely has to be told it — which is the point. The guest's screen carries it
as digits *and* as a scannable QR, so the ordinary case is one gesture rather
than six digits read aloud across a queue.

A guest who cannot show it — flat phone, a friend sent to collect — cannot have
the order closed today. There is no staff override. That is a deliberate choice
and the note in BUSINESS_LOGIC.md §5 says what would replace it if a real
counter proves it too rigid.

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

On the **web** the switch is in the header of every screen, not in Settings,
because there the language is part of the URL. Switching it is a move to *the
same page* in the other language — `/r/dolmama` → `/ru/r/dolmama`,
`/search?q=…` and the home filters kept — never a trip back to the home page.

```
any page, any language
   ↓ HY / RU / EN
same page, same query, other language
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

---

## 11. Staff onboarding (back office)

Everything above is the **customer** app. Staff are separate accounts with
their own flow, and there is no sign-up in it — an account exists only because
somebody who already had one invited it.

```
Platform admin → Platform tab → New restaurant (+ administrator email)
   ↓  (invitation email)
Restaurant admin → /accept-invite?token=… → set password → signed in
   ↓
Branches tab → Add a branch          (opens CLOSED — no menu yet)
   ↓
Menu tab → Add dishes                (hy name + price required)
   ↓
Branches tab → Open                  (now it accepts orders)
   ↓
People tab → Invite a manager / shift staff, scoped to that branch
```

The back office has three links **between** tabs, and they all run the other
way:

```
People tab → a person's role ("Jazzve · Arshakunyats")
   ↓  (click)
Restaurants tab → Jazzve, scrolled to Arshakunyats, its team already open
   ↓
that person's row in the team, marked and brought into view
```

```
Restaurants tab → Jazzve → Arshakunyats → Orders
   ↓  (click)
Orders tab → the queue, already narrowed to Jazzve · Arshakunyats
```

```
Orders tab → a card → a line of the order ("2× Խորոված")
   ↓  (click)
Menu tab → that branch's menu, scrolled to that dish, its row marked
```

A person's **Activity** adds three more, one per kind of thing an entry names:

```
People tab → a person → Activity → an entry's dish ("Խորոված")
   ↓  (click)
Menu tab → that branch's menu, scrolled to that dish
```

```
People tab → a person → Activity → an entry's order code ("ORD-7QK3")
   ↓  (click)
Orders tab → the board, narrowed to that one order, on the stage holding it
```

```
People tab → a person → Activity → where it happened ("Jazzve · Arshakunyats")
   ↓  (click)
Restaurants tab → Jazzve, that branch open
```

They are links in the ordinary sense: every back-office screen has its own
address, so the first jump is `/restaurants/:restaurantId/branches/:branchId
?role=:assignmentId`, the second is `/orders?restaurant=:id&branch=:id`, the
third is `/menu?branch=:branchId&dish=:menuItemId`, and an order in somebody's
activity adds `&order=:code` to the second.
Any of them can be copied out of the address bar, sent to somebody else,
bookmarked, or opened in a second tab, and lands whoever follows it in the same
place.
The full table of addresses is in `apps/admin/README.md`; the rules that matter
to the flow are:

- **The back button works.** Sidebar, restaurant, branch, role and the queue's
  scope are all in the URL, so a browser's back and forward move through the
  panel the way they move through any site, and a reload stays where somebody
  was rather than returning them to the order queue. The board's own pickers
  replace the address rather than adding to it, so back from a queue leaves for
  wherever somebody came from instead of walking them through every filter they
  touched on the way.
- **A link somebody cannot open lands somewhere real.** An address for a screen
  the account lacks the permission for — a platform dashboard sent to a branch
  manager, or a URL left over from a role since revoked — falls back to the
  first screen the account does have, rather than showing one where every
  request 403s.
- **A link opened signed-out survives the sign-in.** It goes to
  `/sign-in?next=…` and continues to the address afterwards, so a shared link
  works for somebody whose session had expired.

Every role names the restaurant it reaches, including a branch role's — a
branch name alone is ambiguous, since three restaurants have a "Northern Ave".
A role held over the whole restaurant opens it with no branch disclosed, and a
platform role is over no restaurant, so it is not a link at all.

The jump to a branch's **orders** carries both halves of the board's scope, not
just the branch. Two restaurants have a "Northern Ave", and the restaurant
picker sitting on "All restaurants" beside a branch picker naming one of them
reads as a board that has lost track of where it is pointed. It is offered only
to an account holding `orders:read` — every role that can see a branch holds it
today, and a button leading to a tab the sidebar does not show would be a dead
end the moment that stops being true.

The jump to a **dish** goes by the dish's id, not by the name printed on the
ticket. A line of an order keeps the name the dish had when it was ordered —
that is what the diner bought — so following the name would be a search for a
word the menu may no longer use. The row it lands on is marked and scrolled to
for the same reason the role above is: a menu is fifty rows of similar text,
and "it is in there somewhere" is not an answer to a link that knew which dish
it meant. Offered only to an account holding `menu:read`; for a shift without
it the line is plain text, exactly as a name in an order's history is without
`staff:read`.

The jump to an **order** carries the code rather than the id, because the board
finds an order by searching for its code — and because a code is what somebody
reads off the entry and then recognises on the card they land on. It is the order code and never the pickup code: the board is not sent that one
at all, and a link is a thing that gets pasted into a chat. The board then moves itself to the stage
holding that order, since a link was sent somewhere specific and landing on an
empty **Active** tab is landing next to the answer. Typing a code by hand is
different and still behaves as it did — you stay where you are, and the counts
on the tabs say which stage to look in.

Each of the three is offered only to an account that can open the screen it
leads to (`menu:read`, `orders:read`, `branch:read`); without it the entry reads
as the text it was. All three come with `staff:activity` today — the split
matters because that permission was written to be splittable.

The jump ends on the **role**, not on the branch. A team is a dozen rows, so
opening the right branch and stopping there leaves the same reading-down-a-list
the link was meant to replace, one level lower. What gets marked is the
assignment that was clicked rather than the person holding it: somebody who
manages two branches appears in two teams, and only one of them is the answer.
A role over the whole restaurant is marked among the admins in its About card
instead, which is the section that role is read in.

Two ordering constraints are real rather than conventional:

- **A restaurant with no branch cannot have a menu.** Dishes hang off a branch,
  so the branch comes first. This is why `POST /restaurant/branches` exists —
  before it, a restaurant created in the panel was a dead end.
- **A new branch opens closed.** It has no menu yet, and one that started
  accepting orders would be a kitchen selling nothing. Opening it is a
  deliberate second step on the Branches tab.

Password reset follows the same shape: `Forgot password` → email →
`/reset-password?token=…` → new password → **every other session is signed
out**, since whoever reset it may have done so because somebody else knows the
old one.

---

## 12. Ordering on the web

The same flow as §4 and §5, on `apps/web`. It is written separately because the
mechanics differ: there is no client state anywhere in it.

```
Restaurant (＋ per dish) → Basket → Checkout → [Sign in] → Order → Home
                                        ↑                     ↓
                                   dine-in only:          Orders list
                                   book a table
```

**Checkout is one screen.** Mode, pickup type, table booking, ready time and
payment are all on it, with the order summary sticky beside them — the refreshed
web artifact draws it that way, and `/preorder`, which used to be the first
half, now redirects there.

1. **＋ on a dish** posts to a Server Action. That first deliberate act is what
   creates the guest account — not the page view before it. A dish from a
   different restaurant does not join the basket; the basket page asks whether
   to start a new one, because two kitchens in one order is never allowed.
2. **Basket** re-prices through `POST /cart/quote` on every render. Quantity,
   removal and coupon are each a form post. The server's `canOrder` decides
   whether the flow may continue, so the web never offers a step the API will
   refuse.
3. **Checkout** picks Pickup or Table booking and a ready time. Switching away from
   dine-in drops any table booking, since a pickup order attached to a table is
   an order nobody is sitting for; switching *to* dine-in drops the pickup
   ending for the mirror-image reason, and coming back starts from take-away
   rather than a remembered choice the place may since have stopped offering.
   What a pre-order offers depends on how the place seats people
   (BUSINESS_LOGIC.md §2): where **`dinein`** is declared both **Takeaway / Eat
   at the Restaurant** are live and the food is paid for as an ordinary
   pre-order with no deposit, and where **`reserve`** is declared only Takeaway
   is — the second is still drawn, dead, and
   pressing it switches to Dine-in and opens the calendar, which is the only way
   to a seat there. The quote says which (`pickupOptions`,
   `eatInRequiresBooking`), so the screen cannot offer what the API would refuse.
   Dine-in must book first: date, guests and slot come from
   `GET /restaurants/{id}/availability`, and `POST /reservations` takes the
   deposit.
4. **Sign in** happens at the first step that needs a verified phone — booking a
   table, or paying. The guest's own token is presented to `verify-code`, so the
   account they already have is upgraded and the basket survives; without it the
   API would create a second account and orphan everything collected.
5. **Paying** is card-only on the web, and final: an order can be cancelled only
   while unpaid. `POST /orders` then `POST /payments`, both with an idempotency
   key derived from the basket, so a double-submitted form joins the first
   attempt rather than starting a second. The button sits in the summary column
   and owns the payment form by `form="…"`, so it is still one native POST.
6. **The order page** is both the confirmation and the tracker: the pickup code
   as digits and a scannable QR, status steps and a countdown, refreshing itself
   every ten seconds. The code has to survive a reload and still be there twenty
   minutes later at the counter, which is why this is a route and not a toast.

**Getting back to it.** `/profile` opens with whatever is still in flight —
every active order, above the history, each row a link into its tracker — so the
account screen answers "where is my food" before it answers "what did I eat".
Nothing is drawn there when nothing is cooking.

**Ordering it again.** `/profile` lists the last five past orders with a
**Reorder** button, which rebuilds the basket from that order's ids and
quantities and lands on `/cart` — priced from scratch by `POST /cart/quote`, so
a dish that has changed price or left the menu is caught there rather than
carried over. It replaces whatever was in the basket, by the same
one-restaurant-per-basket rule as step 1, and then the flow above continues
unchanged from step 2.

**Signing out** revokes the refresh token, then drops the session and the
basket. The basket goes because it belongs to the session that is ending;
leaving it would hand the next person at that browser the last one's order.

**Saying where you are** (the header's location control) is a preference, not a
step: it survives signing out, and the only thing it changes is what
`GET /restaurants` is asked — coordinates, so a card can say how far away it is
and the "near me" chip has something to sort by. The control opens a dialog over
a map where any point can be tapped, with address search and the browser's own
position on offer, and a ✕ on the badge that names the pending place for going
back to the whole city. **Nothing is stored until "confirm"**, so a point tried
and abandoned costs nothing; closing it — ✕, Escape or the scrim — leaves the
previous choice standing. Confirmed points are also kept in this browser's
`localStorage` and offered back at the top of the dialog next time.

This is the one preference **JavaScript is required for**: the district chips
that answered it without one were removed on 2026-08-06, and everything left in
the dialog needs a browser. It is off the ordering path — a visitor who never
answers browses the whole city and orders exactly as anyone else does; what they
lose is the distance on a card and the "near me" sort.

**Transition map:**

```
Restaurant → Basket → Checkout → Order
     ↑          ↑         ↓  (dine-in)  ↓
  order panel  Restaurant Reservation  Orders → Order
                          ↓
                       Sign in → back to wherever it was needed
```

Every arrow is a form post and a redirect, so all of it works with JavaScript
switched off.
