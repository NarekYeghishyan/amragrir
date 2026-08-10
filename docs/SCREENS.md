# SCREENS.md

> Detailed description of every screen. Screens correspond to the `screen` state in the design. Navigation switches `screen` + active tab (`tab`). Screens with the bottom tab bar: `home`, `search`, `orders`, `favorites`, `profile`.

Field legend: **Purpose** · **User** · **Elements** · **Actions** · **Transitions** · **API data**.

## What is built on mobile (2026-08-10)

This file is the **specification**, transcribed from
`docs/design/Amragrir (mob).dc.html`. It describes screens whether or not they
exist yet, so the state of `apps/mobile` is recorded here rather than inferred
from it.

| Screen | State |
|---|---|
| Home, Restaurant, Auth, Basket, Checkout, Tracking | built and restyled to the artifact |
| Search, Orders, Favorites, Profile, Referral, Settings | built to the artifact |
| Pre-order | built (`apps/mobile/app/preorder.tsx`) — the reservations API is wired in |
| Filter sheet | built 2026-08-10 (`src/components/FilterSheet.tsx`) — the price question below is resolved |

**The artifact is fully ported.** Three screens beyond it were added on
2026-08-10, because the phone could take a booking and then never mention it
again — `GET /reservations` and its cancel had been in the client with nothing
calling either:

| Screen | State |
|---|---|
| Book a table alone (`app/book/[branchId].tsx`) | built — from a button on the restaurant page, with no basket |
| My bookings (`app/bookings.tsx`) | built — upcoming and past, from the profile |
| One booking (`app/booking/[id].tsx`) | built — the deposit's fate, and the button that gives the table back |

They are the phone's answer to the web's `/reservations` pair (§ web table
below) and are not in the artifact, which drew booking only as a step inside
pre-order. See USER_FLOW.md §3b.

The five-tab bar is built (`apps/mobile/app/(tabs)/`) and carries exactly the
five screens named above: home, search, orders, favorites, profile.

**Two things this file specifies that the backend does not support**, and which
are therefore not built (a third — the profile's counters — turned out to be
supported; see below):

- **`POST /auth/social`** (§0) does not exist. Customer identity is phone + OTP
  only, so the Apple and Google buttons the mobile artifact draws have nothing
  to call and are not built on either client. The **Login / Sign up switch is
  built on the web** (§14c) — it costs nothing, because `verify-code` takes an
  optional name and upgrades a guest in place, so the tabs choose whether the
  name field shows rather than which endpoint runs.
- **`GET /search/popular`** (§2) does not exist. The six popular tags are
  editorial content in `packages/i18n` (`popular1`…`popular6`) until it does.
- ~~**Reward points, order count and coupon count** (§10) have no endpoint.~~
  **Wrong, and corrected 2026-08-10.** `GET /me` has returned `rewardPoints`,
  `ordersCount` and `couponsCount` all along — the web profile has been drawing
  them from it — and the phone simply never called the endpoint. The three
  tiles are now real on both clients. The artifact's 340/28/3 were only ever
  mock values.

The question that **blocked the filter sheet is resolved** (2026-08-10). The
sheet specifies price per person while the API filtered on a branch's average
menu-item price — a different quantity, 1 480–3 900֏ across seeded data, which
never met the artifact's 4 000–24 000 slider. The API was measuring the wrong
thing: spend is now `AVG(price_amd) × SPEND_ITEMS_PER_PERSON` (2 — a main and
something with it), and both ends of the slider come from `packages/shared`
rather than from the artifact's hardcoded pair, so a client cannot draw a range
the server has never heard of. See BUSINESS_LOGIC.md §"Catalog".

