# Changelog

> Every product/business-logic/schema/API/UI change gets a dated entry here —
> see "Keeping documentation in sync" in [AI_CONTEXT.md](./AI_CONTEXT.md) for
> which doc file to update alongside it. Loosely follows
> [Keep a Changelog](https://keepachangelog.com/). Dates: `YYYY-MM-DD`.

## [Unreleased]

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

### Reconciled with the Claude Design artifacts

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
- Added `.cursor/rules/project-rules.md` and root `CLAUDE.md` so both Cursor
  and Claude Code keep docs synchronized with the implementation on every
  change, plus this CHANGELOG to track what changed and why.
