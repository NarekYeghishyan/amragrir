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
reads off the entry and then recognises on the card they land on. It is the full
code, not the four-digit pickup code a counter says out loud: that one is only
unique among a branch's *active* orders, so a link built from it would
eventually mean two different orders. The board then moves itself to the stage
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
Restaurant (＋ per dish) → Basket → Pre-order → [Sign in] → Checkout → Order → Home
                                        ↑                                  ↓
                                   dine-in only:                       Orders list
                                   book a table
```

1. **＋ on a dish** posts to a Server Action. That first deliberate act is what
   creates the guest account — not the page view before it. A dish from a
   different restaurant does not join the basket; the basket page asks whether
   to start a new one, because two kitchens in one order is never allowed.
2. **Basket** re-prices through `POST /cart/quote` on every render. Quantity,
   removal and coupon are each a form post. The server's `canOrder` decides
   whether the flow may continue, so the web never offers a step the API will
   refuse.
3. **Pre-order** picks Pickup or Dine-in and a ready time. Switching away from
   dine-in drops any table booking, since a pickup order attached to a table is
   an order nobody is sitting for. Dine-in must book first: date, guests and
   slot come from `GET /restaurants/{id}/availability`, and `POST /reservations`
   takes the deposit.
4. **Sign in** happens at the first step that needs a verified phone — booking a
   table, or paying. The guest's own token is presented to `verify-code`, so the
   account they already have is upgraded and the basket survives; without it the
   API would create a second account and orphan everything collected.
5. **Checkout** is card-only on the web, and paying is final: an order can be
   cancelled only while unpaid. `POST /orders` then `POST /payments`, both with
   an idempotency key derived from the basket, so a double-submitted form joins
   the first attempt rather than starting a second.
6. **The order page** is both the confirmation and the tracker: pickup code,
   status steps and a countdown, refreshing itself every ten seconds.

**Transition map:**

```
Restaurant → Basket → Pre-order → Checkout → Order
                ↑         ↓  (dine-in)         ↓
             Restaurant  Reservation        Orders → Order
                          ↓
                       Sign in → back to wherever it was needed
```

Every arrow is a form post and a redirect, so all of it works with JavaScript
switched off.