The sheet offers the artifact's six sections — sort, price, distance, rating,
dietary, service. `openNow` exists in the DTO and is deliberately left out: the
artifact does not draw it, and "serving right now" on a screen for ordering
*ahead* answers a question nobody arrived with.

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
**Actions:** open search; pick a category; open filters; open a restaurant; **save one (the card's ❤)**; toggle theme; change location.
**Transitions:** search bar / See all → Search; category → Home (filtered by category); card → Restaurant; FAB → Filter sheet; ❤ as a guest → Auth.
**API:** `GET /restaurants?lat&lng&sort&filters` (nearby list), `GET /categories`, `GET /favorites` (which hearts are filled), `POST /favorites` / `DELETE /favorites/{restaurantId}`, user geolocation/address. Card fields: name, rating, reviews, cuisine, price level, distance, prepMin, open/closed, services[], photo, and both ids — `id` is the branch, `restaurantId` the business the heart saves.

**The bell sits beside the greeting**, badged with the unread count, and opens
§15. It draws nothing for a guest — there is no order to be told about, and the
API refuses both the list and the subscription for one. The count is fetched on
focus (which catches everything that happened while the app was backgrounded,
where a socket alone would miss it) and kept true while the app is open by the
`watchMe` subscription on the order socket.

**The heart fills before the request lands** and goes back on a refusal — a
one-bit change the server accepts for any signed-in account, and one that reads
as broken if it waits a round trip. Favourites belong to an account
(ROLES_AND_PERMISSIONS.md §1), so a guest's hearts are all hollow and pressing
one opens Auth. The set is refetched on focus, because the Favorites tab can
remove a restaurant while this feed is off screen.

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
- **Adding a dish does not reload the screen (web, 2026-08-08).** Nothing the server renders here depends on the basket — that is what keeps the page pre-rendered — so the `＋` and the order panel's steppers write through Server Actions that neither revalidate nor redirect, and hand back the priced basket. Only the panel and the header count change; the menu is not re-rendered and the scroll does not move. **The quantity moves at once, the money waits** for `POST /cart/quote` and is dimmed until it arrives — no amount is ever computed on the client (BUSINESS_LOGIC.md §money). The `＋` shows a tick for a moment, since with no page rebuild there is nothing else to confirm the press. Without JavaScript the same buttons post the same forms and the screen reloads as before.
**Transitions:** back → Home; View basket → Basket; ❤ as a guest → Auth/`/signin`.
**API:** `GET /restaurants/{id}` (profile), `GET /restaurants/{id}/menu?category=` (items with price, kcal, prep, photo, dietary tags), `GET /favorites` (whether the heart is filled), `POST /favorites` / `DELETE /favorites/{restaurantId}`.

**The heart is built on both clients since 2026-08-09** — the artifact's second
glass circle, opposite the back button. It saves the **restaurant**, so it uses
the detail's `restaurantId`, never the route's `{id}`: that parameter is
whatever the previous screen happened to hold (a slug, a branch id or a
restaurant id), and only the loaded detail knows which business it resolved to.

**On the web it is drawn in the browser, like the order panel beside it.** This
page is pre-rendered at build time in all three languages — the one thing it
exists to be — and reading the session here to decide whether one glyph is
filled would opt every one of those pages into rendering per request. So the
heart ships hollow in the HTML on disk and asks `GET /[lang]/saved?restaurant=`
what it should be once it mounts, exactly as the panel asks `/[lang]/basket`.
It is still a `<form>` posting `toggleFavorite`, so a scriptless visitor can
still save from here; what they cannot do is *un*-save, because a page that
cannot know the state cannot offer the other direction. `/favorites` is where
that exists for them, and it renders per request. The press alone posts
`revalidate=0`: nothing this page renders depends on the answer, so revalidating
would evict a pre-rendered page to change nothing on it.

---

## 4. Basket

**Purpose:** review and edit the order before choosing a time.
**User:** having collected items.
**Elements:** back + title + restaurant name; restaurant banner (photo, rating, meta, prep, distance); item list (photo, name, price each, total, ± stepper); "＋ Add more items"; summary (Subtotal, Service, Total); sticky "Choose time · total" CTA. Empty state: 🧺 icon + title + description + "Browse restaurants". **Unpriceable state** (web): the same shape, with "Start a new basket" — what a basket naming a branch or a booking that has gone gets instead of an error page.
- **The banner is a `BranchCard` on the web (2026-08-08), and it replaces the back button.** The web had never drawn the banner this file asks for: the restaurant was a name in a back chip and the same name again in a grey subline, which is enough to recognise a restaurant and not enough to *check* one — nothing on the screen said which address the food was being collected from or whether the kitchen was open. The card says all of it and is still the route back to the menu, so the chip above it would have been a second link to the same page.
- **It names the branch**, fetched by branch id rather than by the basket's slug: `dolmama` is two kitchens on two streets and a slug always resolves to one of them, so an address taken from the slug can be the wrong street. Its prep time is the **quote's**, which prices the dishes actually collected, not the branch's general figure.
- **The title's subline is the basket, not the restaurant** — the dish count and the service mode (Pre-Order / Table booking). The restaurant has the card to itself.
- **The card carries a heart (2026-08-09), and the checkout's copy of it does not.** Same component, one optional prop. The basket is a screen somebody is still browsing from and the card is the route back to the menu, so saving the restaurant belongs here; the checkout is where money is committed, and a control that writes to the account beside the button that charges the card does not. It is a flex item between the rating and the chevron rather than a disc on glass — this card is a row, not a photograph.
**Actions:** change quantity (±); add more; go back (the restaurant card); **save the restaurant (❤)**; proceed to time selection.
- **On the Basket screen a change re-renders the page — it no longer reloads it** (2026-08-08). This screen *is* rendered from the basket, so unlike the restaurant screen (§ 3), whose live writes skip the rebuild altogether, the rebuild here *is* the answer: the list, the line totals, the summary and the CTA all come from the render a change invalidates. What went is the `redirect` after it. Redirecting to the page you are already on is a navigation, so pressing `＋` threw the tree away, blanked the screen for as long as `POST /cart/quote` took and put the viewport back at the top — every time somebody wanted one more of something. `changeLineQtyInPlace` and `removeLineInPlace` write and revalidate without it, so React patches only what differs.
- **The quantity moves on the frame it is pressed; no amount does.** The line total, the discount, the fee and the total are the server's answer to a basket that just changed, and this client computes no money — they stay last second's under `.settling` until the quote lands. The stepper and the ✕ are still `<form>`s posting the redirecting actions underneath, so a browser with JavaScript off behaves exactly as it did.
**Transitions:** back → Restaurant; Add more → Restaurant; Choose time → Pre-order; Browse (empty) → Home; ❤ as a guest → `/signin`.
**API:** client-side basket (or `GET/PATCH /cart`); compute `subtotal`, `serviceFee`, `total`. Basket tied to a single `restaurant_id`. The heart reads `GET /favorites` in the page's own batch and writes `POST`/`DELETE /favorites`.

---

## 5. Pre-order (When & how)

**Purpose:** choose mode (Pre-Order/Table booking), time and booking parameters.
**User:** ready to place the order.
**Elements:**
- Title "When & how", subline (restaurant · prep time).
- Mode select: **Pre-Order** (Grab & go at counter) / **Table booking** (a table held for you, deposit off the bill). Both names are labels, not stored values: the modes are `pickup` and `dine_in` (BUSINESS_LOGIC.md §2). **"Table booking" is the mode, not the `dinein` service** — that service is walk-in seating and cannot be declared beside `reserve`, so the two must not be given the same name in the UI.
  - **Table booking is drawn only where a table can actually be booked** (`reservationsEnabled` on the quote — `reserve` declared *and* bookings not paused; 2026-08-07). It used to be drawn unconditionally, so a restaurant that takes no bookings offered a tile whose only destination was the "This restaurant does not take bookings" notice — a door painted on a wall. **The row stays and draws the lone "Pre-Order" tile**, which is what the artifact does — `fulfillModes` maps `modeKeys` with no minimum. A single tile stops being a question and becomes a label naming the kind of order being placed; dropping the row left the screen opening on "Pickup type" with nothing above it saying what was being picked up.
  - **A basket that is already `dine_in` keeps the tile** even where the answer is no, because bookings can be paused mid-checkout and that basket needs a way back — the row stays, and the notice explains why the block below is empty. This is the only case where the notice is still reachable.
  - **Pressing a tile no longer redraws the page (web, 2026-08-08.)** It used to post and redirect to the screen it was already on, which is a navigation: the router threw away the tree and built a new one, so the whole checkout blinked and the viewport jumped while the API re-priced the basket. Since this tile changes more of the screen than any other control on it — a calendar, a deposit, a set of totals and the CTA all appear or go — it was also the one where that was felt worst. The press is intercepted instead (`ModeSwitch`, COMPONENTS.md), the tile moves on the frame it is pressed, and React swaps only the parts that differ; scroll position is kept. **The tile is still a submit button in a real `<form>`** posting the same action, so with JavaScript off it posts, redirects and redraws exactly as it always did — verified with script execution disabled at the browser.
  - **Only the tile is optimistic.** Everything the mode *implies* — whether a table can be had, the deposit, the totals, which CTA — is the server's answer, and this client neither prices baskets nor allocates tables. So that half of the screen is dimmed and sealed (`.settling` + `pointer-events: none`) until the real answer lands, rather than guessed at and corrected a moment later. The booking block animates in when it arrives (`.rise`), which is the only thing left to mark the moment now that the page does not reload; opted out of under `prefers-reduced-motion`.
- **Under Pre-Order:** **Takeaway** / **Eat at the Restaurant** — a second, smaller pair, indented so it reads as a choice *inside* the pre-order rather than a second question of equal weight. Absent for Dine-in entirely, and on both clients it lives on this screen (it used to sit on the Basket in the mobile app, a screen away from the calendar it now points at). What it draws depends on the kind of place, per BUSINESS_LOGIC.md §2:
  - **Where `dinein` is declared** (a room that seats walk-ins) both are live, drawn from `pickupOptions` on the quote. The choice is real: the kitchen plates one and bags the other, and either way the guest pays for the food as an ordinary pre-order — no deposit, no table held. Pressing one is intercepted like the mode above it (web, 2026-08-08) — but it carries its **own** pending state, and dims only this row: the press moves a tick, and dimming the payment section to answer "bag it or plate it" would be the screen shouting about a small thing.
  - **Where neither is declared** (a hatch with nowhere to sit) `pickupOptions` holds take-away alone, and **that one ending is drawn on its own** — ticked, since there is nothing else it could be. The artifact hides the section here (`subKeys.length > 1`) and the web did too until 2026-08-07; the cost was that the screen went from the mode straight to the clock, leaving *what happens to this food* answered nowhere, which is the one thing this block exists to say. A restaurant that has declared **nothing at all** still draws none, because `pickupOptions` is then empty and there is no ending to name.
  - **Where `reserve` is declared** (tables are booked) `pickupOptions` holds take-away alone, and `eatInRequiresBooking` is true — so **Eat at the Restaurant** is still drawn beside it, dimmed and dashed, reading "Only by booking a table". Pressing it selects nothing: it switches the basket to **Dine-in**, which opens the booking block below. It therefore travels the *mode* path, not the ending one — same interception, same settling (2026-08-08). Hiding it would leave the guest to discover the rule by not finding it. **Unless bookings are paused** — `eatInRequiresBooking` is the declaration and stays true through a pause, so this door is gated on `reservationsEnabled` as well; both entrances to the calendar close together, or this one reopens the dead end the mode tile was hidden to avoid.
  - All three fields come from the quote rather than from `services`, so the screen and the API cannot disagree — and `reservationsEnabled` could not be derived from `services` at all, since the pause switch is not in there.
- **For Dine-in** (block appears): month calendar (Monday-first, prev/next month, days past or beyond the horizon drawn but `disabled`), "Reservation time" slot grid, "Guests" **stepper** (`−` / count / `+`, on both clients since 2026-08-07 — the web drew a chip per seat until then), "Table deposit" card (`depositAmd` from the server, the party it covers, "credited to bill" note, info note), and a "table booked" line once one is held. **The web draws this calendar and this grid too, since 2026-08-08** — it drew one "Date & time" field instead until then, and the trade that cost is recorded (now reversed) in the table at the foot of this file. Both clients share `monthGrid` from `@amragrir/shared`; the web reads a day's slots through its own `GET /[lang]/availability` route handler, and keeps the native field as the no-JavaScript path.
- **Pickup only:** "Food ready at" time slot grid. A dine-in basket does not get one — see below. **The web draws it on both**, because the web artifact does; the rule below says it should not, and the two have not been reconciled — see the note under it.
- "⚡ ready summary" panel + kitchen note.
- sticky CTA: "Book the table" while dine-in has none, otherwise "Continue to checkout · **`dueNowAmd`**".
**Actions:** pick Pre-Order/Table booking; pick the pre-order ending (Takeaway / Eat at the Restaurant) where there is a dining room, or press the dead "Eat at the Restaurant" to switch to Table booking where tables are booked; page months; pick booking date/time; change guest count; pick ready time (pre-order); continue.
**Transitions:** back → Basket; Continue → Checkout.
**API:** `GET /restaurants/{id}/availability?date=&guests=` — slots, `maxSeats`
and `depositAmd` in one call — then `POST /reservations` when a time is tapped,
and `POST /cart/quote` again afterwards, because a held deposit changes what is
left to pay.

**Two corrections to what this section used to claim.** `GET
/restaurants/{id}/tables` exists but the screen does not call it: availability
already answers the only question the picker has — the largest party any single
table seats — and a second call would be a second chance to disagree. And the
deposit is **not** `guests × depositPerGuest` computed on the client; it arrives
as `depositAmd`, sized by the server for the party. The screen prints it and
says how many guests it covers, and does no arithmetic on money at all
(DEVELOPMENT_GUIDE.md).

**The party size is the question, not a filter on the answer.** Availability is
asked per guest count — "19:00 is free" means nothing without knowing whether it
is free for two or for eight — so changing the stepper refetches the day. A
party larger than any table comes back with **no slots and a `maxSeats`**, which
is why the stepper stops there rather than letting somebody ask for a table that
does not exist.

**Booking is where dine-in can fail.** A slot can be taken between drawing the
grid and tapping it; the screen shows the server's refusal and redraws the day
rather than leaving a dead time on offer. Until a table is held, the CTA reads
"Book the table" and is disabled — dine-in without a reservation is the one
combination `POST /orders` refuses outright, so it is blocked here rather than
at the payment.

**Dine-in has no "Food ready at" grid, because the table already answered it.**
Booking a slot sets the order's `readyAt` to the booked instant; `POST /orders`
accepts it and starts the kitchen a prep-time before, so a table at 19:30
tomorrow is served at 19:30 tomorrow instead of cooked tonight. Asking twice
would let somebody order food for 15:00 and a table for 19:30. Switching mode
therefore clears the chosen time as well as the booking: the value means a
different thing on each side.

> **The web does not follow this rule, and has not since the checkout became
> one page.** The web artifact draws "Ready at" outside its dine-in block, so
> the field renders in both modes there — and a dine-in basket can therefore
> carry a table at 19:30 tomorrow and a `readyAt` of this afternoon, which
> `POST /orders` accepts because both are inside its own limits. The 2026-08-07
> pass that replaced the web's pills with the artifact's clock field left this
> exactly as it found it rather than deciding it in passing: which of the two
> artifacts is right here is a product question. **Open.**

**The calendar stops at the *order* horizon, not the booking one.** Bookings are
taken `RESERVATION_MAX_LEAD_DAYS` (30) ahead and orders only `ORDER_MAX_LEAD_DAYS`
(7) — and this screen books a table *for a basket*, so the table always carries
food. Verified against the running API: a table booked ten days out is created
happily, deposit authorised, and the order for it is then refused with *"Orders
can be scheduled at most 7 days ahead"*. Offering day eight here would take a
deposit for a meal the next screen cannot sell, so the shorter limit wins. The
standalone reservations flow, which books a table with no basket behind it, is
not bound by this.

**Which "Food ready at" times are offered** (pickup)**.** The earliest is `earliestReadyAt`
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
**Elements:** back + title; item summary (qty, name, amount); Subtotal + Service; "Ready at" block (the chosen time, or ⚡ and the prep estimate when it was left as soon as possible), the booked table where there is one, for dine-in — Table deposit + credit note; "Payment" section (Apple Pay, Google Pay, Credit Card — with radio dot); a line saying that paying places the order and cannot be undone; sticky "Pay · **`dueNowAmd`**" CTA.
- **The restaurant is a `BranchCard` on the web (2026-08-08), the same one the Basket draws.** This screen said *less* about the restaurant than the screen before it — a name and a prep time in one grey subline, the exact shape the basket had already replaced — and it is the screen where the money is committed. Nothing on it named the address the food was being collected from or said whether the kitchen was still open, so checking either meant going back a screen before paying. Fetched by **branch id**, for the reason given in §4: a slug resolves to one branch of a restaurant that may have several, and an address taken from it can be the wrong street.
- **The subline is the order, not the restaurant** — dish count and service mode, as on the Basket. The name was in that grey line and is now in the card directly under it; saying it twice is the duplication §4 had cleaned out of the same spot. **If the card cannot be fetched the subline takes the name back**, because it is then the only thing naming the place being paid: the fetch is an ordinary cached catalogue GET wrapped in a `catch`, and a screen holding somebody's payment must not fail because the catalogue did.
- **The booking-only variant draws it too**, with no prep tag — there is no quote to time, and the branch's general figure would promise a wait for food nobody has ordered. There it **replaces the back chip**, which named this restaurant and led to this same menu; the card says it, shows it and still goes there. The priced page keeps its back chip, which goes to the Basket — a different screen. That variant also stopped resolving the restaurant **by slug**: it was drawn under whichever branch the slug happened to name, which was invisible while the screen printed only a name (every branch of `dolmama` is called Dolmama) and stops being invisible the moment a street is printed.
**Actions:** pick payment method; back; open the restaurant (the card); pay.
**Note:** the design's fourth method, *Cash at the counter*, and its "Place
order" variant of the CTA are gone — every order is paid for online before the
kitchen receives it (BUSINESS_LOGIC.md §5).

**The CTA charges `dueNowAmd`, never `totalAmd`.** A table deposit is authorised
when the table is booked and credited against the bill, so the two differ by
exactly that deposit — a real quote from the seeded data reads `totalAmd 11360`,
`depositAmd 4000`, `dueNowAmd 7360`. Showing the total here would ask a diner
for money already held. The server does the subtraction; the screen prints it.
**Transitions:** back → Pre-order; Place order → Tracking (`placed:true`, `secondsLeft:480`).
**API:** `POST /orders` (create), `POST /payments` (process), `GET /payment-methods`. Response contains `order_id`, `pickup_code`, `ready_at`, status.

---

## 7. Order Tracking

**Purpose:** show progress and the pickup code.
**User:** having placed an order.
**Elements:** "Order confirmed" + restaurant name + animated checkmark; ring progress with "Ready in mm:ss" timer (start 480s = 8 min) + "arrives HH:MM"; status steps (Confirmed → Preparing → Almost ready → Ready); pickup-code card — the six digits **and a real scannable QR of them** — plus the instruction ("Show this at the counter" / for dine-in — "table #12"); "Done" button.

**The code on this card is what closes the order.** The counter cannot mark an
order collected without being told it (BUSINESS_LOGIC.md §5), and no staff
screen shows it — so this card is the only place it exists for the person
holding it. It is a QR as well as digits because the counter now *types* the
code: six digits read off a stranger's phone at a queue is where the wrong order
gets handed over, and a wedge scanner reads this in one gesture. The plate is
white with dark modules in both themes, because that choice belongs to the
scanner rather than to the reader's theme.
**Actions:** wait for readiness; return home.
**Transitions:** Done → Home. (From Orders you can return to Tracking via the active order.)
**API:** `GET /orders/{id}` + realtime (WebSocket/polling) of status and `ready_at`. Fields: status, seconds_left/ready_at, scheduled, pickup_code, table_no. The realtime payload deliberately carries **only** the status and the clock — never the code — so a socket frame is not a second copy of it.
**The screen follows the kitchen without being reloaded.** The four steps are
moved by somebody in the back office, and both clients hear about it while the
screen is open — the socket on mobile, a five-second read of
`GET /orders/{id}` on the web (through a route handler, because the session is
an httpOnly cookie). Only the steps and the timer repaint; nothing else on the
screen moves, and the new step is announced for a reader who cannot see it.

**The timer moves every second; the status does not have to.** `secondsLeft`
comes from the server and the screen counts on from it locally between updates.
Counting is display only: whatever the server next says replaces it — including
a `readyAt` the kitchen moved — and a client that cannot count (no JavaScript on
the web) simply shows the value it was sent.
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
**Actions:** open active order (→ Tracking); open a past order (→ Tracking);
reorder a past order.
**Transitions:** active card → Tracking; past row → Tracking; Reorder → Basket,
prefilled.
**API:** `GET /orders?status=active`, `GET /orders?status=past`, and
`GET /orders/{id}` for the reorder — **not** `POST /orders/{id}/reorder`, which
is unimplemented and unwanted: a basket is per-device state, so reordering
copies ids and quantities into a fresh one and lets `POST /cart/quote` price it
(API_DOCUMENTATION.md). Built on the phone 2026-08-10; until then the button
said "Reorder" and opened Tracking.

---

## 9. Favorites

**Purpose:** quick access to saved restaurants.
**User:** on the Favorites tab.
**Elements:** title; card list (photo, name, meta, ⏱ prep, ★ rating, filled ❤).
**Actions:** open a restaurant; remove it.
**Transitions:** card → Restaurant.
**API:** `GET /favorites`, `DELETE /favorites/{restaurantId}`.

**The heart here is always filled,** because everything on this screen is saved —
so its one job is to give the restaurant back. The row leaves the list on the
press rather than on the answer, and returns if the call is refused. The list is
refetched on focus, since the hearts that *add* to it live on the other screens.

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
**Elements:** bottom sheet: Sort by (Recommended/Nearest/Fastest/Top rated), Price per person (range 4000–24000֏), Max distance (range 0.5–5 km), Minimum rating (Any/★ options), Dietary (Vegetarian, Vegan, Halal, Gluten-free), Service (Pre-Order, Eat at the Restaurant, Table booking — the `pickup`/`dinein`/`reserve` declarations), Reset / "Show N results" buttons.
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
| Basket | client state | httpOnly cookie of ids + quantities; re-priced by `POST /cart/quote` on every render. A basket the API **refuses** to price — a withdrawn branch, a cancelled table booking, both `404` — renders a "start a new basket" state on `/cart` rather than an error page: the cookie is httpOnly, so that screen is the only place it can be cleared from. `5xx` still throws, because the API breaking is not the basket going out of date |
| Checkout | screen | **one page**: mode, pickup type, timing, table booking and payment on the left, the order summary sticky on the right. `/preorder` was merged into it and now redirects there |
| Booking a table alone | not built | **The same `/[lang]/checkout` (2026-08-07)**, with the order summary empty. "Book a Table" on a restaurant page works with **nothing in the basket** — it used to be drawn and `disabled` until a dish was collected, because the checkout prices a basket and `POST /cart/quote` refuses one with no lines. The reason was technical, not real: `POST /reservations` has never wanted an order, so a guest booking for Saturday had to put food in a basket to ask. The button now sends the branch along, `chooseServiceMode` opens a basket with no lines against it, and `loadBasket` answers **`booking`** — a new kind carrying no quote. The checkout draws the calendar, the guest stepper and the deposit exactly as it does with food; what disappears is everything a quote fed: the lines, the totals, the payment methods and the ready-time field. In "Your order" the empty basket says so, with **"Order food ahead" linking to the restaurant** and "Book the table" below it. **It was briefly a page of its own** (`/book/{slug}`) and that was wrong: this is still the screen where you settle when you are coming and what it costs, and splitting it left two places that had to agree about the calendar |
| My bookings | not built | **`/[lang]/reservations` and `/reservations/{id}` (2026-08-07).** Upcoming and past, split by the API (`status=upcoming\|past`) rather than by reading a status here, so this screen and the back office cannot disagree about whether a booking is over. The detail names the party, the table, the deposit's fate and whether the booking carries an order (`reservationAlone` when it does not), and cancels while `isReservationCancellable`. **The deposit line reports, it does not compute** — `depositCredited` and the status arrive settled by `depositOutcomeFor`. Built with the screen above, because without it a table booked on its own could never be looked at or given back: `GET /reservations` and `POST /reservations/{id}/cancel` had existed all along with nothing on the web calling either |
| Confirmation | toast over the placing screen | `/[lang]/orders/{id}` — it carries the pickup code, which has to survive a reload |
| Payment | Apple Pay, Google Pay, Card | **Card only.** Wallets are shown disabled ("available in the app"): they need a browser payment SDK the web does not have |
| Tracking | WebSocket | `GET /orders/{id}` polled every 10s; the socket needs a handshake the httpOnly token cannot do from the page |
| Pre-order times | full slot picker | **the grid, since 2026-08-08** (`ReadyAtField`) — "As soon as possible" first and then the times after `earliestReadyAt` on `READY_STEP_MINUTES` (**10** since 2026-08-08; it was 15, matching the booking grid's step so the two controls on one screen stop offering different grains for the same question — when do you want to be here). The count went 8 → 12 with it, because a count is a span in disguise: eight quarter-hours reached two hours, eight ten-minute steps would have reached eighty minutes, and a shorter horizon was nobody's ask. Drawn in a panel the field opens. It was a bare `<input type="time">` until then, and could name 03:00 on a branch that opens at eleven. "As soon as possible" is still the **absence** of a time, which is what `POST /orders` defaults to; a clock field said that with `--:--`, which says nothing, so it is now a labelled option and the one the panel starts on. `readyTimeOptions`' leading `earliest` entry is dropped here, because that button says it better — left in, the panel read "As soon as possible / 14:29 / 14:30", where the first two mean the same thing. The native field is still what a browser with no JavaScript gets, `min` and `step` unchanged |
| Table date and time | month calendar + slot grid | **the calendar and the grid, since 2026-08-08** (`DateTimeField`) — Monday-first month, prev/next arrows disabled onto a month with nothing bookable, days outside the window greyed rather than hidden, and **beside it, in a scrolling column with ▲/▼ arrows**, the slots `GET /restaurants/{id}/availability` answers for that day and that party — the shape of every desktop date-and-time picker, and the one thing a grid under the calendar could not do: put *when* next to *which day*. The chosen time is scrolled into view when the panel opens. **Times already past are dropped, taken tables are struck through:** the API reports both as `available: false`, but a struck-through 20:00 says somebody has that table and informs a choice of 20:30, while a struck-through 10:00 on a day half gone says nothing — today's list opened with nine of them before the first choosable time. Read in the browser through `GET /[lang]/availability`, a route handler: paging to Thursday changes nothing else on the checkout, so a Server Action would re-price the basket to fill in a grid of times. **This reverses the trade recorded here before.** The screen was a native `<input type="datetime-local">` stepped by `RESERVATION_SLOT_MINUTES` (**10** since 2026-08-08; it was 30 — see BUSINESS_LOGIC.md, where only the *spacing* moved and the 90-minute seating did not, so a 10:00–23:00 day now offers about 70 starts instead of 21), and its cost was that a time could only be refused once it was asked for — a closed Monday, an off-grid minute, a party no table seats, a table already gone, all 422s after the press. Nothing offered now can be refused for those; what remains is a table going while somebody decides, which `submitCheckout` still catches and still draws above the fold. The field survives underneath as the no-JavaScript path, with the same `name`, `min`, `max` and `step`, and the value posted is the same `YYYY-MM-DDTHH:mm` Yerevan reading either way, so `rememberTiming` and `bookTable` never learn the control changed. The month grid is `@amragrir/shared`'s (`monthGrid`), moved out of `apps/mobile/src` when the web grew the same calendar — two copies of "which weekday does this month start on" is two chances to disagree about a booking. The party size is **the same `− n +` stepper as the app** (2026-08-07; it was a chip per seat before, which drew up to twelve near-identical targets to answer a question whose answer is nearly always two or four). Its two buttons **submit the form rather than navigating**, so the field above them keeps what was typed, and each carries the number it would produce rather than a direction — the arithmetic is on the page and the action still takes one `guests` value. With JavaScript on the submit is **intercepted** (`GuestStepper`): the count moves optimistically and `changeGuests` revalidates without redirecting, so a press patches the count and the deposit in place rather than redrawing the checkout — it was a full navigation per press until 2026-08-07. The deposit is never moved optimistically, because it is money and the server sizes it. `−` stops at 1 and `+` at the smaller of `RESERVATION_MAX_GUESTS` and the branch's `maxSeats`, where a grey "(max)" appears to say why it stopped |
| Header basket | always | the design's accent pill — cart glyph, running total, count badge — and it keeps its place when the basket is empty. The count and the total both need JavaScript; see `apps/web/README.md` for why the count is a separate readable cookie and the total comes from `GET /[lang]/basket` as an already-formatted string |
| Restaurant page | sticky "View basket" bar | the design's **order panel** beside the menu: lines, steppers, subtotal/service/total, "Book a Table" and a checkout CTA. Drawn in the browser from `GET /[lang]/basket`, so the page stays pre-rendered HTML and the totals still come from `POST /cart/quote`. **"Book a Table" shows wherever the restaurant takes bookings**, as the artifact draws it — disabled, not hidden, until a dish is in the basket, because the calendar is on `/checkout` and a basket with no lines cannot be priced |
| Menu tabs | filter the dish list | **the same** since 2026-08-06 — one category on screen, the chosen pill dark. They filter in CSS (a radio per pill, `:has(:checked)` choosing the section), so every section stays in the pre-rendered HTML for a crawler and the tabs work without JavaScript. They were anchors that scrolled a page showing all sections at once until then. Section headings stay in the markup and are hidden from view, since the pill above already names the group |
| Location | device geolocation, an address | the artifact's **dialog**, built, over a **real Yandex map** (their public widget in an iframe, no key): tap to put the pin anywhere, drag to look around, the search box searches addresses, and the browser's own position is offered. What is stored is a **point** — `lat`, `lng` and the name to show for it — which is what `GET /restaurants` has always taken; a ✕ on the badge that names it puts the visitor back to the whole city. Recently chosen points sit at the top of the dialog, in `localStorage`. The map is built only when the dialog opens. The row of six district chips was **removed** (2026-08-06), and with it the only control that worked without JavaScript — see the note below the table. With no geocoder key a tapped point is named after the nearest district instead of its address, and the search box is not rendered at all: filtering those chips was its whole job without a key |
| Favourites | a heart on every card | **the same, since 2026-08-09.** A heart on the top-right of every restaurant card — home, search and `/[lang]/favorites` — posting `toggleFavorite`, so it works with JavaScript off like every other write here. It was **read-only** until then, on the reasoning that the artifact drew the heart only in the app; what that produced was a list nobody could add to from the site that showed it, and empty-state copy telling people to go and use the app instead. The rating badge moved left to make room. `toggleFavorite` **does not redirect** — alone among the writes here, because both directions are idempotent server-side, so a re-posted heart asks for the state it already asked for, and skipping the redirect keeps a press from scrolling a long listing back to the top. A refusal is not reported but corrected: the revalidation re-reads `GET /favorites` and the heart snaps back to what the server has. A visitor who is not signed in still sees hearts, and pressing one signs them in and returns them to the card. **The restaurant page has one too**, on its banner — but that page is pre-rendered, so its heart reads its own state from `GET /[lang]/saved` in the browser and posts `revalidate=0`; see §3. **So does the basket's `BranchCard`**, as a flex item in the row rather than a disc on glass — but *not* the checkout's copy of that same card, which is the one screen where a write to the account has no business sitting beside the button that charges the card. The two clients share the list |
| Profile | 5 account rows + points | orders, favourites and sign-out. **The three counters are built on both clients** from `GET /me` (2026-08-10 on mobile, earlier on web). Addresses and stored cards are not built (no couriers; the API lists accepted methods, not saved ones), and help has no page |
| Sign-in phone | one field, placeholder only | a country select plus a field that **shapes the number as it is typed** — `99 12 34 56` — and **stops at the chosen country's length** instead of refusing a too-long number on submit. See `PhoneField` in COMPONENTS.md |

**Every step works with JavaScript disabled.** Each action is a `<form>` posting
to a Server Action followed by a redirect: quantities, coupon, mode, table
booking, sign-in, payment and cancellation. The header basket's numbers, the
restaurant page's order panel and the tracking auto-refresh are the only
enhancements, and none is on the path — the header's basket pill is a plain
`<a href="/[lang]/cart">` in the server's markup on every page, so a scriptless
reader always has the route from a restaurant to the basket. The "order ahead /
call" card that used to be named here as that route was removed on 2026-08-06;
it was never the only one.

**One thing is not on that list any more: saying where you are.** The district
radios were the picker's scriptless answer, and they were removed with the chip
row on 2026-08-06; the map, address search, geolocation and recents all need a
browser. A reader without one browses the whole city, which is the state
everybody starts in — nothing on the ordering path asks for a location, so this
costs distance on a card and the "near me" sort, not a step.

**Routes:** `/[lang]/cart`, `/checkout`, `/signin`, `/orders`, `/orders/{id}`,
`/profile`, `/favorites`, plus `/preorder` (a redirect into checkout, which
absorbed it), `/session` (a route handler that mints or refreshes a token and
bounces back, because a page render may not write a cookie), `/basket` (a
route handler answering the priced basket as JSON, for the restaurant page's
order panel) and `/geocode` (a route handler proxying Yandex's geocoder, so its
key stays on the server; it answers `{ items, failed? }`, because a refused key
and an address that does not exist are otherwise the same empty list). All are
`noindex, follow` **and** disallowed in
`robots.txt` —
`noindex` is only read after a fetch, and these pages do real work per request
for a client that can never have a basket.

A catch-all under `[lang]` renders the designed 404 for anything else. Without
it an unknown URL matched no route at all and Next answered with its own error
page — outside this app's layout, with neither the header nor the artwork.

### 14a. Web profile — `/[lang]/profile`

**Purpose:** the account, and the way back into an order already placed.
**User:** somebody with a verified phone; anyone else is sent to `/signin`.
**Elements:** gradient banner with the account's initial, name (or the verified
number when there is no name) and three counters — orders, reward points,
favourites; **every active order above the history**, each a row with its order
number, ready time, status pill and total; then the last five past orders, each
with a status pill and a **Reorder** button; an account menu (my orders,
favourites) and **Log out**.
**Actions:** open an order; reorder it; open favourites; sign out.
**Transitions:** order → `/orders/{id}`; See all → `/orders`; reorder → `/cart`;
sign out → home.
**API:** `GET /me`, `GET /orders?status=active`, `GET /orders?status=past`,
`GET /favorites`; reorder reads `GET /orders/{id}` and the branch behind it;
sign out `POST /auth/logout`.

**Food still coming outranks food already eaten,** so anything in flight sits
above the history. The section is drawn only when there is something in it —
an empty "no active orders" row on a summary screen would push the history down
to say nothing, and `/orders` is the page that owes both states a heading. All
active orders are listed rather than the first few: one waiting at a counter is
exactly the one that must not be hidden behind a **See all**.

**Reorder copies ids and quantities, never money.** The new basket is priced by
`POST /cart/quote` like any other, so a dish that has changed price or left the
menu is caught there instead of being carried over from history. It replaces
whatever was in the basket — one basket, one kitchen.

**Sign-out revokes the refresh token and then clears the cookies,** basket
included: it belongs to the session that is ending, and leaving it would hand
the next person at that browser the last one's order. The chosen district
survives, being a preference rather than a credential.

### 14b. Web favourites — `/[lang]/favorites`

**Purpose:** the restaurants this account has hearted, on a bigger screen.
**Elements:** the same restaurant cards as the home grid, every heart filled; an
empty state pointing back at the listing.
**Actions:** open a restaurant; remove it from the list.
**API:** `GET /favorites`, whose rows already carry every card field, and
`DELETE /favorites/{restaurantId}` behind the heart.

**Every heart here is filled by definition,** so pressing one removes the
restaurant — the only thing a heart can usefully mean on this screen.
`toggleFavorite` revalidates this route, so the card leaves on the press rather
than on the next visit.

### 14c. Web sign-in — `/[lang]/signin`

**Purpose:** confirm a phone number before ordering or booking.
**User:** anyone; a guest arrives here from the checkout and comes back to it.
**Elements:** one centred card — heading ("Welcome back" / "Create your
account"), a **Log in / Sign up** tab pair on a chip-coloured track, a "Full
name" field on the sign-up tab only, a country-and-number field, the OTP note,
the CTA ("Log in" / "Create account") and the Terms/Privacy line. The second
step replaces the fields with the SMS code, keeping the same heading, and offers
"← Use another number".
**Actions:** switch tab; enter name/number → send the code; enter the code →
confirm; go back to change the number.
**Transitions:** confirmed → `?next=` (the checkout by default).
**API:** `POST /auth/send-code`, `POST /auth/verify-code` (with `name` from the
sign-up tab), `POST /auth/guest` for the session it upgrades.

**The tabs choose a field, not an endpoint.** There is one credential and one
call behind both: `verify-code` takes an optional name and upgrades the guest
account in place, so "sign up" is the same flow with the name field showing —
which is what the web artifact does too, where both tabs run one `submitAuth`.
Nothing on this page can tell a returning number from a new one before the code
is confirmed, and it does not need to: the API decides and answers `isNewUser`.
The name is a hint, not an instruction — the API fills it in only where there is
none already, so confirming an existing number cannot rename that account.

**The tabs are links (`?mode=register`), not buttons,** so the switch works
with JavaScript off like the rest of this flow. The tab, the name and the number
travel in the query string across the code step and every bounce back with an
`?error=`; there is nowhere else to keep them on a page that must survive
without a client.

**With a client, pressing a tab no longer loads the page** (2026-08-08). The
href stays real and the server still renders whichever tab the query string
names — that is the no-JavaScript path, unchanged — but a press is intercepted
and switches in place, with `history.replaceState` correcting the address
behind it. The tabs decide only whether "Full name" shows and what the heading
and the CTA say, and a round trip to this `force-dynamic` page for that rebuilt
the card, replayed its entry animation and emptied a number field somebody was
halfway through typing. The name field is now hidden rather than removed on the
log-in tab, so switching back finds it as it was.

**The country picker stands where the artifact prints a plain `+374`.** The web
artifact assumes an Armenian number; `PHONE_COUNTRIES` has eight, each with its
own grouping and trunk-prefix rules, and `requestCode` refuses a number whose
country was not named. So the static prefix is a `<select>` inside the same
pill, with the dial code first in each option — the closed control is narrow
enough to leave the number room, and truncation can only take the country name.

**The artifact's "OR / Continue with Apple · Google" block is not here** — the
web artifact has no social buttons at all (its only "Google" is Google Pay at
checkout). The mobile artifact does specify them; see §0.

### 14d. Waiting for a page (2026-08-09)

**Purpose:** answer a press on the frame it happens, on a site where every
screen is rendered by the server.

That is the trade this app is built on: server rendering is what makes the
catalogue indexable, and it is why a press is answered by a round trip rather
than by a frame. Left alone the browser holds the *old* page, unchanged, for
that second or two — and the honest reading of an unchanged page is "nothing
happened", so people press again and the second press is the one that feels
broken.

**Every segment under `[lang]` has a `loading.tsx`** — home, search, restaurant,
basket, checkout, orders and one order, favourites, reservations and one
booking, profile, sign-in, and the two that render nothing of their own
(`/preorder`, which redirects, and the catch-all, which 404s). With one in
place the router swaps the skeleton in on the frame the link is pressed: the
visitor is already on the next screen while its data is fetched. Without one a
segment borrows its parent's, which is why even the redirect has its own —
otherwise a bounce through `/preorder` flashed a catalogue that was never
coming.

**Each skeleton is that screen's own layout**, built from the page's real
classes rather than from generic bars, so what arrives settles into the shape
already on the screen instead of shoving it around: the restaurant page draws
its `1fr 380px` split, its menu tabs and its dish cards; the basket draws lines
with the 72px photograph in front; the home page and the profile draw their
gradient banners **for real**, because those need no data and only the words on
top of them are worth waiting for. See COMPONENTS.md → `Skeleton (web)`.

**Above all of it, `RouteProgress`** (COMPONENTS.md), which covers the gap
before the skeleton is on screen and marks the control that was pressed. It
stays silent for the first 140ms: most moves here are already in the router's
cache, and a bar that flashes on every one of them is what teaches people to
stop looking at it.

---

## 15. Notifications — the bell

**Purpose:** tell somebody their order moved, wherever they are in the product.
**User:** a signed-in customer with a verified phone.
**Where:** a screen (`/notifications`) on mobile, reached from the bell on Home;
a panel under the header bell on the web, on every page.
**Elements:** title, "clear all" beside it, one row per notification (status
headline, order code chip, one-line description, unread dot, **a cross**), empty
state.
**Actions:** open a row → §7 Order Tracking for that order; **delete one (the
cross); delete all**; pull to refresh (app).
**API:** `GET /notifications`, `POST /notifications/read-all`,
`PATCH /notifications/{id}/read`, `DELETE /notifications/{id}`,
`DELETE /notifications`, and `watchMe` on the order socket.

**The cross removes the line at once and tells the server afterwards** — one
that waited for a round trip before anything moved would not read as a cross.
The answer carries the bell as it now stands, so a delete that did not go puts
the line back rather than leaving a gap. Deleting an unread line takes its
unread with it; deleting a read one leaves the badge alone.

**"Clear all" empties everything, unread included**, and is offered only when
there is something to clear. It is drawn as quiet text rather than as a
destructive red control: what it throws away is a list of messages, and the
order history it describes is not in this list to begin with.

**It exists because §7 is not enough.** Tracking reports the one order it is
showing, so somebody browsing for their next meal heard nothing when the kitchen
marked their food ready.

**The words are the client's, not the API's.** A row arrives carrying
`{ orderId, code, status }` and no prose, and the line is drawn from the same
dictionary keys §7 uses for its steps. So the bell can never describe an order
differently from the screen it opens, and the whole history follows a language
change in Settings. See DATABASE.md §12.

**Opening it is what "I have seen these" means** — the badge clears on open,
server-side. The dots on the rows stay as they arrived: they are what somebody
came to read, and clearing them under their eyes would take that away.

**It arrives at once, on both clients.** The app holds its token in memory and
subscribes over the socket directly. The web's session is an httpOnly cookie the
page cannot read, so there is no token for the socket's first message — its
route handler holds that socket *for* the browser and streams what arrives down
as Server-Sent Events. Measured at 53ms from the kitchen pressing a button.

The 30-second poll is the **fallback**, not the mechanism: it starts only where
the stream cannot be opened at all — a proxy that will not pass
`text/event-stream`, a host that caps request duration. That deployment is half
a minute behind instead of instant, which is worse and is not broken.

**Browser alerts, opt-in.** With the site open in any tab — including on a phone
— a status change can raise the browser's own notification, so the news reaches
somebody who is not looking at this tab. Asked for from a press inside the panel
and never on load; offered only where it can work. On an iPhone it is not
offered at all: Safari has no notification API until the site is installed to
the home screen. This is **not** Web Push — the alert is raised by the open page
from the stream it already holds, so it cannot reach a closed site. That is
`POST /devices`, which needs credentials from outside this repository.

**Without JavaScript the web bell does not render at all.** Nothing is lost that
is not elsewhere: §8 lists the same orders with the same statuses, one press
away in the same header.

---
