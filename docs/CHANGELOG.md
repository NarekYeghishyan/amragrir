# Changelog

> Every product/business-logic/schema/API/UI change gets a dated entry here —
> see "Keeping documentation in sync" in [AI_CONTEXT.md](./AI_CONTEXT.md) for
> which doc file to update alongside it. Loosely follows
> [Keep a Changelog](https://keepachangelog.com/). Dates: `YYYY-MM-DD`.

## [Unreleased]

### 2026-08-10 — Two mobile screens were written around endpoints that existed

Both carried a comment saying the API did not support them. Both were wrong,
and had been since before the screens were written.

**The profile's three tiles.** Reward points, orders and coupons were left out
because "no endpoint reports any of them" — `GET /me` has returned
`rewardPoints`, `ordersCount` and `couponsCount` the whole time, and the web
profile has been drawing them from it. The phone simply never called `/me`. The
artifact's 340/28/3 were mock values, not a claim that the numbers were
unavailable. A guest still gets no row: "0 orders" is a statement about
somebody, and there is nobody yet.

**The settings switches.** Notifications and promotional email were held in
`useState` and marked local-only because "no endpoint stores either" —
`PATCH /me/settings` takes `notifPush`, `notifPromo` and `darkMode`, and has
since the screen was built. A switch that forgets what it was set to on every
app launch is worse than no switch. They now move first and tell the server
after, the bargain the favourites heart already makes, and a refusal springs
them back. The theme is stored in both places on purpose: the local copy paints
the first frame before any request lands, and the account's copy is what a
second phone starts from.

`SCREENS.md` and `docs/design/README.md` are corrected — both recorded the
counters as unsupported, and both recorded the filter sheet's pricing question
as open after it was settled earlier today.

### 2026-08-10 — The phone can see the table it booked

Table booking on the phone was one-way. A guest could take a table — but only
from inside the pre-order funnel, with food already in a basket — and then never
mention it again: `GET /reservations`, `GET /reservations/{id}` and
`POST /reservations/{id}/cancel` had all been in the mobile client for months
with nothing calling any of them. A booking made on the phone could not be
checked afterwards and could only be given back by ringing the restaurant. The
browser has had every one of these screens since August.

Three doors, all of which the web already had:

- **Book a table on its own** (`/book/{branchId}`), from a button on the
  restaurant's page. `POST /reservations` has never wanted an order; requiring
  a basket was the funnel's assumption, not the API's.
- **My bookings** (`/bookings`), reached from the profile beside the order
  history — two lists, upcoming and past, with the API deciding which is which.
- **One booking** (`/booking/{id}`), with the deposit's fate reported rather
  than recomputed, and a cancel button that asks twice.

**One calendar, not two.** The month grid, the slot chips, the party stepper and
the deposit card came out of `preorder.tsx` into `BookingCalendar`, because two
booking paths drawing their own would be two readings of one availability answer
— and that failure is silent: a screen offering a slot the API then refuses.

`RESERVATION_STATUS_LABEL` and `depositLabelFor` moved from `apps/web/src/lib`
into `@amragrir/i18n`, where `ORDER_STATUS_COPY` already lives. Both clients now
show somebody their own table; a status word or a deposit line that differed
between them would be the two apps disagreeing about what happened to that
person's money.

### 2026-08-10 — The filter sheet, and the number that held it up for a year

The last screen of the mobile design artifact. It went unbuilt over a units
mismatch: the sheet draws a **price per person** slider from 4 000 to 24 000֏,
and the API measured a branch's *average dish price* — which puts every
restaurant on this platform between 1 480 and 3 900. The two ranges do not
overlap, so the control as drawn matched everything or nothing wherever it was
put, and shipping it would have meant shipping a slider that does nothing.

The API was measuring the wrong quantity. One dish's average is not what a
person spends — it is dragged down by the drinks and the sides. `spend =
AVG(price) × SPEND_ITEMS_PER_PERSON`, which is **2**: a person orders a main and
something with it. Still an approximation, still documented as one, but now an
approximation of the right thing. Both ends of the slider live beside the model
in `packages/shared`, so a client cannot draw a range the server has never heard
of — which is exactly how this went wrong the first time.

The sheet itself is the artifact's: sort, price, distance, rating, dietary and
service, with a count on the Home button. The sort is **not** counted — every
list is sorted somehow, and a badge over a feed nobody had narrowed would be the
control lying about itself. `openNow` exists in the DTO and is deliberately not
offered: the artifact does not draw it, and "serving right now" on a screen
whose purpose is ordering *ahead* answers a question nobody arrived with.

`RestaurantSort` moved from the API's DTO into `packages/shared`. The phone's
client had it retyped as a bare string union, which is the duplication that
package exists to stop.

### 2026-08-10 — The book is the order board at a different hour

The Bookings tab shipped as a dense striped list: a second visual language for
the same job, on a screen a shift moves to and from all evening. It is now built
the way the board is — the same header, the same toolbar, the same stage strip,
and the same cards on the same grid. The card is literally `.order`'s, shared by
naming both in the stylesheet rather than by giving the book a copy of the
padding and the radius, which is how the two would have come to differ by two
pixels.

**Two things were broken rather than merely different.** Both pickers carried
`''` as their "All" option, and Radix reserves the empty string for the
placeholder state — so on arrival, in their default state, they read "Choose…"
rather than "All restaurants". And the day lived in component state, so the
screen read the date out of the address on arrival and never wrote one back:
stepping to Saturday left the URL saying today, and the link the whole feature
was built to be sendable could not be sent. Restaurant, branch and day are now
all in the address, and the pickers narrow by navigating.

**A stage strip, counted here rather than by the API.** The board pages through
hundreds and has to ask the server what each stage holds; a book is one day and
arrives whole, so All / To confirm / Confirmed / Seated is arithmetic over what
is already on screen. `bookingsPartial` keeps that honest — a day bigger than
its page says so, rather than letting four tabs quietly undercount.

The header carries **covers, not bookings**: the number a kitchen staffs and
preps for, and the one thing a book knows that counting its rows does not say.

### 2026-08-10 — The 00:30 party is on tonight's page, not tomorrow's

Found by running the finished module against a real database rather than by
reading it. A branch open 12:00–02:00 offers 00:30 as the last start of
*tonight's* evening; `assertBookable` gates it against tonight's hours and
accepts it. The staff book then asked for `reserved_for` between local midnight
and local midnight — the **calendar** day — and 00:30 has tomorrow's date. Those
guests landed on tomorrow's page: invisible to the shift that was still working
when they walked in, and sitting above a service that had not opened. The whole
past-midnight apparatus built in stage one — the wrapped window, `serviceDateOf`,
the grid that keeps counting past 1440 — was working, and the one query that
mattered was not asking it.

`reservations.service_date` now holds the answer, written at the moment the
booking is accepted, by the same call that decided it was legal. Stored rather
than recomputed for the reason `seating_minutes` and `free_cancel_hours` are: it
belongs to the hours in force when the booking was taken, and a branch that
shortens its night next month must not move guests already in the book to
another day. A computed filter also could not answer for a list spanning
branches whose nights end at different times.

Backfilled to the local calendar date, which is exact rather than a guess: until
stage one, a window closing earlier than it opened produced a slot loop whose
body never ran, so nobody has ever been booked past midnight on this platform.

### 2026-08-10 — The pass finds out where the dine-in order is sitting

Stage five, and the smallest of them. A dine-in order arrived on the board as
`serviceMode: 'dine_in'` and nothing else — which is the least useful half of
what the order knows. Where these people are sitting, when they are due and how
many covers to lay are all on the reservation the order already carries through
`orders.reservation_id`, so the queue was throwing away an answer it was
holding, and the kitchen was reading a ticket that could not be laid.

`GET /restaurant/orders` now sends `booking: { tableNo, time, guests }` on a
dine-in row and `null` on every pickup one, and the card draws it as a single
badge rather than three — they are one fact: these people, there, then.

This closes the five-stage table-booking module. What began as a schema that
could not be configured, an API nothing wrote to and a journal nothing read is
now: settings a restaurant can set, a book a shift can work, and an order the
kitchen can lay.

### 2026-08-10 — The book gets a screen, five months late

Stage four. `GET /restaurant/reservations` and `PATCH .../status` were written,
tested and permissioned months ago, and nothing has ever called them:
`reservations:read` was granted to every restaurant role and opened nothing at
all. There is now a **Bookings tab**, between the queue and the menu, which is
where a shift would look for it.

**A day at a time, with the date in the address** — `/bookings?branch=&date=` —
so "look at Saturday at Northern Ave" is a link rather than a sentence somebody
re-types at the other end. Arrows either side of the picker, because a date
field alone makes "tomorrow" three clicks.

**Two views.** The list answers "who is coming next" and fits a phone. The room
— tables down the side, time across the top — answers "what is free at nine",
which is the question somebody at the door with four people is actually asking
and which a list answers badly. Every table gets a row, including the empty
ones, since a grid of only the busy tables hides exactly the answer being looked
for. The room needs one branch chosen, and says which of the two reasons it fell
back to a list rather than quietly showing one.

A sitting after midnight keeps counting — 01:00 on the night of the 1st is 1500
minutes, not 60 — so it is drawn to the right of the evening it belongs to
instead of at the far left of the wrong day. The bars are placed as percentages
of the span so the grid scales with its container, and the span is taken from
the bookings themselves rather than from the branch's hours: a day with two
bookings at eight should not be drawn as thirteen empty hours with a mark in it.

The action buttons come from the shared transition table, so the panel cannot
draw a move the API is about to refuse. Reseating is a picker on the row. The
customer's number is a `tel:` link on every one of them, because a booking
nobody can ring is a table nobody can free.

### 2026-08-10 — A restaurant can set all of it from the panel

Stage three, and the one that makes table booking work in production at all. A
restaurant could not previously enter its own tables — they existed only in the
seed — so `GET /availability` answered with nothing and the calendar was empty
for every real branch. Now the branch card carries five blocks: the tables, the
booking hours, the dated exceptions, the policy, and a preview of what a guest
would be shown.

**It loads when opened, not when rendered.** A chain's card carries every branch
under it, and three requests apiece across seventy-eight branches is ten seconds
spent fetching settings nobody asked to see. It also appears only where the
branch actually takes bookings — tables and seating lengths for a counter in a
mall would be a form about nothing.

**Every policy row says which level answered it** — decided here, from the
chain, from the platform. That is the difference between a form somebody can
read and one they cannot: without it a manager cannot tell a deliberate 90 from
an inherited one, so they set it again to be sure, the branch acquires an
override nobody wanted, and it stops following the chain forever. Switching a
row off sends an explicit `null`; switching it on sends the figure already in
force, so taking a decision over changes nothing by itself.

**A refused save becomes a list, not a message.** The dialog names each booking
the change would strand — date, time, party, table, whom to ring — and offers to
save anyway. It states outright that nothing will be cancelled, which is longer
than "these bookings will be cancelled" and has the advantage of being true.

The week of hours is stored sparse and edited as seven rows, and the two
conversions are held to being inverses of each other: a form that reads a week
differently from the way it writes one loses a Sunday every time somebody saves.
Writing always names all seven days, because a day left unsaid falls through to
the kitchen's hours and quietly reopens. A closing time at or before the opening
one is not an error but a night that runs past midnight, and the row says so
rather than inviting somebody to "fix" it.

83 dictionary entries in all three languages, including sentences for the eight
audit actions stage two started recording — the feed had been falling back to
printing the raw verb, which it is designed to do but is not where this should
have been left.

### 2026-08-10 — The back office can finally write those numbers

Stage two: fourteen endpoints under `/restaurant` for the room's tables, the
hours a branch holds them, the days it does not, and the booking policy at both
levels — plus moving a booking to a different table by hand. Stage one taught
the booking path to *read* these settings; nothing could write them.

**Zero new permissions.** Tables and the policy are `branch:write` (a manager's
decision), the hours and the closed days are `branch:hours` (a shift's — closing
tomorrow because the freezer died has to be possible at 6pm without ringing
anybody), and the chain's defaults are `restaurant:write`. The split fell out of
the existing roles rather than being designed onto them.

**Every narrowing change is checked against the bookings that already exist**,
answers `409` with the list — table, time, party, who to ring — and goes through
on a repeat carrying `?force=true`. It cancels nothing either way: behind each
booking is a guest with plans and a deposit already taken.

The line that took the most care is what *counts* as a conflict. It is "we could
not seat them", never "we would not sell that now". A table that has gone or
shrunk below the party, a day or an hour the branch would be shut — those break
a booking. A booking that no longer lands on a narrowed slot grid, sits past a
shortened horizon, or exceeds a lowered party cap does not: the table is still
there, still big enough, on a day the branch is still open. Reporting those
would put a warning on every save, and a warning that is always there is a
warning nobody reads. It follows that the policy numbers produce no conflicts at
all — not from leniency, but because the seating, the deposit and the
cancellation window are snapshotted onto each booking.

Which is why this stage also carries **`reservations.free_cancel_hours`**.
`deposit_amd` was already frozen while the cancellation window was still read
live — half a promise fixed and half floating, so a branch moving its window
from two hours to twenty-four moved it for people who had already paid. The two
are one sentence, *this much money, returnable until then*, and they are now
frozen together.

Reading a policy answers with **three** sets: what this level decided, what it
would inherit if it decided nothing, and what is therefore in force, plus which
level each answer came from. A form given only the resolved number cannot show a
deliberate 90 apart from an inherited one — so a manager sets it again to be
sure, the branch acquires an override nobody wanted, and it stops following the
chain forever. An explicit `null` in a PATCH is how an override is undone.

`GET /booking-preview` answers what the settings would actually produce — "41
slots, 12:00 to 21:30, largest party 100". A form full of numbers is not
something a person can check, and the mistakes here (hours that close before
they open, a seating longer than the evening) surface as an empty calendar
rather than as an error.

Verified against the running API, not only in tests: a 100-seat banquet hall
entered as one table, the branch cap raised to 120, and `GET /availability`
then offering 23 slots for a party of eighty at a 160 000֏ deposit — the whole
chain from the back office to the public calendar.

### 2026-08-10 — Every number behind a booking becomes the restaurant's

Stage one of the table-booking admin module: the foundation, with no screen
attached to it yet.

Until now every booking rule was a constant in `packages/shared` — a 90-minute
seating, a 10-minute grid, 2000֏ a head, 30 days ahead, 12 guests at most — the
same for a wine bar with four tables and a hall that seats a hundred, and
changeable by nobody but a deploy. They are now defaults at the bottom of a
three-level chain: **platform → restaurant → branch**, resolved field by field
in one function, `resolveBookingPolicy`.

**Nothing answers differently today.** Every column added is nullable and every
NULL means "inherit", so a database that has just migrated resolves to exactly
the constants it resolved to before. The existing suite is what proves it: its
assertions are untouched. Its *call sites* did change — `slotsFor`,
`isSlotBoundary`, `seatingsOverlap`, `depositFor` and `freeCancellationUntil`
now take their numbers as **required** arguments. Deliberately required: an
optional parameter defaulting to the platform's value would compile at every
call site that forgot a branch's policy, and a calendar offering times the
endpoint then refuses is the one failure this whole design exists to prevent.

Five migrations, none of which touches an existing row: `booking_policies` (one
table for both levels, two nullable owners and a CHECK that exactly one is set —
the shape `payments` already uses), `branch_closures` for dated exceptions,
`restaurant_branches.booking_hours` for a kitchen that serves longer than it
books, `UNIQUE (branch_id, table_no)`, and `reservations.seating_minutes`.

That last one is what makes changing a seating length *safe*. Read live, a
branch lengthening its seating would stretch every accepted booking backwards,
and two that sat comfortably an hour apart would start overlapping on one table
— an overlap nothing would catch, because the unique index guards the start
instant and the transaction that checks intervals committed weeks ago. Snapshot,
and the new setting applies only forwards.

**A night may now run past midnight.** A closing time at or before the opening
one is read onto the opening day's number line, so 12:00–02:00 becomes minutes
720–1560. Before this a late-night branch was offered zero bookable times and
nothing on screen said why. It also means a booking's service date can differ
from its calendar date — 01:00 on Tuesday belongs to Monday's shift — which
`serviceDateOf` now answers, so such a booking is gated against the right day's
hours and filed under the right day's sheet.

Two new settings that had no previous answer: `minLeadMinutes` (an hour by
default — a table could previously be claimed a minute before the guest walked
in) and `autoConfirm` (`true`, because by the time a booking exists the money is
held and the table is chosen, and `pending` would mean "we have your money and
have not said yes").

`maxGuests` stops being a ceiling and becomes a default. The platform limit is
200 and guards a slipped finger rather than a business decision; the clients now
read the branch's answer off `GET /availability` instead of clamping at twelve,
so a branch that enters a banquet hall as one 100-seat table can actually be
booked for one. Seating a single party across several tables stays out of
scope — it would move exclusivity off `UNIQUE (table_id, active_slot)`.

### 2026-08-09 — The working tree is LF, so the token guard tests colours again

`packages/ui/src/tokens.spec.ts` compares the generated `tokens.css` in
`apps/web` and `apps/admin` to `renderTokensCss()` **byte for byte** — that
comparison is what stops the web accent drifting from the phone's. The
generator emits `\n`; the repository had `core.autocrlf=true` and no
`.gitattributes`, so a Windows checkout wrote those files back as CRLF and the
guard failed on line endings after any branch switch, and on every fresh
Windows clone.

`.gitattributes` now pins `* text=auto eol=lf`, and the working tree was
renormalised. The check is back to failing only when a colour actually
diverges. Recorded in DEVELOPMENT_GUIDE.md §3 "Git / process" so the next
person to meet a red token test does not fix it by loosening the assertion.

### 2026-08-09 — A press is answered on the frame it happens

The complaint: pages take a moment to load, nothing on screen says so, and it
looks like the click did not register — so people click again.

They were right about the cause. Every screen here is rendered by the server,
which is what makes the catalogue indexable; the cost is that a press is
answered by a round trip and not by a frame, and until the answer lands the
browser holds the *old* page unchanged. An unchanged page honestly reads as
"nothing happened".

**Every segment under `[lang]` now has a `loading.tsx`** — home, search,
restaurant, basket, checkout, orders and one order, favourites, reservations and
one booking, profile, sign-in, plus the two that render nothing of their own
(`/preorder` redirects, the catch-all 404s). With one in place the router swaps
the skeleton in on the frame the link is pressed and the visitor is on the next
screen while its data is fetched. Even the redirect has one: a segment with no
`loading.tsx` borrows its parent's, so a bounce through `/preorder` was
flashing a catalogue that was never coming.

**The skeletons are the screens' own layouts, not generic bars.** They are
assembled from the page's real classes — `.grid`, `.card`, `.dishes`,
`.order-row`, `.line`, `.banner` — so the blocks sit where the words will sit
and the arriving page settles into the shape already on screen instead of
shoving it around. There is also only one set of measurements to keep in step
with the design rather than two. The home hero and the profile banner are drawn
**for real**: their gradients need no data, and only the words on top of them
are worth waiting for.

**`RouteProgress`**, mounted once in the layout, covers the gap before the
skeleton is there. A 3px accent thread across the top of the window, plus two
things the bar alone cannot say: `is-pending` on the control that was pressed,
so the answer is attached to the thing pressed rather than floating at the top
of the screen, and `data-navigating` on `<html>` for the cursor.

Three decisions in it worth recording:

- **Silent for the first 140ms.** Most moves here are already in the router's
  cache. A bar that flashes on every one of them is noise, and noise is what
  teaches people to stop reading a progress indicator.
- **It never reaches the end.** There is no way to know how far a server render
  has got, so it approaches 90% and slows. Arriving at 100% and then sitting
  there is a lie the next second exposes.
- **It watches the query string, not only the path.** The home page's filter
  chips and a new search change nothing else, and both are slow enough to be
  the reason this exists. That means `useSearchParams()`, which is why the
  component wraps itself in `<Suspense>` — without a boundary it would drag
  every page out of static rendering, and the restaurant pages are the ones
  that must stay prerendered.

The rules and the arithmetic live in `lib/navigation-progress.ts`, away from the
DOM and unit-tested: which presses actually load a page (not a middle click, not
`target=_blank`, not `mailto:`, not another origin, not a hash on the page you
are already reading), and where a GET form's fields put it — resolved rather
than guessed, so resubmitting an identical search does not raise a bar with no
navigation behind it. Every other form here posts a Server Action, mutates in
place and is deliberately left alone.

Reduced motion keeps the blocks and drops the movement: the layout is the point,
the shimmer is decoration.

New i18n key: `loading` (hy/ru/en). It is announced once, by `RouteProgress`, in
a `role="status"` region — a `loading.tsx` is handed no route params and so has
no language to translate with, which is also why the skeletons are `aria-hidden`.

Docs: COMPONENTS.md (`RouteProgress (web)`, `Skeleton (web)`), DESIGN_SYSTEM.md
§8 (loading, navigating) and its keyframes list, SCREENS.md §14d.

### 2026-08-09 — Notifications can be thrown away

A cross on every line and a "clear all" beside the title, on both clients. New:
**`DELETE /notifications/{id}`** → 204 and **`DELETE /notifications`** →
`{ deleted }`.

**A hard delete, and it is the exception in this schema.** Everywhere else a
removal is soft, because the row is a fact somebody may later have to account
for. A notification is not that — it is a *message about* a fact, and the fact
is in `orders` and `order_events`, untouched by the cross. A `deleted_at` here
would keep rows nobody can ever read again, to preserve a second copy of what is
already preserved properly.

`DELETE` on the collection rather than a `POST /clear`, unlike `read-all`:
marking read is a state change with no verb of its own, while removing every
member of a collection is exactly what this verb means. Clearing takes the
unread ones too — the gesture is "I am done with all of this", and a clear that
quietly left some behind would look like it had failed.

Both crosses are optimistic: the line goes at once and the server's answer — the
whole bell — replaces the guess, so a delete that did not go puts the line back
rather than leaving a gap. **Two things that were easy to get wrong and are
tested rather than trusted:**

- The badge arithmetic (`withoutItem`, in `notification-watch.ts`). It drops
  only when the deleted line was unread, and never below zero: the count is the
  server's and covers everything, while the list is one capped page of it, so
  the two can legitimately disagree.
- `sameBell` is **not** used to apply a local delete. It compares the unread
  count and the newest id — right for "did my poll find anything new", wrong for
  "I removed a read line from the middle", where neither moves and the cross
  would have appeared to do nothing.

The cross is a sibling of the line's link, never nested in it: a `<button>`
inside an `<a>` is invalid HTML and the press would belong to both. It carries
the order code in its `aria-label`, so a screen reader hears which line is going
rather than "delete" eight times.

Docs: API_DOCUMENTATION.md (Notifications), DATABASE.md §12, SCREENS.md §15,
COMPONENTS.md.

### 2026-08-09 — The web bell is pushed, and can raise a browser alert

Two complaints about the entry below, both fair.

**"It only shows after a refresh."** True in effect: the web bell polled every
30 seconds, so a status change sat invisible for up to half a minute and
refreshing looked like the thing that fetched it. The app was already instant.

The fix is the upgrade `apps/web/README.md` has described beside the tracking
poll since that poll was written: **the Next server holds the order socket and
streams it down as SSE.** The browser cannot hold that socket itself — the
gateway authenticates in its first message and the session is an httpOnly cookie
the page cannot read — but a route handler *does* receive the cookie, so
`GET /[lang]/notifications/stream` reads the session, subscribes with `watchMe`,
and forwards what arrives. Measured end to end: **53ms** from the kitchen
pressing a button to the event reaching the browser.

The README worried that this costs "a WebSocket client in the server"; Node 22
and later ship a global `WebSocket`, so it costs no dependency. The other half
of that worry stands — **one held connection per open tab** — which is why the
30-second poll is still there and now serves as the fallback, taking over on its
own wherever the stream cannot be opened. That deployment is half a minute
behind rather than broken.

**A bug this surfaced:** the stream answered **500** where the sibling route
answers 401, when a refresh token had been spent. `EventSource` retries a
dropped connection forever and gives up permanently on a non-stream response, so
a 500 there is a reconnect loop against a session that is never coming back. It
answers 401 now, like its sibling.

**"Alert the browser too."** Added, opt-in. With the site open in any tab —
including on a phone — an arriving notification raises the browser's own, so it
reaches somebody who is not looking at this tab. It goes through a new
`public/notifications-sw.js`, because **Android Chrome refuses
`new Notification()`** and shows one only through a service worker; that worker
caches nothing and intercepts nothing, deliberately not a PWA. Permission is
asked from a press inside the bell panel and never on load.

**This is not Web Push**, and the distinction matters: the alert is raised by the
open page from the stream it already holds, so a closed site still gets nothing.
That is `POST /devices`, still unimplemented, still needing FCM/APNs credentials
from outside this repository. On an iPhone the control is not offered at all —
Safari has no notification API until the site is installed to the home screen.

The mobile app is unchanged: it was already pushed, and OS-level notifications
there are the same `POST /devices` piece of work.

Docs: `apps/web/README.md` (new bell section), SCREENS.md §15,
COMPONENTS.md, API_DOCUMENTATION.md (`watchMe` — both clients now use it).

### 2026-08-09 — The customer gets a bell

`notifications` (DATABASE.md §12) has been in the schema since it was laid out
and nothing ever wrote to it; `GET /notifications` and
`PATCH /notifications/{id}/read` have been specified in API_DOCUMENTATION.md
just as long and never existed. Both are now real, on the web and in the app.

The gap this closes is narrow and was easy to miss: the tracking screen already
followed an order live, so an order *being watched* was never the problem.
Somebody browsing for their next meal was the problem — they heard nothing when
the kitchen marked their food ready, because the only thing listening was a
screen they had navigated away from.

**Rows are written by a subscriber, not by callers.** Three places move an order
(`orders.service`, and twice in `payments.service`), and
`CustomerNotificationsService` listens to the event stream all three already
publish to. A fourth is announced for free rather than being a thing to
remember. The events fire after their transaction commits, so a notification can
never describe a change that was rolled back — and the listener catches its own
failures, because an unhandled rejection would take the API down over a bell.

**Six of eight statuses earn one** (BUSINESS_LOGIC.md §4): `created` is the
customer's own act, and `paid` is published back to back with `confirmed` from
one payment, so announcing both would buzz a phone twice for one tap.

**The row carries facts, not a sentence — and `title`/`body` became nullable to
say so.** Turning the table on asked a question it had never had to answer: in
which language is `title` stored? Every answer that fills it freezes the row in
whatever language the reader preferred that day, so switching language in
Settings would leave a half-translated bell; and the API cannot render it
properly anyway, compiling to CommonJS while `@amragrir/i18n` ships TypeScript
only a bundler reads. So an `order` row carries `{ orderId, code, status }` and
the clients draw the line from the keys they already ship for their tracking
screens. **The feature added no copy in any language** — three keys for the
panel's own chrome, and nothing else. `ORDER_STATUS_COPY` moved into
`@amragrir/i18n` so the web and the app cannot word one fact two ways.
The columns now mean "prose the server authored", for `promo` and `system`.
It is the conclusion `staff_notifications` reached (§8b) from the other
direction: that table has no known reader, this one has a reader allowed to
change their mind.

**Live delivery differs by client, and the difference is the client.** The app
holds its token in memory and subscribes with a new `watchMe` frame on the
existing order socket — customer tokens only, verified phone only, the same gate
the REST list sits behind, because "may you call this" and "may you hold this
open" have to agree. The web's session is an httpOnly cookie the page cannot
read, so there is no token for that first message: it polls a new
`/[lang]/notifications` route handler every 30 seconds, the wall `OrderLive`
already hit. Slower than tracking's five seconds on purpose — somebody on that
screen is waiting, a bell is glanced at, and a five-second bell is twelve
requests a minute from every open tab.

**Not included: OS-level push.** `POST /devices` stays unimplemented and is now
marked so. It needs FCM/APNs credentials, which live outside this repository.
The bell works whenever the site or the app is open.

Docs: API_DOCUMENTATION.md (Notifications, now *implemented*), DATABASE.md §12,
BUSINESS_LOGIC.md §4, SCREENS.md §1 and new §15, COMPONENTS.md.
Migration: `20260809120000_customer_bell_renders_client_side`.

### 2026-08-09 — The heart reaches the restaurant page, on both clients

Follow-up to the entry below, which put the heart on cards only. It is now on
every surface that shows a restaurant for browsing: the card (home, search,
favourites) and the **restaurant page's photo header**, opposite the back
button, where the artifact has always drawn it and where §3 of `SCREENS.md` has
always listed "favorite" as an action.

**The web's restaurant page could not simply render one.** It is pre-rendered at
build time, every restaurant in all three languages, which is the single thing
that page exists to be — and a heart that knows whether *this* account saved
this restaurant is a read of the session, which would have opted every one of
those pages into rendering per request to draw one glyph two ways. So it takes
the trade `OrderPanel` already made on the same page: new `FavoriteButton` is a
client component that ships hollow in the HTML on disk and asks the new
**`GET /[lang]/saved?restaurant=`** route handler what it should be once it
mounts.

It is still a `<form>` posting the same `toggleFavorite`, so a scriptless
visitor can save from this page. What they cannot do is *un*-save from it —
a page that cannot know the state cannot offer the other direction — and
`/favorites` is where that exists for them, rendering per request. The button
posts **`revalidate=0`**, a new opt-out `toggleFavorite` honours: the listings
draw their hearts on the server, so revalidating is what redraws one, but here
it would evict a page built at build time to change nothing on it.

**The app's restaurant screen** got the artifact's second glass circle, filled
and reverted optimistically like the feed's. It reads its state from
`GET /favorites` filtered to the one business — the detail endpoint does not
report it — and keys off the loaded detail's `restaurantId`, never the route's
`{id}`, which is whatever the previous screen happened to hold: a slug, a branch
id or a restaurant id.

**The `BranchCard`** — the card naming the restaurant an order belongs to — was
left without one at first, on the reasoning that it appears in the middle of
paying. That was right about the checkout and wrong about the basket, and it is
now split: **`/cart` draws a heart, `/checkout` does not.** The basket is a
screen somebody is still browsing from — the card is the way back to the menu,
and saving the place you are ordering from is an ordinary thing to want there.
The checkout is where money is committed, and a control that quietly writes to
the account one press from the button that charges the card is not. The `favorite`
prop is optional and the checkout simply omits it, so one component serves both.

That card is a **row**, not a photo, so the heart is an ordinary flex item
between the rating and the chevron rather than a disc floating on glass — it
wears `--chip` for the same reason, since there is no photograph under it to
need blur. It needed the same restructure `RestaurantCard` did: the row is now
the container and the link is the item filling it, because a `<form>` may not
live inside an `<a>`. The chevron moved out of the link with it, so it stays at
the row's edge.

Verified end to end against a running stack: a verified account, `POST` then
`GET` then `DELETE /favorites` with the exact id the card posts, and the web
grid rendering one filled heart for it.

Docs: `SCREENS.md` (§3 restaurant, and the web-parity row), `COMPONENTS.md`
(`FavoriteButton` among the web-only components), `apps/web/README.md` (the new
route handler in the tree).

### 2026-08-09 — The heart on a restaurant card actually saves the restaurant

`/favorites` existed on both clients, and on neither could anybody put anything
into it. The web listed favourites and set none — deliberately, on the reasoning
that the artifact drew a heart only in the app — so its empty state read "the
heart in the app adds a restaurant here", which is a website telling somebody to
go and use something else. The app *did* draw the heart, on every card, and it
was a `BlurView` with an SVG in it and no press handler: a control that looked
pressable for as long as anyone cared to press it. Both are wired now, to the
`POST`/`DELETE /favorites` pair that has been implemented since Phase 8.

**A card is a branch; a favourite is a restaurant.** That is why this was not
just a button. A row from `GET /restaurants` carried one id, the branch's, and a
heart posting it would have favourited an address rather than a business —
looking right until a chain opened its second one. `RestaurantListItem` now
carries **`restaurantId`** beside `id`, which is what `SearchRestaurant` has
always done and the reason search needed no change. The two are asserted apart
in `restaurants.service.spec.ts`, because for a long time either would have
passed.

**On the web the heart is a `<form>`, like every other write here.** It posts
`toggleFavorite`, so it works with JavaScript off. Two things are unlike the
rest of `actions.ts`, and both are deliberate:

- **No redirect.** Every other write ends in Post/Redirect/Get so a reload
  cannot re-post it. Both directions here are idempotent server-side, so a
  re-posted heart asks for the state it already asked for — and skipping the
  navigation stops a press from rebuilding the route and scrolling a long
  listing back to the top, the same reasoning as `changeGuests`.
- **A refusal is corrected, not reported.** The revalidation re-reads
  `GET /favorites`, so a press that failed leaves the heart drawn the way the
  server actually has it. There is nowhere on a listing to put an error that
  says more than the heart snapping back already does.

Hearts are drawn for signed-out visitors too, hollow; pressing one goes to
`/signin` and comes back to the card — including back to the *filtered* listing
it was pressed on, which is what `homeHref` was factored out of `chipHref` for.
`favoriteIds` (new, `lib/favorites.ts`) is the one read that fills them in, and
it joins the home page's existing `Promise.all` rather than costing a fourth
round trip. It skips the call entirely for anyone not signed in.

**In the app the heart fills before the request lands** and goes back on a
refusal — a one-bit change the server accepts for any signed-in account, and one
that reads as broken if it waits for the network. `onToggleFavorite` is optional
on `RestaurantCard`: where a screen cannot act on a favourite the heart is now
**not drawn**, which is the honest version of what it was doing before. The
Favorites tab grew a heart of its own, always filled, that gives a restaurant
back and takes the row out on the press. The home feed refetches the set on
focus, since that tab can empty it while the feed is off screen.

The rating badge on the web card moved to `right: 56px` to clear the new
button, and the card became an `<article>` holding a link and a form as
siblings — a `<form>` is interactive content and cannot live inside an `<a>`.
New keys `addFavorite` / `removeFavorite` in all three dictionaries, and
`noFavoritesHint` no longer sends people to the app.

Docs: `API_DOCUMENTATION.md` (`GET /restaurants` now returns `restaurantId`, and
what each id is for), `SCREENS.md` (§1 home, §9 favourites, §14b web favourites,
and the web-parity table, where "Favourites: read-only" is retired),
`COMPONENTS.md` (`RestaurantCard`, `RestaurantListItem`, and the web note that
recorded `onToggleFavorite` as deliberately absent), `DESIGN_SYSTEM.md` (§5, the
favourite button's own measurements and states).

### 2026-08-09 — A pin beside an order's code holds the board on that one order

Answering the phone about **AMR-17117037** meant finding it again on a board of
fifty cards that reorders itself every twenty seconds, or retyping twelve
characters read off the screen you are trying not to lose. Every card now
carries a pin before its code: pressing it puts that code in the search box and
leaves the one order on the board. Pressed again — on a pinned board, the one
card on screen — it lets the queue back in.

**It writes `&order=:code`, the address a line in somebody's activity already
links to**, rather than setting the search term directly. So the board needed
nothing new to do this: the box fills from the URL, the term is editable exactly
as a typed one is, and a pinned board has a URL that can be sent to whoever is
asking about the order. `replace`, like the board's own pickers — narrowing a
queue is not a place in the browser's history, and nothing is lost by that
because the control that undoes it is the one card left on screen.

**The restaurant and branch are carried through.** Unpinning is not "clear the
filters": somebody pinned an order from one branch's board and wants that board
back, not every branch's at once.

**Only the pin lights the pin.** A code typed into the search box by hand leaves
it dark — that is somebody looking for an order, and the counts on the tabs are
already the board telling them where to look. Being *held* on one order is a
different state, and it is the one the address records. Taking the pin out also
empties the search box, which is the one thing the address cannot say on its
own: a URL naming no order is the ordinary board rather than an instruction to
clear a box somebody is typing in.

No API change — searching a full code was already how the board finds one order.
New `pin` glyph in the panel's icon set, drawn head-on rather than leaning: at
17px a tilted pin reads as an arrow, and an arrow among the status buttons looks
like something that moves the order along. New keys `orderPin` / `orderUnpin` in
all three admin dictionaries. `pinScope` is exported and tested directly
(`orders-tabs.spec.ts`), including the round trip through `routePath` /
`parseRoute` that is the whole mechanism.

Updated: apps/admin/README.md, docs/COMPONENTS.md.

### 2026-08-09 — The order board's tab counts move when an order does

Pressing **Confirmed** on a card under **Paid** took the card off the board at
once — the socket broadcast does that — and left the number on the tab above it
reading `3` over two cards. The counts arrive only with a page of orders, and
nothing fetched a page after a status change, so the twenty-second poll was what
eventually corrected the strip. The one part of that screen which is a running
total was the one part that stood still.

The board now re-reads after every move it makes: the status buttons, the cancel
dialog, and the handover dialog, which is `ready → completed` and therefore
changes Ready and Past together. Every tab is right by the time the toast is up.
**Both outcomes are re-read**, not only the successful one — a refused move may
have been refused because the order had already moved under somebody else's
hand, in which case the numbers on screen are the stale ones that made the press
look reasonable in the first place.

**A re-read, and not arithmetic.** The panel could subtract one from the stage
the order left, add one to the stage it entered, and never make a request. But
`scheduled` is a stage defined by a timestamp rather than by a status, and a
pre-order is counted there and in **none** of the others — `countPerStage`
groups only the orders that are due. Doing the sums here would mean reproducing
that rule in a second place and drifting from the server exactly where it is
least obvious, and the symptom of that drift is a tab whose count disagrees with
the list underneath it.

No API change, and the list itself is still set only from the broadcast. A move
made by a **colleague** still reaches the counts on the next poll: a socket
frame carries an order id and a status, which is not enough to say what the
other tabs now hold.

### 2026-08-08 — The web profile shows the order you are waiting for, above the one you already ate

`/[lang]/profile` opened on **Order history** — the last five orders, all of
them finished — while an order being cooked at that moment appeared nowhere on
the screen. The account page could tell you what you ate last week and not that
something was ready for collection.

Active orders now sit above the history: one row each, order number and ready
time, status pill and total, linking into the tracker at `/orders/{id}`. The
page fetches `GET /orders?status=active` alongside the history and the
favourites, in the same `Promise.all`, so it costs no extra round trip in
sequence.

**The section is drawn only when there is something in it.** An empty "no active
orders" row on a summary screen would push the history down to say nothing;
`/orders` is the page that owes both states a heading. And **all** active orders
are listed rather than the first few — one waiting at a counter is exactly the
one that must not be hidden behind a **See all**.

Web only. The mobile app's `(tabs)/orders.tsx` already leads with its active
list, and the profile tab there is unchanged.

### 2026-08-08 — The pickup code stops being the tail of the order number, and now closes the order

`AMR-24919119` told you `9119`, and `9119` was all the counter ever asked for.
The pickup code was the last four digits of `orders.code` — derived in the API,
never stored, on the argument that two stored identifiers can come to disagree.
True, and beside the point: the order number is printed on the ticket, read out
over the phone and scanned off the board, so every place it appeared was a place
the collection code leaked with it. A proof derived from a public name proves
nothing — and nothing was proved anyway, because marking an order collected was
one press of a button on a card that had the code printed across its top.

Both halves are fixed. **The code is now its own thing** —
`orders.pickup_code`, six digits, drawn with `randomInt` over the whole space
and stored under its own unique constraint, with no arithmetic relating it to
`orders.code`. **And it is what closes an order:** `ready → completed` carries
the code the guest showed, and the API compares it against the column before
anything is written.

Every order gets one, `pickup` and `dine_in` alike — one rule rather than two,
so nobody at a counter has to remember which kind of order asks for a code.

**No staff endpoint returns it.** Not the kitchen board (`QueueItem`), not the
platform-admin customer list (`AdminCustomerOrder`), not a `prep_due`
notification payload. That is the part that makes the check mean something: a
counter that can read the code off its own screen never has to ask a guest for
it. All three now name an order by `orders.code`. The panel's only dealing with
the collection code is the other direction — typed into the new handover dialog
and checked by the API — and it *can* still search by it, matched whole and
never as a substring, so the box finds the order a guest read a code out for and
cannot be walked digit by digit into one nobody gave.

A mistyped digit is the ordinary case at a counter, not an error: the API
answers 422 with `details.reason = "pickup_code_mismatch"` — the one failure the
panel rewords in the shift's own language, beside the box that was typed into.
**There is no override**, which is a product decision rather than an oversight;
BUSINESS_LOGIC.md §5 records it and says what would replace it (a
permission-gated override written to `order_events`) if a real counter proves it
too rigid.

**The customer's copy is now a real QR.** It was a white square with the digits
printed in it — honest while the code was read out loud, and not enough once the
counter has to *type* six digits off a stranger's screen at a queue. `encodeQr`
moved from `apps/admin/src/qr.ts` to `@amragrir/ui` (with `qrcode-generator`
as that package's one runtime dependency) and is now shared by the panel, the
web tracking page (`components/PickupQr`, a server component) and the mobile
tracking screen (`react-native-svg`). The payload is the six digits alone, so a
wedge scanner types exactly what the handover box wants; the dialog submits on
Enter, which makes the whole handover one gesture. The digits stay printed
beside the picture — a scanner can be flat, out of reach or absent.

**Migration `20260808090000_independent_pickup_code`** adds the column, backfills
**every** order including finished ones (the column is NOT NULL and the check
reads it directly, so a row without a code is a row nobody could ever close),
then adds the unique index. The backfill is a bijection over the code space
rather than a sequence, so historic codes are as unguessable as new ones. Live
orders are backfilled too, so a guest holding a screen that still shows the old
four digits is refused at the counter — a few hours' cost, and the tracking
screen re-reads the order.

**Global uniqueness caps the platform at 1,000,000 orders, ever.** Per-branch
uniqueness would be enough for the check to be correct; global uniqueness buys
that a mistyped code can never quietly be a *different* live order's. Past a
million, the index refuses the insert and order creation fails loudly rather
than reusing somebody's proof of purchase. Written down in DATABASE.md §7 with
the two ways out, both of which are decisions for a person.

Docs: BUSINESS_LOGIC.md §5 + §10, DATABASE.md §7 and §8b, API_DOCUMENTATION.md
(`POST /orders`, `GET /restaurant/orders`, `PATCH /restaurant/orders/{id}/status`,
`GET /staff/notifications`, `GET /admin/users/{id}/orders`), SCREENS.md §7,
USER_FLOW.md §5, COMPONENTS.md, PROJECT_OVERVIEW.md, and the admin/web/mobile
READMEs.

Tests: the whole suite is green (1,062 API · 331 admin · 19 ui · 65 mobile).
New coverage for the generator's independence from the order code, the handover
check (right code, wrong code, the old four-digit tail, no code at all, the
`reason` the panel keys off, and that the state machine is still checked first),
whole-vs-substring pickup-code search, and that neither staff payload carries
the code. One unrelated pre-existing failure was fixed on the way:
`setReminderLead`'s fixtures pinned a literal "tomorrow" of `2026-08-06`, which
stopped being in the future on 2026-08-06 and had been red since — the describe
now pins the clock instead, so the assertions stay literal.

### 2026-08-08 — Reloading a signed-in page no longer logs you out

A refresh token is single-use: the API rotates it and revokes the old one, so
the second request to present the same token gets a 401 (reproduced directly —
two concurrent `POST /auth/refresh` with one token answer `200` and `401`). On
the customer web three things can notice an expired access token at the same
moment — `/session` when a page is reloaded, the header basket panel, and the
tracking page's status poll — and each called `api.refresh` on its own. When two
fired together the loser got the 401, and `/session`'s 401 path **mints a
guest** — silently turning a signed-in customer into one and sending them back
to sign in. The five-second tracking poll added by the previous change is what
made this easy to hit: a reload of the tracking page raced the poll on the same
token. Web only; no API change, no schema change.

**`lib/session-refresh.ts`** (new) collapses concurrent refreshes onto one
rotation. It keys a promise on the token being spent and keeps it for a few
seconds after it settles, so a reload arriving just after the background poll
rotated the token gets the *new* pair from here rather than trying to spend one
that is already gone. `/session`, `basket-panel.ts` and `order-live.ts` all
rotate through it now instead of calling `api.refresh` directly; each still
writes the resulting cookie in its own request context.

**It is in-process** — one Next server shares the map, the way the API's order
fan-out is one in-process emitter. A second web instance would not share it and
the race would return; the complete cross-instance and cross-client (mobile too)
fix is a short **grace window on the API's own rotation**, where a token consumed
a moment ago returns the same new pair to a concurrent retry instead of a 401.
That is recorded as the next step rather than built now, because the deployment
is single-instance.

Six unit tests on the helper (one rotation for many concurrent callers; the
result held briefly after settling; a real call again once the hold elapses;
two different tokens not fused; a rejection reaching every sharer) plus a source
guard that every refresher goes through it. 295 web tests pass; `tsc --noEmit`
clean; the dev server compiles `/session`, `/orders/[id]/status` and `/basket`.

Not reproduced end-to-end: the exact in-browser logout, which needs a verified
OTP login the local tooling would not let me forge. The race underneath it is
reproduced against the running API, and the fix is verified by the tests above.

### 2026-08-08 — The Customers screen shows customers

A `users` row is written for every visitor who opens the storefront
(`POST /auth/guest`): an anonymous session with no name and no number until a
phone is verified. They arrive faster than customers do and they are the newest
rows, so the back office's Customers list — ordered newest-first — was page after
page of "No name · no phone · 0 · 0", with the people who actually order buried
behind them. On a local database with 271 accounts, 223 were guest sessions.

**`GET /admin/users` takes `guests`** (`1`/`true` to include them; off
otherwise), and leaves out the anonymous sessions that never ordered unless
asked. Hidden, never deleted — and two accounts are never filtered whatever the
flag says: a **guest who has ordered**, because that is somebody who bought
something, which is what the list is asking; and the account an **`id`** names,
because that comes from a link that already knows who it means, and filtering it
would answer "that account no longer exists".

**The Customers screen has a "Show guest sessions" switch**, off by default,
which resets to page 1 when it is flipped — page 9 of one list is not page 9 of
the other. It stays in React state rather than the address, like the search box:
it narrows an answer rather than being one.

**`toBool` moved to `apps/api/src/common/query.ts`** and is shared with the
catalog DTOs. A flag in a query string means the same thing on every endpoint,
and `Boolean('false')` is `true` — worth getting wrong only once.

Docs: API_DOCUMENTATION.md (`GET /admin/users`), `apps/admin/README.md`.

### 2026-08-08 — The tracker follows the kitchen in place

Confirmed → Preparing → Almost ready → Ready is moved by somebody in the back
office, and `/[lang]/orders/[id]` learned about it the only way it could: by
re-running its whole server component every ten seconds and swapping the tree
for the answer. The entire page was rebuilt to change one word, nothing moved
until the round trip landed, and the rebuild happened just as often when nothing
had changed at all — which is nearly always. Web only; no API change, no schema
change.

**`GET /[lang]/orders/[id]/status`** (new route handler) answers
`{ status, secondsLeft, readyAt }` — deliberately the three fields the order
socket pushes, so the payload survives the day this page can hold a socket open.
Deliberately *not* the pickup code, the lines or the total: none of them can
change under the reader. A route handler for the reason `[lang]/basket` is one —
the session is an httpOnly cookie, so only the server can turn it into an API
call, and only a route handler may write the rotated cookie back when the
fifteen-minute token behind it expires mid-order. **It refreshes on a 401**; an
expired token here arrives as a silently dead tracker, which is the exact
failure the endpoint exists to prevent.

**`OrderLive`** (new client component) polls it every five seconds and provides
the answer to the two components that care. It renders no markup, so the DOM is
unchanged. **`OrderSteps`** (new) draws the four steps from it and moves them in
place — no navigation, no scroll jump, no flash — and **`Countdown`** re-syncs
from every answer instead of free-running, so a `readyAt` the kitchen pushes
back lands on the screen rather than leaving the clock counting to a promise
nobody made.

**The server component still re-runs, but only when something it drew has
changed** — a new status, or a `readyAt` the kitchen moved. Whether the order
can still be cancelled, whether the headline says confirmed or cancelled,
whether there is a countdown at all, what time it says the food arrives: the
server's to decide, and patching them from the browser would be a second source
of truth. So a change fires `router.refresh()` behind the repaint that already
happened. `secondsLeft` is excluded from "changed" on purpose: it falls between
every pair of answers, and counting that as news would be the old behaviour back
at twice the rate.

**It stops when there is nothing left to hear.** Completed and cancelled orders
are not watched; a `401` or a `404` ends the watch, since a session that ended
and an order that is not yours do not improve by being asked again. Anything
else — a 5xx, a phone in a tunnel — is assumed temporary and the next tick
catches up. A tab coming back from the background re-asks at once rather than
showing a minute-old status, its interval having been throttled while away.

**The new step is announced.** It used to change only when the page reloaded,
which a screen reader announces by starting the page again; now it changes under
a reader who may never look at it, so the step it moved to is read out from a
`visually-hidden` polite live region — the same word the line shows, so there is
no new string to translate.

**Still polling, not the socket.** The gateway authenticates in its first
message and this page has no token to put there. Bridging it server-side — the
Next server holding the upstream WebSocket and streaming SSE down — is the
upgrade, and it costs a WebSocket client in the server plus one held connection
per viewer: a deployment decision, not a component one.

`OrderRefresh` is gone, replaced by the above. `isLive(status)` moved into
`lib/order-status.ts` so the page and the watcher cannot disagree about when an
order has stopped. 289 tests pass (22 new: the answer parser refusing a status
that is not one, what counts as a change, which HTTP codes end the watch, the
statuses worth watching, the language-prefixed endpoint, and source guards on
the page, the watcher, the steps and the route); `tsc --noEmit` is clean; the
dev server compiles the new route and answers `401` to a request with no
session, in both the bare and the `/ru`-prefixed form.

### 2026-08-08 — The tracking timer counts, without the page reloading under it

`/[lang]/orders/[id]` printed `formatCountdown(secondsLeft)` straight from the
server, and the only thing that changed it was `OrderRefresh` re-running the
whole server component every ten seconds. So the `mm:ss` under "Ready in" stood
still for ten seconds and then dropped ten — on the one screen whose whole job
is to prove the order is moving, and where a frozen number is indistinguishable
from a stuck order. Web only; no API change, no schema change.

**`Countdown`** (new client component) is the `.timer`'s value, ticking once a
second in the browser. It is the only new client code on that page, and it makes
no request and causes no navigation to do it.

**It counts elapsed time, not a number of its own.** `seconds` is the API's
`secondsLeft`; the component tracks how long ago that value arrived and
subtracts (`lib/countdown.ts`), and a poll landing with a newer value restarts
it. The server therefore remains the only thing that decides what is left —
the same reason the rest of the page is server-rendered — and the poll stays
exactly as it was, because the *status* still belongs to it.

**Measured against `Date.now()` rather than by decrementing per tick.** A
background tab's interval is throttled to roughly once a minute and a sleeping
laptop's stops firing altogether, so a self-decrementing counter comes back
minutes behind — and behind means "still cooking", which is the direction that
keeps somebody sitting down. The count floors at zero and stops waking React
there; the poll is what moves the page past it.

**The first paint is still the server's.** State starts at the prop and no clock
is read during render, so the markup the browser hydrates is byte-for-byte the
markup it was sent (checked with `renderToStaticMarkup`). With JavaScript off
the timer shows the server's value and holds it, exactly as before, with the
refresh link below it.

`remainingSeconds` is unit-tested (hydration parity, per-second counting, a
90-second and a five-minute catch-up, the floor at zero, a clock stepped
backwards); source guards hold the page to `<Countdown>` over `formatCountdown`,
keep `OrderRefresh` in place, and keep the clock out of the render path. 266
tests pass; `tsc --noEmit` is clean, and the dev server compiles the route.

### 2026-08-08 — The basket's stepper stops reloading the page

Pressing `＋` on `/[lang]/cart` was a full navigation: `changeLineQty` wrote the
cookie and then redirected to the page it was already on, so the router threw
the tree away and rebuilt it. The screen blanked for as long as
`POST /cart/quote` took to answer and the viewport jumped back to the top —
every time somebody wanted one more of something. `−` and the ✕ did the same.
Web only; no API change, no schema change.

**`changeLineQtyInPlace` and `removeLineInPlace`** (new Server Actions) are the
same writes minus the `redirect`. They are deliberately **not** the restaurant
page's `changeLineQtyLive`, which neither revalidates nor redirects: nothing the
server renders *there* depends on the basket, whereas here the line totals, the
discount, the fee, the total, whether a dish is still available and whether the
order can be placed at all are the server's answer to the basket that just
changed. So the revalidation stays and the action returns the rebuilt tree for
React to patch in place.

**`BasketEditor`** (new client component) is what presses it — the grid, one
line's `− n +` / total / ✕, and the dim on amounts being re-priced. **Every
button is still a submit button in a `<form>`** posting the redirecting action,
so a browser with JavaScript off behaves exactly as before; the interception
happens only once `useScripted` says React is driving. **The quantity moves on
the frame it is pressed and no amount does** — this client computes no money, so
the totals stay last second's under `.settling` until the quote lands. One
transition serves the whole screen, because a press re-prices the summary down
the side as well as the row it landed on.

Verified against the running dev server with a filled basket: the action answers
**200 with no `Location` header**, writes `qty: 3` to the basket cookie, moves
`amr_n` to 3, and the tree it returns already reads `3` with the line at
14 400 ֏ and the total at 14 760 ֏. The fallback forms still ship with their
`$ACTION_ID` and hidden fields. 256 web tests pass (6 new source guards in
`basket-edit.spec.ts`) and `tsc --noEmit` is clean; the in-browser press itself
was not driven in a browser. The coupon field still redirects — it was left
alone.

Docs: `SCREENS.md` (§4), `COMPONENTS.md` (`BasketEditor`).

### 2026-08-08 — The sign-in tabs stop reloading the page

Log in / Sign up were plain links to `?mode=register`, and `/[lang]/signin` is
`force-dynamic` — so glancing at the other tab cost a full server round trip to
change one thing: whether "Full name" is on screen. The card was torn down and
rebuilt, its `rise` animation replayed from the top, and a number already typed
into the phone field went with it. Web only; no API change, no schema change.

**`AuthPanel`** (new client component) takes the first step — heading, tabs and
form — and makes the press local state. The tabs are **still links to the same
addresses**: the href is real, the server renders whichever tab the query string
names, and a browser without JavaScript navigates exactly as before, which is
the whole point of keeping this flow scriptless. What mounting adds is
`preventDefault` plus `history.replaceState`, so the URL keeps saying which tab
is showing without the router fetching anything. `replaceState` and not
`pushState`: the two tabs are one screen, and Back belongs to the checkout that
sent the visitor here. Modified clicks (⌘, ctrl, shift, middle) are left to the
browser so "open in new tab" still opens a real page.

**The name field is hidden now, not unmounted.** Type a name, look at the log-in
tab, come back — it is still there. It posts on both tabs as a result, which
changes nothing: `requestCode` reads `name` only when `mode` is `register`, so a
name from the log-in tab is ignored there exactly as it was when the field did
not exist. A `?error=phone` clears on a switch, since the switch rewrites the
address to one that no longer carries it.

Both tabs verified server-rendered against the running dev server — the log-in
tab ships the name field `hidden`, the sign-up tab visible, each with its own
heading and CTA — so the fallback is intact. 249 web tests pass and
`tsc --noEmit` is clean; the toggle itself was not driven in a browser.

Docs: `SCREENS.md` (§14c), `COMPONENTS.md` (`AuthPanel`).

### 2026-08-08 — Both time pickers go to a 10-minute grain

`RESERVATION_SLOT_MINUTES` 30 → **10** and `READY_STEP_MINUTES` 15 → **10**, both
in `@amragrir/shared`. Confirmed by product; the booking one was marked
`[proposed]` in `constants.ts` with "confirm with product" written next to it,
and 30 had only ever been read off the design's 12:30 default.

**The spacing is the grain of the offer, not the length of the booking.**
`RESERVATION_SEATING_MINUTES` (90) is untouched, so a party still keeps the
table an hour and a half and 19:00 still collides with 19:10 exactly as it
collided with 19:30. What changes is that somebody who wants 19:20 can ask for
it. A 10:00–23:00 day now offers **70 starts instead of 21** — verified against
the live API, gap 10 min.

**No API change was needed, by construction.** `isSlotBoundary` decides whether
a requested instant is legal by regenerating the day from `slotsFor` rather than
testing the minute against its own copy of the spacing, so the offer and the gate
moved together. All 53 reservation tests passed untouched.

**The ready-time count went 8 → 12 with the step,** and that is not a separate
decision — a count is a span in disguise. Eight quarter-hours reached two hours
ahead; eight ten-minute steps would have reached eighty minutes. Finer grain was
the ask, a shorter horizon was not, and it would have been the silent half of it.
Twelve options are eleven steps after the earliest, so the grid still reaches 110
minutes.

Both clients get it from the same constants, and the web's no-JavaScript fields
take `step` from them too, so the native field cannot offer a minute the grid
above it does not.

Two spec expectations moved with the constant (quarter-hours → tens) and one was
added for the span. **A third assertion I wrote was simply wrong** — I asserted a
120-minute reach and got 110, because the first entry is the earliest itself, so
twelve options are eleven steps, not twelve. Corrected to the real number rather
than to a number that flattered the change.

Driven in a real Chrome: "Ready at" offers `16:40 16:50 17:00 … 18:20`, the
booking column offers 70 rows for a future day and 32 for today once the past is
dropped, picking still writes `2026-08-15T10:00`, and the panel is unchanged in
both themes. The whole workspace passes except the pre-existing expired fixture
in `restaurant/orders.service.spec.ts` (`READY_AT` pinned to 2026-08-06), which
is unrelated and was already failing.

Docs: `BUSINESS_LOGIC.md` (§"How a table is held" and the constants table),
`SCREENS.md` (both rows of the deviation table).

### 2026-08-08 — Times move beside the calendar, and two layering bugs go with them

The times sat *under* the month. Beside it is the shape every desktop
date-and-time picker has, and it does the one thing a grid underneath cannot:
put **when** next to **which day**, so moving between them is a glance rather
than a scroll. A column with ▲/▼ arrows that move it three rows at a time, and
the chosen time scrolled into view when the panel opens. Web only.

**The part-of-day headings went with the layout that needed them.** Grouping
twenty-four chips into Morning / Afternoon / Evening was structure a ragged
wrapping row badly needed; a column does not, and a heading every few rows in an
82px gutter is noise. `groupSlots`/`periodOf` and the three i18n keys added for
them are removed — `lib/slots.ts` keeps `upcomingSlots` and `hasFreeSlot`, and
its tests came down from 12 to 10. Dropping the past times stays: that was never
about layout.

**Two bugs the screenshot found, neither of them cosmetic.**

*The panel was being painted over* — by the "Ready at" field below it and by the
payment rows, which sliced the last week off the calendar. Not a z-index that was
too low: `section.booking` carries `.rise`, whose `animation-fill-mode: both`
**retains a `transform` forever**, and a retained transform makes the element a
stacking context. The panel's z-index was therefore being compared against its
own siblings inside that section instead of against the page. `.rise` is now
`backwards`, which fills the only frame that matters — the one before the
animation starts, which is what stops the flash — and leaves no transform behind.
The `to` frame was the element's natural state, so nothing changes to look at,
and every popover inside any `.rise` element stops being trapped. `.picker` also
takes a z-index while open, so it outranks the *next* field rather than only the
page.

*The panel grew to 541px with both halves 464px tall.* `align-items: stretch`
sizes every item to the tallest, and a list of twenty-four times **is** the
tallest — so the calendar was stretched to match a column that was only that tall
because it had been stretched. Circular. The column's three children are
`position: absolute` now, so it contributes no height at all, the month is the
only thing left to measure, and stretch hands that height back: **panel 328px,
calendar 251, times 251.**

Verified by looking, in both themes, at 2× — plus `document.elementFromPoint`
down the panel returning panel content at every depth, where it had returned the
"Ready at" trigger before. The rest still holds: side by side at x=33/x=269, the
column scrolls, an arrow moves it 248 → 335, picking the 15th then a time gives
`2026-08-15T10:00`, Escape closes, and with script execution disabled both fields
are still the plain `datetime-local` and `time`. Home, restaurant, search and
sign-in all still 200 — `.rise` is used on eight elements and the other seven set
their own layering explicitly.

Docs: `SCREENS.md` (the booking row of the deviation table), `COMPONENTS.md`
(`DateTimeField`, `ReadyAtField`).

### 2026-08-08 — The time grid gets the calendar's structure

The calendar landed well and the times under it did not keep up. They were one
wrapping row of chips — up to twenty-four for a full day, ragged at the right
edge, with no landmark between lunch and dinner — sitting directly beneath a grid
that has a month header, a weekday row and seven aligned columns. A blob to scan
rather than a thing to read. Web only; no API change, no schema change.

**Four aligned columns, under a heading per part of the day** —
Morning / Afternoon / Evening, styled as the weekday header is so the panel's two
grids read as a matched pair. The block scrolls at about four rows, because a day
of half-hours is taller than the calendar that chose it and a panel that grows
past the viewport puts its Close button somewhere nobody can reach. `HH:mm` is set
in tabular figures, so the columns line up without a `min-width` fighting the
grid. The ready-at panel uses the same grid without the headings — it is two
hours of one evening, not a day.

**A past time and a taken table stop being the same thing.** The API reports both
as `available: false`, which is right from where it stands and wrong to look at:
a struck-through 20:00 says somebody has that table, which informs a choice of
20:30, but a struck-through 10:00 on a day already half gone says nothing at all.
Today's grid opened with **nine dead chips stacked before the first time anybody
could pick**. The past is dropped now; only genuinely taken tables are struck
through. Today went from 24 slots with 15 free to **13, all free**.

**A real bug fell out of building the test for this.** While a newly-picked day's
slots were in flight, the previous day's stayed on screen and stayed pressable —
so a press could book the day the calendar had already stopped showing, silently.
Reproduced exactly that way: picked the 15th, pressed a time, got
`2026-08-08T16:00`. The slots are `disabled` while a day is loading now, not
merely dimmed, because dimming would not have stopped a keyboard reaching them.

**`lib/slots.ts`** (new) holds both rules — `groupSlots`, `hasFreeSlot`,
`periodOf` — out of the component and free of `Date.now()`, the way
`booking-calendar` is, with **12 tests** covering the Yerevan boundaries
(11:59 → morning, 12:00 → afternoon, 16:59 → afternoon, 17:00 → evening), the
slot happening exactly now, an empty part of the day drawing no heading, and an
unreadable instant. Three new i18n keys in all three dictionaries
(`slotMorning`, `slotAfternoon`, `slotEvening`).

Driven in a real Chrome: a future day groups as **Morning(4) Afternoon(10)
Evening(10)**, renders in 4 columns, and the block scrolls. 251 web tests pass,
`tsc --noEmit` clean across the workspace, and the no-JavaScript path still
renders the plain `datetime-local` and `time` fields with no picker chrome.

Docs: `SCREENS.md` (the deviation table's booking row), `COMPONENTS.md`
(`DateTimeField`, `ReadyAtField`).

### 2026-08-08 — The checkout's two time fields become pickers

"Date & time" and "Ready at" were bare native inputs, and both could name a time
the restaurant would not take: a `datetime-local` offers every half hour on the
calendar including Mondays the branch is shut and evenings with no free table, a
`time` field will take 03:00 where the kitchen opens at eleven. The refusal
arrived after the press, as a 422 drawn above the fold. Asking and being told no
is a worse way to pick a time than being shown the ones that exist.

**This reverses a trade `SCREENS.md` had recorded**, rather than inventing
something: the design always specified a month calendar and a slot grid, the app
has drawn them since it was built, and the web took the native field instead.

**`DateTimeField`** (new) draws the month — Monday first, arrows dead onto a
month with nothing bookable, days outside the window greyed rather than hidden
so there is no hole where the 1st should be — and under it the slots
`GET /restaurants/{id}/availability` answers for that day and that party. A
taken table is struck through, not removed: that 20:00 exists and is gone is
worth knowing when picking 20:30. **`ReadyAtField`** (new) leads with "As soon as
possible" — the *absence* of a time, which is what `POST /orders` defaults to and
what `--:--` could never say — then the quarter-hours from `readyTimeOptions`.

**Both keep the native field underneath.** `useScripted` swaps to the panel one
commit after mount, which is also what keeps the first client render identical to
the server's. Verified with script execution disabled at the browser: the
`datetime-local` and the `time` field render with their original `name`, `min`,
`max` and `step`, and no picker chrome. The posted value is unchanged in either
mode — the same `YYYY-MM-DDTHH:mm` and `HH:mm` Yerevan readings under the same
names — so `rememberTiming`, `bookTable` and `submitCheckout` never learn the
control changed. The refusal path stays too: a table can go while somebody is
deciding, which is the one 422 the grid cannot design away.

**`GET /[lang]/availability`** (new route handler) is how a day is read in the
browser. A route rather than a Server Action, for the reason the panel's is one:
paging to Thursday changes nothing else on the checkout, and revalidating would
re-price the basket to fill in a grid of times. It carries no session — table
times are public — validates its own query against the API's bounds, and answers
an empty day rather than an error the picker would have to draw.

**`monthGrid` moved to `@amragrir/shared`**, out of `apps/mobile/src`, by the
same route `readyTimeOptions` took: two copies of "which weekday does this month
start on" is two chances to disagree about a booking. Mobile imports it from the
package now; its spec stayed where the runner is.

Driven in a real Chrome against the live API: the panel opens on **August 2026**,
week header `Mon Tue Wed Thu Fri Sat Sun`, **42 cells of which 8 bookable** (the
seven-day order horizon, not the thirty-day booking one — a table booked here
always carries food). Picking the 15th moved the value `2026-08-08T14:30` →
`2026-08-15T14:30`, keeping the time; picking a slot took it to
`2026-08-15T10:00`, and the panel closed. Today offered 24 slots with 15 free
(the past ones struck through); the 15th offered 24 free. "Ready at" offered
`14:45 … 16:15`, picking one wrote `"14:45"` and "As soon as possible" wrote
`""`. Escape closes.

Docs: `SCREENS.md` §5 and the deviation table at its foot (two rows reversed),
`COMPONENTS.md` (`DateTimeField`, `ReadyAtField`).

### 2026-08-08 — Switching Pre-Order / Table booking stops redrawing the checkout

Pressing a mode tile posted and then redirected to the screen it was already on.
A redirect to the current page is a navigation: the router throws the tree away
and builds a new one, so the whole checkout blinked and the viewport jumped
while the API re-priced the basket. This tile changes more of the screen than
anything else on it — a calendar, a guest stepper, a deposit, a set of totals
and the CTA all appear or go — so it was also where that was felt worst. Web
only. No API change, no schema change; the same two Server Actions do the same
writes.

**The same answer the dish `＋` already got**, and the same shape:
`changeServiceModeLive` and `changePickupOptionLive` are the existing actions
minus the `redirect`, so Next returns the revalidated tree and React swaps what
differs. `chooseServiceMode` and `choosePickupOption` keep theirs, because they
are still what the forms post.

**`ModeSwitch`** (new, `components/ModeSwitch.tsx`) owns the mode tiles, the
take-away / eat-in row under them, and — as `children` — everything the pair
decides. One component because one press changes all of it, and the pending
state has to reach the content to dim it. It holds no i18n and no rules about
what the restaurant offers: tiles arrive translated, sections are chosen by the
page from the quote. The dead "Eat at the Restaurant" tile travels the *mode*
path, since that is what it does.

**Every tile is still a submit button in a real `<form>`.** Verified with script
execution disabled at the browser: one navigation, mode changed, booking block
present — the fallback is the markup, not something bolted beside it.

**Only the tile is optimistic.** Whether a table can be had, the deposit, the
totals and which CTA to draw are the server's answers, and this client neither
prices baskets nor allocates tables (DEVELOPMENT_GUIDE.md). So the tile moves on
the frame it is pressed and everything it implies wears `.settling` until the
real answer lands — plus `pointer-events: none` via `.mode-swap`, because a
stale "Book the table" is not something to let somebody press on the way past.
The two presses carry **separate pending states**: a mode change dims all of it,
a pickup ending dims only its own row.

**`.rise` on the booking block**, because it now *arrives* — nothing else marks
the moment a calendar and a deposit appear where a row of pickup tiles was, now
that the page does not reload. Tiles ease on `border-color`, `background-color`,
`box-shadow` (.18s) and `transform` on `:active` (.12s); `border-width` and its
compensating padding are deliberately **not** transitioned, since the pair fight
and the tile twitches. All of it opted out under `prefers-reduced-motion`.

Measured in a real Chrome over CDP, against the live API, clicking after
hydration: **30ms** after the press the tile reads "Table booking", the
dependent half is dimmed, and the booking block has not arrived yet; it lands
shortly after. A sentinel set on `window` before the click is still readable
afterwards and `scrollY` is unchanged — proof the page was patched, not
replaced. The pickup ending behaves the same and dims only its own row. Both
directions checked, on `pickup+reserve` and `pickup+dinein` branches.

Docs: `SCREENS.md` §5 (mode tiles, pickup endings), `COMPONENTS.md`
(`ModeSwitch`), `DESIGN_SYSTEM.md` §8 (the `settling` state, and what may move
optimistically).

### 2026-08-08 — The checkout says which restaurant, and which of its branches

The web checkout described the restaurant in one grey line — the name and a prep
time — which is the exact shape the Basket had already replaced with a
`BranchCard`. So the screen where the money is committed said *less* about the
place being paid than the screen before it: nothing on it named the address the
food was being collected from, or said whether that kitchen was still open.
Checking either meant going back a screen, mid-payment.

**It now draws the same `BranchCard` the Basket does** — cover, name, cuisine ·
price level, rating and reviews, and the `.tag` row carrying the prep time, the
address and Open/Closed. Web only. No API change, no schema change, no new
endpoint: `GET /restaurants/{id}` was already being called on the Basket one
screen earlier, and it is cached for 60s.

**Fetched by branch id, not by the basket's slug.** A slug resolves to one branch
of a restaurant that may have several, so an address taken from it can be the
wrong street. It goes out in the same `Promise.all` as the dine-in availability
call, so the card costs no extra round trip in front of the booking block.

**The subline is the order now** — dish count · service mode, as on the Basket.
The restaurant has the card to itself; keeping the name in the grey line above it
would be the duplication the Basket had already cleaned out of that spot. **When
the card cannot be fetched the subline takes the name back**: the call is wrapped
in a `catch` and the card is simply dropped, because a screen holding somebody's
payment must not 500 because the catalogue had a moment, and the quote — which
decides every number — is untouched either way.

**The booking-only variant gets it too**, and two things fall out of that:

- `prepMin` is now **optional** on `BranchCard`, and the tag is dropped without
  it. That variant has no quote, and the branch's general figure is not a
  stand-in — it would promise a wait for food nobody has ordered.
- It stopped resolving the restaurant **by slug**. The booking is made against a
  branch id, and asking by slug drew it under whichever branch the slug happened
  to name. That was invisible while the screen printed only a name — every branch
  of `dolmama` is called Dolmama — and stops being invisible the moment the card
  prints a street.

There it also **replaces the back chip**, which named this restaurant and led to
this same menu; the card says it, shows it and is still the way there. The priced
page keeps its chip, which goes to the Basket — a different screen.

Verified against the running stack in all three states — pickup, dine-in, and a
table with no food — by minting a guest session, forging the two cookies the app
keeps and reading the rendered HTML: the card renders with Dolmama's Saryan St
address and Open badge, the prep tag is present on the two priced states and
absent on the booking-only one, and `/cart` is unchanged. 239 web tests pass;
`tsc --noEmit` clean.

Docs: `SCREENS.md` §6 (Checkout), `COMPONENTS.md` (`BranchCard`).

### 2026-08-08 — Adding a dish stops rebuilding the restaurant page

Pressing `＋` on a dish, or a stepper in the order panel, rebuilt the whole
route. On a page of menu that is a sledgehammer for one number: the panel
remounted and blanked, the press cost most of a second, and a long menu could
lose where you were in it. Web only — no API change, no schema change, and the
without-JavaScript path is untouched.

**Nothing the server renders on a restaurant page depends on the basket.** That
is precisely why the page can be pre-rendered for 69 restaurants × 3 languages —
the basket is drawn in the browser, by the panel and the header button. So the
only things that ever had to change were those two, and a redirect was the wrong
size of answer.

**Two live Server Actions**, `addToBasketLive` and `changeLineQtyLive`. Same
write through the same `lib/cart` rules, and they **neither `revalidatePath` nor
`redirect`** — so Next sends back no new RSC payload and the route is not
rebuilt. What they return is the priced basket, from `pricedPanel`, which was
lifted out of the `GET /[lang]/basket` route handler into `lib/basket-panel.ts`
so the write and the fetch cannot disagree about the shape or the money.

**The forms are still forms.** `<form action={addToBasket}>` and `<form
action={changeLineQty}>` are exactly as they were; the live path is taken only
once React is driving (`lib/scripted.ts`, `useScripted`, lifted out of
`LocationPicker` which already had it). With JavaScript off the browser posts,
the server acts, the browser follows the redirect — verified by clicking the
button with script execution disabled and watching the count go 6 → 7.

**The quantity moves on the frame it is pressed; the money does not.**
`useOptimistic` over `applyQtyLocally` (`lib/order-panel.ts`) moves the number
and **touches no amount** — every string of money came from `POST /cart/quote`
and the next one will too, so the old totals stay legible and say they are
settling (`.settling`, 55% opacity) until the server has re-priced. An
optimistic subtotal is exactly how a client starts computing money.

**`lib/basket-live.ts`** carries the answer between controls that are nowhere
near each other in the tree — the dish `＋` publishes the basket its write
returned, the panel takes it. It also holds the panel's memory across a remount
(moved out of the component) and tells the header's count watchers, since the
same write moved the cookie they read. `alreadyPublished` stops the panel
fetching a second copy of what it was just handed: that was one wasted round
trip per press, and two of them in flight after two quick presses can land out
of order and put the quantity back down.

Measured in a real browser against a real basket, with the dev server and a live
API: **147ms** from click to the panel's quantity, the panel's total and the
button's tick all moving. Scroll position unchanged, menu not remounted (DOM
marks survive), and the only requests are the action itself and the header's own
total. Before: a full route rebuild and a blanked panel.

The `＋` also **answers now** — a green tick for 1.2s. With no page rebuild left
to signal anything, a button that looks identical after being pressed is one
people press twice.

`order-panel.spec.ts` and `basket-live.spec.ts` cover the optimistic rule (with
"touches no amount" stated as its own test), the branch-keyed hand-off, and
guard at the source that the live path never revalidates or redirects and that
the plain forms underneath it survive — losing those would be silent, since
every browser we look at has JavaScript. 239 tests. Docs: `COMPONENTS.md`
(`AddDish`, `OrderPanel`), `apps/web/README.md`.

### 2026-08-08 — The header basket was showing a basket nobody had any more

Remove a line and the list lost it, but the button in the header kept the old
count and the old total; empty the basket entirely and a badge stayed on a
button that opened "your basket is empty". The restaurant page's order panel had
the same fault and one of its own.

**The cause was a wrong assumption written into both components.** Every basket
write is a Server Action answering with `redirect()`, and Next resolves that as
a **client-side re-render, not a document load** — so `pageshow`, `focus` and
`storage`, which both were listening for, never fired. Neither control was ever
told anything; they showed whatever they had read on the first paint.

**`lib/basket-count.ts`** (new) watches `amr_n`, the small readable cookie
`cart-store.ts` already rewrites on every basket write, and both controls read
the count through it via `useSyncExternalStore`. It is a **250ms poll**, plus
those same events for a tab restored from the back/forward cache or returned to
after the basket changed in another one. There is no cookie-change event every
browser has — the CookieStore API is Chromium's alone — and the alternative,
reading the basket in the layout, is the one thing this app may not do: a single
`cookies()` call there opts all 69 pre-rendered restaurant pages into rendering
per request. A quarter-second regex over one short string is the cheap end of
that trade. The subscription reports only an actual change, so a page nobody is
touching wakes React not at all.

**The order panel had a second bug underneath the first.** Pressing `＋`
rebuilds the route, which **remounts** the panel and discards its state — and
`null`, which its own doc comment has always said means "not asked yet", was
being rendered as the 🧺 "your basket is empty" block. So every press emptied the
panel for as long as the refetch took, and every first paint claimed an empty
basket to anybody who had one. The empty state now waits to be told
(`basket?.state === 'empty'`), and a module-level `lastSeen` per branch — only
ever written from inside the effect, so the server's copy of it stays empty and
no visitor can be handed another's — carries the last answer across the remount.
Pressing `＋` now moves the line, the panel total and the header together, with
nothing blank in between.

Verified by driving a real browser against a real priced basket: removing lines
one at a time takes the badge 6 → 3 → 2 → gone and the total with it, and `＋`
on the restaurant page moves panel and header in the same frame. `basket-count.spec.ts`
covers the cookie reading and the subscription, and guards both regressions at
the source, as `theme.spec.ts` does. 225 tests. Docs: `COMPONENTS.md`
(`BasketButton`, `OrderPanel`), `apps/web/README.md`.

### 2026-08-08 — The basket says which restaurant you are buying from

`/cart` gave the restaurant a name in a back chip and the same name again in a
grey subline under the title, and nothing else. That is enough to recognise a
restaurant and not enough to check one: nobody about to pay could see from this
screen **which address they were collecting from, or whether the kitchen was
open**. Web only — no API change, no schema change.

**`BranchCard`** (new, `components/BranchCard.tsx`) — cover, name, cuisine ·
price level, rating and reviews, and a tag row carrying the prep time, the
address and Open/Closed. It is built from the catalogue's own parts — `.media`,
`.tag`, `.tag.prep`, `.tag.good` — so the restaurant reads the same here as on
the card that was pressed to get here, and the whole card is the link, as
`RestaurantCard` is.

**It names a branch, and asks by branch id.** `dolmama` is two kitchens on two
streets, and a slug always resolves to one of them — so an address taken from
the basket's slug can be the wrong street. The card's prep time is the
**quote's**, not the branch's: the quote prices the dishes actually collected,
so a basket of one drink and a basket of four grills report different numbers
and both are true.

**The back button came off this screen.** The card leads to the same menu, and a
chip above it saying the restaurant's name a third time was the duplication, not
the navigation. The title's subline is now about the basket — the dish count and
the service mode. `＋ Add more items` still sits under the lines.

**Basket lines finally have their photographs.** The markup for one has always
been there; `POST /cart/quote` does not return `photoUrl`, so every line drew the
hatch placeholder. They are merged in from the branch's menu — a cached GET the
restaurant page already makes — and the quote's own field is still preferred for
the day the API starts sending it. Neither this fetch nor the card's may take
the screen down: both fall back (no card, hatched photos) so a basket still
shows what was collected and what it costs when the catalogue is unreachable.

**The two-row basket line is now the line at every width.** That layout already
existed below 560px, with the note that five things in one row "leave the dish's
name about five pixels" — which is just as true at 1440, where the basket column
is 476px and the photo, stepper, total and remove button take 347 of them.
Armenian dish names were wrapping into three lines inside ninety pixels. Same
card, same height: the photo is taller than both rows together.

Verified in the browser against a real priced basket in hy and en, light and
dark, at 1440px and at 400px. Docs: `SCREENS.md` (§ 4 Basket — which already
specified this banner, from the mobile artifact; the web had simply never drawn
it), `COMPONENTS.md` (`BranchCard`), `design/README.md` (tenth pass — the
departure from the web artifact's bare back button).

### 2026-08-08 — The footer no longer floats in the middle of a short page

On any screen whose content did not fill the window — the 404, an empty basket,
a profile asking someone to sign in — the footer stopped where the content
stopped and left a band of page colour under it, which reads as the page having
failed to finish loading rather than as the end of the page.

The page is now a **column**: `body` is `min-height: 100dvh` (with a `100vh`
line before it for engines that don't know the dynamic unit) laid out as a
flex column, and `.wrap` — the layout's `<main>` — takes the slack with
`flex: 1 0 auto`. Short pages push the footer onto the bottom edge; long pages
are untouched.

Two details that are the whole reason this is `1 0 auto` and not `flex: 1`.
The shorthand means `1 1 0%`, which measures the column from a **zero basis and
lets it shrink** — on a page taller than the window that is how content ends up
squeezed under a footer that thinks there is room. And a flex item with auto
cross-axis margins is **never stretched**, so `.wrap`'s existing `margin: 0
auto` would have collapsed the site to the width of its widest row; `width:
100%` restores what it had as a plain block.

The sticky header is unaffected — a sticky flex item still positions against
the scrollport — and so is its `backdrop-filter` dance with the location
dialog. Verified in the browser at 1500px of window (footer flush on the bottom
edge, 404 centred above it) and at 1000px (home page unchanged, full 1220px
column). Docs: `DESIGN_SYSTEM.md` ("Web page columns").

### 2026-08-07 — A table can be booked with nothing to eat

`POST /reservations` takes a branch, an instant and a party, and has never
wanted an order. But the only calendar on the web lived on `/checkout`, which
prices a basket, so "Book a Table" on a restaurant page stayed **drawn and
disabled** until a dish was collected. A guest who wanted a table for Saturday
had to put a burger in a basket to ask for one. **No API change here** — the
whole feature was screens the clients never had.

**It happens on the checkout, not on a screen of its own.** `loadBasket` grew a
**`booking`** kind — a basket with no lines that still names a branch, in
`dine_in` — and it carries no quote, because there is nothing to price. The
checkout draws the calendar, the guest stepper and the deposit from that exactly
as it does with food; what disappears is everything the quote fed: the lines,
the totals, the payment methods and the ready-time field. In "Your order" the
empty basket says so, with **"Order food ahead" linking to the restaurant** and
"Book the table" below it.

**This was briefly `/book/{slug}`, a page of its own, and that was wrong.** The
reasoning — checkout is built around a quote, a booking has none — was true of
the code and beside the point for the visitor: this is still the screen where
you settle when you are coming and what it costs, and splitting it left two
places that had to agree about the calendar, the stepper and the deposit.

**`bookTableState` lost its dead state and then its basket argument.** The
button is drawn wherever the restaurant takes bookings and always lands on the
checkout. What it does carry is the **branch**, because an empty basket names no
restaurant — `chooseServiceMode` opens a basket with no lines against it, and
only when nothing has been collected, so a basket with food in it can never be
quietly moved to another restaurant.

**`/[lang]/reservations` and `/reservations/{id}`** were built with it, because
a table booked on its own could otherwise never be looked at or given back —
`GET /reservations` and `POST /reservations/{id}/cancel` had existed all along
with nothing on the web calling either. Upcoming and past are split **by the
API**, not by reading a status here, so the screen and the back office cannot
disagree about whether a booking is over. The deposit line **reports** rather
than computes: `depositCredited` and the status arrive settled by
`depositOutcomeFor`, the same function the owner panel's no-show path calls.

`/cart` handles the new kind too: a basket holding a table and no food is the
same nothing there, so it draws the empty state — but points at the restaurant
already chosen rather than the home page.

27 keys in all three dictionaries, and `/reservations` joined the `PRIVATE` list
in `robots.ts`. Booking needs no entry of its own: it is `/checkout`, already
listed.

Verified end to end in a browser against the running app. From a restaurant page
with an **empty basket**: "Book a Table" live rather than disabled → `/checkout`
with "Your order" reading "Add a dish to start", the deposit at 4 000 ֏ and two
buttons → signed in by OTP → booked → "✓ Table booked", the booking button gone,
"Order food ahead" pointing at `/ru/r/burger-bros`. The row landed in the
database with **no order against it** — a table and nothing else — and was then
cancelled from `/ru/reservations`, deposit returned.


### 2026-08-07 — Checkout stops offering a booking mode that leads nowhere

`/[lang]/checkout` drew **Table booking** beside **Pre-Order** at every
restaurant. At one that takes no bookings the tile's only destination was the
"This restaurant does not take bookings" notice — a door painted on a wall.
It is drawn only where a table can actually be booked now.

**Which needed a new field, because neither existing one answers it.**
`GET /cart/quote` gains **`reservationsEnabled`**: `reserve` declared **and**
bookings not paused, the same pair `GET /restaurants/{id}/availability` and
`POST /reservations` already gate on. `eatInRequiresBooking` looks like it would
do and does not — it is the *declaration*, so it stays true through a pause, and
it is false at a place declaring `reserve` alone because there is no pickup pair
for a dead half to sit under. The pause switch is not in `services` at all, so
no client could derive this even in principle. It is `bookableAt` in
`orders.service.ts`, built from `resolveBranchOffering` like everything else
that asks what one address offers.

**Both entrances to the calendar close together.** The dead "Eat at the
Restaurant → Only by booking a table" tile under Pre-Order is gated on
`reservationsEnabled` too; on `eatInRequiresBooking` alone it would have
reopened exactly the dead end the mode tile was hidden to avoid.

**A lone option is drawn, not hidden** — in both blocks on this screen, which
is a reversal of the rule the pickup pair used to follow.

Dropping the mode row wherever booking was unavailable (which this entry
originally did) left the screen opening on "Pickup type" with nothing above it
saying what was being picked up. The artifact does not do that: `fulfillModes`
maps `modeKeys` with no minimum, so one mode draws one tile. The same argument
applies to the pickup pair, which the artifact *does* gate on
`subKeys.length > 1` — a take-away-only restaurant drew no section at all, so
*what happens to this food* was answered nowhere, when stating it is the one
thing that block is for. Both now draw the single entry, ticked: not a question,
a label. See `docs/design/README.md` (ninth pass) for the departure.

A restaurant that has declared **nothing** still draws no pickup section, since
`pickupOptions` is then empty — there is no ending to name, and inventing one
would be the screen answering what the API did not.

**A basket already `dine_in` keeps the tile** even where the answer is no: a
restaurant can pause bookings mid-checkout, and hiding the mode somebody is in
would leave them looking at the refusal with nothing to press. That is now the
only way to reach the notice.

Checked against the running app across every kind of restaurant: `reserve` draws
both modes and the dead eat-in door; `dinein` draws one mode and two live
endings; pickup-only draws one mode and the single "Takeaway"; a restaurant that
declared nothing draws one mode and no endings. And, by pausing one branch's
bookings and putting it back, the two cases that motivated the field: paused
with a pickup basket offers nothing dead, paused with a dine-in basket keeps the
tile and the notice so there is a way out.

### 2026-08-07 — The sign-in phone field was 26px tall inside a 54px pill

`#phone` in `PhoneField` had `height: 26px`. The artifact draws a 54px row with
a **`1px × 26px` divider** between the dial code and the number, and the input at
`height: 100%`; transcribing that divider as the input's `border-left` carried
its 26px onto the field itself.

Two things were wrong as a result, both measured in the running app rather than
reasoned about. **Only a band across the middle of the field took a click** —
`elementFromPoint` at the top and bottom of the right half of the pill returned
the wrapping `div`, not the input; it returns `#phone` at all three heights now.
And **the focus ring was drawn around that band**, a 26px box floating inside a
54px field.

The divider is its own element again, as the design has it, so a hairline's
height can no longer become a field's. The ring moved to the **pill**: that is
the field a visitor sees, and it is the shape the invalid state already uses
(`.phone-row:has(input[aria-invalid='true'])`). The per-control rings stay as a
fallback where `:has` is unsupported, and are correct now that both controls
fill the row.

### 2026-08-07 — The web sign-in is the artifact's auth card, tabs and all

`/[lang]/signin` was a bare heading over a stacked form. The web artifact draws
a centred card with a **Log in / Sign up** tab pair, a name field on the sign-up
side, the phone pill, the OTP note, the CTA and the terms line — and that is
what the page is now (SCREENS.md §14c).

**The tabs choose a field, not an endpoint.** There is one credential and one
call behind both: `verify-code` already took an optional name and upgrades the
guest account in place, so signing up is the same flow with the name field
showing. The artifact agrees — both of its tabs run one `submitAuth`. Nothing
on the page can tell a returning number from a new one before the code is
confirmed, and it does not need to. The name is a hint, not an instruction: the
API fills it in only where there is none already, so confirming an existing
number cannot rename that account from a form.

**They are links (`?mode=register`), not buttons.** The whole order flow works
with JavaScript off, and a client-side toggle would be the one control on it
that does not. The tab, the name and the number therefore travel in the query
string across the code step and every bounce back with an `?error=` — otherwise
somebody halfway through signing up lands back on the log-in tab with the name
they typed gone.

**The country picker is the one departure from the artifact.** The artifact
prints a fixed `+374`; `PHONE_COUNTRIES` has eight countries with their own
grouping rules, and `requestCode` refuses a number whose country was not named,
so dropping the select would have dropped the other seven. It sits inside the
same pill instead — and each option now leads with the dial code, because a
select narrow enough to leave the number room truncates, and the first render
of this cut `+374` in half.

The artifact's auth heading, tab, CTA and register strings were missing from
`packages/i18n` (only the mobile screen's subset was there): `authLoginHead`,
`authRegisterHead`, `authLoginCta`, `authRegisterCta`, in all three languages.

**No Apple/Google buttons — the web artifact has none.** Its only "Google" is
Google Pay at checkout. The *mobile* artifact does draw them, and they remain
unbuilt on both clients for the reason SCREENS.md §0 has always given:
`POST /auth/social` does not exist.

### 2026-08-07 — The mobile app's committed API address had gone stale

`app.json`'s `extra.apiUrl` pointed at `192.168.27.6`, a dev machine DHCP has
since moved to `.5`, so every screen in the app rendered its chrome and then
said "Cannot reach the server". Updated to the current address.

The value being committed at all is the trap — it is a lease, not a constant,
and it will go stale again. `apps/mobile/README.md` now says so, along with the
part that makes it hard to diagnose: **Metro bakes the resolved config into the
bundle and caches it**, so editing `app.json` and restarting still serves the
old address. The symptom is identical to not having edited it, and
`expo start --clear` is what actually applies the change. The README also
described `extra.apiUrl` as holding `localhost:3000`, which it has not for some
time.

### 2026-08-07 — The checkout's party size is the artifact's stepper, not chips

`/[lang]/checkout` drew a chip per seat to ask how many people are coming. The
web artifact draws a `− [count] +` stepper there, which is also what the app has
always drawn, so the web now draws it too.

**Why the chips were the wrong control anyway.** They put up to twelve
near-identical targets on screen to answer a question whose answer is nearly
always two or four, and the row grew with the branch: a restaurant seating
twelve wrapped onto a second line of buttons that all look alike. A stepper is
two targets whatever the branch seats.

**The markup did not change.** Both buttons are still `type="submit"` on the
checkout form with `name="guests"`, exactly as the chips were — the party size is
server state (it re-prices the deposit), and a GET to a new URL would redraw the
page with the date-and-time field above it emptied. Each carries the number it
would produce rather than a direction, so the arithmetic stays in the page and
`submitCheckout` goes on taking one `guests` value and clamping it to
`RESERVATION_MAX_GUESTS`. Two buttons rather than a number input, for the same
reason the basket's quantity stepper is two forms: this works with no
JavaScript, and a field typed into with no button to press would do nothing.

**But pressing one is no longer a navigation** (`GuestStepper`, the first client
component in the checkout). Submitting the form ran `chooseTiming`, which
redirected to the page it was already on: the router replaced the whole tree and
the customer watched the entire checkout blink for the two API round-trips it
takes to re-price a deposit — to change one digit. The scroll jumped with it.

The component now intercepts the click when it can: `preventDefault`,
`useOptimistic` moves the count at once, and a new `changeGuests` action stores
the party and revalidates **without** redirecting, so React patches the count and
the deposit in place. Measured against the running app: **no top-frame
navigation at all**, the count moves in ~30ms and the deposit follows at ~300ms,
the scroll position holds, and the `datetime-local` above keeps both its DOM node
and a time typed into it but not yet posted.

`changeGuests` takes the **whole form**, not a number, so the guarantee
`rememberTiming` exists for still holds — an unposted time travels with the
press exactly as it did when this was a chip submitting the form.

**The deposit is not moved optimistically, only the count.** It is money, and
this client does no arithmetic on money (DEVELOPMENT_GUIDE.md) — `depositAmd` is
sized by the server for the party. The number answers instantly and the amount
follows; showing a figure the page guessed and then correcting it would be worse
than showing the old one for a moment.

**With JavaScript off nothing above happens and the stepper still works** — the
submit is the fallback, not a leftover. Verified by clicking `+` with script
execution disabled: one navigation, party 2 → 3, deposit 4 000 → 6 000 ֏.
`chooseTiming` keeps its redirect for exactly that path, so a reload does not
re-post the form.

**Where it stops.** `−` at 1, `+` at the smaller of `RESERVATION_MAX_GUESTS` and
the branch's `maxSeats` — the same ceiling the chips were generated from, so no
party that could be asked for before is refused now. At the top a grey "(max)"
appears beside the count, since a `+` that has quietly stopped working says
nothing on its own. A disabled button keeps its place rather than being hidden.

New keys in all three dictionaries: `guestsFewer`, `guestsMore` (the buttons'
accessible names — the glyphs are `−` and `+`) and `guestsMax`. `.guestpicker`
and `.guest` are gone from `globals.css`, replaced by `.guest-stepper`. The
button class is `guest-step` rather than `step` because `.step` is already the
order tracker's progress segment, and its `flex: 1` stretches anything that
takes the name across the column — a `flex-basis` of 0 beats any `width` set
beside it.

Docs: SCREENS.md (both the booking block and the web-vs-app table),
COMPONENTS.md (`GuestPicker`, and `GuestStepper` beside it), DESIGN_SYSTEM.md
(the two steppers are now described separately, and "Guest chips" is marked
removed).

### 2026-08-07 — The checkout's two times are the artifact's fields, not grids

"Date & time" and "Ready at" on `/[lang]/checkout` are now drawn as the web
artifact draws them: a 50px row with an accent glyph and a native field in it —
`datetime-local` at `step=1800` for the table, `time` at `step=900` for the
food. The seven-day pager, the reservation slot grid and the ready-time pills
are gone. `docs/design/README.md` had recorded both fields as **deliberate**
departures; that entry is reversed and the reasoning is kept beside it.

**What the old objection got right.** A grid could only offer times the API had
just agreed to, and a field can name one it will not. So that is handled instead
of avoided: `min`, `max` and `step` keep the obviously-impossible out of the
browser's picker, and `POST /reservations` answers the rest — a closed day, an
off-grid minute, a party no table seats, a table already taken — with a 422 the
page draws above the fold under one message (`slotUnavailable`, new in all three
dictionaries). What it missed is that the grid was never safe either: a slot
could be taken between drawing it and pressing it, which is the `slot_taken`
path that already existed. The real cost is **discoverability** — the grid
showed which times were free and the field does not.

**Three things moved with them.**

- **The party size is in the basket cookie, not the URL** (`Cart.guests`, and
  `Cart.reservedFor` beside it). The chips were links, and a link is a fresh GET
  that would redraw the page with the date-and-time field emptied — a native
  field holds its value nowhere but the page. They are submit buttons now, and
  the pair survives a party change, a trip through `/signin` and a refused
  booking. Both are dropped when the mode leaves dine-in, like `reservationId`.
- **The left column is one form with an `intent`** (`submitCheckout`, which
  replaces the exported `placeOrder`, `bookTable` and `chooseReadyAt`), so
  nothing on the screen can empty anything else on it. `intent` on the button
  rather than a `formAction` per button, because React encodes which action a
  `formAction` names in that button's own `name` and the chips need theirs.
- **The CTA is one button with two meanings**, as the artifact draws it: "book
  the table" while a dine-in basket has none, the payment once it has. It used
  to be a warning notice pointing at a slot grid that no longer exists.

**"As soon as possible" is now an empty field**, with a hint saying so. The pill
that carried it is gone and the artifact draws nothing in its place, but the
meaning is real — no `readyAt` at all is what `POST /orders` reads that way.

New: `READY_STEP_MINUTES` exported from `packages/shared` so the mobile grid and
the web field cannot come to disagree about the grain; `yerevanDateTime`,
`instantOfYerevan`, `instantOfYerevanTime` and `yerevanStepUp` in
`apps/web/src/lib/format.ts`, because a native field speaks wall-clock readings
with no zone on them and everything either side of it speaks instants — and the
clock is the restaurant's, not the reader's. `color-scheme` now follows the
theme switch and not only the system, or a page put into dark opens a white
calendar over itself.

**Left open, and written down rather than settled in passing:** the web artifact
draws "Ready at" for a dine-in basket too, which contradicts `SCREENS.md` §5 —
the table already answered that question, and asking twice lets somebody hold a
table for 19:30 tomorrow and have the food cooked this afternoon. That
contradiction predates this change; the note is now in `SCREENS.md` beside the
rule.

Docs: `SCREENS.md` (§5, and the app/web table), `DESIGN_SYSTEM.md` (§6 Forms —
the clock field and its `color-scheme`), `docs/design/README.md` (eighth pass),
`apps/web/README.md` (checkout).

### 2026-08-07 — A restaurant that takes bookings says so before you have ordered anything

The order panel's "Book a Table" was gated on `canBook` **and** the basket
having something in it. The artifact gates it on `canBook` alone — its `sc-if`
sits above the lines and above the empty-basket state alike — so a restaurant
that takes bookings looked like one that does not until somebody had already
chosen a dish, which is the one moment they have stopped deciding where to eat.

It is now drawn whenever the restaurant takes bookings, and **disabled** rather
than absent until this restaurant's basket has a dish in it. That is not a
second opinion about when to offer it: the calendar lives on `/checkout`, which
prices a basket, and `POST /cart/quote` refuses one with no lines
(`@ArrayMinSize(1)`), so a press could only land on the basket page saying "add
a dish". A basket collected at another restaurant waits too — that is not this
restaurant's table to book — and so does a panel that has not heard back yet.

The rule is `bookTableState` in `lib/order-panel.ts` rather than a condition
inside the JSX, because this is exactly the kind of condition that gets quietly
tightened; it has its own tests. The button also picks up the artifact's
`display:flex` centring and 9px glyph gap, and a disabled state that keeps its
colour at half strength beside the panel's own "add a dish to get started".

Docs: `COMPONENTS.md` (`OrderPanel`), `SCREENS.md` (app/web comparison).

### 2026-08-07 — A basket the API will not price no longer takes the page down with it

`/cart` rendered an error screen — the raw `ApiError` throw site in
`lib/api.ts` — whenever `POST /cart/quote` answered with anything other than
`401`. Two of those are ordinary and reproduce against a running API: a basket
whose branch has been withdrawn (`404 Restaurant not found`) and one carrying a
table booking that has since been cancelled (`404 Reservation not found`). The
basket cookie is **httpOnly**, so the screen that could have cleared it was the
one failing, and the customer had no way off it short of devtools.

`loadBasket` now returns one of three states — `empty`, `priced`, `stale` —
instead of a basket-or-null that threw on the third. `/cart` renders the stale
one as the empty state's twin: the same shape, with "Start a new basket" wired
to the `emptyBasket` action. `/checkout` sends anything that is not `priced` to
`/cart`, which is where it is explained.

**A `5xx` still throws.** That is the API breaking rather than the basket going
out of date, and telling somebody to rebuild a basket that was never the problem
would be the wrong instruction. The refusal is logged server-side with its status
either way — which dish or which booking went missing is a developer's question,
and the page says only that the basket has to be started again.

This is the rule the Server Actions already stated (`actions.ts`: "a basket that
has gone stale ... should read as a message on the screen they are on, not as an
error page that loses their basket"); the page render was the one path that did
not follow it. Docs: `SCREENS.md` §4 and the app/web comparison.

### 2026-08-07 — A dish may take 0 minutes, because some of them do

The menu form refused a prep time of zero (`@Min(1)` in `menu.dto.ts`, matched by
`dishFormValid`), so the only way to put a bottle of water on a menu was to leave
the box empty — which does not mean "no wait", it means "no estimate", and the
branch's average then promised a wait for something that is handed across the
counter. **`prepMin` is now `0…480`** on both create and PATCH, and the panel
accepts a typed `0`.

**Three states, not two.** Absent leaves an estimate alone, `null` takes it back,
and `0` is a dish claiming it needs no cooking. `dishPatch` already distinguished
an empty box from a typed number by trimming rather than by truthiness, so it
sends `0` correctly; the DTO test that `null` survives transformation matters more
now, because `@Type(() => Number)` applied to `null` would produce a `0` that
validates and would quietly store "needs no cooking" in place of "no longer says".

**`estimatePrepMinutes` counts a declared `0` as declared.** It filtered on
`min > 0`, which treated a zero as an unfilled column and fell through to the
branch average — for a basket of nothing but drinks that invents a wait out of a
number somebody did fill in. Beside food nothing changes: the estimate is the
maximum, so a bottle of water never made a burger slower and still does not. Only
`null` reaches the fallbacks now.

The panel's hint says so in all three languages. Docs: `BUSINESS_LOGIC.md` §4 and
the menu-edit section, `API_DOCUMENTATION.md` (quote + menu-item rules),
`COMPONENTS.md` (`dishFormValid`/`dishPatch`).

### 2026-08-06 — The restaurant page is the drawing again: the tabs filter, and the card the artifact never had is gone

Read against `design/Amragrir Web (standalone).html`, the page differed in four
places. Two were measurements; two were decisions worth re-opening.

**The menu tabs filter now**, one category on screen and the chosen pill dark, as
the artifact draws them. They were anchors that scrolled a page rendering every
section at once, because the whole menu has to reach a crawler — that premise was
right, and it never required the tabs to look different. They filter **in CSS**:
each pill is a `<label>` around a radio, and `.menu:has(input[value=…]:checked)`
picks the section to paint. Every section is in the markup unconditionally, so
the crawler still gets the whole menu and the tabs still work with JavaScript
off. The rule is gated on `@supports selector(:has(*))` — a browser that applied
`display:none` to the sections but not the rule that brings one back would draw a
menu with no dishes on it. Without `:has()` the page is what it was: every
section at once, under visible headings.

**Section headings are no longer drawn** but stay in the markup, hidden. The pill
says the word already; a flat run of cards with no headings has no structure for
a crawler or a screen reader to read.

**The "order ahead / call" card is removed.** The artifact draws nothing there,
and the reason recorded for keeping it — "with JavaScript off it is the only
route from a restaurant to its basket" — was **false**: the header's basket pill
renders as `<a href="/ru/cart">` in the server's markup on every page, verified
in the response. The phone went with it; the artifact puts no number on this
screen, and the branch's number is still emitted as `telephone` in the page's
JSON-LD.

**The title sat 52px under the banner where the drawing puts it at 26** —
`.rest-head` carried a `margin-top:26px` inside `.rest-grid`, which already has
one. Everything else already matched the artifact to the pixel.

Removed with them: `.cta` and its five rules in `globals.css` (`.cta-action`
stays — the hero and the 404 use it), `telHref` in `lib/format.ts` and the spec
that covered only it, and the strings `orderInAppHint` and `callRestaurant` in
all three languages. `orderAhead` stays, used by the home hero.

**Not changed:** the artifact's meta line and `📍` chip both show a distance.
That needs the visitor's coordinates from a cookie, and a `cookies()` call here
would opt all 69 pre-rendered restaurant pages out of static rendering — the one
trade this app does not make. The chip keeps the branch's street address.

Verified in the running app at `/hy/r/tashir-pizza`: one section painted, the
other two present in the HTML and hidden, the first pill dark.

### 2026-08-06 — Un-choosing a place brings the map back to Yerevan

The map already **opened** on Yerevan with nothing chosen — `YEREVAN` in
`lib/locations.ts`, Republic Square at zoom 12, which is also the centre the
geocoder biases searches around. What it did not do was go *back* there. The
`useEffect` in `YandexMap` that frames a place arriving from outside began
`if (!value) return;`, so `null` — the one value that means "the whole city" —
was the only one it ignored.

That was invisible until the ✕ on the badge was added earlier today, because
until then nothing could set `null` on an open dialog. With it, pressing ✕ left
the map exactly where it was: framed at zoom 16 on the single street the visitor
had just rejected, while the badge beside it read "Yerevan · all districts". The
map now returns to the `YEREVAN` view, so "no place" looks the same however it
was arrived at.

Two tests guard the constant itself (`lib/locations.spec.ts`): that it sits
inside Yerevan, and that its zoom holds the city rather than one street. A
slipped decimal there would move the opening view *and* skew every address
search, in a place nothing else would report.

Also swept up: comments left stale by the chip removal — in `locations.ts`,
`recent-places.ts`, `map-frame.ts`, the geolocation-failure note in
`LocationPicker`, the map's keyboard note in `YandexMap`, and two test names in
`locations.spec.ts` that described the districts as radio values.

### 2026-08-06 — The district chips are out of the location picker, and choosing a place now needs JavaScript

**Removed:** the `locpick-chips` `radiogroup` in `components/LocationPicker.tsx`
— "all districts" plus the artifact's six, as `<label>`s over radios — and
everything that existed only to serve it.

That row was the picker's whole no-script story: the browser tracked the
selection, confirm posted it as `preset`, and `chooseLocation` read that field
when `place` came back empty. So **the dialog no longer chooses anything without
JavaScript.** It still opens, reads and closes natively; confirm there posts an
empty place, which is the whole city — the state such a reader already had.
Nothing on the ordering path asks for a location, so what this costs is the
distance on a card and the "near me" sort, both already absent for anyone who has
not answered. Recorded rather than glossed: it is a real reduction in what the
site does without a browser, and `SCREENS.md`'s "every step works with JavaScript
disabled" now carries the exception.

**Two things had to change with it, neither of them cosmetic:**

- **The un-choose was rebuilt.** "All districts" was a chip in that row and the
  only way back to the whole city; deleting the row alone would have made a
  visitor's first choice permanent. It is now a ✕ on the glass badge that names
  the pending place — `.locpick-unset`, scripted like everything else left.
- **The search box is gone when there is no geocoder key.** Without a key it
  never searched addresses — it filtered those chips, which is why it had a
  placeholder of its own. With nothing left to filter, typing in it could not
  change anything on the screen. An unkeyed deployment is now map, recents and
  confirm.

**Dead code removed with it:** `showAll`, `presets`/`shownPresets` and the
`matches()` helper in the component (`DrawnMap` takes `AREAS` directly now); the
`preset` fallback in `chooseLocation`; `.locpick-empty`, the hidden-radio rules
and the `:has(input:checked)` half of the chip's on-state in `globals.css`; and
three strings per language — `locDistricts`, `locAddressSearchOff` and
`locSearchPlaceholder` (the no-key placeholder, "Search a district…").

`AREAS` stays: the six districts are still the vocabulary points are named in —
`nearestArea` labels a tapped point when no geocoder can do better, and the drawn
placeholder still draws their pins — they are simply no longer a control.
`@amragrir/web` typecheck and its 193 tests are green; no test covered the
removed markup.

### 2026-08-06 — The pin on the real map is the artifact's pin, and there is now only one of it

The picker has two maps — the artifact's drawing, and Yandex's widget — and they
were marking a point with two different things. The drawing used the artifact's
pin, transcribed exactly. The real map used a CSS box rounded into a teardrop
(`border-radius: … / 44% 44% 60% 60%`), **which is an egg**: it has no point on
it. So on the only map where the answer is a specific spot on a specific street,
the marker could not say which spot it meant.

The shape now lives once, in `components/MapPin.tsx`, drawn around its own point
at the origin. The drawn map places it with a `translate()` inside its own
coordinate space; the real map renders it as a 26×35 `<svg>` over the frame,
translated `-50%, -90%` so that the **tip** — 90% down the box, which is what
`PIN_TIP` records — lands on the coordinate rather than the middle of the head.
Nothing about the shape itself changed; there is simply no second copy of it to
get this wrong again.

Verified in the running app at 1440px, light and dark: the pin sits on
`Կենտրոն` with its point on the street, white ring, white centre and the ground
shadow the artifact draws, and the drawn placeholder is unchanged.

### 2026-08-06 — Yandex does speak Armenian, and a search now answers in the alphabet it was asked in

**`yandexLang('hy')` returned `en_US`.** The comment above it said Yandex had no
Armenian; it does. `lang=hy_AM` answers `Վարդանանց փողոց, 10 · Երևան, Հայաստան`,
and the map widget draws its labels *and its own controls* in Armenian. The
claim was made without a key to test it with, and it cost the product's default
language its own alphabet — on the map, in the search results, and in the name
of every point tapped. Fixed, and the wrong reasoning is recorded next to the
right answer so it does not get re-derived.

**And the language of a search now follows the query, not the page.** Typing
`Վարդանանց` on the Russian pages returned Russian results — an answer in an
alphabet the reader did not type in, which is the moment a search box stops
feeling like it understood you. `queryLang` reads the script instead: Armenian
→ `hy_AM`, Cyrillic → `ru_RU`.

**Latin deliberately does not count.** `Vardanants` is how the street is written
in a Russian reader's transliteration *and* an Armenian one's, so it says
nothing about which language is wanted — where each of the two non-Latin scripts
belongs to exactly one. Latin therefore keeps the page's language, and only an
unambiguous script overrides it. A tap on the map asks in no alphabet at all, so
its address follows the page.

Verified against the live geocoder in every combination: Armenian query → five
Armenian suggestions on the Armenian, Russian and English sites alike; Russian
query → Russian everywhere; Latin → the site's own language; reverse → the
site's. Then the whole round trip on the Armenian pages — Armenian map, Armenian
suggestions, `Հանրապետության փողոց, 42-46` for a tapped point, and the header
reading it back out of the cookie.

### 2026-08-06 — Address search is on, and the keyed path is verified at last

A working `YANDEX_GEOCODER_API_KEY` arrived, and the half of the picker that
had only ever been unit-tested was finally exercised against the real thing.
It works, in all three languages, with one change needed on the way.

**Choosing an address now takes the map there.** The rule was "move only if the
point is not already on screen", which is right for a tap and wrong for a search
result: picking `Вардананц 10` from the list left the pin as a dot 17 pixels off
the centre of a whole-city view. It now frames any place that came from outside
the map at street zoom. The tap case is unaffected and did not need the
distance test to stay still — a tap writes its own point in before it reports
it, so it never reaches that code. One guard fewer, and the better behaviour.

Verified end to end at 1280px: `Вардананц 10` → five suggestions, Yerevan first
and the Ashtarak/Vanadzor/Taperakan namesakes below it (that is `ll`+`spn`
doing its job) → picking one re-points the frame to `44.518565,40.177291` with
the pin dead centre → a tap on the map now answers with a street rather than a
district, `улица Анрапетутян, 42-46` → confirm writes
`amr_loc=40.176303~44.51599~…` and the header reads it back. Reverse geocoding
in `hy` answers in English, as designed — Yandex has no Armenian.

One thing worth writing down for the next person holding a key that "does not
work": **percent-encode Cyrillic yourself when testing by hand.** A shell that
mangles it makes Yandex answer `found: 0` for `Ереван`, which reads exactly like
an account with no Armenian data and is not.

### 2026-08-06 — A broken geocoder no longer looks like an empty city

`GET /[lang]/geocode` swallowed every failure into `{ items: [] }`, so a key
Yandex refuses was indistinguishable from an address nobody has heard of — and
that is the failure that actually happens, on the day somebody deploys. It now
answers `{ items: [], failed: true }` and the picker reads it: the results list
says *"Search is temporarily unavailable"* (`locSearchFailed`) instead of
*"Nothing found"*.

The reason goes to the server log, where the operator is, rather than to the
visitor: `[geocode] Yandex answered 403: {"message":"Invalid api key"}`. **The
URL is never logged** — the key is in it.

Found by installing a real key and watching the dialog say "nothing found" for
`Вардананц 10`, which is a street that plainly exists.

**How to tell a refused key from a wrong one** is now written down in
`.env.example`. Three keys were tried — one per product, Geocoder included —
and all three answered 403 identically on every service that validates a key,
which points at the account rather than the product. The trap worth recording:
`api-maps.yandex.ru/2.1/` answers **200 for any key and for none**, so it is
not a test of anything; `geocode-maps.yandex.ru/1.x/` is. Also recorded there:
**Geosuggest is not a substitute** for the Geocoder — it returns no coordinates
at all, and the `uri` it returns instead is resolved by the Geocoder.

Typing a street into the picker with no `YANDEX_GEOCODER_API_KEY` configured
answered "Այդպիսի թաղամաս չկա" / "No district by that name" — true, since
without a geocoder the box filters the six presets, and useless to somebody who
was plainly typing an address. That dead end now says which search this is and
what to do instead: *"Address search is unavailable. Pick a point on the map, or
a district from the list."* (`locAddressSearchOff`). `locNoMatches` — still what
the results list shows when the geocoder answers with nothing — was reworded to
the general "Nothing found", since with a geocoder it is not about districts.

**A keyless geocoder was investigated and rejected.** Nominatim (OSM) and Photon
were both queried with the addresses this product's readers actually type:
`Вардананц`, `Северный проспект` and `Վարդանանց` return **nothing** from either,
while `Vardanants 10` resolves correctly. OSM has Yerevan's streets in Armenian
and English, and its Russian index is effectively empty — so a keyless address
search would be a search box that finds nothing in two of the three languages
this app ships. Yandex's geocoder remains the only good answer here, and it
needs its key.

### 2026-08-06 — The picker's map is a frame, and needs no key

The entry below made the picker's map real and made it Yandex's **JS API v3**,
which needs a key. There is no key here, so what the dialog actually showed was
the fallback: a drawing of a city that is not Yerevan. The map is now **Yandex's
public map widget in an `<iframe>`** — no key, no quota, no script on the page —
so it works in this deployment and every other one.

`NEXT_PUBLIC_YANDEX_MAPS_API_KEY` is gone, and with it the last public key in
this app. `YANDEX_GEOCODER_API_KEY` is unchanged: still optional, still server
side behind `GET /[lang]/geocode`.

**A cross-origin frame cannot be read, so it is not asked.** A tap inside the
frame is Yandex's tap and a pan inside it is Yandex's pan — neither is
reportable out here, and a frame left interactive would show one place while the
pin claimed another. The frame is `inert` and the app owns the viewport: the pin
is an element drawn over it, panning is a CSS transform, and the new
`lib/map-frame.ts` projects pixels to coordinates. **Tapping picks the point
under the finger; dragging looks around and picks nothing.** Zoom is two buttons.

Neither tapping nor dragging reloads the widget. The frame is drawn 220px larger
than its box on every side, so a drag slides real tiles into view; only a zoom,
or a pan that has spent most of that margin, re-points the URL. A place chosen
somewhere else — a preset, a search result, geolocation — moves the map only if
it is not already on screen, so the map never jumps under the hand using it.

**The projection is ellipsoidal Mercator (EPSG:3395)**, which is what Yandex's
tiles use, not the spherical EPSG:3857 of most other maps. The difference is
0.4% of every north-south movement: a pin in the wrong street, with nothing
anywhere reporting an error. A round trip cannot catch it — spherical is
perfectly self-consistent, it just disagrees with the tiles — so the test writes
the spherical formula out beside it and asserts the gap between them.

**The map is built when the dialog opens**, never before: an iframe inside a
closed `<details>` still loads, and this control is in the header of every page.
Verified — zero frames and zero requests to Yandex on a page view; one frame
after the dialog opens; none at all with JavaScript off, where the drawing and
the six presets are still the whole dialog. The drawing is therefore a
placeholder now rather than a fallback for a missing key, and the "map
unavailable" note (`locMapOffline`) is gone with the reasoning behind it: a
frame cannot honestly report that it failed to load.

Two things the widget draws for itself had to be drawn again, because the bleed
pushes the frame's own corners out of sight: its attribution, now a link to the
same view on `yandex.ru/maps`, and its dark scheme, now asked for in the URL —
a frame inherits none of this page's tokens, and a dark page was opening a
dialog with a white rectangle in the middle of it. New keys: `locMap`,
`locMapCredit`, `locZoomIn`, `locZoomOut`.

Verified in a browser this time, on the real map: opening, tapping (the pin
lands exactly under the pointer and the frame does not reload), dragging (the
selection holds still, the frame re-points once past the margin), zooming, the
credit link following the view, both themes, 390px and 1280px, and the whole
round trip on a phone — tap, confirm, `amr_loc=40.188133~44.533199~…`, header
reading it back. What is still unexercised is the **geocoder**: with no key the
route answers empty by design, so address search and reverse geocoding are
covered by unit tests only.

Docs: `COMPONENTS.md` (`YandexMap` rewritten), `SCREENS.md`,
`DEVELOPMENT_GUIDE.md` (the app now ships no public key at all),
`design/README.md` (fifth pass), `apps/web/README.md`, `.env.example`.

### 2026-08-06 — A real map in the location picker, and the points you chose before

The dialog added earlier today drew the artifact's hand-drawn city and offered
the six districts pinned on it. It now shows **Yandex's map**, any point on it
can be chosen, and the five most recently chosen points sit under the search box.

**What is stored changed from a district to a point.** `amr_loc` held
`kentron`; it now holds `lat~lng~base64url(label)` — a `Place`, which is what
`GET /restaurants` has always taken. The district was only ever a way of
producing a coordinate without a map. `parseArea`/`areaQuery` became
`parsePlace`/`placeQuery`, and the home page and the "near me" chip follow the
same rule as before, one field wider. The old cookie value parses as "no place",
so an existing visitor lands on "all districts" and chooses again rather than
seeing a broken header.

That cookie alphabet is deliberate: every character `encodePlace` can produce is
one `encodeURIComponent` leaves alone. Next URL-encodes cookie values on the way
out and the browser reads `document.cookie` raw, so anything else would be a bug
that appears only for names with a space in them. A test asserts the property
rather than the format.

**The six districts survive as presets** — the answer with no JavaScript, the
answer with no map key, and six fewer taps for the answer most people want. Each
is a `Place` like any other, so nothing downstream knows the difference.
`chooseLocation` reads two fields in order: `place`, which the browser fills in
from the map, the search, a preset or geolocation, and `preset`, the radios,
which is what a page with no script has to offer. Two names rather than one,
because a single name would leave which value won depending on where the fields
sit in the document.

**Recents are `localStorage`, not a cookie.** Only this dialog ever reads them,
and a cookie would ride along on every request to every page for a row of chips
most visits never see. Five entries; two points within 120m of each other are
the same place, so a map tap repeated slightly off does not fill the row with
one street corner.

**Two keys, and they are not the same kind of thing.**
`NEXT_PUBLIC_YANDEX_MAPS_API_KEY` reaches the browser — a tile cannot load
without it — and its safety is the domain restriction set on it in Yandex's
console. `YANDEX_GEOCODER_API_KEY` cannot be restricted that way, so it stays on
the server behind a new route handler, `GET /[lang]/geocode`, which does both
forward and reverse lookups; the browser is only told *whether* there is one.
Both are optional and degrade separately: no map key falls back to the drawn map
and the presets, no geocoder key names a tapped point after the nearest district
rather than by its address. `apps/web/.env.example` is new and says so beside
each variable.

The map script is ~300KB and loads **on demand**, once per page, the first time
the dialog opens. A load that fails — offline, ad blocker, a key Yandex
refuses — falls back to the drawn map with a note saying the map is unavailable,
rather than letting a decoration pass for something tappable.

**Not verified in a browser: the keyed path.** *(Since verified — see the entry
of the same day above.)* There is no key in this repository, so what has been
exercised end to end is the fallback — drawn map, presets, recents, cookie round
trip — plus the geocode route answering empty with no key. The Yandex-facing
logic was split into `lib/geocode.ts` as pure functions and unit-tested for the
parts that fail silently: the language mapping, the script URL, the geocoder
URL's **longitude-first** coordinate order, and parsing a response shape that is
optional at every level.

Docs: `COMPONENTS.md` (`LocationPicker`, new `YandexMap`), `SCREENS.md`,
`USER_FLOW.md`, `DEVELOPMENT_GUIDE.md` (which keys may be public and why),
`design/README.md`, `apps/web/README.md`.

### 2026-08-06 — "Выберите локацию" opens the artifact's dialog

The header's location control was a 280px dropdown listing six districts. The
design draws a dialog — 760×640 over a scrim, a map of the city with a pin on
each district, a search box, the chosen district named on a glass badge, "use
current location" and a confirm button — and that is what it opens now.

It had been built as a list on the reasoning that the dialog needed a map nobody
could draw and a geocoder nobody had. Re-reading the artifact, half of that was
wrong. **Its map is not a map**: it is a hand-drawn SVG of five streets and a
river, and the only things on it that mean anything are the six pins, which are
the six districts the dropdown already listed. **Its search box does not
geocode**: `locQuery` filters those six by name. And **"use current location"**
is a browser permission prompt, which a server-rendered page cannot ask for but
this control can — it has been a client component since the day it was built, so
that all 69 restaurant pages stay pre-rendered. It now asks the browser and
resolves the answer to the nearest district (`nearestArea()`), because a
district is what the cookie holds and what `GET /restaurants` can be asked in.

**Nothing was traded for it.** The dialog is a `<details>` whose `open` React
controls, so it is a modal for a browser and a plain disclosure without one: no
JavaScript and the summary still opens it, the districts are radios, confirm is
a `<form>` submit posting `chooseLocation`, and ✕ is a submit on a hidden second
form that re-posts the district already stored — a write that changes nothing
and redirects back out. With JavaScript it gains Escape, the scrim, focus
handling, a scroll lock, the map's pins, the search filter and geolocation. The
chips are styled off `input:checked` rather than React state, so they stay right
for the reader whose selection React never hears about. Selection is pending
until confirmed, as the artifact has it, so four districts tried is one
navigation instead of four.

Three departures from the drawing, all in `docs/design/README.md`: the map is
**fitted rather than sliced** (the artifact's `slice` on a 400×340 drawing in a
panel twice as wide as it is tall crops 45% of the height, taking Cascade's and
Shengavit's pins off the screen); **"all districts" is kept**, since somebody who
has chosen a district must be able to un-choose it; and the header **drops its
`backdrop-filter` while the dialog is open**, because a `backdrop-filter` makes
its element the containing block for fixed-position descendants and the dialog
lives inside the header — without that rule the overlay is trapped in a 72px
strip at the top of the page.

Two faults the artifact's fixed canvas could not have shown were fixed on the
way: the confirm button collapsed to the height of the word on it below 560px
(`flex: 1` turned upright grows from a zero basis, and a footer with no spare
height gives it none), and at 640px of dialog the map cropped two of the six
pins away.

Six strings per language (`locSearchPlaceholder`, `locUseCurrent`, `locConfirm`,
`locClose`, `locNoMatches`, `locGeoFailed`); `Area` gains `mapX`/`mapY`, the
artifact's own pin layout rather than a projection, since its map is a drawing
and six districts projected onto it truthfully would land in a huddle. Docs:
`COMPONENTS.md`, `SCREENS.md`, `USER_FLOW.md`, `design/README.md`,
`apps/web/README.md`.

### 2026-08-06 — Switching language no longer throws the chosen theme away

Switching language turned the page black — or white, for anyone who had chosen
dark on a light machine. The theme was not being changed; it was being
**deleted**. `data-theme` on `<html>` is set by the layout's pre-paint script,
from `localStorage`, outside React. Switching language is the one navigation
that changes the `[lang]` segment, which remounts the root layout, and React 19
re-acquires the `<html>` singleton by **stripping every attribute on it** before
re-applying the ones it rendered. `data-theme` is not one of those, so it went,
and the page fell back to `prefers-color-scheme` — black on a dark machine.

Measured in Chrome before the fix, on a machine set to dark with light chosen:
`/r/dolmama` had `data-theme="light"` and `--bg: #F6F5F2`; one click of RU left
`/ru/r/dolmama` with no `data-theme` at all and `--bg: #100E0B`. An ordinary
same-language navigation kept it, which is what pointed at the segment change.

The switch's links are now plain `<a>`, so a language change is a document load
and the pre-paint script runs again before the first frame — which is where the
theme is meant to be applied anyway. It is also the honest thing for this one
link: the whole document changes language, down to `<html lang>`, and Next
itself hard-navigates when a root layout changes. `language.spec.ts` guards the
anchor, since no unit test can see the attribute being stripped and `<Link>` is
the reflex everywhere else in this app.

This predates the same-page switch below: the old links went home, and lost the
theme on the way.

Docs: `COMPONENTS.md` (`LanguageSwitch`), `DEVELOPMENT_GUIDE.md` §5 — with the
general rule it leaves behind: anything set on `<html>` outside React survives
only until the next remount of it, so it must be re-applied on every document
load rather than once per session.

**Noticed, not fixed:** `ThemeToggle` reads the *DOM attribute* to decide which
glyph to show, not the stored choice, so a visitor who never chose a theme on a
dark machine sees 🌙 ("switch to dark") on an already-dark page, and pressing it
appears to do nothing. Same root cause family, different component; left alone
because nobody asked for it yet.

### 2026-08-06 — Switching language keeps the page you were on

The web header's HY/RU/EN links pointed at `homePath(code)` — the *home page* of
the language you picked. So choosing Russian while reading Dolmama's menu, or
halfway through a basket, threw the page away and left the back button as the
only way back. A language is a way of reading this page, not a reason to leave
it.

They now link the same page: `/r/dolmama` → `/ru/r/dolmama`, `/ru/cart` →
`/cart`, and `?q=…` or the home filter chips ride along, so a switch mid-search
returns the same results in the other language.

The work is one pure function and one small component. `translatedPath()`
(`apps/web/src/lib/site.ts`) swaps the language segment and keeps the rest of
the address; it takes both the published path (`/cart`) and the internal one the
middleware rewrites to (`/hy/cart`), because those are the two forms the caller
can be holding — the second is what a server render of the Armenian tree sees —
and a switch that moved you depending on whether JavaScript had loaded would be
its own bug. It still never emits a `/hy/…` URL, guarded by the same test that
guards every other link builder.

`LanguageSwitch` (`apps/web/src/components/LanguageSwitch.tsx`) is a client
component for one reason: **a layout is given its `params`, never the path below
it**, and the way to get the path there — reading the request's headers — would
opt every pre-rendered page out of static rendering. `usePathname()` costs
nothing; only the *query* has to wait for the browser, since `useSearchParams`
cannot be read while pre-rendering, so the switch renders inside a `Suspense`
boundary whose fallback is the same nav without the query. The pre-rendered HTML
therefore still carries real links to the right page — a crawler and a visitor
without JavaScript keep a working switch — and the browser upgrades them to ones
that also keep the query. `next build` confirms every page that was `● (SSG)`
still is.

Its `aria-label` was the literal string `"Language"` in all three languages; it
is now the `language` key, which the dictionaries already had for the app's
Settings screen.

Docs: `COMPONENTS.md` (`LanguageSwitch`), `USER_FLOW.md` §8 (the web's switch is
in the header and is a same-page move), `DEVELOPMENT_GUIDE.md` §5 (the rule that
a URL-borne language must switch in place).

### 2026-08-06 — The web is measured against the artifact, not just built from it

The previous pass recorded which of the artifact's *screens* had been built. This
one put the built screens beside the artifact's own measurements, and eight
things did not match.

**The header basket was the wrong control.** The artifact draws a solid accent
pill — cart glyph, running total, count badge — and it is the one thing in that
header meant to be pressed. What shipped was a 44px outline circle with a 🧺 in
it that **disappeared when the basket was empty**, so the control moved depending
on what you had. It is now the pill, and it keeps its place whether or not there
is anything in it. The total arrives from `GET /[lang]/basket`, the same route
handler `OrderPanel` reads, which returns money **already formatted as strings**
— so the header still computes nothing and every restaurant page is still
pre-rendered (the build confirms: `● (SSG)`). The badge went from accent to
`--ink`, because accent on an accent pill had nothing to stand out against.

**Every screen was laid out on the catalogue's 1220px.** The artifact draws the
basket on 900 and the checkout on 980, centred; both were running full width and
sitting left with a strip of dead space beside them. Now `.screen--basket` and
`.screen--checkout`, with the column table recorded in `DESIGN_SYSTEM.md`.

**The summary column was a box inside a box** — on the basket, the checkout *and*
the restaurant panel. The `<aside>` is already a card and the artifact puts plain
rows in it; the bordered `<dl>` nested inside read as a mistake. The standalone
version on `orders/[id]`, which has no column around it, keeps its border.

**The steppers had drifted from this repo's own documentation.**
`DESIGN_SYSTEM.md` has recorded the artifact's lopsided pair since before the web
app existed — `+` is an accent disc, `−` is a quiet chip — and the web drew two
identical grey buttons. Adding one more is the ordinary thing to want; taking one
away is the correction, and they should not look alike.

Also transcribed: basket lines are one lifted card each with the dish's photo
(they were rows in a flat list); the dish card's `＋` moved onto the foot row with
the price, where the artifact puts it, instead of floating level with the dish's
name; the checkout's payment rows, radio dots and mode tiles went to the
artifact's radii and paddings, and the mode tiles now line up — the grid items are
the `<form>`s, and the buttons inside them were not filling one; the profile hero
gained the translucent disc the artifact bleeds off its corner.

Two divergences are deliberate and recorded in `docs/design/README.md`: the
restaurant page keeps a small "order ahead / call" card the artifact does not
draw, because the order panel is drawn in the browser and that card is the only
route to a basket with JavaScript off — restyled from an accent-soft panel that
read as a second hero into the site's ordinary card chrome. And the footer still
renders on every screen, where the artifact draws it only on home.

Two responsive faults the artifact's fixed 1280 canvas could not have shown were
fixed on the way: the header dropped the account mark onto a line of its own
around 820px (the district name truncates instead), and a basket line overflowed
the viewport below 560px, where five things in one row leave the dish's name a few
pixels (it stacks into two rows now). `.sticky-cta`, dead since `StickyBasket` was
deleted, is gone.

Docs: `DESIGN_SYSTEM.md` (web page columns, summary column, header basket, dish
foot row, basket line), `COMPONENTS.md` (`BasketButton` props and behaviour),
`docs/design/README.md` (a second-pass reconciliation section). 131 web tests
pass and `next build` still pre-renders every restaurant page.

### 2026-08-06 — The sign-in phone field takes the shape of the number it wants

The web sign-in already *checked* the number — `isValidNational`, the same
function the server decides with — but it never *showed* what it was checking
for. Eight digits arrived as `99123456`, a run the eye cannot count, and
nothing stopped a ninth, tenth or thirtieth from being typed and then refused
on submit. **Typing now stops at the chosen country's own length**: eight
digits for Armenia, and a ninth only for somebody who wrote the trunk `0`,
which is the one thing that earns the extra digit. A test holds every
country's cap to a length that country calls valid, so no field can be filled
to the brim and still be told it is wrong.

The number is now written as it is typed: `99 12 34 56`, in the grouping the
country uses, beside a select that carries the `+374`. `PHONE_COUNTRIES` in `packages/shared` gained a `groups` per
country and the module gained `formatNational` and `maxNationalDigits`, so the
shape, the length cap and the check all come from the one list the API's
`normalizePhone` already reads. A country with two valid lengths keeps one
rule — Germany's `[3, 3]` writes both its 10- and 11-digit forms — and every
placeholder is now held to its own grouping by a test, so the specimen number
cannot say one thing and the field do another.

Armenia's specimen changed with it, `99 123 456` → `99 12 34 56`, which is how
the number appears on a business card here. That is also the spelling in the
API's "enter a valid phone number, e.g. …" message, since it is built from the
same entry. *(The mobile app's `authPhonePlaceholder` is a separate string and
still reads `99 123 456`.)*

Three things the shaping had to get right to be worth having: **a pasted whole
international number loses its duplicate dial code** rather than being kept in
full and then cut to nonsense at the cap; **backspacing onto a separator takes
the digit in front of it**, instead of deleting a space the formatter puts
straight back; and **the caret is put back where it was**, so an edit in the
middle of a number is not thrown to the end. The dial code stays on the select
alone: it is already on the row, and printing it inside the number field too
would state the same fact twice.

The invalid hint now also appears when the field is **left** with an unfinished
number, not only when a wrong one is long enough to be wrong. None of this is
permission to submit: `requestCode` and `normalizePhone` still decide, and with
JavaScript off the plain select and input post and get a translated answer
exactly as before.

### 2026-08-06 — The web design refresh: a 404 that exists, a location that means something, and an account

`docs/design/web-landing.html` was replaced by
`docs/design/Amragrir Web (standalone).html` — the same design carried forward
plus the screens it never had: basket, checkout, **profile**, a **404**, and a
**location picker**. Read against `apps/web` screen by screen; what follows is
what was built, and `docs/design/README.md` carries the full reconciliation
including what was not.

**The 404 was not reachable.** `[lang]/not-found.tsx` existed, but only a page
that *calls* `notFound()` renders it — an unknown URL matched no route at all
and got Next's own error page: black, unstyled, outside this app's layout, with
neither the header nor a way back. A catch-all under `[lang]` now takes the miss
and calls `notFound()`, so the design's artwork (the two fours around a cloche
on a gradient disc) renders inside the site. Copy is the artifact's own, which
is better than what was there: "This page went off the menu".

**The header's location control does real work.** `GET /restaurants` computes
`distanceKm` and can sort by it, but only for a caller that sends `lat`/`lng` —
and this app sent none, so every card's distance was blank and `sort=nearest`
was unreachable. The six Yerevan districts the artifact lists now supply the
coordinates, and distances appear on the cards. The **"Near me"** chip, recorded
until now as unmappable to any API parameter, is `sort=nearest`, and is offered
only once a district is chosen: with no origin the API answers in its default
order, so a chip that lit and changed nothing would be a lie about the listing.
A hand-typed `?sort=nearest` is dropped for the same reason.

Not the artifact's map: what it draws is a hand-drawn SVG of nowhere, a real one
needs a tile provider nobody has chosen, and "use current location" needs a
permission prompt a server-rendered page cannot raise. Not a `distMax` either —
saying where you are should not hide the rest of the city.

**`/profile` and `/favorites`.** The account's counters (`GET /me` reports
`rewardPoints`, `ordersCount`; favourites are counted from `GET /favorites`),
the last five past orders with **Reorder**, and sign-out. Reorder copies ids and
quantities only and lands on `/cart`, where `POST /cart/quote` prices it from
scratch — a dish that changed price or left the menu is caught there rather than
carried over from history. Sign-out revokes the refresh token before dropping
the cookies, and takes the basket with it: it belongs to the session that is
ending, and leaving it would hand the next person at that browser the last one's
order. The chosen district survives, being a preference, not a credential.

Three rows the artifact draws are absent rather than dead: saved addresses
(there are no couriers), stored payment methods (the API lists what the platform
accepts, not saved cards) and a help centre (no page to link to).

**A type that had been lying.** `api.orders()` was typed `{ items: Order[] }`,
but `GET /orders` returns summaries — `itemsCount` and `date`, no `items`, no
branch, no payment. It compiled because the orders list only ever read fields
the two shapes share; the profile page touched `items` and got `undefined` at
runtime. Now `OrderSummary`, which immediately caught the same wrong assumption
on `/orders`.

**The basket got the artifact's two-column layout** — lines left, a sticky
summary right, with the CTA inside it instead of a fixed bar.

**And the restaurant page finally got its order panel** — the one thing this
repo had recorded as deliberately not transcribed, twice, since 2026-08-03. The
objection was that the panel needs the basket, the basket needs `cookies()`, and
one `cookies()` call in that page turns 69 pre-rendered restaurant pages into a
render per request; and that pricing it in the browser would mean a total the
client computed. Both were true of building it *in the page*, and neither
survives building it as `OrderPanel`: a client component over
`GET /[lang]/basket`, a route handler that reads the httpOnly cookie, prices it
with `POST /cart/quote` and returns lines and totals **already formatted as
strings**. The page is still static HTML — the build still prerenders all 69 —
and the client still computes no money, because it is handed `"1 860 ֏"` and has
nothing to add up. Same trade `BasketButton` made for the header badge, one step
further. `StickyBasket`, the fixed bar that stood in for the panel, is deleted.

**Checkout became one page, because the artifact draws one page.** Mode, pickup
type, table booking, ready time and payment on the left; the order summary
sticky on the right. It had been split across `/preorder` and a `/checkout`
slide-over drawer — the previous artifact's shape — which is why the screen bore
no resemblance to the drawing. `/preorder` now redirects into `/checkout`, and
the intercepting drawer route, `CheckoutPanel` and the layout's `@modal` slot
are all deleted.

Two things fell out of the merge. The payment radios are on the left and "Place
order" is in the right-hand column, which HTML already answers: a submit button
outside a form owns it by `form="…"`, so choosing a method and paying stays one
native POST with no JavaScript in the path. And **the page no longer demands a
sign-in on arrival** — right when it was only the payment, a toll gate now that
it is also where somebody picks take-away and a time. `placeOrder` and
`bookTable` each redirect to `/signin` and come back, and everything chosen
lives in the basket cookie.

The artifact's **pickup type** rows are transcribed as drawn: indented behind a
rule, a ✓ on the chosen one, and an arrow with a "needs booking" badge on the
one that leads to the calendar instead of selecting anything. Its ready-time
clock field and `datetime-local` booking field are still not adopted — the pills
and the slot grid are the sets the API will accept, and a free-form clock lets
somebody pick 03:00 and be refused at the payment.

The basket route **refreshes the token itself** on a 401, which driving it is
what found: an access token lives fifteen minutes, a menu page can be open for
longer, and the first version quietly returned "empty" — a panel claiming an
empty basket beside a header badge reading 3. A Route Handler may write cookies
where a page may not, the same fact `/session` exists because of.

Two more things went with it. The block above the menu was overlapping its own
buttons once the panel took 380px off that column — it is a flex row now — and
its hint still read *"Pre-ordering and table booking live in the Amragrir app"*,
which stopped being true the day web ordering shipped. It now says where the
basket is.

**The artifact's admin panel confirms the rule shipped yesterday.** Its three
toggles are `reserve` / `pickup→takeaway` / `pickup→eat-in` under other names,
and its stated rule — "enabling one automatically disables the other" — is
`SERVICE_EXCLUDES`. Not built (the artifact hides its own entry point, and the
real panel is `apps/admin`), but recorded as independent agreement.

Docs: `design/README.md` (new artifact registered and reconciled; four stale
claims corrected — "Reserve Table leads nowhere", "Near Me needs geolocation",
"no endpoint reports reward points", and the two entries refusing the order
panel), `SCREENS.md` (§14 table, §14a profile, §14b favourites),
`COMPONENTS.md` (`LocationPicker`, `OrderPanel`, `StickyBasket` removed),
`USER_FLOW.md` (§12: reorder, sign-out, district), `DESIGN_SYSTEM.md` (artifact
names), `apps/web/README.md`.

### 2026-08-05 — The dine-in *mode* is called Table booking, because that is what it is

`ServiceMode.DineIn` read **"Dine in"** (hy `Տեղում`, ru `В зале`) on the
pre-order mode selector and the checkout summary. That name was already thin —
the mode has always required a `reservationId` — and it became actively
misleading the moment `dinein` stopped meaning "a booking restaurant" and
started meaning walk-in seating: one phrase, two opposite things, on screens a
guest moves between.

The **mode** now reads **Table booking** (hy `Սեղանի ամրագրում`, ru `Бронь
столика`), and its hint says what distinguishes it rather than repeating its
name — "A table held for you, deposit off the bill" instead of "Reserve a
table".

**The `dinein` *service* was not renamed to match** — it got its own name in the
next entry below. Calling the service "Table booking" too would collide head-on
with `reserve`, which *is* the booking: the home page would carry two filter
chips both reading like a reservation while one of them filters for places that
take none. The mode is the booking; the service is the room. They are different
words because they are different things.

### 2026-08-05 — The `dinein` service is called Eat at the Restaurant, on every surface that shows it

`dinein` was still labelled **"Dine-in"** (hy `Տեղում`, ru `В зале`) — the panel
switch, the card badge and the home filter chip. A name inherited from when it
meant "this is a sit-down restaurant", and no longer saying the thing an
operator needs to decide: **is there somewhere to sit, or is takeaway the only
option here?** A hatch on a street corner and a room with tables were told apart
by a word that described neither.

It now reads **Eat at the Restaurant** (hy `Ուտել ռեստորանում`, ru `Поесть в
ресторане`) — the same words the guest sees on the pre-order screen, because it
is the switch that puts that button there. The whole chain says one thing:
operator switches on *Eat at the Restaurant* → the card badge says it → the
filter chip finds it → the pre-order screen offers it beside *Takeaway*. Switch
it off and the guest gets Takeaway alone, which is the case the rename exists
for.

**Both service hints in the panel were wrong and are fixed.** They still
described the requires-then-cascade rule from earlier the same day: the dine-in
hint promised "turns table booking **on** with it" when it now turns it off, and
the pre-order hint said eating in is offered "until table booking is on" when it
now needs its own switch. A hint that contradicts the switch beside it is worse
than no hint — somebody would have trusted it.

### 2026-08-05 — A dining room stops needing a booking, and starts excluding one

`dinein` **required** `reserve`, on the reasoning that wherever there is a
dining room the way to a seat is the booking. That rule made the commonest kind
of place in this market unsayable: the one with tables and no calendar — a
khorovats place, a pizzeria, a bakery with a window seat. Under it, "we have a
dining room" could only be said by a business that also took reservations.

**The two are now mutually exclusive**, because they are two ways of seating
somebody and an address does one of them:

- **`dinein`** — the room seats whoever arrives. Nothing to hold, so nothing to
  put a deposit on: the guest pre-orders, **pays for the food exactly as any
  pre-order**, and eats it there off a plate. That order is a `pickup` order
  with `pickup_option = eat_in`, and `reservation_id` / `table_no` stay null.
- **`reserve`** — the table is held in advance. Eating in is the booking flow,
  in `dine_in` mode with a `reservationId` and a deposit against the bill.

**No new order path was needed**, which is the part worth writing down. The
walk-in ending already existed as the `eat_in` sub-mode — priced, charged and
tracked as the pre-order it is. What was wrong was how it was *reached*: eating
in was offered wherever `reserve` was absent, which quietly assumed every place
without bookings had somewhere to sit. A hatch on a street corner does not, and
it was offering "Eat at the Restaurant" to people with nowhere to eat it.
**Eating in is now declared** (`dinein`) rather than inferred from an absence.

`acceptsPickupOption` deliberately did *not* move with it. It still refuses
eat-in only where `reserve` is declared, so it stays wider than what the screen
shows: a restaurant is created with an empty `services` and many never fill it
in, and refusing an order on the strength of a field nobody got round to would
break orders those places have always taken.

The panel resolves the conflict instead of refusing to move — turning one
seating on turns the other off (`toggleService`) — so no switch is disabled. The
API still refuses a body naming both, with a 422.

**Data.** Nine restaurants held the pair and were repaired by migration
`20260805170000_dinein_excludes_reserve`, which drops `dinein` and keeps
`reserve`. That is the behaviour-preserving direction: with both declared
`takesBookings` was already true, so those places already offered take-away
alone with the eat-in button dead — a guest sees exactly what they saw
yesterday. Dropping `reserve` instead would have taken a restaurant's bookings
off the app. The migration adds `dinein` to nobody: whether a place has tables
is a fact it has to declare, and guessing would repeat the mistake being fixed.

The seed now covers all three states rather than two — 36 branches take
bookings, 25 seat walk-ins, 14 are hatches — because the walk-in case had no
example at all while the old rule stood, and a combination with no seeded
example is one nobody notices is broken. The biggest chain got the walk-in case
so the live pair has to survive a paginated list, not just a detail page.

**No switch in the panel is disabled any more.** The dine-in row used to be
dead, reading "Turn Table booking on first" until somebody found that switch and
flipped it — the old rule enforced as an obstacle. `restaurantServiceNeeds`
became `restaurantServiceExcludes` ("Not available while X is on") with it: a
key named for a requirement, holding exclusion text, is the kind of drift that
outlives the rule it described.

Two things fixed in passing, both found while working here. The panel's Armenian
called the dining room `Տեղում ուտել` where all three clients say `Տեղում`, and
its English said `Dine in` against the clients' `Dine-in` — aligned.
COMPONENTS.md's ServiceRows section was two changes stale, still describing four
switches and the `eat_in` service removed earlier; it now matches what the
component renders.

### 2026-08-05 — "Pickup" is called Pre-Order now, and its two endings say what they are

The mode a guest picks was called **Pickup** — `Վերցնել` on the filter chip,
`Տանել` on a restaurant card, `Վերցնել տեղից` in the back office. Three names for
one thing, and none of them said the part that matters: the food is ordered
*before* anyone arrives. It now reads **Pre-Order** (hy `Պատվիրել նախապես`,
ru `Заказать заранее`) in all three places, and its two endings are **Takeaway**
(hy `Վերցնել հետդ`, ru `Забрать с собой`) and **Eat at the Restaurant**
(hy `Ուտել ռեստորանում`, ru `Поесть в ресторане`).

**No identifier moved.** The mode is still `pickup`, the sub-mode still
`take_away` / `eat_in`, and `restaurants.services` still holds `pickup` — so
this is a dictionary change with no migration, no API contract change and no
touched seed data. `packages/i18n` is the only place the words live, which is
what made a rename across four surfaces six edits instead of a search across the
repo. BUSINESS_LOGIC.md §2 now states the split explicitly, because a reader who
sees `pickup` in a payload and "Pre-Order" on a screen would otherwise have to
guess they are the same thing.

The back office's two service hints quote the sub-mode names in prose, so they
moved too — a panel that explains a rule using words the app no longer shows is
worse than one that says nothing.

Two things this leaves open, both wording rather than code:

- **`orderAhead` (the web hero button and a footer link) is already
  `Պատվիրել նախապես`.** The hero and the mode chip now read identically while
  doing different things — the hero scrolls to the list, the chip filters by
  service. Defensible, since starting a pre-order is exactly what the hero is
  for, but it is a collision somebody chose to accept rather than one nobody
  noticed.
- **The card badge grew.** `Տանել` was one short word; `Պատվիրել նախապես` is two
  long ones, and on a restaurant offering all three services the badge row now
  wraps to a second line. It wraps cleanly — nothing overflows — but the cards
  are taller than the design's. A shorter badge-only form is the fix if that
  matters.

### 2026-08-05 — A counter and a restaurant are different places, and the booking is what tells them apart

Eating in after collecting an order was a declared service (`eat_in`) that a
restaurant could switch on beside its table bookings. It should never have been
a switch at all, and the combination it allowed was incoherent: a place that
holds tables and takes a deposit for them was also offering "collect it at the
counter and seat yourself", which is not a second thing such a place does.

**The rule is now derived from one question — does this address take table
bookings?**

- A **counter** — a shawarma window, a khorovats place, a coffee bar — does not.
  There is no table to hold, so ordering ahead asks which of the two endings the
  guest wants, and the kitchen plates it or bags it. **Both buttons are live**,
  everywhere, with nothing to configure.
- A **restaurant** does. Eating in there is a table, a seating and a deposit —
  the booking flow. **Its pickup is take-away and nothing else.**

**`eat_in` is gone from the services vocabulary.** `RestaurantService` is
`pickup`, `dinein`, `reserve`; the panel's fourth switch is gone with it. A
switch that could disagree with the booking was a second answer to a question
that has one.

**`dinein` now requires `reserve`** — the one rule with teeth left in
`checkServices`. Wherever there is a dining room the way to a seat is the
booking, so a dining room whose tables cannot be booked is a door onto nothing.
The exclusion rule it replaces (`dinein` against `eat_in`) is gone, and with it
the `excludes` half of `ServiceBreach` and the panel's "unavailable while X is
on" line.

**The guest is shown the rule rather than its result.** At a restaurant the
pre-order screen still draws **Eat at the restaurant** beside take-away —
dimmed, dashed, reading "only by booking a table" — and pressing it switches the
basket to dine-in and opens the calendar. It is deliberately **not** `disabled`:
a disabled control says "not for you" and then does nothing, and this one has
somewhere to send them. Hiding the option would have left somebody to discover
the rule by not finding it, which was the whole complaint about the old screen.

`POST /cart/quote` answers with **`eatInRequiresBooking`** beside
`pickupOptions`, so neither client derives the rule from `services` — the same
reason `pickupOptions` was added.

**Enforced on the way in, not merely hidden.** `eat_in` on a basket at a branch
that takes bookings is a **422** from the quote *and* from `POST /orders`: a
basket outlives the page it was built on, and a branch can start taking bookings
between the choice and the payment.

**The pickup pair moved to the pre-order screen in the mobile app**, out of the
basket, so the dead button sits beside the calendar it points at rather than a
screen away from it. It was already there on web.

**Migration `20260805090000_eat_in_derives_from_bookings`** strips `eat_in` from
`restaurants.services` and `restaurant_branches.services`, and adds `reserve` to
any row carrying `dinein` without it. Adding the booking rather than dropping
the dining room is the cautious direction — and it starts no bookings on
anybody's behalf, because a booking still needs `reservations_enabled`, which
the migration leaves alone. `orders.pickup_option` is untouched and keeps both
values: what a guest chose is what happened.

**`reserve` and `reservations_enabled` stay different questions.** The first is
what kind of place this is and is what decides the pickup options; the second is
whether it is taking bookings this week. A restaurant that pauses its bookings
does not become a counter that seats walk-ins.

Docs: BUSINESS_LOGIC.md §2, SCREENS.md §5, COMPONENTS.md, USER_FLOW.md,
API_DOCUMENTATION.md, DATABASE.md, `apps/admin/README.md`.

### 2026-08-04 — A branch answers for itself: its photograph, its services, its bookings

The entry below put the cover on the restaurant, shared by every branch, and
recorded per-branch covers as deliberately not chosen. **That was wrong, and it
was wrong the same day.** Branches of one chain are genuinely different places —
one has a dining room, one is a counter in a mall, one is photographed and one
is not — and a single row could not say so. Services and `reservations_enabled`
had the same defect and moved with it.

**Both levels now exist, and the split is the permission.**
`restaurants.{cover_url, services, reservations_enabled}` is the **default**
every branch inherits, still `restaurant:write`. The three new columns on
`restaurant_branches` are what **this address** offers, on `branch:write` —
which a `restaurant_manager` already holds for the same branch's address and
phone. A manager answers for one place and nothing else; changing what the chain
defaults to is still the business's decision.

**The migration is purely additive and backfills nothing.** A branch that has
not spoken for itself resolves to exactly what it showed before, so no answer
changed on deploy.

**`resolveBranchOffering` in `@amragrir/shared` is the only place inheritance
happens** — the catalog, search, favourites, an order's validation, the
reservation check and the back office all go through it, so a guest cannot be
shown a service the order endpoint then refuses.

Three settings, three resolutions, and the differences are deliberate:

- **The cover falls back on `null`.** "None here" and "not answered here" are
  the same state on purpose — there is no reason a branch would want to be blank
  while its business has a photograph.
- **The services needed a flag** (`services_overridden`). `[]` is already a
  legitimate value — every restaurant is created having declared nothing — so a
  branch must be able to override a pickup parent with a genuinely empty set,
  which falling back on emptiness would make unsayable. Prisma also cannot
  express a nullable scalar list. A CHECK holds the array to the flag so a stale
  set cannot sit behind a `false` looking like an answer.
- **Bookings fall back on `null`**, since `false` is a real answer.

**The catalog filter now asks each branch**, not just its parent: an overriding
branch matches on its own array, every other on its restaurant's. Filtering the
parent alone returned branches that had withdrawn the very service somebody
filtered for — and hid the ones that had added it. A top-level `OR`, because the
`q` search builds its own inside `where.restaurant`.

**The panel.** Each branch's disclosure — previously its team — now opens on its
own cover, services and bookings, each with a "this branch decides" switch that
*is* the data model: with it off the controls show the restaurant's values,
disabled, so the screen still says what the address offers rather than going
blank. The restaurant-level sections stayed and are now labelled as the default.
Turning the switch on starts from what the branch is already showing, so it
changes nothing by itself — it only moves who decides.

`POST /uploads/branch-cover` is its own route rather than a parameter, because
the permission is the whole difference and a single endpoint would have to
decide that in a service, out of sight of the guard.

**1541 tests pass** (API 1024 → 1034), all eight workspaces typecheck. One
assumption was corrected on the way: a role that grants none of a permission is
refused by `reachFor` with a **403** before any query is built, rather than
matching an empty filter.

Updated: `DATABASE.md` (three columns and the CHECK), `API_DOCUMENTATION.md`
(four endpoints), `ROLES_AND_PERMISSIONS.md` (the two levels, and why the split
is the permission), `BUSINESS_LOGIC.md` §2 (the rules judge a branch),
`COMPONENTS.md`, `apps/admin/README.md`.

**Not done:** the seed still plants covers and services only on restaurants, so
a fresh database has no branch that differs from its parent. The feature works;
the demo data does not yet show it off.

### 2026-08-04 — A restaurant can put its own photograph on its card

`restaurants.cover_url` has been read by the catalog, favourites and orders
endpoints for a while and **written by nothing** — the seed planted a demo
picture so the screens could be looked at, and a real restaurant had no way to
replace it. Who may is not a new decision: it was agreed on 2026-08-04 and
recorded in ROLES_AND_PERMISSIONS.md as decided-and-unbuilt. This builds exactly
that, unchanged.

**`restaurant_admin` and above; `restaurant_manager` may not.** One cover is
shared by every branch, so a manager running one branch would be choosing the
picture the others are advertised under — the same reasoning that already puts
`PATCH /restaurant/restaurants/{id}/services` at that level. Both run on
`restaurant:write`, so **no new permission was invented**; widening that one to
managers would also have handed them the services and the restaurant's name,
which is the trade that made a narrower `restaurant:cover` not worth having.

Per-branch covers were **again** not chosen. `restaurant_branches` has no image
column, and adding one is a migration plus a fallback rule in every client — not
an upload.

**Two endpoints, the same shape as a dish photo.**
`POST /uploads/restaurant-cover` (`restaurant:write`) stores the file and
answers with a URL; `PATCH /restaurant/restaurants/{id}/cover` puts it on the
restaurant and is where reach is checked — the upload only writes a file and
names it. `UploadsService` grew `saveRestaurantCover` beside `saveMenuPhoto`,
both on one private `save(bytes, tooLarge, dir)`: the refusals, the sniffing and
the uuid naming are identical, and the directory is not the caller's to choose.
Covers land in `covers/`, apart from the dishes, so a later sweep or thumbnailer
can act on one without reasoning about the other.

**`coverUrl: null` takes a cover down**, and is the one place this differs from
a dish, which cannot be blanked. An *absent* field is a 400 — `@ValidateIf`
rather than `@IsOptional()`, because the latter skips null as well and an empty
body would then read as "remove it".

**A replaced cover is not deleted from disk**, and `restaurant.cover` (new in
`AuditAction`) carries the URL it replaced — which is the only thing that makes
an accidental replacement recoverable. A request that changes nothing writes
neither the update nor the entry, like every other PATCH here.

**The panel.** A restaurant's page grows a Cover section directly under its
facts, shown to everyone who can open the restaurant — a cover is public the
moment it is set — with the file input and Remove button only for
`restaurant:write`. A **small block with the controls beside it**, not a
full-width banner: it answers "is there one, and is it the right photograph",
and a hero image this high up the page would push the branches below the fold.
Choosing a file uploads and stores in one go, since there is no form still being
filled in. `usePhotoUpload`
now takes *which* endpoint to send to, defaulting to the dish one; the prop that
gated the services switches was `canEditServices` and is now `canEditRestaurant`,
because it gates two things and both are `restaurant:write`.

**The seed's bargain is now load-bearing rather than a precaution.** The
endpoint overwrites a seeded cover freely; `isSeedCover` keeps `db:photos` from
ever overwriting an uploaded one, and an uploaded cover is served from this
API's own origin, so it matches nothing in those tables. `apps/mobile` needed
nothing — its `Photo` component already rendered the URL and fell back without
one.

11 new tests (6 on `setCover`, 3 on `saveRestaurantCover`, plus the manager
refusal and the no-op). **1024 API tests and 323 panel tests pass**; both
typecheck clean. One of the new tests corrected an assumption worth writing
down: a manager reaching `setCover` gets a **403 from `reachFor`**, not a 404
from an empty filter — reach is refused outright when no held role grants the
permission, rather than assembling a query that happens to match nothing.

Updated: `ROLES_AND_PERMISSIONS.md` (the section is no longer "decided, not yet
built"; `restaurant.cover` in what is recorded; the implemented list),
`API_DOCUMENTATION.md` (both endpoints), `DATABASE.md` (`cover_url` has writers
now), `BUSINESS_LOGIC.md` (seeding is not the feature — here is the feature),
`COMPONENTS.md` (`usePhotoUpload`'s `send`), `apps/admin/README.md`.

### 2026-08-04 — Fixed: the phone showed half the photographs, and said nothing about it

The new covers appeared on the website and not in the app — and neither did
about half the **dish** photographs, which had been that way silently since the
day they were seeded.

**Wikimedia answers 403 to a request whose `User-Agent` is a bare library name.**
That is their User-Agent policy, not a rate limit, and React Native sends
`okhttp/4.x`. Every `upload.wikimedia.org` picture was refused on the phone
while the browser, sending its own agent, got all of them. TheMealDB does not
care, which is why *some* cards had a picture and the failure looked arbitrary.

Nothing appeared broken, and that is the part worth keeping: `Photo` falls back
to the placeholder surface on a failed load, which is also what it draws when a
restaurant genuinely has no cover. A refusal and an absence render identically,
so the app looked like it was faithfully reporting missing data.

**Two changes, because the first was correct and not sufficient.** `Photo` now
sends `AmragrirApp/1.0 (+https://amragrir.am)` with every image request, which
is what Wikimedia's policy asks for and good manners anywhere — but on the
device the pictures stayed blank, so **the seed no longer uses that host at
all**. `menu-photos.ts` and `restaurant-covers.ts` now draw only from TheMealDB
and TheCocktailDB, every URL of which was re-checked with `okhttp/4.9.2` — the
agent React Native actually sends — before being written down. 206 dishes and 15
covers rewritten in the running database by `db:photos`; the one uploaded photo
in that table was left alone, as designed.

Both tables now claim any `upload.wikimedia.org` URL as **their own** in
`isSeedPhoto` / `isSeedCover`, matching on the host rather than the value. The
values are gone from the files, and without that rule a database seeded before
today would keep, forever, exactly the pictures no phone can show.

Losing that host cost four dishes their own photograph — Gata, Four Cheese,
Garlic Bread, Poke Bowl now show their category's, which is the fallback working
as designed rather than a gap to paper over by naming a picture of something
else.

Guards, all of which would have caught this: every URL in both tables must be on
one of the two hosts (`new URL(url).host`), and `photo-headers.spec.ts` checks
the header reaches the image and that no second component fetches one behind
`Photo`'s back. Source scans rather than unit tests, on the same reasoning as
`link-aschild-style.spec.ts` — the component renders, the request is made and
the fallback is correct, so nothing below a real device can see the bug.

### 2026-08-04 — Every demo restaurant has a cover photograph

`restaurants.cover_url` was null for all 25 restaurants in a seeded database, so
the restaurant card, the restaurant banner and the thumbnail beside a past order
drew their empty state everywhere — three screens whose main visual element
could not be judged, on the web and on the phone.

**New: `prisma/restaurant-covers.ts`**, the same shape as `menu-photos.ts` — a
photograph per slug where a restaurant should differ from its neighbours, one
per cuisine behind that, and something plated for a cuisine the table does not
know (which is what the three hand-made test restaurants in the dev database
got, one of them with no cuisine at all). Karas gets meat over an open fire,
Lavash griddled flatbread, Dolmama a plate of dolma, Jazzve a coffee.

Hotlinked on exactly the terms the dish photographs use, `MENU_PHOTOS=local`
included — that switch now falls back to the committed category placeholders for
covers too, reusing the SVGs already in `apps/api/public/menu` rather than
drawing a second set to keep in step.

Photographs of dining rooms were tried first, from Wikimedia Commons, and
abandoned within the day: that host refuses the app (see the entry above), and a
demo has no rights to a picture of anybody's restaurant anyway. Food is what a
card is selling.

Every URL was fetched and **looked at** before it was written down, which is not
a formality: the first search for "burger restaurant interior" returned the
lavatory of a Burger King, "pizzeria interior" a mop bucket under a sign saying
the dining room was closed, and "Armenian restaurant" a stuffed eagle.

**This is not the upload feature.** Nothing in `apps/api/src` writes this column
yet; who may set a cover is still decided-and-unbuilt in ROLES_AND_PERMISSIONS.md.
The seed writes it on create and `refreshSeedCovers` fills the rows that predate
it — rewriting only a cover that is empty or one the seed planted, never one
somebody chose, the same rule `db:photos` already applied to dishes. That
command now does both and reports both, and the seed prints
`restaurantsWithoutCover` beside `menuItemsWithoutPhoto` so "every restaurant
has a picture" is re-checked on every run rather than assumed. Applied to the
running dev database: 25 restaurants updated, a second run correctly finds
nothing to do.

The spec reads the cuisines and slugs **out of `seed.ts`** rather than keeping a
copy: a demo restaurant added with a cuisine nobody wrote a cover for should
fail the suite, not ship a card showing a stranger's dining room.

### 2026-08-04 — Mobile pre-order: the app can book a table and time a kitchen

The last screen the mobile artifact specified is built
(`apps/mobile/app/preorder.tsx`), and the basket now leads through it rather
than straight to payment: **Basket → "Choose time" → Pre-order → Checkout**.
Mode, a Monday-first month calendar, booking slots, guest count, the deposit
card and the ready-at grid, all against the real API.

**The cart stopped lying about `serviceMode`.** It was the literal string
`'pickup'` in `toPayload()`, so dine-in was unreachable from the phone whatever
the API supported. `CartState` now carries `serviceMode`, `reservationId` and
`readyAt`, with the rules the API enforces mirrored in the reducer and tested:
leaving dine-in drops the table (a pickup order pointing at a booking is
refused, and a table left attached is one held for somebody who has decided not
to sit at it); **any** change of mode drops the chosen time, because the value
means the table's hour on one side and a slot off the pickup grid on the other;
and starting a basket at another restaurant drops all three.

**Checkout charges `dueNowAmd`, not `totalAmd`.** Driven against the running
API, a real dine-in basket quotes `totalAmd 11360`, `depositAmd 4000`,
`dueNowAmd 7360` — the button used to show 11 360 ֏ to a diner whose 4 000 ֏ was
already authorised. Mobile's `Quote` and `Order` types had fallen behind the API
by six fields (`serviceMode`, `discountAmd`, `coupon`, `dueNowAmd`, `tableNo`,
`scheduled`, `prepStartAt`, `reservationId`); all of them are now declared, the
same staleness that had hidden the filter parameters last time.

**A dine-in basket has no "food ready at" grid, and that is the point.** Booking
a slot sets `readyAt` to the booked instant; `POST /orders` accepts it and starts
the kitchen a prep-time before, so a table at 19:30 tomorrow is served then
rather than cooked tonight. Asking twice would let somebody order food for 15:00
and a table for 19:30.

**A bug caught by driving it rather than by reading it: the calendar stops at 7
days, not 30.** `RESERVATION_MAX_LEAD_DAYS` is 30 and `ORDER_MAX_LEAD_DAYS` is
7, and this screen books a table *for a basket*. Against the live API a table
ten days out is created happily and its deposit authorised — and the order for
it is then refused with *"Orders can be scheduled at most 7 days ahead"*. Day
eight would have taken 4 000 ֏ for a meal the next screen cannot sell, so the
shorter limit wins here. **The two constants disagreeing is a product question
this does not settle**, only avoids: booking a table with no basket behind it is
still free to go 30 days out.

**Times are the restaurant's, not the phone's.** `formatTime` read
`date.getHours()`, so a traveller — or anyone whose clock had drifted onto
another zone — was told to collect their food four hours early. It now formats
in `Asia/Yerevan`, as `apps/web` already did, and the spec that covered it was
asserting the old behaviour in a way that only passed on a machine already set
to Yerevan. `yerevanDate`, `formatMonth` and `weekdayHeads` joined it.

**`readyTimeOptions` moved to `@amragrir/shared`.** Web and mobile draw the same
grid from the same quote; two copies would have drifted into offering two
different sets of times for one basket. Its spec stayed in `apps/web`, pointed
at the package — the package has no runner, and adding one for four assertions
is more machinery than the move is worth.

One i18n key added — `guestsWord`, in all three dictionaries. Everything else
the screen needed was already there under the names the other clients use, so
the screen reuses those rather than minting synonyms for "Pickup". Docs:
SCREENS.md §5 and §6, USER_FLOW.md §3 and §4, COMPONENTS.md.

### 2026-08-04 — The mobile design artifact enters the repo, and the app grows tabs

`docs/design/` had one artifact and a row admitting the more important one was
missing. **`Amragrir (mob).dc.html` is now stored** beside it, with the two files
it imports — `ios-frame.jsx` (the iPhone bezel the mockup is drawn in) and
`support.js` (the generated runtime that makes it interactive). Neither is
product code; React Native supplies the first and has no use for the second.

Reconciling it against the code, declaration by declaration: **all 15 palette
tokens already matched `packages/ui/src/tokens.ts` verbatim, in both themes.**
Two colours in it had no token — `--danger` and `--dangerSoft`, for a declined
card, a cancelled order and the button that cancels one. Both were added.
Purely additive: `apps/web` and `apps/admin` render exactly as before, and the
generated `tokens.css` diff is 16 insertions with no changed line.
`--danger` is theme-aware where `--destructive` is not, and DESIGN_SYSTEM.md now
says why the two are not interchangeable.

**`apps/mobile` speaks three languages.** It did not depend on `@amragrir/i18n`
at all and hardcoded English, against rule 5 in AI_CONTEXT.md. It now has a
`LanguageProvider` shaped like the back office's, reading the device's languages
and remembering the choice. The artifact carried complete hy/ru/en dictionaries,
so the **123 new keys were transcribed, not translated**; all three files hold
267 keys in identical order.

This also fixed a quiet bug: the API client took a `language` argument that **no
screen ever passed**, so the API localised its errors and `*_i18n` columns into
its own default no matter what the customer had chosen. `Accept-Language` is now
always sent.

**Five tabs, six new screens.** `app/(tabs)/` carries home, search, orders,
favorites and profile, with the bar drawn only there — exactly the artifact's own
`showTabBar`. Search, orders, favorites, profile, settings and referral are built
to it; the tab glyphs are its own SVG paths. A `ThemeProvider` came with the
Settings dark-mode toggle, which the old `useTheme` comment had already promised.

**The mobile client's `RestaurantQuery` had fallen behind the API**, not the
other way round: `openNow`, `dietary[]`, `service[]` and `priceMin`/`priceMax`
are all in `ListRestaurantsDto` and none were reachable from the app. Added, and
each verified to narrow a live query.

Three places the artifact was **not** followed, each recorded in
`docs/design/README.md`: no "delivery addresses" row (there are no couriers), no
Apple/Google sign-in (customers are phone + OTP only), and no reward-points tile
(no endpoint reports it, and inventing a number on the screen a customer reads as
their own record is worse than an absent row).

**Home is restyled to the artifact** — its own header and 27px question, the
search field as a button, the category rail bleeding to the screen edge, and
three card-shaped skeletons instead of a spinner so the feed does not jump when
the real cards land. `RestaurantCard` came with it: a 162px photo, the
open/closed badge on glass over the image, prep time in accent and the
restaurant's actual `services[]` as quiet chips — `eat_in` deliberately not
among them, being a sub-option of pickup rather than a third thing on offer.

**The restaurant screen followed** — a 270px cover with the back button on
glass, the content sheet pulled up over it with 26px top corners, the rating in
its own bordered card, menu tabs that invert to `--ink` when selected, and dish
rows as bordered cards with a 104px photo and a solid accent add button.

Its basket bar shows the item count and **not** a running total, which the
artifact does draw. Every total in this app is one the server calculated; the
basket screen asks for a real quote. A number added up in the client would be
the one place a customer could be shown a figure nobody charged.

**Recorded, not built: restaurant covers are an upload, not seed data.**
`restaurants.cover_url` is read by three endpoints and written by nothing —
there is no upload path, no write in `apps/api/src` and no UI in the panel,
which is why it is null for all 25 seeded restaurants. Agreed that
`restaurant_admin` and above may upload one and `restaurant_manager` may not,
and that the cover stays on the restaurant rather than the branch. See
ROLES_AND_PERMISSIONS.md.

**Fixed: `GET /restaurants/{id}/availability` answered 500 for a slug.** Its
sibling routes under the same prefix — the restaurant and its menu — all accept
a branch id, a restaurant id *or* a slug, and clients hold whichever the
previous screen gave them. This one queried `id` directly, so a slug reached
Prisma as a UUID and threw there. It now resolves all three the way the catalog
does, with the same deterministic branch tie-break, so a restaurant's calendar
and its menu can no longer describe different branches. An unknown slug is a
404 rather than a 500.

Found while wiring the reservations API into the mobile client for the
pre-order screen, which is exactly the call that screen has to make first.

**The screens show photographs, because the API has them.** The artifact draws
hatched blocks wherever a picture goes — a mockup has no photography — and those
were transcribed literally, which was a mistake: `menu_items.photo_url` is
populated for every seeded dish. A new `Photo` component renders the URL and
falls back to the artifact's placeholder surface only when there genuinely is
none, or when loading fails — the demo photographs are hotlinked from TheMealDB
and Wikimedia, and Wikimedia rate-limits bursts of thumbnails.

`CartLine` gained `photoUrl` so the basket can show what was added. It is
carried for display only and never sent: the order payload names the menu item,
and the server owns everything else about it.

Restaurant `coverUrl` is wired the same way and is **currently null for every
seeded restaurant** — so those keep the placeholder, correctly this time,
because the data says there is no picture rather than because a mockup drew one.

**Basket and checkout finished the set** — every screen the artifact draws that
this app has is now drawn the way it draws it. The basket got its card rows with
a 66px thumbnail and the ±30px stepper, the dashed "add more" button, and the
take-away / eat-in choice as two cards rather than a list, still offered only
where the quote says the restaurant does both. Checkout got the quantity chips,
the ready-at row and payment as bordered rows with a radio — three methods, no
cash, because there is no such `PaymentMethod` and an order is paid for before
the kitchen sees it.

Both keep the logic that was already right and is easy to break by rewriting:
the basket re-prices on its *contents* rather than its payload object, and
checkout still holds one idempotency key per attempt across retries, so tapping
"place order" twice on a bad connection replays rather than ordering twice.

**Tracking is the screen the artifact has most to say about, and it now says
it**: a 236px countdown ring, the five-stage rail, the pickup-code card, and the
three states the old screen had no rendering for at all — **unpaid**, **payment
declined** and **cancelled**. This is where `--danger` and `--dangerSoft` earn
their place; until now they were tokens nothing used.

Two things there are real rather than decorative. **"Pay now" pays** — it asks
the API for the default method and posts a payment with a fresh idempotency key,
rather than routing back through checkout, which would have created a *second*
order. **"Cancel order" cancels**, and is offered only while the order is unpaid,
because paying commits it (BUSINESS_LOGIC.md §5).

The ring empties over **this order's own prep window** — the first countdown the
server reported — instead of the artifact's fixed 480 seconds, which was a mock
value, not a rule. The code plate carries the pickup digits rather than a
scannable code; a real one needs a generator, and printing the number the
counter actually reads is honest in the meantime.

**Sign-in was restyled too**, and gained the artifact's accent hero, brand
glyph and fixed `+374` prefix — the customer types only the local part and can
no longer get the country wrong. It keeps its two steps because the API has
two; the artifact has no OTP screen at all, which SCREENS.md §0 already recorded
as something it should grow. No Apple/Google buttons and no log-in/sign-up tabs,
for the reasons above.

That screen held the **last hardcoded English string in the app**. With it and
the navigator's own screen titles translated, `apps/mobile` finally satisfies
rule 5 of AI_CONTEXT.md everywhere except the two screens still to be restyled.

Sign-in moved to the profile screen. The artifact reaches it through a
full-screen auth gate that is not built yet, and the old link on home went with
the restyle — without somewhere to put it a guest would have had no route to
verifying a phone at all.

Still unbuilt and written down rather than skipped: **pre-order** (needs the
reservations API wired into the app) and the **filter sheet**, which is blocked
on a real disagreement — the artifact draws price *per person* at 4000–24000֏
while the API filters on a branch's average *menu-item* price, 1167–3900֏ across
seeded data. The ranges do not overlap, so the slider as drawn matches
everything or nothing. The six existing screens are not yet restyled.

### 2026-08-04 — The guest picks the ending, and the kitchen sees it

The entry below made `eat_in` something a restaurant can *offer*. This makes it
something a guest can *choose*, and — the reason it matters — something the pass
finds out before the food is plated. A bag and a plate are not the same order to
pack, and the counter is too late to ask.

**`orders.pickup_option`** — `take_away` or `eat_in`, and **null exactly when the
order is dine-in**, held there by a CHECK constraint rather than by convention:
the column is required for one value of `service_mode` and forbidden for the
other, which NOT NULL cannot say. The 406 pickup orders already in the table were
backfilled to `take_away`, which is not a guess standing in for missing history —
it was the only ending on offer until this shipped.

**Nothing chosen means take-away**, everywhere. It is what pickup *is*, so the
field is optional on `POST /cart/quote` and `POST /orders`, and a client that has
never heard of it places exactly the order it always placed. Two refusals, both
422: `eat_in` at a restaurant that has not declared the service, and any ending at
all on a dine-in order. The first is checked **while pricing as well as while
creating** — a basket outlives the page it was built on, and a restaurant can
withdraw the option between choosing it and paying; catching it on the quote puts
the refusal on the screen the guest is looking at instead of at the payment.

**The quote now says which endings exist** (`pickupOptions`), so no client works
it out from `services` a second time. Fewer than two is not a choice: web and
mobile draw the buttons only when there are both, because one button labelled
"take away" asks somebody to confirm something that was never in doubt.

**Where it shows.** Web: a second, smaller pair indented under the mode on
`/preorder`, two form posts like everything else in that flow, so it survives
JavaScript being off; repeated on the checkout summary and on the tracking card
the guest holds at the counter. Mobile: the same choice in the basket, with the
chosen ending in the quote's cache key. Back office: the order card marks
`eat_in` **and nothing else** — every other pickup order is take-away, and
labelling all of them would bury the one that needs a plate.

**Switching mode drops it**, mirroring what dine-in already did with a booking,
and coming back to pickup starts from take-away rather than a choice the
restaurant may have withdrawn in between. `toBasket` refuses to send one on a
dine-in basket even so, because a hand-written cookie can hold the pair.

Updated: `BUSINESS_LOGIC.md` §2 (what the guest chooses, what the kitchen sees),
`DATABASE.md` §7 (the column and its CHECK), `API_DOCUMENTATION.md`
(`POST /cart/quote`, `POST /orders`, `GET /restaurant/orders`), `SCREENS.md` §5,
`USER_FLOW.md` §4, `COMPONENTS.md`. Migration:
`20260804090000_pickup_option`.

### 2026-08-04 — Pickup can be eaten in, and that fights with dine-in

A restaurant can now declare **`eat_in`**: pickup, but the guest sits down in
the room with what they collected — no waiter, no booking. It joins `pickup`,
`dinein` and `reserve` in `restaurants.services`, and it is the first value
there that is not free to combine with the others.

**The rule.** `dinein` and `eat_in` cancel each other out. A restaurant with
waiters serves people at their table, so "collect it at the counter and find a
seat yourself" is not a second thing it would offer — a guest shown both is
being asked to choose between table service and no table service in the same
room. And `eat_in` needs `pickup`, because it is a choice made *inside* pickup
rather than beside it. Four combinations survive, which is the table now in
BUSINESS_LOGIC.md §2. Take-away needs no flag at all: it is what pickup is.

**Written once, in `@amragrir/shared`** (`service-offering.ts`).
`checkServices` answers whether a set describes a real restaurant;
`serviceToggleBreach` answers the panel's per-row question — "would flipping
this switch produce a legal set" — by asking `checkServices`, so neither side
restates a rule the other could drift from. `toggleService` is what a switch
does, cascade included: turning pickup off takes `eat_in` with it.

**The API.** `PATCH /restaurant/restaurants/{id}/services` takes the whole set
and answers with the restaurant. Whole, because the rules are about
combinations — "may this restaurant offer dine-in" is unanswerable without
knowing whether the eat-in option is on. A combination that is not a restaurant
is a **422** naming both services. It runs on `restaurant:write`, which has been
declared with services named in it since roles were split and had no endpoint
behind it until now; no branch-level role holds it, because this is one
statement covering every branch. Recorded as `restaurant.services` with the
whole array on both sides.

**The panel.** A restaurant's page grows a Services section: four switches, and
the switch that would break the rule is dead with the reason in the row — "Недоступно, пока включено «В зале»" — naming the switch to turn off first.
Plain text rather than a tooltip, which is not there on a touch screen. Read-only
accounts keep the one-line fact they had. There is no take-away switch, and the
pickup row says why rather than leaving its absence to be noticed. The `reserve`
row also admits a pre-existing trap: advertising bookings and taking them are
two columns (`services` and `reservations_enabled`), a booking needs both, and
nothing on this screen sets the second — so the row says so instead of letting
somebody switch it on and wonder why no table can be booked.

**The order-level choice landed the same day** — see the entry below.

Updated: `BUSINESS_LOGIC.md` §2 (the rule and the table), `API_DOCUMENTATION.md`
(the new endpoint), `DATABASE.md` (`services` vocabulary and why there is no
CHECK constraint), `ROLES_AND_PERMISSIONS.md` (`restaurant:write` has an
endpoint; `restaurant.services` in what is recorded), `COMPONENTS.md`
(`ServiceRows`, `services.ts`). Seeded: Greenhouse and Green Bean now declare
`eat_in`, so the combination exists to look at.

### 2026-08-03 — The refreshed design artifact, re-read against the code

`docs/design/web-landing.html` was re-exported. Rather than trust a glance, the
new file was diffed against `globals.css` declaration by declaration: **117 of
its 144 distinct measurements already matched verbatim** — header, hero,
category rail, filter chips, restaurant cards, banner, rating card, menu tabs
and dish cards were all still accurate and were not touched. Three things had
actually moved. Updated: `docs/design/README.md` (what the refresh changed and
what was deliberately not taken), `docs/COMPONENTS.md` (`Brand`, `Footer`).

**The logo changed.** The pin now holds a fork *and* a knife, and carries a
clock badge — the product in one glyph, since this is order-ahead rather than
delivery. It lived inline in `layout.tsx`; it is now `components/Brand.tsx`,
because the footer draws the same logo and two copies of a logo is how they
stop being the same logo.

**The wordmark is a logotype, not a string.** `amragrir.am`, Latin and
lowercase in all three languages with only `.am` in the accent colour. The
artifact hardcodes it outside its `L` dictionary while everything around it
comes from inside one, which is how it says so. The translated brand name
(`Ամրագրիր`, `Амрагрир`) is not lost — it is now the home link's `aria-label`,
so a screen reader still announces it where the eye reads the domain.

**The footer was rebuilt** to the new drawing: logo and wordmark open the brand
column, three social marks close it, the copyright moved inside the container
as a rule-separated bottom bar, `🇦🇲` joined "Made in Armenia", headings went
from `--ink3` to `--ink` — at `--ink3` they carried the same weight as the
items beneath them and the three lists read as one grey wash — and the grid
went `2fr` → `1.6fr` with a 40px gap, because the brand column's blurb is
capped at 300px and the extra width was empty.

**Two things the audit caught that the refresh did not cause.** The dish add
button was a pale `--accent-soft` chip at 34px where the artifact draws a solid
`--accent` disc at 38px with a shadow — it did not read as a button. And the
860px breakpoint still sized `.foot-inner`, which no longer owns the footer
grid; it would have silently stopped collapsing. `.muted` and `.faint` went
with the rewrite, having lost their last callers.

**Not transcribed, deliberately: the sticky order panel** the artifact draws
beside the menu. It cannot be built as drawn without breaking two decisions
this app rests on — reading the basket on the server would opt every restaurant
page out of pre-rendering, and pricing it in the browser would need a
client-side API call and a client-computed total. `StickyBasket` plus the
header basket stays the adaptation, and `docs/design/README.md` records the gap
rather than quietly closing it.

> **Superseded 2026-08-06.** Both objections were about building it *in the
> page*. Built as a client component over a route handler, the page keeps its
> pre-rendering and the client is handed formatted strings, so neither applies.
> See the 2026-08-06 entry.

### 2026-08-03 — Sign-in asks which country the number is from

The sign-in screen now has a country select in front of the number, Armenia
selected by default, and the number is validated against the country before
anything is sent. Sign-in also stops being Armenia-only: `POST /auth/send-code`
accepts Russia `+7`, Georgia `+995`, USA `+1`, France `+33`, Germany `+49`,
Iran `+98` and UAE `+971` alongside `+374`. Updated:
`docs/API_DOCUMENTATION.md` (`POST /auth/send-code`), `docs/COMPONENTS.md`
(`PhoneField`). Two new i18n keys in each of hy/ru/en.

**One list, in `packages/shared`.** `PHONE_COUNTRIES` holds each country's dial
code, valid subscriber lengths, trunk prefix and example. The form is built
from it and the API's `normalizePhone` validates against it, so the field
cannot offer a country the API would refuse — which is the only bug this
screen can really have.

**The country is a field, not a guess.** The form posts `country` and `phone`
separately, because a leading `0` means different things in different places:
`099123456` is Armenian, `89123456789` is Russian, and both are just "0…" to a
parser. Choosing removes the ambiguity before the number is ever built.

**Every existing Armenian spelling still works, unchanged.** `normalizePhone`
tries two readings in order — a whole international number first, then a bare
national one read as Armenian — so `99123456`, `099123456` and
`+374 99 123 456` all still collapse to `+37499123456`. Dial codes are matched
longest-first, or `+971 50…` would be read as Russia's `+7`. The existing
nine-case table passes untouched; twelve international cases join it.

**Country names come from `Intl.DisplayNames`, not the dictionaries.** ICU
already has every country in every language, correctly declined; copying eight
of them into three JSON files would have added twenty-four strings whose only
future is to drift. The dictionaries gained the two strings that are actually
ours to write — `countryLabel` and `phoneInvalid`.

**A fix found on the way:** the sign-in error banner rendered `phoneLabel`,
so a refused number was explained with the words "Phone number". It now shows
`phoneInvalid`, which says what is wrong with it.

### 2026-08-03 — Pricing a dine-in basket is no longer an error

`POST /cart/quote` refused any `dine_in` basket that had no `reservationId`,
with a 422. But choosing "dine in" and booking the table are **two steps**, so
between them there is an ordinary basket, on a screen the customer is looking
at, in exactly that state. Every screen that prices a basket — `/cart`,
`/preorder`, `/checkout` — therefore crashed, and because the basket lives in a
cookie that outlives the page, the customer could not get back to the basket to
empty it either. Choosing "dine in" bricked the flow. Updated:
`docs/API_DOCUMENTATION.md` ("Dine-in orders").

**The split is pricing vs committing**, which this codebase already had a shape
for: coupons `preview` (returns null) for a quote and `claim` (throws) for an
order. `resolveReservation` never got that split, so it enforced an
order-time rule at pricing time. It now takes `{ required }` — false for
`quote`, true for `create`. `POST /orders` still 422s without a booking.

**What deliberately did not change.** A `reservationId` that *is* supplied is
still checked in full on both endpoints — owner, branch, active status, not
already used — so quoting is not a way around any of it. Three tests cover
that, because the relaxation is only about *not having* a booking.

**`canOrder` stays as it is,** reporting on the basket's contents rather than
on the flow. Making it `false` for an unbooked dine-in basket looks right and
is a trap: `/cart` hides its CTA when `canOrder` is false, so it would strand
the customer on a basket whose only route to the booking form had just been
removed. The block belongs on `/preorder`, the screen that books the table,
where it already is.

### 2026-08-03 — Armenian moves to the bare domain

Armenian is the default language and no longer carries a URL prefix. The site's
Armenian pages are now `amragrir.am/` and `amragrir.am/r/sunny-table`; Russian
and English keep an address of their own (`/ru`, `/en/r/sunny-table`) so each
language is still indexed separately with `hreflang`. Armenian is the market's
language and the overwhelming majority of the traffic, and it was the only one
paying for a prefix it did not need. Updated: `docs/DEVELOPMENT_GUIDE.md`
(§ localised columns, and the "how each app decides which language to show"
table), `apps/web/README.md`.

**One page, one address.** `middleware.ts` *rewrites* an unprefixed path onto
the `[lang]` tree rather than redirecting, so the visitor keeps the short URL,
and `/hy/…` now 308s to the unprefixed form. Serving a page at both addresses
would split its ranking between them, so the old URLs redirect instead of
staying alive. Every URL in the app is built by `lib/site.ts`, so the change is
one `prefix()` helper — and a test asserts no helper can emit a `/hy` URL.

**`Accept-Language` is no longer read by the web app** (`negotiate()` is gone).
It used to pick where a visitor landing on `/` was sent. That cannot survive an
unprefixed default: a Russian-speaking visitor who deliberately clicks "HY" is
sent to `/`, and a header redirect would bounce them straight back to `/ru` —
leaving no way to ask for Armenian at all. The bare domain now always serves
Armenian and the language switcher is the way to change it. Keeping the old
behaviour would have needed a preference cookie to override the header, which
is machinery for a redirect Google discourages anyway.

**Links and routes are not the same string any more, and that distinction is
now load-bearing.** A link is the published URL (`/cart`); a *route* is what
Next actually rendered, which is always `/[lang]/…` (`/hy/cart`), because the
unprefixed URL is a middleware rewrite rather than a route of its own. So
`revalidatePath` — which keys on the route — goes through `routePath()`, while
`redirect()` keeps using the public path. Getting this backwards revalidates
nothing at all, in the language that is most of the traffic, and reports no
error: the customer just sees a basket missing the dish they added. Two tests
hold it: one on `routePath()`, and one that reads `actions.ts` and fails if any
`revalidatePath` call is not wrapped.

**A `robots.txt` gap fixed on the way.** The private screens were disallowed as
`/*/cart`, `/*/checkout` and so on, but search was listed only as `/search` —
which never matched the real `/hy/search`, `/ru/search`. Each screen is now
named in both shapes, unprefixed and prefixed, generated from one list.

### 2026-08-03 — A customer can order from the web

The web stops being a shop window. The whole chain works in a browser now — add
dishes → basket → when & how → sign in → pay → pickup code and tracking — for
**pickup and dine-in**, with a ready time up to a week out. This reverses the
Phase 9 deferral recorded in `apps/web/README.md`; that decision is now history
rather than policy. Updated: `docs/SCREENS.md` (§14, the web's screens and how
they differ), `docs/USER_FLOW.md` (§12, the web ordering flow),
`docs/COMPONENTS.md`, `docs/DEVELOPMENT_GUIDE.md` (the frontend rules the web
follows instead of the app's), `docs/design/README.md`, `apps/web/README.md`.
84 new i18n keys in each of hy/ru/en.

**No backend work.** Every endpoint already existed and was tested; `apps/web`
was simply the one client that never called them. `docs/API_DOCUMENTATION.md` is
unchanged for that reason.

**The architecture, which is the actual decision.** The browser never talks to
the API. Reads stay in server components, writes are Server Actions driven by
`<form action={…}>`, and the Next server holds the tokens. So there is still no
`NEXT_PUBLIC_API_URL`, no API address in the bundle and no CORS — and now also
no token in reach of a script, because the session lives in an httpOnly cookie.
The consequence worth stating: **the entire flow works with JavaScript
disabled**, including stepping quantities, booking a table, signing in and
paying.

The basket is a cookie of ids and quantities and *never* money — every total on
every screen comes from `POST /cart/quote`, re-priced on each render, because a
price in a cookie is a price the customer can edit. It is re-validated on read
against `ORDER_MAX_LINES` and `ORDER_MAX_ITEM_QTY`, so a hand-edited basket is
refused immediately rather than at checkout. A guest account is minted on the
first deliberate act — adding a dish — not on a page view, so crawling the
catalogue creates nothing. `POST /orders` and `POST /payments` carry an
idempotency key derived from the basket, so a double-submitted form joins the
first attempt instead of charging twice.

**Following the refreshed artifact.** `docs/design/web-landing.html` was updated
with a checkout slide-over and an order-confirmed modal, and both are
transcribed — the 440px panel, the 24px quantity chips, the uppercase section
labels, the ready-time pills, the payment rows, the confirmation card. Both
became *routes* rather than states: checkout is an intercepting route, so
clicking gives the drawer and loading the URL directly gives the same component
as a full page, and the confirmation is `/[lang]/orders/{id}` because it carries
the pickup code, which has to survive a reload.

**Where it departs from the artifact, on purpose.** Its fourth payment method,
*cash at the counter*, is not built — every order is paid online before the
kitchen sees it (`BUSINESS_LOGIC.md §5`), and the design has been wrong about
this since the first reconciliation. Apple Pay and Google Pay are drawn but
disabled, labelled "available in the app": they need a browser payment SDK this
app does not have, and a live button that cannot pay is the dead end the
previous design pass existed to remove.

**Two things that cost a decision.** The basket badge is drawn in the browser
from a second, deliberately readable cookie holding only the item count —
reading the basket on the server would opt every restaurant page out of
pre-rendering, undoing the reason this app exists. And the order pages are
`noindex` *and* disallowed in `robots.txt`, because `noindex` is only read after
a fetch and these pages do real work per request for a client that can never
have a basket; the orders screens send a session-less visitor to sign in rather
than through the guest-minting route, which would otherwise loop forever for
anything that keeps no cookies.

### 2026-08-03 — The web wears the design

`apps/web` is now the artifact rather than a rough likeness of it. Updated:
`docs/COMPONENTS.md` (a note on what the web implements and what it deliberately
does not), `apps/web/README.md`. New i18n keys: `svcPickup`, `svcDineIn`,
`svcReserve`, `kcal` — the first three taken verbatim from the artifact's own
short forms rather than translated afresh.

**What changed.** A sticky 72px glass header with the logo mark, the search
field as one rounded control, the language switch as a segmented pill. The hero
is the artifact's gradient panel with its two translucent discs, not page text
on a background. Cuisines became a scrolling rail of tiles instead of a wrap of
pills. Restaurant cards gained the thing that made them cards: a 180px media
band with the open/closed and rating badges floating on it, the prep time as an
accent chip, and — new — the services the restaurant advertises, which the API
had been returning all along and nothing rendered. The restaurant page gained a
280px banner, a rating box, and a two-up dish grid where each dish finally shows
its photograph, calories and prep time; the seed has carried those photos since
Phase 2 and the page never asked for them.

**Where it departs from the artifact, on purpose.** The `+` on every dish, the
cart button and the sticky order panel are the ordering flow Phase 9 deferred —
drawing the buttons without the flow behind them is the dead end this app was
just criticised for. The location selector needs coordinates and the avatar
needs an account; neither exists here. And the artifact's menu **tabs** render
as anchors that scroll, because a tab that hides three quarters of the menu
defeats the single rule this app is built on: the HTML that leaves the server
already contains the content. Verified, as before, by stripping every `<script>`
from both pages and finding the names, prices and menu still there.

Two of the artifact's six filter chips stayed out for the reason already
recorded against "Near me": they map to no API parameter. The remaining four
kept their glyphs; pickup/reserve/dine-in were already there.

Responsive behaviour is this repository's, not the artifact's — it is drawn at
1280×860 and says nothing about a phone. Three breakpoints: the three-up grid
steps to two and then one, the hero's padding and headline shrink, and the
header wraps its search field rather than crushing it.

### 2026-08-03 — The design source is in the repository now, and it disagrees with the code

`docs/design/` holds the design artifacts as HTML. Added:
`docs/design/README.md`, `docs/design/web-landing.html`. Updated:
`docs/README.md` (index), `docs/DESIGN_SYSTEM.md` (§"Two design artifacts").

**Why it is worth the 156 KB.** The artifacts were previously opened once,
distilled into DESIGN_SYSTEM/SCREENS/COMPONENTS, and lost. The cost was already
visible in this repository: the note that the two artifacts disagree about four
opacity values had to be written as prose, because nothing remained to re-read.
A design source that cannot be diffed is a design source that has to be trusted.
The web artifact can now be checked; the **mobile** one — the authoritative one,
and the one behind the eight unbuilt screens in SCREENS.md — is still missing.

**Two places where the web artifact contradicts implemented business logic**,
found by reading it against the code rather than against the earlier summary:

- **It offers cash.** `payNames` ends in `Cash` / `Наличные` / `Կանխիկ`, in all
  three languages. `PaymentMethod` has no such value, deliberately: an order is
  paid for before the kitchen sees it, so nothing can owe money at the counter
  (§5). The design is wrong here, not the code.
- **"Reserve Table" leads nowhere.** The filter chip and the per-restaurant
  badge are drawn; no booking flow exists in the artifact — no date, guests,
  slots or deposit — while the API implements all of it.

**And what it has no concept of at all**, recorded so the next person does not
rediscover it: order tracking (it stops at the confirmation modal, against eight
statuses); a failed payment and the unpaid order it strands; cancellation, and
that paying ends it; deposit and referral lines in the totals; basket limits;
one restaurant per basket; sold-out dishes; **branches** — it treats a
restaurant as a single place, where one has up to ten, each with its own
address, hours and menu; and **authentication**, though placing an order
requires an identity. Two of its six filter chips map to no API parameter.

None of this is a defect report against the code. The artifact's ordering flow
is the one Phase 9 deferred, so it reads as a proposal that was never accepted —
which is exactly why it needed writing down rather than quietly fixing.

### 2026-08-03 — One row per restaurant, for a caller whose pages are per restaurant

The public site drew Green Bean five times, Black Angus five times, and headed
the list "Restaurants in Yerevan (78)" over 23 restaurants. Updated:
docs/API_DOCUMENTATION.md (`GET /restaurants` gains `groupByRestaurant` and
states the ordering tie-break; `GET /search`), apps/web/README.md.

**Why it looked like that.** A row from `/restaurants` is a *branch* — that is
what a guest travels to, and what carries hours, coordinates and prep time. The
mobile home feed sends coordinates, so its branches are told apart by distance.
The web sends none and has exactly one page per restaurant, so every branch of a
chain rendered as an identical card, all of them linking to the same URL. The
sitemap and `generateStaticParams` already collapsed the list by slug for this
very reason; the listing that visitors see did not.

**`groupByRestaurant`.** Opt-in, off by default, so the app's feed is untouched.
Collapsing runs **after** filtering and ordering, so the branch kept is the best
one under the active query — the fastest under `sort=fastest`, an open one under
`openNow` — and `total` counts restaurants (23) rather than branches (78).

**Every ordering now ends in a tie-break** (`created_at`, then `id`). A chain's
branches share one rating, so `ORDER BY rating` was a tie across all of them and
Postgres could return tied rows in any order — which quietly makes `skip`/`take`
paging drop and repeat rows between pages. It is also the tie-break
`GET /restaurants/{id}` uses to pick a branch, so the branch that represents a
restaurant in the list is now the same one the page behind it opens: a card
reading "open · 8 min" no longer leads to a page that says otherwise.

**Search had the same defect** and is fixed without a flag, because nobody wants
a restaurant listed once per branch: the query matches on name and cuisine, both
restaurant columns, so five branches of one chain filled five of the twenty
result slots. It now reads a wider window and returns one row per restaurant.

**Menu section headings were the raw wire values.** The Armenian restaurant page
printed `mains`, `sides` and `drinks`. `MenuTab` is an enum, not a word; the
headings are now translated (hy/ru/en), typed so a new section without a
translation is a compile error.

**The "order in the app" block was two lines of inert text.** Ordering itself
stays the app's job — Phase 9's call is unchanged, and nothing here duplicates
checkout or payment — but a visitor who read the whole page arrived at the point
of wanting the food and found nothing to press. It now carries the branch's
phone as a real action (`callRestaurant`, hy/ru/en). App-store links belong in
the same block once there are URLs to point at; there are none in the repo.

**Branches had no phone number to show.** `restaurant_branches.phone` has always
existed and the page has always had markup for it, but no seeded row filled it,
so both the contact line and the new action were invisible to everyone. The seed
now gives every branch its own `+374 10 555 0xx` — derived from the index like
the rest of it, so a reseed is reproducible — and backfills databases seeded
before today, filling only nulls so a number corrected in the back office
survives. `tel:` hrefs are stripped to digits (RFC 3966 does not allow the
spaces the display format uses).

### 2026-08-03 — Ordering for later: booked orders, and the warning a branch gives itself

A customer picking a time rather than taking the earliest now means something all
the way through. Updated: docs/BUSINESS_LOGIC.md §4 (new *Ordering for later*
section, two constants), docs/DATABASE.md (`orders`, §8a, new §8b, indexes),
docs/API_DOCUMENTATION.md (`POST /orders`, `POST /payments`, `GET /orders`,
`GET /restaurant/orders`, its history route, the new
`PATCH /restaurant/orders/{id}/reminder`, the new *Back-office notifications*
section), docs/ROLES_AND_PERMISSIONS.md, docs/SCREENS.md §5 and §7,
apps/admin/README.md.

**What was already there and is now documented.** `orders.prep_min`,
`prep_start_at`, `reminder_at` and `reminder_sent_at`; the pure scheduling rules
shared by the basket quote and order creation; opening hours checked for a
genuine pre-order only; `staff_notifications` addressed to a branch rather than
to a person; the once-a-minute Redis-locked sweep that is the API's only
scheduled job; and the board's split between orders that are due and orders that
are not. None of it had reached `/docs`, which is why this entry covers the whole
feature rather than only what moved today.

**What is new.**

*Paying for a pre-order accepts it.* `paid` means "waiting for the restaurant to
say yes", and nobody presses Confirm on Monday for a Saturday order — so until
somebody did, the diner watched a screen saying the restaurant had not looked at
it, on no board anybody opens. The payment transaction now also moves it to
`confirmed`, recorded with a **`system`** actor: a diner cannot accept an order
on a restaurant's behalf, and no member of staff was there. Both moves are
announced, so no watcher sees a jump the state machine has no edge for. Ordinary
orders are untouched.

*The warning is a number somebody can move.* `reminder_at` was arithmetic nobody
could see: ready time, less the prep estimate, less a constant. That is a fine
default and a poor rule — the estimate is the slowest dish on the ticket, and the
person at the pass knows things a menu column does not. `orders.reminder_lead_min`
holds it as **minutes before the food is due** (the number as a shift says it),
defaulted to exactly the old arithmetic so nothing already placed moved, and
`PATCH /restaurant/orders/{id}/reminder` lets `orders:advance` change it between
5 minutes and 24 hours. Nothing the customer was promised moves. A `reminder_set`
row in `order_events` records who did it and what it was before, because the
column is overwritten in place; `reminder_sent_at` is re-armed when the new
moment is still ahead, so lengthening a notice cannot silently mean it never
fires again.

*The back office can see any of this.* A **Booked** tab, first in the strip and
deliberately not the landing tab, holding the pre-orders whose hour has not come
— the one stage that is a question about time rather than status. Each of its
cards says when the order is due and when the kitchen must start, drops the
countdown and the late warning (both meaningless on work nobody was meant to have
begun), and carries a button reading its own notice — *Warn 40 min ahead* — that
opens a dialog previewing the moment a new notice would land. The board now sorts
by `prep_start_at` rather than `created_at`, which is the same ordering for
ordinary orders and the right one for a pre-order.

*And a bell in the shell*, because a reminder has to reach somebody looking at
something else: an order due at eight is announced at ten past seven, and nobody
is watching the Booked tab at ten past seven. `GET /staff/notifications`,
`POST /staff/notifications/read` and the socket's `watchBranches`, all on
`orders:read`. Read-marks are per person — the first colleague to open the bell
must not clear it for the shift.

**Still a default rather than a setting:** nothing writes `branches.open_hours`,
so every branch is treated as open 10:00–23:00 and the times a customer may pick
are the same everywhere. Making that a branch admin's to set is the next piece.

### 2026-08-03 — A cooking order can go straight to the pass

A card on the *Preparing* tab now offers two moves: **Almost ready**, and
**Ready** beside it. Updated: docs/BUSINESS_LOGIC.md §4,
docs/API_DOCUMENTATION.md (`PATCH /restaurant/orders/{id}/status`),
apps/admin/README.md.

`almost_ready` is a warning to whoever works the counter, not a step in cooking.
Plenty of dishes are plated in one motion and never wait at the pass, and until
now saying so meant pressing twice — which left behind a record of a stage the
food was never in. **`preparing → ready` is now an edge in the state machine**,
so it is one transition and `order_events` records it once, as what happened.

The panel needed no new rule to show it: `ORDER_STATUS_FLOW` gained the second
entry and the card renders what the flow offers, as it always has. What is new
on the card is the emphasis — only the **first** move is a filled button, and
anything past it is offered rather than instructed. Two solid buttons side by
side are two things asking to be pressed, on a screen worked with the side of a
hand. Both keep the 44px target: a shortcut you have to aim at is not one.

The one consequence worth knowing is on the strip above: **the *Almost ready*
tab now counts what somebody deliberately flagged**, not everything on its way
out of the kitchen. That is the number a counter actually wants — it stopped
being "orders that will need handing over soon" and became "orders somebody said
will".

`preparing` is the only status in the machine with a second way forward, and a
test in each of `order-status.spec.ts` and `order-actions.spec.ts` fails if
another appears — a second shortcut is a decision, not a detail. The panel's
button derivation moved out of `format.spec.ts`, which had been re-implementing
it locally to test it, into `order-actions.spec.ts` against the real function.

### 2026-08-03 — A restaurant survives its owner being deleted

Caught by `prisma migrate dev`, which generated a migration nobody asked for
while applying the payments one — the sign that the schema and the migration
history had been disagreeing since 31 July. Updated: docs/DATABASE.md.

`20260731100000_restaurant_admin_by_assignment` made `restaurants.owner_id`
nullable, because ownership became a `restaurant_admin` row in
`staff_assignments` and a restaurant no longer needs a user behind it. Prisma's
implied referential action follows the column — `Restrict` while required,
`SetNull` once optional — so the schema has meant `ON DELETE SET NULL` since
that day. The database was still carrying the `ON DELETE RESTRICT` from the
initial migration, because nothing ever generated the SQL to change it.

**Only a database built from the migrations was wrong**, which is every one that
matters: CI, a new machine, production. Deleting a user who owns a restaurant
failed with a foreign key violation, where `owner User?` in the client promises
the column is simply emptied. Nothing to back-fill — this changes what a
*future* delete does, and no `owner_id` value is touched.

New migration `20260803100000_restaurant_survives_a_deleted_owner`. It is the
one Prisma generated; it was left unnamed at the prompt, and has been renamed
and given the header the rest of the folder has.

### 2026-08-03 — The order board becomes the state machine, and the panel fills the window

The stage tabs are now *Paid · Confirmed · Preparing · Almost ready · Ready ·
Done* — one per status, in the order an order moves through them, opening on
**Paid**. Two unrelated changes to the same screen. Updated:
docs/API_DOCUMENTATION.md (`GET /restaurant/orders`), docs/COMPONENTS.md
(`SegmentedTabs`), apps/admin/README.md.

**The stages were coarser than the statuses, and that cost a kitchen numbers it
needed.** A single `new` spanned `created`, `paid` and `confirmed`; `preparing`
swallowed `almost_ready`. The argument was that these are one decision to a
kitchen rather than three — they are not. Accepting an order, starting to cook
it and plating it are three different people's moments, and a tab that mixed
them could not say how many of each were waiting. `QueueFilter` gains
`confirmed` and `almost_ready`, `preparing` narrows to itself, and `new` is
gone. Every count on the strip is now a number somebody can act on.

**`paid` leads and is where the board opens** — and where clearing the filters
returns it. It is the only stage whose next move belongs to the restaurant: the
money is in, nobody has accepted the order, and a diner is watching a timer that
has not started. Everything after it is work under way or work finished, which
is not what a kitchen opens this screen to find out.

**`active` is off the strip** but stays in `QueueFilter` as the API's default
for a caller that names no stage. It answered "show me everything", which has no
action attached to it. It is also the reason the counts still do not sum to the
number of orders: `active` overlaps every working stage, so a paid order is
counted under both.

**The unpaid orders hang off Paid, as an inner filter.** Open **Paid** and a
quieter strip appears under the tabs: *Paid* and *Unpaid* — the two halves of
one question, did the money arrive. `unpaid` is a new `QueueFilter` holding
exactly the `created` status, named for what it means rather than the status
behind it, because "which of these were never paid for" is the question somebody
actually asks. No place on the top strip, because that strip is the path an
order takes through a kitchen and an unpaid order never enters it.

It is worth reaching at all because **nothing expires those rows.** There is no
scheduled job in the API of any kind, so every abandoned basket and every
declined card stays for good — 25 in the dev database as this shipped, the
oldest twelve days old. Without the tab they pile up entirely out of sight; with
it they are one click from the stage they are the opposite of. The tab makes the
pile visible, it does not clear it.

**The nesting is presentation only.** Both levels are ordinary `QueueFilter`
values, so picking *Unpaid* just asks the API for a different stage — no second
filter in the board's state, none in the request, and `topStage` keeps Paid lit
while the inner filter is on.

The stage table lives in `packages/shared`, so the API needed no changes at all:
`@IsIn(Object.values(QueueFilter))`, `where.status.in` and the per-stage counts
all read it. A test walks the strip against `ORDER_STATUS_FLOW` and fails if a
tab is out of order or quietly widens, and another pins that `created` reaches
no tab on the strip but is reachable under Paid. Dictionary keys
`ordersStageConfirmed`, `ordersStageAlmostReady`, `ordersStageUnpaid` and
`ordersPaidFilterLabel` replace `ordersStageNew`, `ordersStageNewAll`,
`ordersStageCreated`, `ordersNewFilterLabel` and `ordersStageActive`;
`ordersEmptyAll*` became `ordersEmptyPaid*`, since the empty board a kitchen
lands on is now the one waiting to be accepted.

**`SegmentedTabs` nests, and scrolls sideways instead of pushing the page wide.**
One rendered inside another's panel is a sub-filter that appears only while its
parent segment is open; `.subfilter` makes the inner strip smaller and outlined
rather than filled, because two identical rows of segments read as one control
that wrapped. The strip had no overflow rule either — segments are `flex: none`
so a tab is never squeezed to half a word.

**`.main__content` is no longer capped at 1280px**, and `--content-max` went
with it — it had no other reader. A measure that suits prose is wrong for a
panel of tables, boards and card lists: the cap left a wide monitor showing the
same number of orders as a laptop, with grey down both sides.

### 2026-08-03 — Every order is paid for online, and paying is the point of no return

Two rules changed together, because they were the same rule seen from two ends:
an order used to be able to exist without money behind it, and money used to be
able to come back out of an order. Neither is true now. Updated:
docs/AI_CONTEXT.md, docs/BUSINESS_LOGIC.md, docs/API_DOCUMENTATION.md,
docs/DATABASE.md, docs/USER_FLOW.md, docs/SCREENS.md,
docs/ROLES_AND_PERMISSIONS.md, apps/api/README.md, apps/admin/README.md.

**`cash` is gone from `PaymentMethod`.** The design had it as "Place order"
without online payment: `PaymentsService.pay` skipped the provider, recorded the
payment `pending`, and moved the order to `paid` anyway so the kitchen would
receive it. Nothing in this repository ever settled those rows — there was no
endpoint, staff action or job that turned a pending cash payment into a captured
one — so `paid` meant "in the queue" for some orders and "actually paid for" for
others, and cash revenue was uncountable by construction. Every method now goes
through the provider, and a successful `POST /payments` means the money was
taken.

**An order can only be cancelled while it is `created`.** `ORDER_STATUS_FLOW`
kept an edge to `cancelled` from `paid` and `confirmed`; both are removed, and
`CANCELLABLE_ORDER_STATUSES` is down to the one status before the money. The
panel needed no change to match — its buttons are rendered from that table, so
Cancel simply stops appearing once an order is paid for, and
`PATCH /restaurant/orders/{id}/status` refuses it with the same 422 the
customer's endpoint gives.

**What this costs, stated plainly:** a branch that cannot fulfil a paid order —
the kitchen goes down, a dish runs out, the customer never comes — has no
in-product way to call it off or return the money. The refund path in
`transition()` is now unreachable for orders in practice; what still reaches it
is a *declined* attempt on an order the customer then walked away from, which is
closed off as `cancelled` so nothing is left looking live. Deposits are
unaffected: a reservation can still be cancelled and its hold released, which is
now the only place in the product where money moves backwards.

**`20260803090000_online_payments_only`** rebuilds the Postgres enum, which
cannot have a value dropped in place. Existing `cash` rows become `card` —
a statement about how they were taken that is not true, and there is no honest
alternative inside a type that no longer has the word. What survives is
`provider_ref = 'legacy_cash'`, written before the rewrite: cash rows are
exactly the ones with no provider reference, so they stay findable afterwards.
**The migration is written for a development database**, whose data is seeded
and disposable; a live one needs somebody to decide whether those orders were
settled at a counter or never paid for, and deciding that in SQL would be
inventing revenue.

**`paymentMethod_cash` stays in the three dictionaries** even though no code
path can produce it. `order_events` rows written before today still carry
`paymentMethod: "cash"` in their detail, and an audit trail that renders
`paymentMethod_cash` at somebody who opened it to check a payment is worse than
a dictionary entry with no caller.

**The seed tells the new story.** No cash, so every paid order is `captured`;
`statusPath` no longer needs a generator, because a cancelled order has exactly
one history — created, then cancelled. Most cancelled orders in a fresh database
are now a card that was refused and never retried, which is the same case
`order_events.type = 'payment'` was added for.

### 2026-08-02 — An order card hands its code to a scanner

Every card on the kitchen board prints the pickup code across its top — the four
digits the counter says out loud. They are unique only among the orders in front
of it. The code that names exactly one order is `orders.code`, `AMR-` + 8
digits, and on the card it was small grey text in the meta line: something to
read aloud and retype, into the board's own search, into a handheld, into the
note on a refund. Twelve characters retyped at a busy counter is where the wrong
order gets picked. Updated: docs/COMPONENTS.md, docs/DESIGN_SYSTEM.md,
apps/admin/README.md.

**A QR button on every card**, beside History and grouped with it (`.order__aside`)
— both are ways of looking something up rather than moves the order makes, so
the status buttons keep the right edge of the row where the thumb already is. It
opens the full code as a QR code big enough to scan across a counter. Anything
that reads one gets it with no keystrokes: a phone, or the wedge scanner that
types what it sees straight into the search box on the next screen. **The plain
code stays written under the picture** — a scanner can be flat, out of reach, or
not there at all, and a code nobody can read with their eyes is a dead end when
it is.

**Nothing is encoded until the dialog opens.** Radix mounts dialog content only
while it is open and the work sits inside the plate rather than in the card, so
a board of fifty orders generates one code — the one somebody asked for.

**`apps/admin` takes its first non-Radix runtime dependency:
[`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator)** (MIT,
no dependencies of its own), for the same reason `src/ui` is built on Radix.
Twenty icons are drawn by hand in this repo because they are twenty paths;
Reed–Solomon codewords, version tables, mask selection and format bits are not,
and a QR the counter's scanner quietly refuses to read is a bug nobody finds
until somebody is standing at the counter.

**What is ours is the drawing** (`src/qr.ts`): the dark modules as one SVG path,
runs merged, in module units — so the code inherits `currentColor`, scales to
whatever box it is given and stays crisp on a tablet held at arm's length, none
of which the library's own rasterised data URL does. Level `M` at the smallest
version that fits, which is 21×21 for an order code; the spec's four-module
quiet zone is inside the viewBox rather than left to CSS, because a scanner
finds a code by its border. `qr.spec.ts` holds the path against the encoder's
own matrix — a path off by one module, or drawn transposed, is still a picture
of a QR code, and the only other place that shows up is a scanner that will not
beep.

**Two new tokens that do not follow the theme: `--qr-ink` (`#111`) and
`--qr-paper`.** DESIGN_SYSTEM.md §1 already named the ink; both are now real
tokens in `packages/ui/src/tokens.ts`, so no stylesheet hard-codes them. Dark
modules on a light field is what the format assumes, and a code that inverted
itself under the dark panel is one a handheld may refuse to read — the panel's
theme is the staff member's choice, not the scanner's.

### 2026-08-02 — Demo dishes get photographs of the dish

Every seeded dish pointed at `/static/menu/<category>.svg` — a gradient with the
category's emoji on it — and any dish predating the photo rule had nothing at
all. Eleven gradients is not a menu you can judge a menu screen by. Updated:
docs/BUSINESS_LOGIC.md, docs/DATABASE.md, docs/DEVELOPMENT_GUIDE.md,
apps/api/README.md, apps/api/.env.example, apps/api/public/menu/README.md.

**A photograph per dish, hotlinked.** `prisma/menu-photos.ts` maps 34 of the
seed's dishes to a picture of that dish and every category to one for the rest —
recipe photos from TheMealDB/TheCocktailDB, freely-licensed photographs from
Wikimedia Commons. Nothing is downloaded: no images in the repository, no
licences to carry, and the trade is that they live on somebody else's servers.
**`MENU_PHOTOS=local`** seeds the committed placeholders instead, which is what a
demo behind a captive network wants.

**Every URL was fetched and looked at before it was written down.** Not
fussiness: a keyword search for "cola" returned a bottle among sugar skulls, one
for "lemonade" a museum's empty pitcher, and one for "grilled vegetables"
chicken and rice. Where no picture of the actual dish could be found, the dish
takes its category's — "Napoleon" showing a cheesecake is a stand-in, showing
something else entirely is a lie about the menu.

**New: `pnpm --filter @amragrir/api db:photos`.** Applies the table to a
database that is already up, without re-seeding anything else; the seed calls
the same function, so a fresh database and a running one agree. It rewrites a
dish with no photograph or one the seed put there and **never** one somebody
uploaded — the only picture in the table anybody actually chose. Idempotent.

**`prisma/categories.ts`** is new: the seed's category list, importable without
running the seed. That is what lets a test hold the photo table to it, so a
category added without a picture fails rather than shipping every dish under it
a generic plate.

Also fixed a flaky assertion found while running these suites:
`seed-activity.spec.ts` compared two `momentFor` calls for equality, and
`momentFor` is an offset from `Date.now()` — it failed about one run in three on
a millisecond boundary. It now stops the clock, which is what the claim meant.

### 2026-08-02 — A dish can be changed after it is on the menu

The panel could set a dish's picture, its Russian name and its menu tab exactly
once — while adding it. Afterwards the row offered a price box, a sold-out
switch and a delete button, so correcting a wrong photograph meant deleting the
dish and adding it again, taking its history with it. Each row now has a pencil
next to History. Updated: docs/API_DOCUMENTATION.md, docs/BUSINESS_LOGIC.md,
docs/COMPONENTS.md, apps/admin/README.md.

**One form for both jobs.** `dish-form.tsx` holds `NewDish` and `EditDish` over
a single `DishFields` — they ask for exactly the same things, and the moment
that is written twice is the moment a field lands in one of them only. The edit
opens on what the dish is now, which is what makes the photograph replaceable
rather than merely settable once. The file input, the upload and the preview
moved to `photo.tsx` and are shared the same way.

**Only what moved is sent, and Save is held until something has.** `dishPatch`
(`dish.ts`, pure, `dish.spec.ts`) diffs the form against the row and returns
null for a form nobody changed — the API writes no history entry for a PATCH
that moves nothing, so reporting success for one would be a lie in the direction
people check. Sending only the moved fields also keeps an edit from overwriting
what somebody else changed while the form was open.

**`prepMin: null` now clears the estimate.** The type said `number` while the
runtime already accepted `null` (`@IsOptional()` skips it) — made honest rather
than closed off, because an estimate can turn out to be wrong and a dish that
could claim one but never take it back would keep a number the kitchen has
stopped believing. The exact opposite of `photoUrl`, which the same request
refuses to blank; absent still means "leave it alone" for both.

**The price box and the sold-out switch stay in the row.** They are what
somebody changes mid-shift, and a form is the wrong shape for one number.

**A long dialog scrolls now.** `.dialog` caps itself at the viewport and
`.dialog__body` was already `overflow-y: auto`, but the `<form>` between them
defaulted to `min-height: auto` and refused to shrink — so a form tall enough
(this one, at six fields, on a laptop) pushed its own Save button off the bottom
of the screen with nothing to scroll. Latent before this; reachable now.

### 2026-08-02 — A dish needs a photograph to go on the menu

`photoUrl` was optional on `POST /restaurant/menu-items`, the panel's "Add a
dish" form did not ask for it at all, and there was nowhere to put an image even
if somebody had one — so the honest description of the rule was that dishes went
on the menu without pictures. A menu is a list somebody reads with their eyes:
an entry with no picture sits under the ones that have one and does not get
ordered, and nobody comes back afterwards to fix it. Updated:
docs/API_DOCUMENTATION.md, docs/BUSINESS_LOGIC.md, docs/DATABASE.md,
docs/DEVELOPMENT_GUIDE.md, apps/api/README.md, apps/admin/README.md.

**`photoUrl` is required on create — 400 without it.** An absolute `http(s)`
URL, trimmed before it is checked (a pasted `"  "` would otherwise satisfy
`@IsNotEmpty` and store a photo that resolves to nothing), max 500 characters.
`require_tld: false` so `http://localhost:4000/…` still validates in
development.

**The PATCH may swap the picture but cannot take it off.** `photoUrl` uses
`@ValidateIf` rather than `@IsOptional()`, which skips `null` as well as absent
and would have written that `null` straight to the column — leaving the field
out is how an edit says "not this one", while `null` and `""` are both 400.

**New: `POST /uploads/menu-photo` — `menu:write`.** The image bytes as the **raw
body** under their own `Content-Type`; the answer is `{ "url" }` to store on the
dish. Not multipart — one request carries one file, so the envelope would be
packaging with nothing to package, and multer would arrive needing
`@types/multer`, a parser and a storage engine to move a single image. A
twenty-line middleware collects the body instead; over the limit it drains
without keeping, so an oversized upload gets an answer rather than a dropped
connection. The bytes are **sniffed by magic number** and the sniffed type picks
the stored extension, which is what the file is later served as: believing the
`Content-Type` would let somebody store HTML as `photo.png` and have the API
serve it back as HTML from its own origin. SVG is refused for that same reason.
5 MB (`MAX_IMAGE_UPLOAD_BYTES` in `@amragrir/shared`, read by the panel too),
415 for anything else, 413 over the limit — both codes are new in the error
envelope. Stored names are fresh uuids, never the uploaded name.

**Two static mounts, outside `/v1`.** `/uploads/…` serves `UPLOAD_DIR` (new env
var, git-ignored, immutable for a year — uuid names never change under a URL);
`/static/…` serves the committed `apps/api/public` (an hour, so a corrected
placeholder can arrive). Both send `nosniff`. Both are absolute against
`API_PUBLIC_URL`, also new, which is what a dish stores.

**Every dish in the seed now has a picture, and so does every dish that
predates the rule.** There is no photography behind demo data, so the repo ships
one placeholder per category (`apps/api/public/menu/<category>.svg`, gradient
plus the category's emoji) and each seeded dish points at its own.
`backfillMenuPhotos` fills in anything already in the database, grouped by
category; the seed's summary prints `menuItemsWithoutPhoto`, which should always
be `0`. Visibly placeholders on purpose — a restaurant replaces one by
uploading, and until then the menu says which pictures are still owed.

**The column stays nullable.** A `NOT NULL` migration would have to invent
values from inside SQL that cannot know the deployment's `API_PUBLIC_URL`. The
seed fills the rows instead, and reads keep returning `photoUrl: string | null`.

**The panel uploads the file where the dish is created.** "Add a dish" has a
required Photo field — the native file input, restyled — that uploads on
choosing and shows the stored photo back as a thumbnail; submit stays disabled
until the upload lands. Type and size are pre-checked against the shared limits
(`photoRefusal`) purely so a 40 MB screenshot is answered instantly and in a
sentence about photographs. The menu table now shows each dish's picture next to
its name, with an empty dashed frame for the ones that have none. New:
`menu.dto.spec.ts`, `uploads.service.spec.ts`, `raw-body.middleware.spec.ts`,
`photo.spec.ts`.

### 2026-08-02 — Two cells on the Customers screen that finally open

The customer table showed four things about a diner and let you act on none of
them. Two of the four were facts with the answer withheld: a phone number masked
to `+374******56`, and an order count — "11" — with no way to see one of the
eleven. The number is withheld on purpose. The count was not: the only route to
those orders was the kitchen board, which searches by customer *name* and so
finds every Aram in Yerevan, on a screen scoped to a shift's own branches
anyway. Updated: docs/API_DOCUMENTATION.md, docs/ROLES_AND_PERMISSIONS.md,
docs/DATABASE.md, apps/admin/README.md.

**`GET /admin/users/{id}/phone` — `platform:users`.** One diner's number in
full, one account at a time. Its own route because it is its own act: the list
masks so that a page of twenty-five readable numbers is not something anybody can
photograph, and a support call needs exactly one of them. **404 both for an id
that belongs to nobody and for an account with no number**, because telling those
apart would confirm that an id exists.

**Every reveal writes `audit_log` — a new `customer.phone_view` action.** A mask
that whoever holds `platform:users` can lift silently is not really a mask, and
this is the first entry in that table to record a *read*. Nothing changed, so
there is no before/after pair: `after` carries the **masked** number, enough to
say which number was read without making the row a second permanent readable copy
of it. The entry is written **before** the answer is returned — a failure to
record is a failure to reveal. No scope on either column, like
`staff.impersonate`, which keeps the row readable only by a platform role. It is
also the only action whose `entity` belongs to the other identity (`customer`, a
`users` row), because it is a thing staff do to a customer record.

**`GET /admin/users/{id}/orders` — `platform:users`, not `orders:read`.** The
difference is which question is being asked. The board answers "what is this
kitchen working on", scoped to the branches a shift can reach; this crosses every
restaurant on the platform to answer "what has this person bought", which belongs
to whoever may see the person at all. Rows arrive **whole** — both codes, every
line, the four money fields, the payment, the booked table — because the screen
opens them in place, and a summary plus a detail route would be eleven requests
per page of ten to read what one query already joined.

**Orders and Points are centred columns now, heading and values together.** They
were `table__num`, which ranges right — except on the heading, where `.table th`
sets `text-align: left` at a specificity `.table__num` cannot beat, so the label
sat at one end of the column and its numbers at the other. Ranging right is what
*money* wants, because a column of amounts is read by lining up units; a tally of
11 against 4 is not read that way. New `table__count` modifier, carrying the
element in both selectors so the heading actually moves.

**Neither cell grew a button.** The masked number and the count are themselves
the controls: a button beside a number would be a second target saying the same
thing. The reveal does not undo — hiding it again would offer to un-know
something whose record is already written — and a badge marks the cell as showing
rather than masked, so a screen read over a shoulder is not mistaken for the
ordinary state. Revealed numbers are dropped on every load, so the mask does not
last only until somebody types in the search box.

**The dialog searches and filters, arranged like the board.** A regular's three
hundred orders is thirty pages, and paging back through them to find a
cancellation from March is not a way to answer a support call. `q` matches the
order code (full or the four-digit pickup code), a dish on the order, or where it
was bought — not the customer's name, which the board matches and which would
match every row here by construction. Search box in a toolbar, segments under it,
so anybody who works the queue already knows this.

**New `CustomerOrderFilter` in `shared`: `all` / `active` / `completed` /
`cancelled`.** Not the board's `QueueFilter` — "new", "preparing" and "ready" are
stages of work still to be done, and three of the five would match nothing for
all but the last hour of a diner's life. Not the customer app's `active`/`past`
either, because that folds cancellations in with completions, and a cancellation
is the row a support call is about. `all` is absent from the statuses map and the
type says so, so the service leaves the column out of the query rather than
writing an `IN` over all eight values that can never exclude a row.

**Counts come back with every page, taken under the search but not the filter.**
Type a code and the strip reads `All 1 · In progress 0 · Completed 0 ·
Cancelled 1` — the answer, before anybody clicks a segment. `counts.all` sums the
group-by rather than the other three, so a status nobody bucketed still shows up
in the total instead of quietly vanishing; `customer-orders-ui.spec.ts` asserts
the three buckets partition `OrderStatus` exactly.

**An order in the dialog links to itself on the board**, at
`/orders?restaurant=&branch=&order=CODE` — the same address a line of somebody's
activity already uses, so an order opens in the same place from wherever the
panel names it. The link is a control inside the opened half rather than the row
itself: opening is looking at it here, following the link leaves for another
screen, and a row that did both would make "which of the two did I just do" a
question about where somebody clicked.

### 2026-08-02 — A dish's own history, on the screen its price is on

`audit_log` has recorded every menu change since the entry above landed — who
added a dish, who moved its price, who marked it sold out — and there was
exactly one way to read any of it: open the People directory, find the right
person, and page through their whole working week hoping the change you wanted
was in it. The question people actually ask is the other way round. They are
looking at a price and want to know who set it. Updated:
docs/API_DOCUMENTATION.md, docs/ROLES_AND_PERMISSIONS.md, docs/DATABASE.md,
apps/admin/README.md.

**`GET /restaurant/menu-items/{id}/history` — `menu:read`.** Everything recorded
about one dish, oldest first, each entry naming the staff member behind it and
the time. No schema change and no new writer: `audit_log` is indexed on
`(entity, entity_id)`, so "everything that happened to *this* dish" was
answerable all along and simply had no endpoint. `MenuHistoryService` is its own
class rather than a method on `MenuService`, following `OrderHistoryService` —
the writer joins the transaction it describes, and keeping the reader out of it
means nothing in the writer can accidentally read unscoped.

**`menu:read`, not `staff:activity`, and the distinction is the point.** An
entity's history sits behind the permission that reads the entity — the same
rule that puts an order's timeline behind `orders:read`. Whoever may read a
price may read who set it, including the shift standing in front of the disputed
number. `staff:activity` stays what it was: one *person* across every dish they
touched, which is a record of a working day and a different power. ROLES gained
a "Who can read it" section stating the rule for all three reads.

**A withdrawn dish still answers.** This is the one menu read that does not
filter out `deleted_at`. The dish somebody took off the menu is precisely the one
they come back to ask about, and a history that vanished with its subject would
be missing at the moment it is wanted. Nothing here is editable, so no stale
panel can write through it.

**The menu row grew a History button, and it is offered to everyone on the
screen.** The actions column used to appear only for `menu:write`; it is now
always there, with Delete the one thing inside it that permission still gates. A
dialog rather than a column — a timeline is something you open about one thing,
read and close, and fifty dishes each carrying their own is a page nobody can
read plus a request per row for panels nobody opened.

**Each entry shows the fields that moved, `from → to`.** Prices formatted in
dram, availability in words, `*_i18n` names resolved to the panel's language, a
category and a photo shown as "set" rather than as a uuid nobody can read. The
diff walks the keys of **`after`**: the API adds the dish's name to `before` as a
label on every edit whether it changed or not, so walking `before` would render a
phantom rename on every price change. A creation and a withdrawal are not dressed
up as diffs — one lists what the dish went on the menu at, the other what it was.

**A name in the timeline links to the person only with `staff:read`.** The same
rule the order board's history follows: a shift holds `menu:read` and can see
that Ani changed the price without being able to open the directory Ani is in,
and a link to a tab their sidebar does not show is a dead end. An impersonated
change names both people, and an account since deleted says so rather than
leaving a blank line.

### 2026-08-02 — What a person did, and a dish that can finally be retired

The People screen could say who works here and what each of them can reach. It
could not say what any of them had done — and neither could the database, for
almost everything worth asking about. `audit_log` had existed since the first
migration with exactly one writer (`staff.impersonate`), so "who dropped the
price on this dish", the question a restaurant actually asks, had no answer
anywhere. It has one now, and the People screen grew a right-hand column to read
it in. Updated: docs/DATABASE.md, docs/ROLES_AND_PERMISSIONS.md,
docs/API_DOCUMENTATION.md, docs/BUSINESS_LOGIC.md, docs/COMPONENTS.md.

**`audit_log` gained the writers it was always missing.** Menu create, edit,
sold-out flip and delete; branch create, edit and open/close; invitations sent,
withdrawn and roles revoked; reservation status. Each one writes **inside the
transaction that made the change** — a log written afterwards has gaps in it
exactly when something failed halfway, which is when it is read. The vocabulary
moved to `packages/shared/src/activity.ts` so the API writing a value and the
panel rendering a sentence for it in three languages cannot drift into
disagreeing; `entity` is derived from `action` through a map rather than passed,
so a menu action cannot be filed under a staff entity.

**A sold-out flip is its own action, not an edit with one field.** A shift holds
`menu:availability` and not `menu:write`. Folding the two together would have
made every shift look like an editor of prices in their own activity feed.

**Entries carry only what moved.** Diffed against the loaded row rather than
taken from the request body — a form that submits every field re-sends the price
nobody touched, and "changed the price from 2400 to 2400" is the noise that
makes a real change hard to find. A PATCH that changed nothing writes no entry
at all, because a request that moved nothing is not something somebody did.

**Scope columns, because a person can work in two restaurants.**
`audit_log` gained `restaurant_id` and `branch_id`, both written wherever both
are known, so the feed can be filtered to the reader's reach without a join per
`entity` value. This is the same rule the directory already runs on — seeing
that somebody works for you does not mean seeing what they did for somebody
else. Both null is platform scope, readable only by an unscoped reach, which
gives the impersonation rows already in the table the right visibility by doing
nothing. Real foreign keys, unlike `entity_id`: they decide who may *read* the
row, and an access-control column holding an id matching nothing hides or
reveals history by accident.

**And `acting_staff_id`, for the same reason `order_events` has one.** An
impersonated price change would otherwise have been filed against the innocent
party. Such an entry now appears in both feeds — the account acted as, because
its account made the change, and the super admin's, because they did.

**`GET /staff/{id}/activity` — `staff:activity`, a new permission.** Knowing who
works here and knowing everything somebody did are different powers; granting
them together today is a decision this split leaves reversible. It merges
`audit_log` with `order_events` at read time rather than writing status changes
to both, so one fact has one record — `order_events` stays the truth for orders,
whose actor is usually a customer or the payment provider. The response is a
union on `kind`, not a flattened shape full of nulls. Scoped twice: to a person
the caller can already see, then to the entries inside their own reach. `page`
is capped at 25, the only list here that caps it, because merging two ordered
streams by offset costs the whole prefix of both.

**A dish now leaves the menu without leaving the database.** `menu_items` gained
`deleted_at`. Deleting a dish that had ever been ordered used to be refused with
a 409 telling the restaurant to mark it unavailable instead — `order_items`
references the row, and an order that can no longer say what was bought is not
an order. Keeping the row removes that objection entirely, so **the refusal is
gone and any dish can be retired**, which was previously impossible for exactly
the dishes that sold. Still a different state from `is_available`: that one is
"sold out tonight" and a shift reverses it in a tap; this needs `menu:write` and
nothing in the panel undoes it.

**Six read paths learned to filter it**, through one exported `LIVE_MENU_ITEM`
in `common/menu-visibility.ts` rather than `deleted_at IS NULL` written out six
times — a new read path is a grep away from the list that needs it. Two are not
cosmetic: the public menu would have shown customers a withdrawn dish, and the
lookup order placement prices against would have let them buy one. A soft delete
that still lets a customer order the dish is not a delete.

**The feed will be empty for anything before this.** The actions were never
recorded, so there is nothing to backfill from. Order status changes are the
exception and go back to the `order_events` backfill.

**The panel is a dialog, not a column.** It was built as a sticky right-hand
column with the directory beside it; on seeing it, a modal off each row read
better — the same shape the order board's History already uses, and for the same
reason. A feed is something you open about somebody, read, and close, rather than
a second thing to keep on screen while working down a list. People went back to
full width, and the `.people-split` grid and its selected-card marker went with
it. One consequence worth having: the dialog fetches nothing until it is opened
and drops the feed when it closes, where the column had to guard against a
selection changing mid-request.

**The dev seed fills it in.** `seed-activity.ts` writes every action type across
the seeded platform, including one impersonated edit per restaurant, because
nothing else in dev produces the line that names both people. It **makes the
entries true** rather than merely writing them — the dish each deletion names is
really soft-deleted, the branch each closure names is really closed — since a
seeded audit trail describing changes the database does not reflect is worse than
an empty one. Its rows are keyed by what they describe, so a re-run replaces
exactly its own and cannot touch an entry the running app wrote. Updated:
apps/api/README.md, docs/DEVELOPMENT_GUIDE.md.

**Every entry now goes somewhere.** The second line of an entry reads
`subject · place` — the dish or the order code, then the branch it happened in —
and both halves are links. This is what the feed was missing to be useful: an
entry says a price moved, and the next question is always "to what", "which
order", "which branch". Each half leads to the same kind of screen on every row,
which the first version did not manage: the place carried the dish link on menu
entries, so "Dolmama · Northern Ave" opened a branch on one row and a dish on the
next. The subject repeats a name the sentence above already used, and that is the
price of it being a thing you can point at — the alternative is markup inside a
translated sentence, in a dictionary translators edit. Updated:
apps/admin/README.md, docs/USER_FLOW.md, docs/COMPONENTS.md.

**The board grew a single-order address to make one of them possible.**
`/orders?restaurant=…&branch=…&order=:code`. Until now the board was addressable
by branch only, which is exactly why the first version left order codes as plain
text: a link that lands near the answer is worse than one that is not offered.
The code is not the search box becoming an address — a typed term is a way of
looking, while a code names one order and is therefore an answer, the same
argument that put `?person=` on the two lists of people. It reaches the API as
the search term, because searching by code is what the board already does, and
the **stage stays out of the URL** because the board can work it out: the counts
on the tabs are taken under the search and not under the stage, so a board sent
to a finished order moves itself to *Past* instead of landing on an empty
*Active*. Typing a code by hand still leaves you where you are with the counts
pointing — a search tells you where to look; only a link was sent somewhere.

**The dish that was taken off the menu is the one entry that stays text.** It is
soft-deleted and filtered out of every menu read, so that link would open the
right menu with nothing marked on it. A link that lands on a missing row reads as
broken rather than as an answer.

**Each link is gated on the screen it leads to** — `menu:read`, `orders:read`,
`branch:read` — and all three arrive with `staff:activity` today. They are three
booleans anyway, matching how the order board's timeline is told what it may
offer, because that permission was written to be splittable and a link to a tab
the sidebar does not show is a dead end.

**Left undone on purpose:** a date filter on the feed (the page cap is the
stopgap), and restoring a soft-deleted dish — the row supports an undelete, but
it is kept for history and order integrity rather than as a recycle bin.
Assignments and invitations stay hard deletes: a revoked role has to be *gone*
from the permission path rather than filtered out of it, since the one query
that forgot the filter would leave somebody holding a role that was taken away.
`before` is what keeps those readable afterwards.

### 2026-08-02 — A line of an order says what it cost, and opens its dish

A card on the board listed `2× Խորոված` and stopped there, which left the two
questions a ticket actually raises unanswered. "Why is this order 14,200" meant
adding the menu up by hand, and "what is in this, is it still on, how long does
it take" meant the Menu tab, its two pickers set again from memory, and a search
for a name the dish may have been renamed out of since. Each line now carries
its own price on the right, and the dish is a link to its row on that branch's
menu. Updated: docs/API_DOCUMENTATION.md, docs/USER_FLOW.md,
docs/DESIGN_SYSTEM.md, apps/admin/README.md.

**The queue's lines gained an id and a price.** `GET /restaurant/orders`
returns `items[]` as `{ menuItemId, name, qty, lineTotalAmd }` — both halves
needed, because an id cannot say what was ordered and a name cannot say what to
open. `name` stays the snapshot taken when the order was placed, so the ticket
goes on saying what the diner bought however the dish has been renamed since,
while the link travels by id and cannot be broken by that rename. The price is
the line rather than the unit, so nobody is being asked to multiply.

**`/menu?branch=:branchId&dish=:menuItemId`.** The third link between tabs, and
the third filter to become an address: which branch's menu is on screen cannot
be React state once a line of an order links to one. `Route` gained a `menu`
beside its `scope`, `open` and `person`, and the Menu screen's pickers write the
address back with `replace` exactly as the board's do — dropping the `&dish=` on
the way, since a mark on a row of another branch's menu is a mark on a row that
is not there. Unlike the board there is no "all branches" state: a menu belongs
to a branch, so a bare `/menu` means the first one in reach. The dish's row is
marked and scrolled to on arrival (`.row--found`, the **arrived at** state
written for a table row), and a filter set before the link was followed widens
back out rather than swallowing it.

**A branch outside this account's reach is said, not substituted.** A link from
somebody who can see more branches than the account opening it gets an empty
state naming the problem. Showing a different branch's menu under a URL that
asked for this one would be worse than showing none — a menu is a list of prices
somebody acts on. The link itself is offered only with `menu:read`; a shift
watching the board without it reads plain text, the way the History dialog's
names do without `staff:read`.

### 2026-08-02 — Order cards in a row of the board are the same height

An order carries anywhere from one dish to a dozen, and `.board` left each card
at its own content height (`align-items: start`), so a row ended in ragged
bottoms and the short card beside a tall one read as the smaller job. The grid
now stretches every card in a row to the tallest of them, and `.order__actions`
takes the slack with `margin-top: auto` — the buttons sit on the card's bottom
edge instead of leaving a gap under them, and they line up across the row, which
is what a hand moving along the board is reaching for. CSS only, no markup
change. Updated: apps/admin/README.md.

### 2026-08-02 — A name in an order's history is a link to the person

"Who confirmed this order" is rarely the last question. The next one is who they
are, where else they work, or what else this diner has ordered — and the History
dialog answered the first and then left a name to memorise and retype into
another screen's search box. Staff names now open `/people?person=:staffId` and
diners `/customers?person=:userId`, each list narrowed to that one person.
Updated: apps/admin/README.md, docs/API_DOCUMENTATION.md.

**By id, not by search.** Both endpoints took `q`, a `contains` over names and
emails, which answers with everyone who shares a name — and for a diner there
was no unambiguous term to give at all, since the panel is shown a masked phone
and no email. `GET /staff` and `GET /admin/users` each gained an optional `id`,
and the history payload gained `actor.id` and `actor.impersonatedById`, read
from the column the entry's own `actorType` names rather than from whichever is
set: a row with both would otherwise resolve to a real person who had nothing to
do with the order.

**An id is a destination, not a disclosure.** On the staff directory it sits
*alongside* the reach filter, never instead of it — holding somebody's id is not
permission to see them, so an id from outside reach lists nobody, exactly as
that person's name does. In the panel the link is offered only where it leads
somewhere: not for the system, not for an account since deleted (the FK is
`ON DELETE SET NULL`, so the id goes with the name), and not to an account
without `staff:read` or `platform:users` — a shift holds `orders:read` and
neither, so for them the dialog reads exactly as it did.

**Only the name is the link.** The words around it — "· customer", ", acting as
this account" — are about the entry rather than the person, so `actorSentence`
cuts the translated string at its `{name}` and renders the three pieces around a
`<Link>`. The alternative is markup inside a dictionary that translators edit.

`Route` grew a `person` beside its `scope` and `open`, carried by
`routePath`/`parseRoute` for those two tabs only and covered in both directions.
Both destinations show a chip and a Clear that leaves the address rather than
just the state, and each explains an empty answer in its own terms: on People
"that person does not work anywhere you can see", because the directory is
scoped and the link knew who it meant; on Customers, which sees every diner, an
account that no longer exists.

### 2026-08-01 — Every branch links to its own order queue

The Restaurants screen is where somebody works out **which** branch they mean —
the chain, the address, how many dishes it has, whether it is even open — and
that answer was good for nothing but reading. Getting to that branch's orders
meant going to the Orders tab and setting the same two pickers again from
memory, on a panel where three restaurants have a "Northern Ave". Every branch
row, on the list and on a restaurant's own page, now carries an **Orders**
button that opens the board already pointed at it. Updated:
apps/admin/README.md, docs/USER_FLOW.md.

**The board's scope became an address**: `/orders?restaurant=:id&branch=:id`,
which is what the button links to and what the board reads its two pickers back
out of. Filters are otherwise React state in this panel — they narrow an answer
rather than being one, and a reload may forget them — but these two answer
"whose queue", which is the question a link exists to answer. The pickers write
the same address back with `replace`, so the URL always names the queue on
screen and can be sent on, while narrowing a queue does not become a place in
the browser's history. The stage tabs and the search box stay in state.

An anchor, not a click handler, like the rest of the panel's navigation: hover
shows where it goes, and ⌘/Ctrl-click opens the queue in a second tab beside the
restaurant. Shown only to an account holding `orders:read` — every role that
reaches a branch holds it today, and a button to a tab the sidebar does not show
would be a dead end the moment that stops being true.

`Route` grew a `scope` beside its `open`, `routePath`/`parseRoute` carry it, and
`navigation.spec.ts` covers it in both directions, including the one place the
round trip normalises rather than preserves: a scope with neither half set is
written as the plain `/orders` and reads back as no scope, because "all
restaurants, all branches" is not a narrowing.

### 2026-08-01 — The dev seed sells food: orders per branch, and history for the ones that were already there

The platform seeded a market with nothing bought in it — 22 restaurants, 76
branches, ~250 staff, and an order board that was empty on every fresh database.
Nothing about the kitchen queue, the status flow, the payment states or the new
History dialog could be looked at without typing orders in through the API one
at a time, which is how "it works on my database" happens. Updated:
apps/api/README.md, apps/admin/README.md, docs/DATABASE.md,
docs/API_DOCUMENTATION.md, docs/DEVELOPMENT_GUIDE.md.

New: `apps/api/prisma/seed-orders.ts` — **four to seven orders per branch**
(~420 in all), placed by a dozen demo diners, each written with the
`order_events` it would have collected on the way. Every branch gets at least one
order waiting and one in the kitchen, so no stage tab is empty; the rest are
mostly completed with some cancelled.

**The history is the same shape the API writes, not a decoration.** Placed by the
customer, paid by the customer, moved through the kitchen by somebody who
actually works at that branch, with the payment method and outcome on the
entries that touched money. About one order in seven had a card refused before
one worked, and some sit unpaid after a refusal nobody retried — the case
`order_events.type = 'payment'` exists for. A few carry an impersonated session
so the "acting as" line has something to render.

**Deterministic, not random.** Every choice comes from a hash of a stable
branch key, so the same seed produces the same orders on every database —
"random-looking" and "different every run" are not the same thing, and the second
one makes a bug found this morning unreproducible this afternoon. Idempotent by
order code: a re-run adds nothing.

**Orders that already existed got history too.** The migration could only
backfill a `created` entry, so an order sitting in `completed` still had a
timeline that stopped at "placed". The seed adds one entry taken from
`orders.status` and `orders.updated_at`, attributed to `system` and flagged
`detail.reconstructed` — and the dialog prints a note under it saying it was
inferred rather than recorded. The status and the time are the database's; the
actor is genuinely unknown, and naming a plausible one would put a fiction in an
audit trail. Everything the API itself has moved is skipped, because its history
already accounts for where it is.

Two invariants of the real code are honoured rather than approximated, and the
tests check both: a deposit is reported on a dine-in order and never added to its
total, and a booking's `active_slot` mirrors `reserved_for` while it holds the
table and is NULL once it does not.

### 2026-08-01 — Every order keeps a history, and the card opens it

`orders.status` was the only record of where an order had been, and a column
overwrites its own past on every update. "When did this come in, who confirmed
it, was the card declined before it went through" had no answer anywhere in the
system — which is a problem the first time a customer disputes one at the
counter. Updated: docs/DATABASE.md, docs/API_DOCUMENTATION.md,
docs/BUSINESS_LOGIC.md, docs/ROLES_AND_PERMISSIONS.md, apps/admin/README.md.

New: `order_events` (migration `20260801090000_order_events`),
`GET /restaurant/orders/{id}/history` (`orders:read`), and a **History** button
on every card of the order board opening a timeline of the order.

**Written in the same transaction as the thing it records.** The `created` entry
is nested inside the order's own INSERT, so an order cannot exist without a
record of having been placed. A status change is written inside the transaction
that performs it — the optimistic match on the current status aborts both
together, so no entry can claim a move that lost a race. Nothing logs after the
fact, because a service asked to log afterwards is one that eventually does not.

**Not `audit_log`.** That table's actor is a `staff_users` row, and most of what
happens to an order is done by the customer who placed it or by the payment
provider; every one of those rows would carry a NULL actor, which is exactly the
question the table was supposed to answer. `order_events` has three actor
columns — customer, staff, system — because those are three tables, not three
flavours of one.

**It names the person behind an impersonated session.** A staff token's `sub` is
the account being *acted as*, so an entry recording only that would put the
change against somebody who was not at the keyboard. `acting_staff_id` carries
the super admin, and the dialog shows both.

**A decline is an entry of its own.** It moves no status, so without a `payment`
type the timeline would show an order sitting in `created` for twenty minutes
with nothing to explain it — which is the gap somebody opens this dialog to
understand.

**Existing orders were backfilled with the one thing the database could still
prove:** that they were created, at `orders.created_at`, by the customer whose
order it is. Everything after that is genuinely unrecoverable, and inventing a
plausible status change would put a fiction in an audit trail. Those entries are
marked `backfilled` and the dialog says so under them.

**The button is `orders:read`, not `orders:advance`.** Reading how an order got
here is part of watching the queue, and the person at the counter is often not
the one allowed to move anything. The timeline is fetched when the dialog opens
and again on every open — an order moves while the panel is looking elsewhere,
and a cached one would be wrong exactly when it is being checked.

### 2026-08-01 — A super admin can sign in as any staff account

Support was answering "what do you see on your screen?" by asking. A
`super_admin` can now open any staff account and use the back office as that
person, writes included. Updated: docs/ROLES_AND_PERMISSIONS.md,
docs/API_DOCUMENTATION.md, docs/DATABASE.md, apps/admin/README.md.

New: `staff:impersonate` (`super_admin` only), `POST /staff/{id}/impersonate`,
and a button at the end of every row that names a person — on the People tab,
and on a restaurant's own page, both with its admins and inside each branch's
team. That second place is the one you are already on when checking what a
branch is reporting. No schema change.

**One rule, two shapes of row.** The directory lists people with their roles
hanging off them; a team lists roles with the person hanging off each. Both go
through `acting.tsx` — `mayActAs` for the decision, `ActAsButton` for the
control — so the four refusals the API makes are mirrored once rather than
copied per screen. The capability travels as one nullable object, because it
threads four levels to reach a branch's team rows.

**It grants nothing a super admin did not already hold.** That is the whole
argument for it being safe: they hold every permission over every scope, so
acting as a restaurant admin *narrows* their reach. The permission therefore
sits beside `platform:staff` rather than with the rest of `staff:*` — for any
narrower role it would be worth the union of what everyone in reach can do.

**The session cannot be extended, because it has no refresh token.**
`/auth/staff/refresh` re-reads the target's assignments and mints a fresh pair,
which would drop the impersonation marker on the way through — a bounded session
would silently become an unlimited one, indistinguishable from that person's
own. An access token alone closes itself after one TTL, and the panel drops back
to the super admin when it does. It does not chain either: a token already
acting as somebody may not begin another, since the marker holds one id.

**The token's `sub` stays the target.** Every guard, scope filter and query then
behaves exactly as it would for them, which is the point of impersonating rather
than granting yourself their rows. The real actor travels beside it in `act`.

**`audit_log` has its first writer.** Every impersonation is recorded before the
token is issued — actor, target, borrowed roles, IP. The session carries full
write access, so without that row the only record of who advanced an order would
name the person who did not do it. The menu, order and staff-management services
still write nothing.

**Getting back costs no round trip and no endpoint.** The super admin's own
tokens were never revoked: the panel stashes them, swaps the impersonation token
in, and puts them back. A strip across the top says whose panel this is, holds
the way out, and cannot be dismissed; `Shell` is keyed on who is being acted as,
so every screen remounts rather than showing a page of somebody else's rows.

**Customers are deliberately not impersonable.** Not a permission question: a
customer session is the other identity entirely and there is nowhere to put one
— `apps/web` has no sign-in and the back office has no customer screens. It
would also mean staff able to spend somebody's saved cards and reward points.
Wanting it means building customer auth in the web app first, and deciding
whether such a session may order and pay. The Customers tab is unchanged.

### 2026-08-01 — Every back-office screen has its own address

The panel held its current screen in `useState`, which meant one URL for all of
it: nothing could be bookmarked, linked to a colleague, opened in a second tab
or reached with the back button, and every reload landed on the order queue
whatever somebody had been reading. The URL is now the state. Updated:
docs/USER_FLOW.md, docs/DEVELOPMENT_GUIDE.md, docs/COMPONENTS.md,
apps/admin/README.md. Panel only — no API, schema or permission change.

```
/orders  /menu  /people  /dashboard  /customers  /platform
/restaurants
/restaurants/:restaurantId
/restaurants/:restaurantId/branches/:branchId[?role=:assignmentId]
/sign-in[?next=…]
```

**The address table is the permission table.** Each row of `TABS` in
`navigation.ts` now carries its `path` beside the permission that opens it, so
"which URL" and "who may see it" cannot drift apart. `parseRoute` and
`routePath` are pure inverses of one another and `navigation.spec.ts` tests them
as a round trip — a link the panel writes has to be a link the panel can read.

**Thirty lines of History API rather than a routing library.** `router.tsx` is
`useSyncExternalStore` over `popstate` plus an event for the panel's own
`pushState`. Nested layouts, loaders, code splitting and revalidation are the
reasons to take that dependency, and this app has one layout, fetches in the
screens and ships a single bundle. Nothing outside `router.tsx` touches
`history` and nothing inside it knows what a URL means, so swapping in a real
router later is two files and no change to any screen.

**An address nobody planned for lands somewhere real.** `/`, a typo, a
half-written restaurant path, or a screen this account lacks the permission for
all fall back to the first screen it does have — with `replace`, so back goes
where the person came from, and only once `GET /auth/staff/me` has answered,
because redirecting on an unknown permission set would erase a deep link before
the panel had read it. Signed out, a panel address becomes `/sign-in?next=…` and
resumes afterwards; `next` is followed only when it is a path of the panel's
own. The `/accept-invite` and `/reset-password` links are left alone, since
bouncing a one-use token to the sign-in form spends it on a screen with nowhere
to type a new password.

**Navigation is anchors now.** The sidebar, a restaurant on the list, the way
back to it and the role rows on the People screen are real `<a href>`: the
address shows on hover, "copy link" is in the context menu, and ⌘/Ctrl/middle
click opens a second tab. The router claims only a plain left click. (This is
what turned `.link-title`'s undefined `--ink1` into a visible bug — an invalid
`color` inherits on a button and goes browser-blue on a link — so it is now
`--ink`, the token that was meant.)

**What is deliberately not in the URL.** The Restaurants search, its two pickers
and its page number stay in React state: they narrow an answer rather than being
one, and the component is never unmounted to render a restaurant, so coming back
still lands where somebody left with no refetch. Which branches are disclosed is
reading state too — the branch in the URL is the one a link *opens*, and a
chevron clicked afterwards does not rewrite it.

**Hosting it now has a requirement.** Every path must serve `index.html`
(`try_files $uri /index.html;`), or a reload on `/restaurants` is a 404 from the
static host — the one failure `vite dev` and `vite preview` cannot show you,
because both do it already.

### 2026-08-01 — An opened branch is tinted for as long as it is open

A branch on the panel's Restaurants list now carries `.branch--open` while its
team is disclosed, drawn as a `--chip` band down the branch and the rows it
opened. Updated: docs/DESIGN_SYSTEM.md. Panel only — one class and one CSS rule,
no component, API or permission change.

**The band is what says the rows belong to the branch.** The team is indented
under it, which is enough for one open branch and stops carrying in a chain of
ten: the indent of the eighth branch's team looks like the indent of the ninth
branch. A ground the branch and its rows share does not depend on being able to
see both edges at once.

**Neutral rather than accent, because accent is already spoken for here.** A jump
from People marks the role it was following in `--accent` *inside* an opened
branch, and tinting the container in accent too would leave the two arguing over
which one is the answer.

**Nothing moves when it opens.** The tint bleeds outwards by a margin its padding
gives straight back — the `.role--found` trick — so no text shifts sideways, and
the padding is horizontal only: vertical padding would push every branch below it
down at the moment of the click, on top of the team already unfolding.

### 2026-08-01 — The back-office page header is the accent bar

`.page-header` is now solid `--accent` with white text, on every screen of the
panel. Updated: docs/DESIGN_SYSTEM.md, apps/admin/README.md. Panel only — CSS,
no component or API change.

**Being accent costs it accent as a signal.** An accent button on an accent
ground is an outline of itself, so the controls on the bar invert instead of
restyling: `.btn--primary` is white with accent text, `.btn--secondary` and
`.btn--ghost` are white outlines, and a `.badge` swaps only its ground to white
so every tone keeps its own colour — the order board's "live" dot has to stay
green, and green on orange is not readable across a kitchen. Size, weight and
behaviour are untouched, so a button does not become a different control by
sitting in a header.

**The glass blur is gone and the hairline is a shadow.** A blur behind an opaque
bar does nothing, and `--line` at 9% ink cannot draw an edge on a saturated
ground; a `--shadow` lift reads against whatever the page scrolls past.

**Contrast is a known cost, recorded rather than assumed.** White measures
**3.5:1** on the light accent and **2.86:1** on the dark one. The 22px/700 title
clears AA-large (3:1) in light only; the 13px description clears neither, and
nor does the inverted primary button's label. The description is held at 88%
opacity rather than the usual `--ink2` step-back to give back what it can.
Near-black on the same bar would measure 5.11:1 and 6.24:1. Both numbers are in
DESIGN_SYSTEM §10 so the choice stays a choice.

### 2026-08-01 — The jump from People lands on the person, not just the branch

Following a role from the People screen now marks the row it was following, in
the team it lands in. Updated: docs/USER_FLOW.md, docs/DESIGN_SYSTEM.md,
apps/admin/README.md. Panel only — no API change.

**The arrival stopped one step short.** Opening the right branch is not the same
as answering the question: a team can be a dozen rows, and somebody who followed
a link to find one person was still reading down a list to find them — the
hunting the link exists to remove, moved down a level. The row now arrives
tinted, and is nudged into view once its team lands.

**Marked by assignment, not by person.** `RestaurantTarget` carries the role's
own id. A team is rows of assignments, so somebody managing two branches is in
two of them, and the person's id would mark both when only one was clicked. A
role held over the whole restaurant is marked among the admins in its About card
instead — the section that role is read in.

**The tint stays; only the flash is motion.** `.role--found` is a 3px `--accent`
inset edge and a 12% band, flashed in from 34% over 2s. It settles rather than
fading out, because a flash that has finished playing cannot tell somebody who
looked away which row they were sent to — and under `prefers-reduced-motion`,
where the panel collapses every animation to 0.01ms, a fade-out would leave
nothing at all. Layout-neutral by construction: an inset shadow rather than a
border, and a margin the padding gives straight back, so the marked row's text
does not shift a pixel against the rows beside it.

The second scroll uses `block: 'nearest'`, so a row already on screen does not
move — a nudge for the rows that need one, not a second jump. It runs when the
team arrives rather than on a timer, and once: reloading the restaurant after a
switch is flipped must not pull the page back.

### 2026-08-01 — A role on the People screen says where it is, and goes there

Every assignment on a person's card now names the **restaurant** it reaches, and
clicking it opens that restaurant on the Restaurants tab — with the branch
disclosed and scrolled to, when the role is held over one. Updated:
docs/API_DOCUMENTATION.md, docs/USER_FLOW.md, apps/admin/README.md.

**`GET /staff` was naming the wrong thing, or nothing.** An assignment names a
restaurant or a branch and never both, and the response copied the
`restaurant_id` column straight out — so every `restaurant_manager` and
`branch_staff` row came back over no restaurant, and the panel rendered it as
"the whole platform · Tigran Mets". Two different restaurants in the seed have a
branch called Tigran Mets. `restaurantId`/`restaurantName` are now the
restaurant the role *reaches* — the one it names, or the one its branch belongs
to — so null means a platform role and nothing else. `branchId` still says which
of the two columns the assignment actually names, and `branchName` now falls
back to the branch's city, as everywhere else a branch is named.

**The panel has no router, so a link between screens is state.** A
`RestaurantTarget` — a restaurant, and a branch when there is one — is handed to
the shell, which switches tabs; the arriving screen reads it once as its opening
state, which is exact, because leaving a tab unmounts it. Choosing a tab from
the sidebar clears it, so going to Restaurants directly is never a replay of the
last jump.

**Opening the branch is not enough — the page scrolls to it.** The seventh of
ten branches is below the fold on arrival, and a page that opened the right
branch off screen leaves the hunting where it was. Once per arrival, not once
per render: reloading the restaurant after a switch is flipped must not yank the
page back. `.branch` carries a `scroll-margin-top` clearing the sticky page
header, without which a branch high enough in the chain to reach `start` exactly
landed underneath it.

A platform role is over no restaurant and stays plain text, as does every row
for an account that cannot open the Restaurants tab — the destination has to
exist before it is offered.

### 2026-08-01 — A restaurant's people move to where they are read

The "Who works here" section at the bottom of a restaurant's page is gone. Its
contents now sit where each half is actually read: the **admins under "About
this restaurant"**, with the facts about the place they run, and everybody else
**under the branch they work at**, disclosed by clicking the branch's name.
Updated: docs/API_DOCUMENTATION.md, apps/admin/README.md.

One flat list had to print a branch name on every row to be intelligible — a
column repeating what the reader had already clicked — and it put a branch's
team a page-length away from that branch's own open/closed switch.

**`GET /restaurant/restaurants/{id}/people` now returns the restaurant's own
roles only**, and `GET /restaurant/branches/{id}/people` is new. An assignment
names a restaurant or a branch and never both, so the split is the data's own,
and each collection hangs off the resource its rows are attached to — the reach
filter guards the branch one exactly as it guards everything else, with no
second check that the branch belongs to the restaurant somebody named. A branch
out of reach returns an empty list, not a 403: it is a collection, and an empty
one says nothing about whether the branch exists.

**A branch's team is fetched when it is opened and then kept.** A chain of forty
branches was thirty-nine teams nobody looked at, and paging them together at
fifty rows put a boundary where none could honestly fall — a branch's staff
could land on page two, away from the branch. One request is now one scope's
whole team, so the role groups inside it are complete by construction and the
pager is gone; past fifty the panel says how many it is not showing.

The branch **name** is the disclosure, not the row — the row holds the shift's
open/closed switch, and a row that is itself one click target makes that switch
a trap. `aria-expanded` + `aria-controls` on a real button, and several branches
stay open at once because comparing two of them is the reason to open either.

Unchanged and verified: an account without `staff:read` — a manager, a shift —
gets the same page with no disclosure and no admins block, sends **no** people
requests, and sees no 403.

### 2026-08-01 — The seed staffs the platform instead of creating two logins

Every restaurant now gets its own `restaurant_admin`, every branch a
`restaurant_manager` and two `branch_staff` — around 250 accounts across the
seeded branches, plus three unaccepted invitations. It staffs whatever is in the
database, so a restaurant added by hand through the panel gets a team on the
next run. Updated: apps/api/README.md, apps/admin/README.md.

The old seed made two accounts, and everything built on top of them was true but
unobservable: the People tab held two rows, a restaurant's own page could only
ever render one group, and **nothing at all exercised a role scoped to a
branch** — which is most of what the permission model exists for. A shift
account could not be signed in as, so the panel most of its users see had never
been looked at.

**The shape is deliberately imperfect**, because a directory where everyone is
identical proves nothing:

- **Every third branch of a chain is covered by the manager next door** — one
  person, two rows. That is how a chain staffs, and it is the case a page
  listing "who works here" has to render honestly.
- Roughly one in seven has **never signed in**, one in twenty-nine is
  **deactivated**, so both states have something to render.
- Three invitations are left **unaccepted** — the People tab has a section for
  those, and a section never populated in dev is one nobody notices is broken.

**Idempotent like the rest of the seed.** Addresses derive from the restaurant
and branch rather than a counter, so re-running finds the same accounts; names
and sign-in dates come from a hash of the address, so it does not rename the
staff each run. Accounts are created with `skipDuplicates`, leaving one whose
password somebody has changed exactly as it is. One scrypt hash is derived and
shared by every demo account — two hundred of them would add minutes to a seed,
and the password is printed on every run anyway.

### 2026-08-01 — A restaurant opens into its own page, with the people on it

Clicking a restaurant's name on the Restaurants tab opens it: what the platform
knows about it, its branches, and **who holds a role over it** — admins,
managers and shifts, grouped and counted. Until now a restaurant was a row that
could not be opened, and "who works at Karas" was answerable only by reading
the whole staff directory. Two new endpoints,
`GET /restaurant/restaurants/{id}` and `/{id}/people`. Updated:
API_DOCUMENTATION.md, apps/admin/README.md.

**Two endpoints because it needs two permissions.** `branch:read` opens the
restaurant; `staff:read` says who works there. A `branch_staff` account holds
the first and not the second, so it sees the restaurant and not its colleagues.
One response with a section that is sometimes absent would have to mix two
permissions in a single guard — and on the client, a 403 rendered mid-page is a
screen that looks broken rather than one that answered what it was opened for.

**Reach and restaurant are separate `AND` terms** in the people query. The
restaurant narrows what the caller may already see and must never be able to
stand in for the reach filter, or naming any id in the URL would list its staff
to anybody holding `staff:read` anywhere. A test asserts both terms are there.

**A row per assignment, not per person.** Somebody who manages two branches
appears twice — that is the honest answer to "who works here and as what", and
a single row would have to pick a branch to name. Ordered by role, which sorts
by the Postgres enum's *declaration* order and so comes out as seniority; a
test pins that, because reordering the enum would quietly reorder the page.

**Removing a role is deliberately not offered here.** It stays on the People
tab, which shows all of a person's roles at once. Taking one away from a page
that shows only this restaurant's is how a role gets removed in the belief it
was the last — the same reasoning that keeps the People tab's role filter from
hiding the roles that did not match.

**The name is the click target, not the card.** A card carrying a switch per
branch and an "add a branch" button cannot also be one click target without
turning each of those into a trap. It is a `<button>`, so it is reachable by
keyboard and announced as something that opens.

**Going back does not reload the list.** The detail renders instead of the
list, one level below the filters, the page number and the fetched rows — so
somebody who opened a restaurant from page 2 of a search lands back on page 2
of that search, with no request made. This is also why there is still no
router: a URL would have to carry all three to match it.

### 2026-08-01 — The people list gets a search, a role filter and pagers

`GET /staff` and `GET /staff/invites` returned everything in the caller's reach
in one response, with no filters and no paging — the last two list endpoints
not following DEVELOPMENT_GUIDE.md's "list endpoints paginate and cap `limit`".
The invitations were exempted on the reasoning that there are never many, which
is true today and is not a ceiling. Updated: API_DOCUMENTATION.md,
apps/admin/README.md.

**One box over the whole card.** `q` matches a name, an email, *or* the
restaurant or branch someone is assigned to, because those are the three things
a card shows and whoever is typing knows which of them they remember. A role
picker sits beside it for narrowing without typing.

**The search cannot escape the caller's reach**, and that is the part that had
to be got right rather than assumed. The term is `AND`ed onto the query instead
of assigned over it, and its "where they work" arm carries the reach filter
inside it — the order board had this exact shape and one assignment there
turned a search into a way to read every restaurant's orders. On the invitations
query it is not theoretical: the reach filter *does* spread its own `OR` into
that object, so `where.OR = …` would have handed back every open invitation on
the platform. Three tests hold it.

**`role` narrows which people appear, not which of their roles are shown.** The
role and the reach are required of the same assignment — otherwise "managers"
would list somebody who manages out of reach and washes dishes here, on the
strength of two different rows — but a listed person still comes back with all
of theirs. Deliberately the opposite of the restaurants list, which does hide
the branches that did not match: a branch there is a row you navigate to, an
assignment here is a permission somebody is about to revoke, and a card showing
one of three is how a role gets removed in the belief it was the last.

**Two lists, two pagers.** The invitations page 10 at a time and the directory
20; they filter together and are walked separately. The invitations pager
renders nothing below ten, which is nearly always — it exists so the eleventh
is reachable rather than dropped off the end of the section.

### 2026-08-01 — A one-branch restaurant selects that branch on the order board

Choosing a restaurant on the order board left the branch filter on "All
branches". For a restaurant with one branch that is a control asking a question
whose answer was already decided — one option, one outcome, and a click to
confirm what could not have gone another way. Picking it now selects it.
Updated: apps/admin/README.md.

The rule is `soleBranchOf` in `scope.ts`, and it is deliberately not
`firstBranchOf`, which the menu uses: that one lands on *a* branch because a
menu has to belong to one, and the first of five is as good a guess as any.
This one selects only when there is no guess to make — a restaurant with
several branches still opens on all of them.

**It refuses to act on an empty restaurant id.** `branchesOf` reads that as "do
not narrow", so without the guard an account whose whole reach is one branch
would have that branch *selected* by choosing **All restaurants** — the one
control that clears the scope would be the one that sets it. Covered by a test
named after the mistake.

The filter still shows, now holding the branch it chose rather than "All
branches", so the board says on screen where it is pointed and offers the way
back out.

### 2026-08-01 — The restaurants list gets filters and a pager

`GET /restaurant/restaurants` returned everything the account could reach, in
one response, with no filters — survivable at two restaurants and not at
twenty-five, where the panel rendered a seven-thousand-pixel page. It was also
the last list endpoint not paging, which DEVELOPMENT_GUIDE.md has required all
along. Updated: API_DOCUMENTATION.md, apps/admin/README.md.

**Search covers both levels in one box** — restaurant name or slug, branch name,
address or city — because whoever is typing knows which of the two they have and
should not have to pick a field first. Plus the restaurant and branch pickers
the order board already uses, and a pager at ten restaurants a page (a card
carries every branch under it, so ten rows of a ten-branch chain is already a
hundred lines).

**Which branches show under a card depends on what matched.** A named branch
shows alone — that is what naming it means. A search shows the branches that
matched it, *unless* the restaurant itself is what matched, in which case the
search was for the chain and hiding nine of its ten branches would be a strange
way to answer.

**`branchCount` was added because the first version of this lied.** With the
branches filtered, the card counted what was left and reported "1 branch" under
a five-branch chain — found by looking at the screen, not by a test. The count
is now the restaurant's real total in the caller's reach, and the card says
"1 of 5 branches" when a filter hid the rest. The zero-branch cases — the
primary "Add a branch" button, the "no branches yet" note — read the true count
too, or a filtered card would claim to have none.

### 2026-08-01 — The order board keeps its branch filter for a one-branch restaurant

The branch filter was shown only when it held more than one branch. Choosing a
restaurant that has a single branch therefore made it **disappear** — the
control vanished at the moment somebody narrowed to a restaurant, which reads
as the filter bar breaking, and left the one branch they were now looking at
unnamed anywhere on screen. Updated: apps/admin/README.md.

It is now shown when there is more than one branch **or** when a restaurant has
been chosen, holding "All branches" and that one. Still hidden is the case it
was there for: an account whose whole reach is a single branch with no
restaurant chosen — most kitchens, and a select with one option is furniture.
The rule is `showsBranchFilter` in `scope.ts`, unit-tested rather than left as
a condition inside JSX.

**The restaurant name under each branch is gone once a restaurant is chosen.**
It exists to tell apart two branches called "Northern Ave" belonging to
different restaurants, which is only a question while the list spans them;
after that it repeats the control directly above it. The menu screen already
dropped it for the same reason.

### 2026-08-01 — Twenty demo restaurants, most of them chains

The seed held two restaurants with one branch each. Everything built on top of
it since — the menu's restaurant-then-branch pickers, the order board's branch
filter, pagination — is invisible against that data: with one restaurant and
one branch there is nothing to pick between and nothing to page. Updated:
apps/api/README.md.

**Twenty added, deliberately uneven: 2 chains of 10 branches, 4 of 5, 6 of 3
and 8 of 2 — 74 branches.** The spread is the point. A dataset where every
restaurant has one branch proves none of the scoping works; one where they all
have ten is just as unrepresentative of a market that is mostly single-site
restaurants. Ten of the 74 are seeded closed, so the "Closed" badge and the
"open and selling nothing" tooltip have something to render against.

**Derived from the index, never randomised.** A seed that produces different
data on each run makes a bug found this morning unreproducible this afternoon —
branch locations, prep times and which branches are shut all follow from the
chain's position in the list.

**Menus are shared by kind, not written per restaurant.** A pizza place sells
pizza whichever pizza place it is, and twenty hand-written menus would be
twenty chances to typo a price. Eight menus of five dishes each, in all three
languages; every branch gets its own copy, because a menu item hangs off a
branch — which is what lets one branch of a chain sell out a dish while the
rest carry on.

`SeedRestaurant.branch` became `branches`, so the two hand-written restaurants
and the twenty chains go through one code path rather than two that drift.
Re-running is still safe — verified by running it twice and getting identical
counts.

### 2026-08-01 — The menu picks a restaurant, then one of its branches

The menu screen offered every branch the account could reach in one flat list,
with the restaurant as grey small print under each name. That reads fine at two
branches and becomes a list you search at a dozen — and two branches called
"Northern Ave" belonging to different restaurants were distinguishable only by
that small print. It now picks the restaurant first and offers only its
branches, matching the order board. Updated: apps/admin/README.md.

**The restaurant picker appears only when there is more than one.** One
restaurant is the common case and a select holding a single option is
furniture. The branch picker always appears on the menu even holding one
option, because which branch this is the menu *of* is the context for every
price and availability switch below it.

**Choosing a restaurant lands on one of its branches.** Unlike the order board,
"all branches" is not a state this screen has — a menu belongs to a branch — so
clearing the selection would leave a blank page waiting for a second click.

**The picking logic moved to `scope.ts`,** shared by both screens rather than
written twice, and unit-tested. It had to come out of the components to be
testable at all: a Radix `Select` keeps its options in a detached node that
needs a document, so none of them appear in server-rendered markup and the
render suite cannot see what a picker holds. A test asserting otherwise was
written and failed, which is how this was found.

### 2026-08-01 — `turbo run dev` rebuilds workspace packages first

Filtering the order board by any stage but Active returned **"Validation
failed"**, with `status must be one of the following values: active, past` — the
old two-value `QueueFilter`, from before the stages existed. The source was
right; the running API was not. Updated: apps/api/README.md.

`dev` was the only task in `turbo.json` without `dependsOn: ["^build"]` —
`build`, `lint`, `typecheck` and `test` all rebuild their workspace dependencies
first. So a change to `packages/shared` never reached a running API: it resolves
that package as built output (`dist/`), and `nest start --watch` watches
`apps/api/src` and nothing else. Every check passed while the thing on port 3000
validated against a stale copy of the enum.

The failure mode is worth naming because it will look like a client bug every
time: the API rejects a value the client is certain it just added, and the
error names the old set. Nothing in the repo caught it — the type checker reads
source, and the tests import source.

`dev` now depends on `^build`. `pnpm start` has the same hazard one step
further out (it runs a build of the API itself that nothing refreshes) and is
now documented as such.

### 2026-08-01 — The order board gets a real filter system

Finding an order meant scrolling for it. The board fetched active orders and
sorted them into stage tabs **in the browser**, over whatever rows happened to
come back — and since it never sent `limit`, that was the API's default of
twenty. A tab reading "3 ready" meant "3 ready among the twenty I fetched", and
a completed or cancelled order could not be looked at from anywhere in the
panel at all. Updated: API_DOCUMENTATION.md (`GET /restaurant/orders`),
apps/admin/README.md.

**Every filter moved to the server.** `GET /restaurant/orders` now takes `q`,
`restaurantId` and a `status` that names a stage rather than just active/past.
The panel sends its filter state and renders the answer; it no longer filters
rows it already has, because it only ever has one page of them.

**The stages live in `packages/shared`.** `QUEUE_FILTER_STATUSES` is the one
table mapping a stage to its order statuses, read by the API to build the query
and by the panel to label its tabs. It was previously a `STAGES` constant inside
`Orders.tsx` that the API knew nothing about — two copies whose drift would show
up as a tab whose count disagreed with the list under it.

**Search covers the order code, the pickup code and the customer name,** in one
box, because whoever is typing knows which of the three they have. The pickup
code needs no case of its own — it is the last four digits of the code, so one
substring match finds an order by either.

**The search is `AND`ed onto the query, and that is a security property, not a
style.** `orderScope` puts its own `OR` at the top level for any account that is
not platform-wide. Assigning `where.OR` for the search would have replaced it —
turning the search box into a way to read every restaurant's orders. There is a
test that holds the ownership filter in place while searching.

**The tab counts come back with the page, taken under every filter except the
stage.** That is what makes the search worth having: type a pickup code while
looking at the live board, and the counts read `Active 0 · Done 1` — one click
away — rather than showing an empty board with no reason. One grouped query, not
five counts, since the stages overlap.

**`past` is a stage now, so finished orders are reachable.** The board only ever
asked for active ones, which meant a cancelled order was invisible the moment it
was cancelled.

**Also:** the board asks for 50 rows and pages beyond that (it was silently
taking the API's default of 20), and the restaurant and branch pickers only
appear when there is a choice to make — most kitchens are one branch of one
restaurant, and two selects reading "All" are furniture. "All" is a real option
in each list rather than the placeholder state, because Radix reserves the empty
value for the placeholder and a filter you can set but not unset is a trap.

### 2026-08-01 — The customer list is paged

The Customers screen asked for `limit=50`, never sent `page`, and ignored the
`total` the API returned — so it showed the newest fifty customers and gave no
sign the other ones existed. On a platform whose whole point is accumulating
customers, that is a list that silently stops being true. Updated:
COMPONENTS.md (`Pagination`), API_DOCUMENTATION.md (`GET /admin/users`),
apps/admin/README.md.

**No API change was needed** — `page` and `limit` were already there and
documented, capped at 50. The panel simply was not using them.

**A `Pagination` primitive**, not a screen-local pair of buttons. Numbers with
ellipses rather than only prev/next: a back office is where somebody goes to
find the account that signed up in March, and stepping there one page at a time
is not navigation. It renders nothing for a single page, and the range summary
("1–25 of 312") is the half that says whether the thing being looked for is in
this list at all.

**The strip is a fixed seven slots wide.** `pageNumbers()` is pure and tested
directly, because the interesting part of a pager is where the ellipses fall and
that is off-by-one territory at both ends. Two rules came out of the tests: the
width never changes as you walk 1 → 20, or the button you meant to click has
moved by the time you click it; and a gap may never stand in for a single page —
same width as the number, less information, one more click. The second was a
real defect the test caught (`1 … 3 4 5 … 8`).

**25 rows a page, not the API's maximum of 50.** The pager has to be reachable:
fifty dense rows is a long scroll to reach the control that leaves them, and not
scrolling is the point.

**The typed query and the applied one are now separate.** They were the same
piece of state, which was survivable when the screen could not page. It is not
now: clicking page 2 must repeat the search that produced the list on screen,
not whatever half-typed thing is sitting in the box. Submitting resets to page 1
— page 5 of the previous list means nothing in the new one — and a load that
comes back empty on a page past the end lands back on page 1 rather than showing
an empty table under a pager pointing into nothing.

### 2026-08-01 — The back office speaks Armenian, Russian and English

The panel was built entirely in hardcoded English, in a product whose default
language is Armenian and whose rule has always been "no hardcoded strings in UI"
(AI_CONTEXT.md). Roughly 300 strings across eight screens and the component
layer now come from a dictionary. Updated: DEVELOPMENT_GUIDE.md (new §5
"Languages"), COMPONENTS.md (back-office primitives, `MenuRadioGroup`),
apps/admin/README.md.

**Two entry points, not one dictionary.** `packages/i18n` now publishes
`@amragrir/i18n` (customer) and `@amragrir/i18n/admin` (back office). The two
vocabularies barely overlap — "Withdraw the invitation" and "Payment
reconciliation" mean nothing to a diner — and they would collide on short keys
like `menu` and `search`. Separate modules rather than prefixes, so the
server-rendered customer site does not ship several hundred staff strings to
every visitor. `hy` stays the reference in both: a key added there and forgotten
in `ru` or `en` is a compile error, not an Armenian word in an English page.

**Chosen and stored, not routed.** `apps/web` puts the language in the URL
because a crawler sends one `Accept-Language` and would leave two of the three
unindexed. None of that applies to a tool behind a sign-in with nothing to
index, and staff work a whole shift in one language — so the panel keeps the
choice in `localStorage` next to the theme, applies `<html lang>` before the
first paint the same way, and switches from the account menu. The sign-in card
carries its own three buttons: the menu is behind a password, and somebody who
cannot read the panel cannot get to it. The choice rides along as
`Accept-Language` on every request, so the API's error messages and `*_i18n`
columns come back in the language the screen is in.

**Enum labels stopped being string manipulation.** `formatStatus()` turned
`almost_ready` into "Almost ready" with a regexp — an English-only assumption
compiled into the panel. Statuses, payment states, menu tabs and staff roles are
now dictionary keys, looked up as `` t(`orderStatus_${status}`) ``: the template
literal type means adding a value to `OrderStatus` without translating it fails
the build.

**Plurals go through `Intl.PluralRules`,** because the three languages disagree
about what a plural is. Armenian's `one` category covers **zero**, and Russian's
covers **21, 31, 101**. A literal "1 branch" is correct only in English — the
other two carry `{count}` in their singular, or the panel would report zero
branches as one and twenty-one as one. `t.plural(key, count)` selects over
`_one`/`_few`/`_many`/`_other`; Armenian and English define only the two
categories they ever select, Russian adds its two.

**Also fixed:** `packages/i18n`'s own `tsc --noEmit` had never passed. Its
`include: ["src"]` expands to TypeScript's extensions only, so the dictionaries
— the entire package — sat outside the project and every import of them errored
`TS6307`. It was invisible because nothing else in the repo compiled that
package directly. `include` now names the JSON too.

### 2026-08-01 — Back office redesigned on Radix primitives

The internal panel was a working prototype: a strip of tabs, inline forms that
unfolded inside the list they edited, native `<select>`s, and feedback kept in
component state next to whichever form produced it. It is now a back office.
Updated: DESIGN_SYSTEM.md (new `--scrim` token, §10 back-office density),
COMPONENTS.md (back-office primitives), apps/admin/README.md.

**Radix, and why.** `apps/admin` now depends on eleven
[Radix primitives](https://www.radix-ui.com/primitives) — dialog, alert-dialog,
dropdown-menu, select, tabs, toast, tooltip, switch, separator, label,
visually-hidden. What they supply is behaviour nobody should write twice: focus
trapping, focus restored to the trigger on close, `Escape`, scroll locking,
`aria-modal`, roving arrow keys, and the pointer rules that keep a menu open as
the mouse crosses a gap. Each is a day to get right and a permanent bug source
after. They are wrapped once in `src/ui` — **screens import from `./ui`, never
from `@radix-ui/*`** — so Radix owns behaviour and this repo owns appearance.
Build cost: 386 kB raw, 121 kB gzipped, for a tool with no public surface.

**A sidebar instead of a tab strip.** Seven destinations across the top wrapped
onto two lines in anything but a wide window, the current one was a coloured
pill among identical pills, and there was nowhere to put the account. They are
now a fixed list down the side, grouped *Restaurant* / *Platform*, with the
headings appearing only when an account can see both. `TABS` moved to
`navigation.ts` — pure data, no UI imports — so the permission logic is tested
without mounting a panel and the sidebar reads its icons and titles from the
same rows that decide access.

**Screens.** The order board filters by stage (all / new / preparing / ready)
with live counts, runs oldest-first because that is how a queue is worked, and
rings an order past its promised time in place rather than re-sorting under
someone's hand. Menu and Customers became real tables; the menu gained a search
and a per-tab filter, and availability is a switch rather than a button whose
label flips between "Mark sold out" and "Back in stock" — that phrasing never
says whether it reports the state or the action. Every "add" form (dish,
branch, invitation) moved into a dialog instead of unfolding inside its own
list. Dashboard ranks restaurants with a share-of-leader bar and states plainly
when there is nothing to reconcile.

**Confirmation, and feedback that splits by lifetime.** Deleting a dish,
removing a role, withdrawing an invitation and cancelling an order now go
through an alert dialog focused on the safe choice that will not close on a
stray click. Flipping a branch closed or a dish sold out does not — those are
reversible with the same switch. Action results are toasts (read once, gone);
what somebody must act on is a banner that stays.

**`--scrim`, a real token.** A modal backdrop is not `--glass` (a surface that
floats over content and stays legible) and cannot be derived from `--ink`
(which inverts between themes). Added to `packages/ui/src/tokens.ts` and
regenerated into both `tokens.css` files, so `apps/admin/src/styles.css`
contains no hex at all — light and dark cost nothing to keep in step.

**Two documented departures from the phone design.** Controls are 40px rather
than the 56px mobile CTA, and radii are tighter: a tool somebody works in all
day wants more on screen than a storefront does. The order board is the
exception and keeps the full 44px hit target, because it is the one screen used
on a tablet in a kitchen.

**Theme.** The account menu carries a light/dark toggle, and `index.html`
applies the stored choice before the first paint so a dark panel never flashes
light. Same storage key as the customer web app.

**Tests.** `render.spec.tsx` renders every screen through `react-dom/server` and
asserts it does not throw — `tsc` proves the panel compiles, not that a hook is
inside its provider or a Radix part inside its parent, which are exactly the
mistakes a component layer introduces. No jsdom, no testing library; effects do
not run, so it covers the first paint and calls no API. 32 tests pass.

### 2026-07-31 — Staff identity split from customers

Restaurant and platform people are no longer `users` rows with a `role` column.
They are separate accounts with their own table, their own credential, and roles
held over a scope. Updated: ROLES_AND_PERMISSIONS.md (rewritten),
DATABASE.md (§16–19, and notes on `users.role` / `restaurants.owner_id`),
API_DOCUMENTATION.md (staff auth, restaurant panel, staff management, platform),
USER_FLOW.md (§11 staff onboarding), AI_CONTEXT.md (key facts),
apps/admin/README.md.

**Why.** A restaurant owner's row also carried reward points, favourites and an
order history, and `PATCH /admin/users/{id}/role` put staff powers one API call
away from any phone number in the table. `restaurants.owner_id` was a single
column, so two managers — or any per-branch scoping — could not be expressed at
all, which is why the `staff` role had been refused everywhere since it was
introduced.

**Schema** (`20260731090000_staff_identity`, `20260731100000_restaurant_admin_by_assignment`):

- `staff_users` — email (lowercased, CHECK-enforced), scrypt `password_hash`
  (null until an invitation is accepted), `is_active`, `last_login_at`.
- `staff_assignments` — one role over one scope; a manager of two branches holds
  two rows. A CHECK constraint enforces the role↔scope shape, and three
  **partial** unique indexes give one assignment per person per scope (a plain
  unique would not: Postgres treats NULLs as distinct).
- `staff_invites` — only the token's digest is stored; the raw token lives in
  the email. One open invitation per address, by partial unique index.
- `audit_log` — **table only; nothing writes to it yet.**
- `restaurants.owner_id` is now nullable and decides nothing. Kept as the record
  of the original owner for restaurants whose owner had no email and so could
  not be migrated.
- Backfill: every `owner`/`admin` with an email became a `staff_user` with
  `password_hash` NULL — they exist, keep their restaurants, and must accept an
  invitation before they can sign in. A migrated `admin` becomes `super_admin`,
  because otherwise nobody could appoint the others.

**Five roles, and permissions in code.** `ROLE_PERMISSIONS` lives in
`packages/shared/src/staff-roles.ts` rather than in tables: a permission only
means something next to an endpoint that checks it, so adding one is a code
change either way, and the back office renders its tabs from the same map the
API enforces. Only the *assignment* is data.

**Two questions kept apart.** `@RequiresPermission()` decides whether an
endpoint is reachable; `src/staff/scope.ts` decides which rows it may touch, for
that same permission. Reach is per permission and counts only the roles granting
it — an account that administers one restaurant and works a shift in another may
edit the first's menu and not the second's. Ownership stays in the query, so a
row out of reach is 404 rather than 403.

**Auth.** `POST /auth/staff/login` with email and password (scrypt from
`node:crypto` — memory-hard, in the standard library, no native build; the
parameters are stored in the hash so the cost can be raised later without
invalidating anyone). Every failure answers identically, and an unknown address
burns the same time a real verification would. An account with valid credentials
and no roles is refused with a plain message rather than given a token that
would 403 on every screen. New `apps/api/src/email/` mirrors the SMS boundary,
with a console sender that prints invitation and reset links to the API log.

**Breaking:**

- `PATCH /admin/users/{id}/role` **deleted.** Promoting a customer into staff is
  no longer possible in either direction. The four refusals it carried are gone
  with it — the states they guarded cannot arise now.
- `POST /admin/restaurants` takes `adminEmail` instead of `ownerId`, and invites
  that person. The invitation is sent after the restaurant commits.
- `/owner/*` → `/restaurant/*`; "owner" stopped being a role.
- Back-office phone login removed. `apps/admin` signs in with email and
  password, and its tabs are chosen by permission rather than by role.
- `Role` in `@amragrir/shared` is now `guest | customer` only.

**Two endpoints split, because they were two permissions wearing one hat:**

- `PATCH /restaurant/branches/{id}/status` (`branch:hours`) vs `PATCH
  /restaurant/branches/{id}` (`branch:write`) — a shift may stop the queue
  without editing the address.
- `PATCH /restaurant/menu-items/{id}/availability` (`menu:availability`) vs
  `PATCH /restaurant/menu-items/{id}` (`menu:write`) — sold-out is true right
  now and reverses in a tap; a price outlives the shift that set it.

**`POST /restaurant/branches` closes a real gap.** A restaurant created through
the admin panel had no branch, `GET /owner/branches` returned nothing, and
`POST /owner/menu-items` needs a `branchId` — so a newly onboarded restaurant
could not have a menu at all. Branches were only ever created by the dev seed. A
new branch opens **closed**, since it has no menu yet.

**Tests: 445 in `apps/api`** (up from 395) and 23 in `apps/admin`. The new ones
cover the permission ladder, the scope resolver, token separation in both
directions, password hashing, the login flow's uniform failures, and the
"cannot grant what you do not hold" rule.

**A DI bug the unit tests could not catch, and the test that now does.** Adding
`StaffTokenService` to `OrdersGateway` left every test green and an API that
could not boot: `OrdersModule` never imported `StaffModule`. Every spec builds
its subject by hand, which proves the class works and says nothing about whether
Nest can hand it those dependencies. `app.module.spec.ts` now compiles the whole
graph with only Redis and Prisma overridden — it reproduces that exact failure
when the import is removed. Added `@nestjs/testing` as a dev dependency for it.

**Verified against a live database and a running API.** Both migrations applied
cleanly on top of the existing four; all four hand-written constraints were
tested by trying to violate them (a branch role with no branch → rejected, a
platform role carrying a scope → rejected, a duplicate platform assignment →
rejected by the partial unique index, a mixed-case email → rejected). A 26-step
end-to-end run against the booted API covered staff login, uniform login
failures, both token-rejection directions, permission gating, branch creation
(opening closed), menu creation, the availability/menu:write split, staff
listing, the privilege-escalation refusal, and invitation acceptance — after
which the new `branch_staff` account could read its queue and flip a dish sold
out, and was refused `menu:write`, `staff:read` and `platform:metrics`. Armenian
and Russian round-trip correctly through `*_i18n`.

**A follow-up the panel exposed: `GET /restaurant/restaurants`.** The back office
listed branches flat, which cannot represent a restaurant that has **no branches
yet** — and that is exactly the restaurant somebody needs to find, because it is
the one waiting for a first branch. Worse, the "add a branch" form built its
restaurant choices from that same branch list, so a branchless restaurant was
unreachable as well as invisible: the dead end this work claimed to close was
still there, one level up. Three of five restaurants in the dev database were in
that state. The new endpoint returns restaurants with their branches nested,
scoping the two independently (a shift sees their restaurant and only their own
branch under it), and the panel's `Branches` tab became `Restaurants`.

**Left undone on purpose:** `audit_log` has no writer, `tables:write` has no
endpoints, and there is no TOTP second factor for platform roles.


- **Referral discount rate changed from 5% to 2%** (both give and get side of "Give X%, get X%"). Stacking cap stays at 25%. Updated: BUSINESS_LOGIC.md, PROJECT_OVERVIEW.md, USER_FLOW.md, SCREENS.md, API_DOCUMENTATION.md (example `discountEarnedPct`), AI_CONTEXT.md.
- **Repo moved from docs-only to a monorepo skeleton.** `git init`; pnpm workspaces + Turborepo (dropped Nx as an alternative — committed to one tool); added `apps/{api,mobile,web,admin}` and `packages/{shared,i18n,ui,config}`. `apps/*` are placeholders (package.json + README with the real scaffold command) — none are scaffolded yet.
- **New decision: dedicated `apps/admin`.** Owner + admin roles combined into one RBAC-gated React+Vite SPA (no SSR — internal tool only), separate from the customer-facing `apps/web` (Next.js, kept for public-page SEO). Previously the architecture doc had no explicit home for the owner/admin panels. Updated: DEVELOPMENT_GUIDE.md (stack table, monorepo tree, roadmap items 4–5).
- `packages/shared/src/{enums,constants}.ts` now hold the real statuses/roles/business constants transcribed from BUSINESS_LOGIC.md and DATABASE.md (including the referral rate above), so `apps/api`/`apps/mobile`/`apps/web`/`apps/admin` have one place to import them from instead of redefining as strings.

### Phase 0 — API foundation (apps/api scaffolded)

- **`apps/api` is now a real NestJS 11 app** (was a placeholder): `/v1` global prefix, global `ValidationPipe`, a unified error filter emitting `{ error: { code, message, details } }` per API_DOCUMENTATION.md, env validation (fail-fast), CORS, and a `GET /v1/health` liveness + DB-reachability check.
- **Prisma schema** (`apps/api/prisma/schema.prisma`) implements all 15 tables + enums from DATABASE.md (users, restaurants, branches, tables, categories, menu_items, orders, order_items, reservations, payments, reviews, notifications, favorites, referrals, coupons) with the recommended indexes and cascade rules.
- **Committed to Prisma** over TypeORM (DEVELOPMENT_GUIDE.md stack table updated from "Prisma or TypeORM").
- **Local infra:** root `docker-compose.yml` (Postgres 16 + Redis 7) and `apps/api/.env.example`.
- **Dev seed** (`apps/api/prisma/seed.ts`): 11 cuisine categories + 2 demo restaurants (Sunny Table — all services + tables; Greenhouse — pickup only) with branches and menu, idempotent.
- **`packages/shared` now builds to CommonJS `dist`** so the CJS NestJS app can consume it; added a build script.
- **Verified end-to-end against a live database:** initial migration `20260721123512_init` applied to Postgres, seed loaded (11 categories, 2 restaurants, 2 branches, 9 menu items, 4 tables), and the running API returns `GET /v1/health` → `{"status":"ok","db":"up"}` with 404s in the documented error envelope.
- **Two bugs the smoke test caught** (build and typecheck both passed while the app could not boot):
  - `PORT` from `.env` arrives as a string and `enableImplicitConversion` did not coerce it, so env validation failed on `isInt` — fixed with an explicit `@Type(() => Number)`.
  - `incremental: true` combined with nest-cli's `deleteOutDir` produced stale builds (dist wiped, cache reporting files unchanged, so `src/prisma/*` was never re-emitted and the app crashed on a missing module) — removed `incremental`.
- **Known issue:** `turbo run build` can't locate pnpm when it's only a corepack shim; use per-package `--filter` builds until pnpm is on PATH (documented in root README).

### Phase 0 (cont.) — lint + test tooling closed out

- **`lint` and `test` were declared but non-functional** — the scripts existed in `apps/api/package.json` while eslint and jest were never installed, so both failed with "not recognized". DEVELOPMENT_GUIDE.md requires "CI: lint + typecheck + tests", so this was a real gap, not a cosmetic one.
- Installed and wired **eslint 9 (flat config)** — `packages/config` now ships its base config via an `exports` map (`@amragrir/config/eslint`) and declares `@eslint/js` + `typescript-eslint`; `apps/api/eslint.config.mjs` extends it and declares Jest globals for specs. Verified linting 11 files, 0 errors.
- Installed and wired **jest + ts-jest**, with `setupFiles: ["reflect-metadata"]` (decorator metadata is loaded by `main.ts` at runtime, but specs have no such entry point — without it every decorated class throws `Reflect.getMetadata is not a function` under test).
- **First 12 tests, all passing:**
  - `env.validation.spec.ts` — regression cover for the string-`PORT` boot failure above, plus range/missing-var cases.
  - `health.controller.spec.ts` — asserts the endpoint stays 200 with `db:'down'` rather than throwing when the DB is unreachable.
  - `shared-wiring.spec.ts` — proves `@amragrir/shared` actually resolves from the CommonJS API build. It was declared as a dependency but imported nowhere, so the wiring had never been exercised; this also pins the enum strings against the Prisma schema so the two can't drift.
- `tsconfig.build.json` already excluded `**/*.spec.ts`; confirmed `dist` still emits exactly the 8 production files.

### Phase 1 — Auth + Users

- **`users.phone` is now nullable** (migration `nullable_phone_for_guests`). DATABASE.md described it as `NOT NULL` *and* described guest accounts, which cannot both hold — a guest has no phone. It is filled on OTP verification, which is what lets a guest upgrade in place instead of creating a second account. DATABASE.md corrected.
- **OTP auth over Redis:** `POST /auth/send-code` and `/verify-code`. Codes are stored **hashed** (a Redis dump must not hand over live logins), are **single-use**, expire in 120s, are rate-limited by a 60s resend cooldown (**429** with `retryAfter`), and are **burned after 5 wrong attempts** — a 4-digit code is otherwise brute-forceable inside its window.
- **Phone normalisation:** every Armenian spelling (`99123456`, `099123456`, `+374 99 123 456`, `0037499123456`) collapses to one E.164 value. `users.phone` is unique and OTP keys derive from it, so two spellings of one number would otherwise become two un-mergeable accounts.
- **JWT access + refresh** (`@nestjs/jwt`): 15 min / 30 days. Refresh tokens are registered in Redis by id, are **single-use (rotated)** and **revocable** — otherwise a signed token would stay valid for its full 30 days after logout. Claims are re-read from the DB on refresh so a changed role or verification status takes effect.
- **Guest sessions** (`POST /auth/guest`) — anonymous account, no phone, browsing and basket only.
- **Both guards are global:** `JwtAuthGuard` (opt out via `@Public()`) and `RolesGuard` (`@Roles()`, `@RequiresVerifiedPhone()`). Secure by default — a new endpoint is protected unless it says otherwise. ROLES_AND_PERMISSIONS.md updated with implementation status.
- **`GET /me`, `PATCH /me`, `/me/settings`, `/me/language`** — all return the full profile so clients never need a follow-up read; duplicate email surfaces as **409**, unknown language as **400**.
- **SMS is behind a `SmsSender` interface** with a dev sender that logs the code. The Armenian provider stays an open question; swapping it in is a one-line change in `SmsModule`.
- **`POST /auth/social` deliberately not implemented** — verifying Apple/Google id tokens needs provider credentials that do not exist yet. Marked as such in API_DOCUMENTATION.md so the gap is not mistaken for an oversight. `referralCode` is likewise accepted but not yet applied (needs the referrals module).
- **Health check now also probes Redis** (`{"status":"ok","db":"up","redis":"up"}`).
- **49 tests passing.** Covers OTP rules (hashing, single use, cooldown, attempt burning, per-phone scoping), phone normalisation, role/phone-verification guards, and env validation. Verified end-to-end against the running API: registration, wrong code, replay rejection, `/me` reads and writes, refresh rotation, old-token revocation, logout, and guest sessions.

### Phase 1 review — three defects found and fixed

A self-review of the auth code before building on top of it turned up three real
problems, each confirmed against the running API before and after the fix:

- **Security: a refresh token was accepted as an access token.** Both kinds are
  signed with the same secret and nothing distinguished them, so a 30-day
  refresh token worked as a bearer credential on any endpoint — and because it
  carries no `role`, `RolesGuard` read `undefined` and would have waved it
  through anything not naming an explicit role. Both token kinds now carry a
  `typ` claim that is verified; tokens without one (older builds) are rejected.
- **Guest upgrade never worked, though the docs said it did.** `verifyCode`
  looked the user up by phone alone; a guest has none, so it always created a
  *second* account and orphaned whatever the guest had collected. It now honours
  an optional bearer on `verify-code` and upgrades that row in place. If the
  phone already belongs to someone, the caller is signed into that account and
  the guest session is abandoned rather than the two being merged implicitly.
- **429 responses were mislabelled `INTERNAL_ERROR` and dropped `retryAfter`.**
  `TOO_MANY_REQUESTS` was missing from the status→code map, and the error filter
  rebuilt the body from `message` alone, discarding context the client was
  documented to receive. Added `RATE_LIMITED`, and extra fields attached by a
  thrower are now forwarded in `details`.

Also closed a gap DEVELOPMENT_GUIDE.md mandates: **per-IP rate limiting on
`auth/*`** (`@nestjs/throttler`, 120 req/min globally and 10/min on auth). The
existing OTP cooldown is per phone number and does nothing against one host
spraying thousands of different numbers. In-memory storage is fine for a single
instance — switch to the Redis adapter before scaling out.

**79 tests passing** (up from 49), including regression cover for each defect
above. API_DOCUMENTATION.md updated with the error-code list, rate limits, token
non-interchangeability, and the real guest-upgrade semantics.

### DEVELOPMENT_GUIDE.md expanded

Added the conventions this codebase actually follows, several of them learned
the hard way earlier in this changelog:

- **API conventions** — `/v1` versioning, the single error envelope, what each
  status code means, secure-by-default routing, mandatory pagination with a
  server-side cap, server-side resolution of localised columns, and never
  returning internals.
- **Security baseline** — never trust the client, distinguish token kinds,
  revocable refresh tokens, secrets/codes hashed at rest, rate-limit anything
  unauthenticated or costly, fail-fast config, no PII in logs.
- **Observability** — health reports each dependency and stays 200 with a
  `down` marker.
- **Testing** — test business rules rather than the framework; **a green build
  is not a working app**, so exercise the running endpoint; every bug fix gets a
  regression test carrying the reason it exists.
- **Definition of Done** — an eight-point checklist ending in "docs updated" and
  "anything deliberately left out is written down".
- Roadmap reworked into a status table with the rationale for the two orderings
  that are easy to get wrong (catalog before any client; owner screens before
  dine-in).

### Phase 2 — Catalog (read-only)

- **`GET /categories`, `/restaurants`, `/restaurants/{id}`, `/restaurants/{id}/menu`, `/restaurants/{id}/tables`** — all public, no token at all, since browsing is open to unauthenticated visitors and the web app needs these pages crawlable.
- **List rows are branches, not restaurants.** A branch is what a guest travels to and what carries hours, coordinates and prep time; the restaurant supplies name, rating and services.
- **`{id}` accepts a branch id, a restaurant id, or a slug** — clients hold whichever the previous screen gave them, and guessing wrong should not be a 404.
- **Localisation resolved server-side** from `Accept-Language` (`hy` default, falling back through `hy` to any populated translation). Clients receive plain strings, never the raw `*_i18n` JSON.
- **Filters:** rating, declared services, free-text over name and cuisine, plus category and dietary — the latter two select branches having *at least one matching menu item*, since they describe dishes rather than the restaurant.
- **Sorting:** recommended, fastest, top-rated in SQL; `nearest` needs coordinates and is computed and paged in the application. Without coordinates `nearest` falls back to the default order rather than inventing a meaningless one. Distance uses Haversine in `geo.ts` — **move it into the query (PostGIS) before the catalog grows**, noted in the source.
- **`limit` capped at 50** server-side.
- **`priceMax` deliberately not implemented** — the design's price-per-person filter has no backing column; recorded as an open question rather than faked.
- **122 tests passing** (up from 79). Verified live against the seed: 11 categories in Armenian and Russian, distance sort (0.4 km vs 1.4 km from Republic Square), each filter, menu tabs, tables, plus 404 and validation paths.

### Phase 2 review — eleven defects fixed before building a client on top

A code review of the catalog and auth-fix branches found real problems in the
endpoints the mobile app is about to consume. Fixed here rather than after a
client had been written against them:

- **The "near me" query was unbounded.** With `sort=nearest` or `distMax`, the query ran with no `take` and no geographic predicate — every branch in the table was fetched, joined and distance-mapped in Node before slicing to one page. On a public, unauthenticated endpoint that is a memory-exhaustion vector, and it broke the pagination rule added to DEVELOPMENT_GUIDE in the same branch. Now narrowed in SQL by a bounding box (`geo.boundingBox`, using the `(lat, lng)` index) with a hard candidate cap, and `sort=nearest` without `distMax` applies an implicit 5 km radius — an order-ahead product has no use for a result 40 km away.
- **Rate limiting would have failed in production.** `ThrottlerGuard` keys on the client IP, but Express reports the *proxy's* address unless told how many hops to trust. Behind nginx/ALB every user would have shared one bucket, so the 10/min `/auth/*` limit would lock out the entire world. Added `TRUST_PROXY_HOPS` (default 0, since blindly trusting a forwarded header lets a caller spoof their IP).
- **A requested sort was silently discarded.** Passing `distMax` disabled the SQL `ORDER BY` while the in-app sort only ran for `nearest`, so `?distMax=2&sort=fastest` returned arbitrary order while the UI claimed fastest-first.
- **A restaurant id or slug resolved to an arbitrary branch.** `findFirst` had no ordering, so a multi-branch restaurant could serve a different branch's menu and prices on each request. Now deterministic (oldest branch); documented.
- **`distMax` compared the rounded display distance**, letting a branch 2.04 km away pass a 2 km filter. Now filtered on the true distance and rounded only for display.
- **Tables were ordered by a varchar**, listing table 10 immediately after table 1. Now numeric-aware, with non-numeric labels ("A1", "Terrace-2") sorted after.
- **Concurrent verification of the same phone returned a 500.** The find-then-create is not atomic; the loser hit the unique index and P2002 went unhandled. It now falls back to reading the row the winner created.
- **`dinein` vs `dine_in` drift.** Service values were hardcoded string literals in a DTO, spelled differently from `ServiceMode` in `packages/shared` — the exact duplication AI_CONTEXT.md forbids. Added `RestaurantService` to shared, documenting *why* the two vocabularies differ rather than letting them silently diverge.
- Also: the two copies of the `Authorization` header parser collapsed into one helper; `findOne` no longer returns an undocumented `language` field and has a real return type instead of `Record<string, unknown>`; `tables()` is typed; the list's `findMany` and `count` now run in parallel instead of sequentially.

**132 tests passing**, each fix carrying a regression test that names what broke.
Verified live: `distMax=5&sort=fastest` now orders Greenhouse (10 min) ahead of
Sunny Table (12 min), where before the order was arbitrary.

Deliberately not changed: the error filter still forwards any extra key a
thrower attaches (it needs a decision on whitelisting versus the current
convenience), and the catalog DTO tests still bypass class-transformer, so the
query-array parsing has no direct coverage.

### Phase 3 — First mobile slice

`apps/mobile` is now a real Expo app (SDK 57, expo-router) rendering live data
from the API: **auth → home → restaurant → menu**.

- **Read the versioned Expo docs rather than writing from memory.** The template ships an `AGENTS.md` warning that Expo has changed; SDK 57 pairs React 19.2 with React Native 0.86, and the router setup was taken from the current installation guide instead of an older recollection.
- **Screens:** `index` (greeting, category rail, nearby restaurants sorted by distance), `auth` (phone → OTP, two steps), `restaurant/[id]` (cover, rating, hours, menu tabs backed by `MenuTab` from `@amragrir/shared`).
- **`src/theme`** transcribes DESIGN_SYSTEM.md into tokens with a `ThemeColors` interface, so adding a colour to one theme without the other is a compile error rather than an `undefined` at runtime. Components read `useTheme()`; no raw hex anywhere else.
- **`src/api`** is the only place that talks to the server: it decodes the error envelope into a single `ApiError` type (network failures included, so screens have one error shape), and exposes typed calls rather than letting screens build URLs.
- **A guest session is created on launch**, so browsing works before sign-in; verifying a phone sends that bearer along and the server upgrades the same account. Token persistence is deliberately absent — it needs secure storage, which lands with checkout.
- **Money is formatted, never computed** on the client, per DEVELOPMENT_GUIDE.md.
- **14 tests** on the display helpers, and the app **bundles cleanly (788 modules)** — which is what proves `@amragrir/shared` resolves through pnpm's symlinks in Metro, the one genuinely uncertain part of the setup.
- **`pnpm` now has to be a real binary on PATH.** Both Turborepo and `expo install` shell out to it and fail with the corepack shim; installing it globally also cleared the `turbo run build` "known issue" recorded earlier.

**Not verified:** rendering, navigation and gestures on a device or simulator —
that needs a human to run `pnpm --filter @amragrir/mobile dev`. Every endpoint
the app calls was exercised directly, and the bundle builds, but no screen has
been seen on screen.

### Phase 4 — Basket, orders (pickup), payment, idempotency

The API can now take money for food. `POST /cart/quote`, `POST /orders`,
`GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/cancel`,
`GET /payment-methods`, `POST /payments`.

- **The basket stays on the client; the server owns the arithmetic.** A cart
  table would need syncing and conflict rules for state that is per-device and
  throwaway. `POST /cart/quote` prices a basket instead, and shares its pricing
  code with order creation — the quote and the order cannot disagree because
  they are the same function. API_DOCUMENTATION's "optional server-side cart"
  is now a decision rather than an open question.
- **Nothing about money comes from the client.** The order request carries ids
  and quantities; prices, names and prep times are re-read from the database.
  `POST /payments` has **no amount field at all** — the server charges the
  order's total.
- **Unknown fields are rejected, not ignored.** `couponCode` is documented in
  the design but unimplemented, so sending it is a 400. Accepting and dropping
  it would let a customer believe a discount applied.
- **Idempotency is mandatory on both money endpoints**, not advisory. A phone
  that loses signal after the server created the order will retry; without a
  key that is a second order. Redis-backed, scoped to endpoint **and** caller
  (a guessed key must not return someone else's order), fingerprinted on the
  body (same key + different basket → 409), and released on failure so a
  transient error cannot burn a key.
- **A quote reports problems; an order refuses them.** A sold-out or unknown
  dish comes back in `unavailable[]` with `canOrder: false` so the basket
  screen can flag the line, but the same basket sent to `POST /orders` is a
  422. A closed restaurant still gets prices.
- **The order state machine lives in `packages/shared`** (`ORDER_STATUS_FLOW`,
  `canTransitionOrder`, `isOrderCancellable`) because the owner panel will
  decide which buttons to render from the same table. Payment asks the machine
  whether `created → paid` is legal instead of checking statuses by hand.
- **Ownership is in the query, not a guard.** Every order lookup filters on
  `userId`, so no code path loads another user's order and then decides — and
  the answer is 404, not 403, which would confirm the id exists.
- **Two race windows closed** — both found by asking what happens between the
  check and the write, not by a failing test. `POST /payments` and
  `/orders/{id}/cancel` now match the **current** status in the `WHERE` clause,
  so paying cannot un-cancel a cancelled order and a cancel cannot land on an
  order the kitchen already started. The loser gets a 409. Added to
  DEVELOPMENT_GUIDE's security baseline as a rule.
- **Cancelling refunds before it cancels.** If the provider refuses, the
  customer keeps an order rather than having neither order nor refund; the
  remaining window (refunded, then the status write fails) is logged as
  needing manual reconciliation rather than pretended away.
- **`PaymentProvider` mirrors `SmsSender`** — nothing outside `PaymentsModule`
  names a provider. The dev implementation approves everything, and declines
  when the token is `decline`, so the declined path is reachable instead of
  written and never run. A decline records a `failed` payment and leaves the
  order `created`, so the customer retries on the same row.
- **Cash captures nothing but still commits the order** to `paid` — otherwise
  the kitchen never receives it (BUSINESS_LOGIC §5).
- **Pickup code is derived, not stored** — the last four digits of
  `orders.code` (`AMR-42774033` → `4033`), so the two can never disagree. With
  only 10,000 values a busy branch would repeat one about one time in eight at
  50 active orders, so generation also avoids clashing with an active order at
  the same branch. Best-effort by design and documented as such: only
  `orders.code` carries a unique constraint. **No schema change was needed.**
- **Prep estimate is the slowest dish, not the sum** — a kitchen cooks in
  parallel. Falls back to the branch average, then to a constant, so an
  unfilled column never schedules an order for "right now".
- **205 tests passing** (up from 132), including regression tests for both race
  windows.

**Verified against the running API**, not just the suite: sign-in, quote
(subtotal matched the menu prices), order creation, a replayed
`Idempotency-Key` returning the *same* order id, 409 on key reuse with a
different basket, 400 without a key, card capture, 409 on paying twice, the
active-orders list, cancel-with-refund, a declined card followed by a
successful cash retry, and the rule checks (dine-in 422, duplicate line 400,
`readyAt` too soon 422 with `earliestReadyAt`, qty over the cap 400, unknown
dish 422, coupon field 400). Cross-user isolation checked with two verified
accounts: every route answers 404 for the other's order.

Unrelated fix found while running the checks: **`apps/mobile` no longer
typechecked.** TypeScript 6 (Expo SDK 57) stopped pulling every
`node_modules/@types` package into the global scope automatically, so the spec
files lost `describe`/`it`/`expect` after a patch bump. Naming `"types":
["jest"]` in `apps/mobile/tsconfig.json` restores them. Confirmed the failure
exists on the previous commit too, so it is not a Phase 4 regression.

**Not built:** the basket, checkout and tracking **screens**. Phase 4 shipped
the API only — the endpoints exist and have been exercised, but nothing on a
phone calls them yet. Also deferred: `POST /orders/{id}/reorder`, dine-in
orders (422 until table booking), coupons and referral discounts, opening-hours
validation on `readyAt`, and the WebSocket order stream (`GET /orders/{id}`
already returns `secondsLeft`, so polling works meanwhile).

### Phase 5 (API) — Live order tracking, and the owner API that makes it move

- **Pulled the owner's status API forward from Phase 6.** Tracking with nothing
  able to change a status is untestable theatre — the same reasoning the
  roadmap already gives for putting owner screens before dine-in, applied one
  phase earlier. `GET /owner/orders` and `PATCH /owner/orders/{id}/status` ship
  here; the owner *screens* stay in Phase 6. Roadmap and rationale updated.
- **`wss://…/v1/orders/stream`** — plain `ws`, not socket.io, because React
  Native and every browser already ship a WebSocket client and the app needs no
  extra dependency for it.
  - **Authentication is the first message, not the handshake.** A browser
    cannot set an `Authorization` header on a WebSocket, and a token in the
    query string ends up in every access log on the way. A `subscribe` message
    carries it instead — which also lets one socket follow several orders, as
    the orders list screen needs.
  - **`subscribe` replies with the current state**, not only future changes. A
    client opening the tracking screen after the order moved would otherwise
    show stale data until the next transition — and for a finished order there
    isn't one.
  - Subscriptions authorise per order through the same visibility rule the REST
    endpoints use, and answer `Order not found` for both "missing" and "not
    yours", since a distinguishable error confirms the id exists.
  - 30s ping/pong sweep: a socket killed by a dropped mobile connection is
    otherwise never collected, because TCP alone can keep a dead peer open for
    hours. Disconnect and shutdown both release the emitter listener.
- **Status changes are published from one place.** `OrdersService.transition`
  now performs every move — customer cancel, owner advance — so the refund rule
  and the broadcast exist once and cannot drift. It matches on the status it
  read, so a change that lands in between loses with a 409 rather than being
  overwritten.
- **`paid` is not a status the panel may set.** Only a payment makes an order
  paid; a restaurant able to set it could mark an unpaid order as settled. The
  legality of every other move comes from the shared state machine, not a list
  written in the owner module.
- **The owner queue is scoped by a Prisma filter, not a check afterwards** —
  owner sees their restaurants' branches, admin sees all. A `branchId` query
  parameter narrows that scope and can never widen it, so passing someone
  else's branch id returns nothing rather than their orders. Ordered oldest
  first: a kitchen works a queue, not a stack.
- **`staff` is refused rather than approximated.** The schema has no
  user-to-branch link, so there is nothing to scope them by; lending them the
  owner's reach until that table exists would be worse than making them wait.
  Written down in ROLES_AND_PERMISSIONS rather than left as a silent gap.
- **Global guards now step aside for WebSocket contexts.** `JwtAuthGuard` and
  `RolesGuard` read `request.user`, which does not exist for a socket message —
  without this the gateway would have thrown on every frame. Both carry a test.
- **`OrderEventsService` is an in-process emitter and says so in its own
  docblock**: it is the first thing that breaks on a second API instance, and
  swapping it for Redis pub/sub is a change to that one file.
- **227 tests passing** (up from 205), including gateway tests for the snapshot
  reply, cross-order isolation, invalid tokens and listener cleanup.

**Verified live, end to end:** a customer placed an order, a socket subscribed
*before* payment, and the owner walked the order through the kitchen. The
socket received `created → paid → confirmed → preparing → almost_ready →
ready → completed` without a single poll. Also checked: a customer gets 403 on
the owner queue, the owner gets 422 skipping a step and 400 attempting `paid`,
a stranger's socket subscription gets `Order not found`, and a garbage token
gets `Invalid or expired token`.

### Phase 5 (mobile) — Basket, checkout and live tracking screens

`apps/mobile` now covers the whole ordering path: **auth → home → restaurant →
basket → checkout → tracking**.

- **`src/cart.tsx` holds the basket, and its rules are a reducer** rather than
  state scattered through screens, so they can be tested without rendering
  anything. Adding a dish from a second restaurant replaces the basket
  (BUSINESS_LOGIC §4) — but the *screen asks first*, because that is a decision
  only the customer can make. Quantity zero removes a line, and the last line
  leaving also forgets the restaurant, otherwise an empty basket would still
  claim a branch and prompt about "switching" from nothing.
- **No total is ever computed on the phone.** The basket carries menu prices
  only so a single line can be rendered before the quote returns; every
  subtotal, fee and total on screen is the answer to `POST /cart/quote`.
- **The idempotency key is created once per checkout attempt and kept in a
  ref** — deliberately *not* regenerated when placing the order fails. That is
  the entire point: a customer tapping "Place order" again after a dropped
  connection replays the first response instead of ordering twice.
- **Tracking loads over REST first and treats the socket as an optimisation.**
  If the stream never connects the screen still renders. It also shows
  `reconnecting…` rather than a countdown that has quietly stopped being live —
  a frozen timer looks exactly like a stuck order.
- **The stream client reconnects with backoff.** A phone loses its connection
  constantly — backgrounding, a tunnel, a lift — so this is not an optional
  extra; without it the tracking screen silently stops updating. Retry lives in
  `onclose` only, since `onerror` is always followed by one and handling both
  would schedule two reconnects per failure.
- The countdown ticks locally between server updates so it moves every second
  instead of jumping at each status change; any value from the server replaces
  it.
- Tracking has no back button: the order exists, and swiping back to checkout
  would offer to place it again.
- **32 mobile tests** (up from 14), covering the cart rules and the countdown
  formatting, and the app **bundles cleanly (1.2 MB web bundle)**.

**Not verified:** rendering, navigation and gestures on a device or simulator —
that still needs a human running `pnpm --filter @amragrir/mobile dev`. Every
endpoint and the exact WebSocket subscribe frame these screens use were
exercised directly against the running API, and the bundle builds, but **no
screen has been seen on screen.**

### Phase 6 — Back office: owner menu API and the `apps/admin` panel

`apps/admin` is now a real React + Vite SPA (was a placeholder README): sign in,
live kitchen queue, menu editing, and the open/closed switch.

**API — branch settings and menu management**

- `GET /owner/branches`, `PATCH /owner/branches/{id}`,
  `GET|POST|PATCH|DELETE /owner/menu-items`, scoped by the same Prisma filter as
  the order queue (`branchScopeFor`, `menuScopeFor` alongside `orderScopeFor`),
  so ownership is part of every query rather than a check afterwards.
- **The owner endpoints return raw `*_i18n` objects**, unlike the public menu
  which resolves one language. The owner is editing all three; resolving would
  make the other two invisible and silently unsaveable.
- **`nameI18n.hy` is required** — it is the fallback every other language
  resolves to, so a dish without it renders nameless for most visitors.
- **Blank translations are dropped before storing.** An empty string is not a
  translation and it beats the `hy` fallback in `localize()`, which would leave
  the dish nameless in exactly the language someone chose.
- **A dish that has ever been ordered cannot be deleted** → 409 telling the
  owner to mark it unavailable instead. `order_items` points at it, and an order
  that can no longer say what was bought is not an order. No soft-delete column
  was added: `isAvailable` already means "not on the menu".
- **`reservationsEnabled` is refused on a branch** — it lives on the restaurant,
  so accepting it here would silently change every other branch. Documented
  rather than quietly half-implemented.
- **Changing a price does not touch existing orders** (order items store what
  they were bought at), with a test that asserts nothing else is written.
- **241 API tests** (up from 227).

**Panel**

- **Status buttons are derived from `ORDER_STATUS_FLOW`**, not written out
  again — the panel can only offer moves the API accepts, so it cannot show a
  button that 422s. `paid` is filtered out because only a payment makes an
  order paid.
- **Nothing is optimistic.** Advancing a status waits for the server's
  broadcast; a kitchen acting on a status that did not save is worse than a
  moment of latency.
- **One socket for the whole board**, re-subscribing every watched order after a
  reconnect — a reconnected socket knows nothing about old subscriptions, so
  tracking them separately is what stops it silently watching nothing.
- **Token refresh is single-flight.** Refresh tokens are single-use and rotated,
  so two requests expiring together would each spend the same one and the loser
  would be logged out. This is not theoretical for a panel left open all shift
  with a 15-minute access token.
- `localStorage` for tokens, with the trade-off written down in the README
  rather than left implicit: readable by any script on the page, accepted for an
  internal tool, **revisit before exposing it beyond the restaurant's network.**
- No router — three tabs and nothing to deep-link. 12 tests, 207 kB bundle.

**Two build problems this uncovered, both worth recording**

- **`@amragrir/shared` was CommonJS only**, which Rollup could not take named
  exports from, so the panel would not build. It now ships **both** builds with
  an `exports` map (CJS for the NestJS API, ESM for Vite). TypeScript resolves
  types next to the resolved JavaScript file, so the ESM build emits its own
  declarations — pointing the ESM condition at the CommonJS `.d.ts` looks
  tidier but simply does not resolve.
- **Deleting `dist` did not force a rebuild.** `tsconfig.tsbuildinfo` sat
  outside it and reported everything current, so `tsc` emitted nothing and every
  consumer failed with "cannot find module" — the same class of stale-build trap
  as Phase 0's `incremental` + `deleteOutDir`. The build info now lives inside
  `dist`, so removing it genuinely resets the build.
- `esbuild` added to `allowBuilds` in `pnpm-workspace.yaml` (pnpm blocks install
  scripts by default; Vite needs the platform binary it places).

**Verified live against the running API:** the branch switch (and a 422 when
ordering from a closed branch), creating a dish with partial translations and
seeing the public endpoint resolve `ru` and fall back to `hy` for the
description, price and availability edits, a 422 when ordering a dish just
marked sold out, a 409 deleting an ordered dish, a successful delete of an
unordered one, and every scoping and validation path (403 for a customer, 404
for a branch the owner does not own, 400 for a missing Armenian name and for
`reservationsEnabled`).

**Not verified:** the panel has not been opened in a browser. It typechecks,
builds, and every request it makes was exercised directly — but no screen has
been seen.

### Phase 7 — Table booking and deposits

`GET /restaurants/{id}/availability`, `POST /reservations`, `GET /reservations`,
`GET /reservations/{id}`, `POST /reservations/{id}/cancel`, dine-in orders, and
the owner's booking book.

**A booking is a seating, not an instant.** It holds a table for 90 minutes,
which is why 19:00 and 19:30 conflict on the same table — modelling a booking
as a point in time would have sold the same table twice with no error anywhere.
Slots are offered every 30 minutes, and the last one is a full seating before
closing: offering 22:30 when the kitchen shuts at 23:00 sells a table nobody
can use.

**Availability is answered per party size.** "19:00 is free" is meaningless
without knowing whether it is free for two or for eight. The server also picks
the table — always the smallest that fits, so a pair does not consume the only
six-seater — because letting a client name one means trusting it to have read
availability correctly.

**Times are Yerevan local, deliberately.** A guest choosing "19:00" means 19:00
at the restaurant; generating slots in UTC would have offered times four hours
off. Armenia is UTC+4 all year (no DST since 2012), so the offset is a named
constant — expanding beyond Armenia becomes a visible change to that line
rather than a silent hour-off bug in every booking.

**Exclusivity is enforced twice, and the second one nearly introduced a bug.**
The "is this table free" check and the insert that makes it not free run in one
**serializable** transaction, with a retry, because serialization failures are
contention rather than errors. A unique index backs it up — but the obvious
`(table_id, reserved_for)` would have blocked a table and time **forever** once
anyone cancelled. It is keyed on a new `active_slot` column that mirrors
`reserved_for` while the booking is live and goes NULL when it ends; Postgres
treats NULLs in a unique index as distinct, so cancelling frees the slot.

**A deposit is held, not charged.** That distinction is the entire product
promise — cancel in time and the money was never taken — so `PaymentProvider`
gained `authorize`/`capture`/`release` alongside `charge`/`refund`. What
happens at the end is one function in `shared` (`depositOutcomeFor`) that both
the guest's cancel and the owner panel call, so they cannot disagree about who
keeps the money: released if cancelled ≥2h ahead, captured on a late
cancellation or a no-show, captured and credited when the guest actually ate.
A booking that fails after the hold succeeds releases it; a booking whose
deposit is declined is not made at all.

**`no_show` is reachable only from `confirmed`.** A table nobody promised to
hold cannot be a no-show, and the deposit rule depends on that distinction.

**Schema:** `payments.order_id` is now nullable with a new nullable
`reservation_id`, plus a `CHECK` that exactly one is set — Prisma cannot
express it, so it is raw SQL in the migration. Without it, "nullable order_id"
would quietly permit an orphan payment no reconciliation could attribute to
anything. A separate `deposits` table would have duplicated every provider
field and status transition for no gain.

**Dine-in orders** now exist: `serviceMode: "dine_in"` requires a
`reservationId` the caller owns, at the same branch, still active, without an
order already. The quote gains `dueNowAmd` — the meal minus the deposit
already held — while `totalAmd` stays the meal, because the deposit is credited
rather than charged twice.

**A latent hole the tests caught:** `quote` took `userId` as optional, so a
dine-in basket could skip the reservation check entirely by omitting it. Made
required.

**307 tests** (up from 241), including the slot arithmetic, every deposit
outcome, and the cancel-frees-the-slot regression.

**Verified live**, including the two things unit tests cannot prove:
- **Two simultaneous requests for the last free table: exactly one booked, one
  got a 409.**
- **Filling all four tables at 17:00 closed 16:00 through 18:00 and left 15:30
  and 18:30 open** — the seating window, end to end.

Plus: the deposit held at booking (`authorized`), untouched through
`confirmed`/`seated`, captured and credited on `completed`; a no-show capturing
it; a cancellation releasing it and the freed slot immediately rebookable; the
dine-in order showing 8760 total with 4000 held and 4760 due at the table; and
every rule and scoping path (off-grid time, past time, oversized party,
pickup-only restaurant, declined deposit, another guest's booking → 404, a
customer reading the owner book → 403).

**Not built:** the booking, availability and reservation screens in
`apps/mobile`, and the booking book in `apps/admin`. This is the API only.
Deferred and written down: per-restaurant seating lengths, real `open_hours`
(availability falls back to a documented 10:00–23:00), and table management
(`/owner/tables`).

### Phase 8 — Favourites, search, filters, referrals and rewards

`GET|POST|DELETE /favorites`, `GET /search`, `GET /search/popular`,
`GET /referrals/me`, `GET /coupons`, plus `couponCode` on quotes and orders.

- **The referral program now actually pays out.** `referralCode` on
  `verify-code` was accepted and ignored since Phase 1; it now attributes the
  account and issues the newcomer's 2% coupon. Guards that matter: attribution
  only for a genuinely **new** account (re-verifying an existing phone with a
  friend's code would be a discount generator), self-referral ignored, and an
  unknown code ignored rather than failing a signup over a typo.
- **The inviter is paid on the invitee's first *paid* order**, not at signup —
  otherwise inviting a hundred throwaway numbers earns the full 25% for free.
  `users.referred_by` is cleared in the same transaction, which is what makes
  the credit once-per-invitee rather than once-per-order. Verified live: a
  second paid order left the figure unchanged.
- **Stacking is accumulation into one coupon**, not a pile of 2% rows. The
  design shows a single "discount earned" figure, and a 25% cap is meaningless
  unless something adds up to be capped. A spent reward restarts at 2% —
  flagged as an open question, since the other reading is defensible.
- **A quote previews a coupon; an order claims it.** Pricing a basket must not
  spend the coupon the guest is only looking at. The claim is a conditional
  update (`usedAt: null` in the filter), so two orders submitted at once cannot
  both apply it — the loser gets a 422 instead of a double discount.
- **Cancelling an order returns the coupon**, and an order that fails to insert
  releases the coupon it just claimed. Both have tests.
- **A rejected coupon code is reported, not swallowed.** The quote carries
  `coupon: { code, applied: false }` so the basket can say so, rather than
  quietly charging full price — the same reasoning that made unknown fields a
  400 in Phase 4.
- **Discounts apply to the subtotal, not the total** (the service fee is the
  platform's), are capped at 25%, and round **down** so rounding never costs the
  customer.
- **Reward points: accrual only.** One point per 100֏ of subtotal, on payment.
  **Redemption is deliberately unbuilt** — the design shows a balance but no way
  to spend it, and inventing a rate would invent an economy nobody agreed to.
  Written into the open questions rather than guessed at.
- Points and referral credit run **after** the payment commits, and each failure
  is logged rather than raised: loyalty bookkeeping must never tell a customer
  their successful payment failed.
- **The price-per-person filter is implemented**, closing an open question left
  since Phase 2. Derived as the average price of a branch's available dishes
  rather than a stored column that every menu edit would have to keep in step;
  documented as the approximation it is. A range matching nothing returns an
  empty list rather than silently dropping the filter.
- **Dish search matches any language.** It runs over the whole `name_i18n` blob,
  so "bowl" finds «Боул с киноа» and "боул" finds "Quinoa Bowl" — verified both
  directions live. Restaurants and dishes come back as two lists, because
  "Sushi" is both a cuisine and a dish.
- **Popular tags are static and labelled as such.** Real popularity needs query
  logging that does not exist; a table nothing writes to would look like a
  feature and return nothing.
- **Favourites are idempotent both ways** — a double tap is not an error, and
  removing something absent leaves the caller in the state they asked for. They
  carry a `branchId` so a card links somewhere orderable.
- Schema: `orders.coupon_id` + `orders.discount_amd` (stored, not recomputed —
  a referral coupon's percentage grows, and a past order must keep saying what
  was actually charged), and `coupons` unique on `(user_id, code)` because a
  coupon code is personal. `ON DELETE SET NULL`, so deleting a coupon can never
  delete the order that used it.
- **349 tests** (up from 307).

**One bug found by the live run, not by the suite:** the discount was applied to
the total but missing from the order response, so the app could not show "you
saved 168֏". Fixed, with a regression test. The suite had asserted the maths and
the storage but never the shape of the reply.

**Also caught by lint, not by tests:** `AuthModule` imported `ReferralsModule`
without adding it to `imports`, which typechecks and passes every unit test but
fails at boot. Another instance of "a green build is not a working app".

**Verified live:** cross-language dish search, the price filter against real
menu averages (both restaurants average under 4 500֏, so `priceMin=4500`
correctly returns nothing), idempotent favourites, signup attribution, the
coupon surviving a quote and being spent by an order, 422 on reuse, the coupon
coming back after a cancellation, 84 points for an 8 400֏ subtotal, the inviter
credited exactly once, and 403 for guests on favourites and referrals.

**Not built:** the favourites, search and referral **screens** in `apps/mobile`,
and `POST /referrals/share` (sharing happens in the OS share sheet; there is
nothing for the server to do until share analytics are wanted).

### Phase 9 — `apps/web`: the public, indexable front door

`apps/web` is now a real Next.js 15 app (was a placeholder README): restaurant
listings, search, and the restaurant/menu pages the whole thing exists for.

- **The design follows from one rule: the HTML that leaves the server already
  contains the content.** Verified by stripping every `<script>` from a
  restaurant page — the name, menu and prices are still there. That is the
  reason this app is Next.js and not another Vite SPA.
- **Language moved into the URL, and this was the phase's real decision.** The
  app was first built the way the API works, negotiating `Accept-Language`.
  That is wrong here for one specific reason: a crawler sends a single header,
  so only one of the three languages would ever be indexed — defeating the
  purpose of building the app. Every page now lives under `/hy`, `/ru` or
  `/en`, linked with `hreflang` and `x-default`. `Accept-Language` is still
  consulted once, in middleware, to decide where a visitor at `/` lands.
  Recorded as an API convention in DEVELOPMENT_GUIDE.md, since it is the one
  place the project's own "resolve from the header" rule does not apply.
- **An unknown prefix is a 404, not a silent fallback** — `/de/r/x` must not
  serve Armenian at a URL that then gets indexed.
- **Pages are pre-rendered per restaurant per language** (`generateStaticParams`),
  with `dynamicParams` left on so a restaurant added after the build is still
  served and then cached. Data revalidates every 60s: short because `isOpen` is
  on these pages, where names and prices would tolerate hours.
- **JSON-LD `Restaurant` with the full menu**, so results can show the rating,
  address and price range rather than a bare link. Optional blocks are omitted
  rather than emitted empty — `aggregateRating` with a zero review count is
  invalid structured data, and a broken block costs more than a missing one.
- **`sitemap.xml` is generated from the API**, every restaurant × every
  language with alternates, and pages through the 50-item cap rather than
  assuming one request returns everything. A hand-kept list would go stale the
  first time a restaurant was added — the failure nobody notices.
- **Search is `noindex, follow`.** Per-query pages are near-infinite and
  duplicate the listings; `follow` keeps the restaurant links discoverable.
- **`packages/i18n` went from three empty `{}` files to real dictionaries** —
  only the keys web actually uses, per that package's own rule against
  speculative keys. `dictionaries` is now typed so every language must define
  the same keys: adding a string to one file and forgetting the others is a
  compile error rather than an Armenian word in an English page.
- 23 web tests, plus a live check of the rendered HTML: negotiation, three
  languages, canonical, hreflang, JSON-LD, title, description, robots, sitemap,
  404, and the no-JavaScript check.

**A bug the tests caught, in code from Phase 6.** `formatAmd` used
`toLocaleString('en-US').replace(/,/g, ' ')` — but the separator depends on the
runtime's ICU data: the same call returns `5,800` in one Node process and
`5 800` (U+202F, a narrow no-break space) in another, where the replace
silently does nothing. Both `apps/web` and `apps/admin` now group digits
directly, so the output is identical on every machine. The admin test had been
passing by luck.

**Not built:** the ordering and booking flow on web. It exists in
`apps/mobile`, and duplicating checkout, payment and tracking would be a second
implementation of the riskiest code in the product for no new capability — the
restaurant pages link to the app instead. Written down rather than silently
skipped.

### Phase 10 — Platform administration (the last roadmap phase)

`GET /admin/metrics`, `/admin/metrics/reconciliation`, `/admin/users`,
`PATCH /admin/users/{id}/role`, `POST /admin/restaurants`, `POST /admin/promos`,
plus three admin-only tabs in `apps/admin`.

- **Changing a role revokes every session that account holds.** This is the
  piece that mattered. Access tokens carry `role` so a guard never has to touch
  the database — which means a demoted account keeps its old powers until the
  token expires, and a token cannot be recalled. Revoking the refresh tokens
  bounds that window to the 15-minute access TTL instead of leaving it open for
  30 days. Added `RedisService.deleteByPattern`, using **SCAN and not KEYS**:
  `KEYS` walks the whole keyspace in one blocking call and stalls every other
  client.
- **Four refusals on a role change**, each protecting a state the platform
  cannot recover from: your own role (an admin who demotes themselves loses the
  panel), a guest or unverified account (staff powers to an anonymous device),
  the last administrator (nobody could restore one), and an owner who still has
  restaurants (they would be unmanageable). `guest` is rejected as a target
  role because it is the `is_guest` flag, not a database role.
- **Revenue counts `paid` and later only.** A `created` order is an abandoned
  basket and a `cancelled` one was refunded; counting either would misreport
  the business in both directions. Aggregates run in SQL and in parallel —
  pulling orders into Node to sum them works on seed data and falls over on a
  real month.
- **A reconciliation view** for payments and orders that disagree. Empty is the
  expected answer, and it is where the "refunded but failed to cancel" case
  from Phase 4 surfaces instead of living only in a log line.
- **Phone numbers are masked in the admin user list.** An admin screen is not a
  reason to hand out every number in full — the same instinct as "no PII in
  logs".
- **Promos demand exactly one kind of discount**, cap percentages at the same
  25% as stacked referrals, target only verified non-guest accounts, and report
  what was actually created rather than what was asked for. Re-issuing a code
  tops up accounts that joined since and skips those who already hold it.
- **Creating a restaurant refuses an owner id that is not an owner** — it would
  produce a restaurant whose "owner" cannot open it in the panel. The slug is
  constrained to lowercase hyphenated words because it becomes a public URL on
  `apps/web`.
- The panel's admin tabs are gated on the role from `GET /me`, and each screen
  is guarded on `isAdmin` as well as on the active tab, so a stale tab value in
  a demoted session cannot render an admin screen. The API enforces all of it
  independently; the UI only avoids offering dead ends.
- A **demo admin** (`+37400000001`) joins the demo owner in the seed. There is
  no bootstrap path for the first admin otherwise, and creating one by hand in
  SQL is how a production credential ends up undocumented.
- **379 tests** (up from 349).

**A bug the tests caught:** `abandonedPct` could go negative. The three counts
behind it are separate queries, so an order cancelled between them makes the
arithmetic underflow — and a dashboard reading "-60% abandoned" is worse than a
rounding error. Clamped, with a test that names the race.

**Verified live**, including every refusal: the metrics against real seeded
data, masked phones, a promotion revoking the old refresh token (401 on reuse),
the promoted user's pre-promotion token still being refused by the owner queue
until they sign in again, all four role guards, duplicate and malformed slugs,
a customer as owner id, promo validation, a promo actually discounting an order
(4 200 → 420 off), and 403 for customer, guest and owner on every admin route.
The last-administrator guard is covered by unit test rather than live, because
the self-change refusal fires first when an admin targets themselves.

**Deliberately not built**, and written down rather than skipped quietly:
- **Review moderation.** There is no review API at all — moderating content that
  cannot be created would be theatre.
- **Editable platform settings** (fees, deposit rates). They live in
  `packages/shared/src/constants.ts`; making them editable means moving pricing
  into the database, which changes how every order is priced rather than adding
  a screen. It stays an open question with the numbers it affects.

### Design tokens moved into `packages/ui`

The palette was hand-copied into three files — `apps/mobile/src/theme/tokens.ts`,
`apps/admin/src/styles.css` and `apps/web/src/app/globals.css`. Changing the
accent colour meant three edits, and nothing caught a missed one: the phone and
the website could disagree about the brand colour with every test still green.
`packages/ui` had existed since the first commit for exactly this and was empty.

- **One source:** `packages/ui/src/tokens.ts`. Mobile imports the objects
  (React Native needs numbers, not CSS strings); web and admin `@import` a
  `tokens.css` **generated** from it.
- **The generated files are checked in, and a test compares them against the
  generator.** Editing the source and forgetting to regenerate fails the test
  rather than shipping a mismatch. Verified by deliberately corrupting a
  generated file and watching the test go red, then restoring it — a drift test
  nobody has seen fail is not evidence of anything.
- App-specific values that are *not* design-system tokens stay in that app's own
  stylesheet, layered on top: web keeps its wider corner radius, the back office
  its tighter one. Admin's `--bad` and `--hit` now alias the generated
  `--destructive` and `--hit-target` instead of restating the values.
- The generator emits both themes plus `[data-theme]` overrides, so an explicit
  theme choice beats the system preference — the apps offer a switch.
- 10 tests, including "both themes define the same keys" and "these four values
  match what DESIGN_SYSTEM.md quotes", so a silent edit makes the documentation
  wrong rather than merely stale.

Also fixed while looking at the web app: **every internal link was a plain
`<a href>`, so each click reloaded the page.** The comment justifying it claimed
crawlers need real anchors — true, but `next/link` renders exactly the same
`<a href>` into the HTML while also giving client-side navigation. The
justification was simply wrong, and the site gave up navigation for nothing.
All internal links now use `next/link`; `tel:` stays a plain anchor because it
leaves the app. The search form became the site's only client component,
progressively enhanced: `action`/`method` still work with JavaScript off, and
`router.push` upgrades the same submit to a client navigation. Re-verified that
the HTML still carries real `href`s, that content survives with every `<script>`
stripped, and that canonical, `hreflang` and JSON-LD are untouched.

### Reconciled with the design artifacts

Unpacked both artifacts and diffed them against the code. Findings, in order of
how much they matter:

- **There are two artifacts, not one.** The mobile app (820×1020, 12 screens) is
  the one `DESIGN_SYSTEM.md` and `SCREENS.md` were transcribed from. A **web
  landing** (1280×860) is new and had never been looked at.
- **Business numbers are unchanged** — service fee `0.9`, the `n×400/10×10`
  money formula, `2%`, `25%`, `480s`. Nothing implemented needs revisiting.
- **The palette matches exactly**, all 26 values, except four opacities where
  the two artifacts disagree with *each other* (`shadow`, `glass`). Recorded in
  DESIGN_SYSTEM.md with the mobile artifact named as authoritative, since it is
  the fuller design and what every app already matches.
- **Two tokens were missing** and are now in `packages/ui`: `glass` (translucent
  surface over photos) and `placeholder2` (the skeleton shimmer needs both
  stops — with one, the gradient has nowhere to travel). `--stage` was
  deliberately **not** added: it is the backdrop around the phone in the
  mockup, design-tool chrome rather than a product surface.
- **The web design contradicts a Phase 9 decision.** It contains a cart,
  ready-time pills, payment methods and an order-confirmed modal — ordering on
  the web, which Phase 9 explicitly deferred on the grounds that it would be a
  second implementation of the riskiest code. Surfaced rather than quietly
  resolved either way; hero and footer were built first by agreement, and
  ordering stays open.

Built from the web design:

- **Hero** — the promo badge, headline, subheading and CTA, in all three
  languages with the artifact's own copy. The CTA is an in-page anchor to the
  restaurant list, so it works with JavaScript off.
- **Footer** — three columns, blurb, copyright and "Made in Armenia". The
  column items render as **plain text, not links**: every destination the design
  lists (About us, Careers, Gift cards, Terms) is a page that does not exist,
  and a footer of dead links on the one app built for crawlers is worse than a
  footer of labels. They become links when the pages do.
- `packages/i18n` gained 13 keys × 3 languages, taken verbatim from the
  artifact rather than translated afresh.

Verified live in all three languages, and that the hero and footer text still
survive with every `<script>` stripped.

- **A light/dark toggle** on the web, matching the design's per-screen switch.
  It cost almost nothing because the tokens already carry it: the CSS generator
  emits `:root[data-theme='…']` blocks that beat `prefers-color-scheme`, so the
  toggle sets one attribute on `<html>` and stores the choice. A pre-paint inline
  script in the layout applies the stored theme before the first frame, so there
  is no flash of the wrong theme; `<html suppressHydrationWarning>` plus a
  neutral SSR glyph keep React from flagging the attribute the script writes.
  Still outstanding from the web design: the quick-filter chips, and the
  ordering flow (the open product question above).

- **Pre-merge review caught a bug that broke the mobile app while every test,
  typecheck and web build stayed green.** `packages/ui/src/index.ts` re-exported
  `./tokens.js` and `./css.js` with the `.js` extension (added earlier so Node
  could run the *compiled* CSS generator from `dist`). But `apps/mobile` imports
  `@amragrir/ui` **from source** — its `main` is `src/index.ts` — and Metro does
  not map a `./tokens.js` specifier to `tokens.ts` ("Unable to resolve module
  ./tokens.js"), so the app failed to bundle. Nothing caught it: the TS compiler
  and Vitest both resolve the extension, the web/admin builds never touch this
  barrel, and the mobile tests do not import the theme chain. Fix: the barrel now
  re-exports `./tokens` with **no** extension and no longer re-exports the CSS
  generator at all — it is web/build-only (its compiled form is imported directly
  by `scripts/build-css.mjs` and the drift test), and re-exporting it also dragged
  css.ts's own `./tokens.js` import into the mobile graph. Added two guard tests
  (no `.js` extensions in the barrel; the generator is not re-exported) and
  confirmed the fix by bundling for Android end-to-end: **1244 modules, exported
  cleanly** — the same command that had failed.

- **The live smoke caught a second bug the earlier "verification" had missed:
  the pre-paint theme script was broken on every page.** `THEME_KEY` was exported
  from `ThemeToggle.tsx`, a `'use client'` module, and the Server-Component layout
  imported it to inline into the `<head>` script. A Server Component importing a
  value from a client module gets a **client-reference proxy**, not the string —
  and interpolating it (`getItem('${THEME_KEY}')`) stringified the proxy, so the
  rendered script read `getItem('function () { throw new Error("Attempted to call
  THEME_KEY() from the server …") }')`: malformed JavaScript that threw at parse
  time and applied no theme. The flash-of-wrong-theme guard the whole toggle was
  built around silently did nothing, and the stored choice never survived a
  reload (the toggle wrote `amragrir.theme`; the script read garbage). The prior
  check had confirmed the script's *position* but never its *content*. Fix:
  `THEME_KEY` (and the `Theme` type) moved to a plain module `src/lib/theme.ts`
  that both the server layout and the client toggle import, so the server gets
  the literal. Added guard tests (the key module carries no `'use client'`
  directive; the layout imports the key from `@/lib/theme`, not the component)
  and re-verified live: the rendered script now reads
  `getItem('amragrir.theme')`, with no proxy leak, before `<body>`.

### Home quick-filter chips (2026-07-24)

The last outstanding piece of the web design's landing: six filter chips on the
home listing, each wired to a real `/restaurants` query parameter so none is
decorative.

- **Chips are real links, filtered.** Open now, Top rated, Ready soonest,
  Pickup, Reserve, Dine-in render as `<Link>`s to `/[lang]?…` — they work with
  JavaScript off and a crawler follows them; with JS they upgrade to client
  navigation. The server owns the filtering (the listing itself narrows, not
  just the chip row — verified live: `?service=reserve` drops the pickup-only
  branch). Sort chips are mutually exclusive; service chips combine (`hasSome`).
- **One small, honest API addition.** `/restaurants` gained an `openNow` flag
  (`1`/`true` → filters on the branch `isOpen`); a malformed value applies no
  filter rather than 400ing. Everything else the chips need already existed
  (`sort`, `service[]`). "Ready soonest" is `sort=fastest` — an honest label for
  a prep-time sort, not the design's "Ready in 15 min", which would need a hard
  prep filter that does not exist.
- **A filtered home is `noindex, follow`, canonical → bare `/[lang]`.** Same
  reasoning as search: filter permutations are near-infinite and duplicate the
  listing, so only the unfiltered landing is indexed and link equity
  consolidates there.
- **"Near me" is deliberately not built.** It needs the visitor's coordinates,
  which only the browser can supply — a client geolocation flow, not a
  server-rendered link. Deferred rather than faked.
- Filter state lives in one pure module (`lib/filters.ts`: parse, toggle,
  serialize, map to API params) with 14 unit tests; a service test proves
  `openNow` filters on `isOpen`. Updated: API_DOCUMENTATION.md, apps/web/README.

## 2026-07-21 — Initial documentation set

- Added the full `/docs` set derived from the app design: PROJECT_OVERVIEW,
  BUSINESS_LOGIC, USER_FLOW, ROLES_AND_PERMISSIONS, DESIGN_SYSTEM, SCREENS,
  COMPONENTS, DATABASE, API_DOCUMENTATION, DEVELOPMENT_GUIDE, AI_CONTEXT.
- Added `.cursor/rules/project-rules.md` and a root agent-instructions file so
  every AI assistant keeps docs synchronized with the implementation on every
  change, plus this CHANGELOG to track what changed and why.
