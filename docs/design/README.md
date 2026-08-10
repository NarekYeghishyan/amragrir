# Design sources

The design artifacts themselves, as HTML, so that a claim about the
design can be **checked** rather than taken on trust.

Until this folder existed, the artifacts were opened once, distilled into
`DESIGN_SYSTEM.md` / `SCREENS.md` / `COMPONENTS.md`, and then gone. The cost
showed up immediately: `DESIGN_SYSTEM.md` had to record in prose that the two
artifacts disagree about four opacity values, because there was no longer
anything to re-read. Anything derived from a design belongs in those documents;
this folder is what those documents were derived *from*.

| File | Artifact | Canvas | In repo since |
|---|---|---|---|
| `Amragrir Web (standalone).html` | Web app | 1280×860, 6 screens + 3 overlays | 2026-08-05 |
| `Amragrir (mob).dc.html` | Mobile app | 820×1020, 12 screens | 2026-08-04 |

`Amragrir Web (standalone).html` **replaces `web-landing.html`**, which is
deleted: it is the same design carried forward — same tokens, same header, same
hero, cards and footer — plus the screens the landing artifact never had. Its
contents are in a bundle rather than plain markup; unpack it with the
`__bundler/manifest` and `__bundler/template` script blocks at the end of the
file (gzip + base64, and a JSON string, respectively).

**The mobile artifact is authoritative** where the two disagree — it is the
fuller design and the one every app already matches.

It arrives with two files it imports, both stored beside it and **neither of
them product code**: `ios-frame.jsx` is the iPhone bezel and status bar the
mockup is drawn inside (it says so itself — `@ds-adherence-ignore`, "omelette
starter scaffold"), and `support.js` is the generated `sc-if`/`sc-for` runtime
that makes the file interactive in a browser. React Native supplies the first
and has no need of the second; they are kept only so the artifact still opens.

Unlike the landing artifact, this one is a **`.dc.html` with three controls** —
`signature` (Amber/Coral/Forest/Indigo), `surface` (Warm cream/Paper
white/Cool slate) and `depth` (Soft & floaty/Crisp & flat/Bold shadows). The
defaults are Amber, Warm cream and Soft & floaty, and those are the values
`packages/ui` holds; the other options are exploration, not alternatives that
were adopted.

## Refreshing one

Export the HTML from the artifact and overwrite the file in place, keeping the
name. Then re-read it against the code and update whatever moved — the diff is
the point of storing it. A published artifact URL is not a substitute: it is not
versioned, it can change under a reader, and access to it is not guaranteed.

## What `Amragrir Web (standalone).html` actually contains

Six screens — `home`, `restaurant`, `basket`, `checkout`, `profile` and a
designed **404** — plus three overlays: the location picker, a restaurant admin
panel, and the order-confirmed modal. Six mock restaurants, five dishes, three
languages, light and dark. Everything the deleted landing artifact drew is still
here unchanged; the basket, checkout, profile, 404 and location picker are new.

### Re-read screen by screen, 2026-08-06 (second pass)

The reconciliation below recorded which *screens* had been built. This pass
compared the built screens against the artifact's own measurements and found
eight places where what shipped was not what is drawn. All eight are now
transcribed:

- **The header basket was the wrong control.** The artifact draws a solid accent
  pill with a cart glyph, the running total and a count badge; the app drew a
  44px outline circle with a 🧺 in it, and hid it entirely when the basket was
  empty. It is now the pill, and it always has its place. The total comes from
  the `GET /[lang]/basket` route handler `OrderPanel` already reads — formatted
  strings, so the header still computes no money and the catalogue is still
  pre-rendered.
- **Every screen was laid out on the catalogue's 1220px.** The artifact draws the
  basket on 900 and the checkout on 980, both centred; both were running the full
  width and sitting left with dead space beside them. See "Web page columns" in
  `DESIGN_SYSTEM.md`.
- **The dish card's `＋` sat beside the text column** rather than on the foot row
  with the price, so it floated level with the dish's name.
- **Basket lines were rows in one flat list.** The artifact gives each line its
  own lifted card with the dish's photo on it.
- **Steppers were two identical grey buttons.** `DESIGN_SYSTEM.md` had recorded
  the artifact's lopsided pair — `+` accent on white, `−` a quiet chip — since
  before the web app existed; the web had simply never followed its own doc.
- **The summary column was a box inside a box.** The `<aside>` is already a card;
  the artifact puts plain rows in it. The bordered `<dl>` nested inside it read
  as a mistake on the basket, the checkout *and* the restaurant panel.
- **Checkout controls were off by a few pixels each** — payment rows at radius 16
  flooding with `--accent-soft` where the artifact thickens the border on
  `--card`, 18px radio dots for 20, mode tiles at 18/16px for 16/14 — and the
  mode tiles did not line up, because the grid items are the `<form>`s and the
  buttons inside them were not filling one.
- **The profile hero had no disc.** The artifact bleeds the same translucent
  circle off its corner as the home hero.

Two things were **deliberately not** made to match. The restaurant page keeps its
small "order ahead / call" card, which the artifact does not draw: the order
panel beside it is drawn in the browser, so with JavaScript off that card is the
only route from a restaurant to its basket, and the phone number is worth
offering to somebody who would rather ask a person. It is now the site's ordinary
card chrome rather than the accent-soft panel it was, which read as a second hero
on a page whose subject is the food. *(Reversed by the seventh pass above — the
card is removed, and its premise was wrong: the header's basket pill is a plain
anchor in the server's markup on every page.)* And the footer still renders on
every screen where the artifact draws it only on home — a real site's footer is
not a home-page ornament.

Also cleaned out in this pass: `.sticky-cta`, dead since `StickyBasket` was
deleted, and an empty "Narrower screens" section header. Two responsive faults
the artifact's fixed 1280 canvas could not have shown were fixed on the way: the
header dropped the account mark onto a line of its own around 820px (the district
name now truncates instead), and a basket line overflowed the viewport below
560px (it now stacks into two rows).

### The restaurant page, reconciled against the drawing, 2026-08-06 (seventh pass)

Read side by side with the artifact's `restaurant` screen, the page differed in
four places. Two were measurements, two were decisions taken earlier and worth
re-examining rather than defending:

- **The title sat 52px under the banner where the drawing puts it at 26.**
  `.rest-head` carried a `margin-top:26px` of its own inside `.rest-grid`, which
  already has one. Every other measurement on this page — the 280px banner at
  radius 24, `1fr 380px` at gap 34, the 104px dish thumbnail at radius 15, the
  pills at 10/18 and radius 22 — already matched.
- **The tabs now filter, as drawn**, and no longer scroll. The reasoning for the
  anchors was that the whole menu must reach a crawler; that was right, and it
  never required the tabs to *look* different. They filter in CSS — a radio per
  pill, `:has(:checked)` choosing the section — so the markup still carries every
  section and the tabs still work without JavaScript. The rule sits behind
  `@supports selector(:has(*))`, because a browser that applied the hiding but
  not the un-hiding would draw a menu with no dishes in it.
- **Section headings are no longer drawn.** The pill above the grid says the same
  word. They stay in the markup: a flat run of cards under four pills has no
  structure for a crawler or a screen reader, and the heading costs nothing to
  keep.
- **The "order ahead / call" card is removed.** The artifact draws nothing there,
  and the justification recorded below for keeping it — "with JavaScript off that
  card is the only route from a restaurant to its basket" — was not true: the
  header's basket pill renders as `<a href="/[lang]/cart">` in the server's
  markup on every page. What went with it is the phone number, which the artifact
  does not put on this screen either; the branch's number is still in the page's
  JSON-LD as `telephone`, so it remains machine-readable.

What was **not** changed, and why: the artifact's meta line and its `📍` chip
both read a distance (`0.4 km`). Distance needs the visitor's coordinates, which
live in a cookie — and a `cookies()` call on this route would opt all 69
pre-rendered restaurant pages out of static rendering, which is the trade this
app does not make. The chip shows the branch's street address instead, which is
true for everybody and free.

### The district chips are gone, 2026-08-06 (sixth pass)

The row of district chips has been removed from the picker — the `radiogroup`
that held "all districts" and the artifact's six. What it cost and what was done
about it, because two of the three are not obvious:

- **Choosing a location now needs JavaScript.** Those chips were `<label>`s over
  radios, and they were the whole no-script story: the browser tracked the
  selection, `confirm` posted it as `preset`, and `chooseLocation` read it. Every
  control that remains — the map, address search, geolocation, recents — needs a
  browser. A scriptless reader can still open, read and close the dialog, and
  what confirm posts there is an empty place, which is the whole city: the state
  they were already in. Nothing traps them and no listing breaks; distance
  ranking is simply unavailable, as it is for anyone who has not answered.
  `preset` was deleted from `chooseLocation` with the last form that sent it.
- **The un-choose had to be rebuilt.** "All districts" was a chip in that row,
  and it was the only way back to the whole city — the third pass below kept it
  for exactly that reason, and removing the row would have made a first choice
  permanent. It is now a ✕ on the glass badge that names the pending place: the
  same job, on the element that states what it undoes.
- **The search box no longer renders without a geocoder key.** With no key it
  never searched addresses; it filtered the district chips instead, which is why
  it had a placeholder of its own (`locSearchPlaceholder`, deleted with
  `locDistricts` and `locAddressSearchOff`). With nothing left to filter, typing
  in it could not affect anything on the screen, and a box that answers nothing
  is worse than no box. An unkeyed deployment is now map, recents and confirm.

`AREAS` stays. The six districts are still the vocabulary the app names points
in — `nearestArea` labels a tapped point when no geocoder can do better, and
`DrawnMap` still draws their pins — they are just no longer a control.

### The map is a frame, not a script, 2026-08-06 (fifth pass)

The pass below put a real map behind the picker and made it Yandex's **JS API
v3**, which needs a key. Nobody had one, so what the dialog actually showed was
the fallback — a drawing of a city that is not Yerevan, with six pins on it.
That is the wrong trade for a control whose whole job is "where are you": the
map is now **Yandex's public map widget in an `<iframe>`**, which needs no key,
no quota and no script on the page, and therefore works in every deployment
including this one.

The cost is that a cross-origin frame cannot be read. A tap inside it is
Yandex's tap and a pan inside it is Yandex's pan, and neither is reportable out
here — a frame left interactive would show one place while the pin claimed
another. So the frame is `inert` and the app owns the viewport: the pin is an
element drawn over the frame, panning is a CSS transform of a frame deliberately
larger than its box, and `lib/map-frame.ts` projects pixels to coordinates in
the ellipsoidal Mercator Yandex's tiles use. Tapping chooses; dragging looks
around and chooses nothing; neither reloads the widget.

Two things follow that the pass below got the other way round. The drawing is no
longer a *fallback for a missing key* — there is no key — it is the placeholder
until the frame is built, and the whole map on a page with no JavaScript; the
"map unavailable" note went with the reasoning, because a frame cannot honestly
report that it failed. And the frame is built only when the dialog opens: an
iframe inside a closed `<details>` still loads, and this control is in the header
of every page on the site.

Two things the widget draws for itself had to be drawn again, because the bleed
that makes panning free pushes the frame's own corners out of sight: its
attribution, now a link to the same view on `yandex.ru/maps`, and its dark
scheme, now asked for in the URL — a frame inherits none of this page's tokens,
and a dark page was opening a dialog with a white rectangle in the middle of it.

### The picker's map is a real one, 2026-08-06 (fourth pass)

The pass below transcribed the artifact's dialog and kept its drawing of a city.
The drawing is now the **fallback**, and what the dialog shows is Yandex's map
(JS API v3) with a pin the visitor can put anywhere on it. Three things follow,
and they are product decisions rather than transcription:

- **What is stored is a point**, not one of six districts — `lat`, `lng` and a
  name. `GET /restaurants` always took a coordinate; the district was a way of
  producing one without a map.
- **The six districts are presets.** They are what a reader with no JavaScript
  has, what a deployment with no map key has, and six fewer taps for the answer
  most people want. The artifact's own six, unchanged. *(Reversed by the sixth
  pass above — the chips are removed and choosing needs JavaScript. The
  paragraph stands as what was thought at the time.)*
- **Recently chosen points sit under the search box** — not in the artifact at
  all, and not derivable from it. It draws a search box that does not search and
  chips that are the whole vocabulary; once the vocabulary is every point in
  Yerevan, a history is what makes the second visit shorter than the first.

The artifact's drawn map survives in `LocationPicker`'s `DrawnMap`, unchanged
and still fitted rather than sliced. It is what renders with no
`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, and what the dialog falls back to when the
script will not load — with a note saying the map is unavailable, rather than
letting a decorative drawing pass for a map somebody might try to tap.

### The location picker is now the artifact's dialog, 2026-08-06 (third pass)

The entry below records the picker being built as a `<details>` dropdown of six
districts, on the reasoning that the artifact's dialog needed a map nobody could
draw. Half of that was wrong: **its map is not a map.** It is a hand-drawn SVG of
five streets and a river, and the only things on it that mean anything are the
six pins — which are the same six districts the dropdown already listed. There is
no tile provider in it to go and find. So the overlay is transcribed as drawn:
760×640 over a 50% scrim, head with title, hint and ✕, the search box and
district chips floating over the map, the chosen district on a glass badge, and
"use current location" beside a full-width confirm.

Two of its three "unbuildable" controls were the same mistake. Its **search box**
does not geocode — `locQuery` filters `LOCATIONS` by name, which is a filter over
six strings. And **"use current location"** is a browser permission prompt, which
a *server-rendered page* cannot ask for but this control can: it has been a
client component since the day it was built, for an unrelated reason. It now asks
the browser and resolves the answer to the nearest district (`nearestArea()` in
`lib/locations.ts`), because a district is what the cookie holds.

**Three deliberate departures**, all recorded rather than quietly taken:

- **The map is fitted, not sliced.** The artifact writes
  `preserveAspectRatio="xMidYMid slice"` on a 400×340 drawing in a panel twice as
  wide as it is tall, which crops 45% of the height — and takes Cascade's and
  Shengavit's pins off the screen with it. Two of six districts with no pin is a
  fault its own 1280×860 canvas would have shown, so it is `meet`, with every
  street extended past the viewBox to fill the margin fitting leaves.
- **"All districts" is kept.** The artifact offers six districts and no way back
  out of them; somebody who has chosen one must be able to un-choose it. *(The
  reasoning is kept and the chip is not — see the sixth pass above: the un-choose
  is now a ✕ on the badge.)*
- **Nothing is stored until confirm**, which *is* the artifact's behaviour
  (`pendingLoc` → `confirmLoc`) and is worth naming, because the dropdown it
  replaces wrote on every press.

The header lost its `backdrop-filter` while the dialog is open. That is not
taste: a `backdrop-filter` makes its element the containing block for every
fixed-position descendant, and the dialog lives inside the header — without the
rule its overlay is trapped in a 72px strip at the top of the page.

### Reconciled against the code, 2026-08-06

Built from this refresh: the **404** (previously a bare heading; the artwork,
copy and CTA are transcribed, and a catch-all route was added because an unknown
URL was reaching Next's own error page rather than this one), the **location
picker** in the header, the **profile** screen, the **favourites** list its
account menu links to, the **account mark** in the header, and the basket's
**sticky order summary**. `apps/web/README.md` describes how each is wired.

**The location picker is a district list, not the artifact's map.** *(Reversed
by the pass above — the dialog, its map, its search box and its "use current
location" are all built. The paragraph stands as what was thought at the time.)*
The map it draws is a hand-drawn SVG of nothing in particular, and a real one
needs a tile provider this product has not chosen; "use current location" needs
the browser's geolocation permission, which a server-rendered page cannot ask
for. What the control is *for* survives intact: `/restaurants` computes
`distanceKm` and can sort by it only for a caller that sends `lat`/`lng`, and
this app had none — so every card's distance was blank and `sort=nearest` was
unreachable. Six district centres fix that, and the artifact's own six districts
are the six. The address search box is not built for the same reason as the map:
nothing geocodes.

**Its admin panel is not built, and it agrees with the code.** The artifact
hides its own entry point (`display:none` on the gear), the real panel is
`apps/admin`, and its three toggles are the same rule this repo already ships
under different names: artifact `dineIn` ("reserve a table, served by waiters")
is our `reserve`, artifact `eatIn` ("order at the counter and eat in") is our
`dinein`, and its stated rule — "enabling one automatically disables the other"
— is `SERVICE_EXCLUDES` exactly. Worth recording as independent agreement rather
than as a gap.

**Three profile rows are deliberately absent.** Saved addresses (there are no
couriers), stored payment methods (`GET /payment-methods` lists what the
platform accepts, not cards anybody has saved) and a help centre (no content to
link to). Reward points **are** built: `GET /me` reports `rewardPoints`, so the
note under the mobile artifact below — that no endpoint reports them — was only
ever true of that screen's other counters.

**The account mark carries a person, not an initial.** The header renders in the
root layout, which may not read the session cookie: it is httpOnly by design,
and a `cookies()` call there would opt all 69 restaurant pages out of
pre-rendering. The same constraint shapes the location control, which reads its
(deliberately readable) cookie in the browser like `BasketButton` does.

**Still contradicting the code, unchanged from the landing artifact:** cash is
still in `payNames`, and `PaymentMethod` still has no such value — an order is
paid before the kitchen sees it (BUSINESS_LOGIC.md §5). The design is wrong
here, not the code.

**The sticky order panel on the restaurant page is now built** — the one thing
this folder had recorded as deliberately not transcribed, twice. The refresh
draws it a third time, with a "Book a Table" button on top of it, and it turns
out the trade it was refused over was a false one.

The objection was that the panel needs the basket, reading the basket needs
`cookies()`, and one `cookies()` call in that page turns 69 pre-rendered
restaurant pages into a render per request. All true — of reading it *in the
page*. The panel is a client component that asks `GET /[lang]/basket`, a route
handler which reads the cookie, calls `POST /cart/quote` and returns the lines
and totals **already formatted as strings**. The page stays static HTML, the
browser fills the panel in, and the second objection — that pricing in the
browser would mean a total the client computed — never arises, because the
client is handed `"1 860 ֏"` and has nothing to add up. It is the same trade
`BasketButton` already made for the header badge, taken one step further.

What is *not* the artifact's: it draws two columns of dish cards beside a 380px
panel at 1280px, which is 40px narrower per card than the artifact's own dish
card. The dishes drop to one column below 1180px instead.

**Its checkout is one page, and now so is ours.** The artifact draws mode,
pickup type, timing and payment in one column with the order summary sticky
beside them; this app had that split across `/preorder` and a `/checkout`
drawer, which is why the screen looked nothing like the drawing. Merged:
`/preorder` redirects into `/checkout`, the intercepting drawer route and
`CheckoutPanel` are gone, and the payment radios keep their cross-column CTA
through `form="…"` so paying is still one native POST. Its **pickup type** rows
— indented behind a rule, a ✓ on the chosen one, an arrow and a "needs booking"
badge on the one that leads to the calendar — are transcribed as drawn.

Two controls on it were deliberately not: **the ready-time clock field** and
**the `datetime-local` booking field**. The pills came from
`readyTimeOptions(earliestReadyAt)` and the slot grid from `GET /availability` —
in both cases the set the API will actually accept, where a free-form clock lets
somebody pick 03:00 and be refused at the payment. *(Reversed 2026-08-07 — both
fields are now transcribed as drawn; see below.)*

### The basket says which restaurant, 2026-08-08 (tenth pass)

A departure from the web artifact, asked for and taken deliberately. The
artifact opens its basket with a back button reading "← Back", a 32px title and
a grey subline of `restName · restPrep`, and that is every word it gives the
restaurant. The web had transcribed it faithfully but put the restaurant's
**name in the back button** as well, so the screen said "Lavash" twice, in two
greys, and still could not answer the two questions somebody about to pay
actually has: *which address am I collecting from*, and *is the kitchen open*.

**The subline is now the basket** — dish count and service mode — and the
restaurant gets a card of its own, `BranchCard`: cover, name, cuisine · price
level, rating, and a tag row carrying the prep time, the address and
Open/Closed. It is the link back to the menu, so the back button came off; a
chip above a card that leads to the same page was the duplication, not the
navigation.

This is **not an invention** — `SCREENS.md` § 4 has specified a "restaurant
banner (photo, rating, meta, prep, distance)" on the basket since before the web
app existed, from the mobile artifact, which is the authoritative one where the
two disagree (see the top of this file). The web simply never had it. The card
is built from the catalogue's own parts (`.media`, `.tag`, `.tag.prep`,
`.tag.good`) rather than a second visual language.

Two more things went with it, both fixes rather than departures:

- **Basket lines carry their photographs.** The artifact draws a photo on every
  line and the code has always had the markup for one — but `POST /cart/quote`
  does not return `photoUrl`, so every line in the running app drew the hatch
  placeholder. The photos are merged in from the branch's menu, which is a
  cached GET the restaurant page already makes.
- **The line's two-row layout is now the layout at every width.** It existed
  already, below 560px, with the note that five things in one row "leave the
  dish's name about five pixels". That is just as true at 1440: the basket
  column is 476px and the photo, stepper, total and remove button take 347 of
  them. The card and its height are unchanged — the photo is taller than both
  rows together.

### A lone option is drawn, not hidden, 2026-08-07 (ninth pass)

Two blocks on the checkout can end up with one entry, and the artifact treats
them inconsistently. Its **mode tiles** map `modeKeys` with no minimum, so a
restaurant offering only pre-order draws a single "Pre-order" tile — the state
the screenshot of Noba Sushi shows. Its **pickup type** section is gated on
`subKeys.length > 1`, so a take-away-only restaurant draws none at all.

**We follow the first everywhere.** A single tile is not a question and is not
pretending to be one: it names what is about to happen, ticked, with nothing
beside it. Hiding it instead loses the statement — a take-away-only checkout
went from the mode straight to the clock, so *what happens to this food* was
answered nowhere, which is the one thing that block exists to say. The mode row
had the mirror of the same problem for one afternoon on 2026-08-07, when it was
dropped wherever bookings were unavailable and left the screen opening on
"Pickup type" with nothing above it.

**A deliberate departure, in one direction only.** Where the API names no
ending at all — a restaurant that has declared nothing, so `pickupOptions` is
empty — the section still does not appear. There is no ending to state, and
inventing "Takeaway" there would be the screen answering a question the API
did not.

### Both clock fields are the artifact's now, 2026-08-07 (eighth pass)

The two departures above are closed. The checkout draws the artifact's **"Date &
time"** field (a `datetime-local` at `step=1800`, calendar glyph, 50px row) and
its **"Ready at"** field (an `<input type="time">` at `step=900`, clock glyph),
and the day pager, the reservation slot grid and the ready-time pills are gone.

**What the objection got right, and what it missed.** It was right that a field
can name a time the API refuses — that is now the screen's behaviour, and it is
handled rather than avoided: `min`, `max` and `step` keep the
obviously-impossible out of the browser's own picker, and `POST /reservations`
answers the rest (a closed day, an off-grid minute, a party no table seats, a
table already taken) with a 422 the page draws above the fold. What it missed is
that the grid was never free of that either — a slot could be taken between
drawing it and pressing it, which is the `slot_taken` path that already existed.
The honest difference is **discoverability**: the grid showed which times were
free and the field does not, and that is the cost of the drawing.

Three things had to move with them, none of them cosmetic:

- **The party size lives in the basket cookie, not the URL.** It was a row of
  links, and a link is a fresh GET — which would redraw the page with the
  date-and-time field emptied, since a native field holds its value nowhere else.
  The chips are submit buttons in the same form now, and `Cart.reservedFor` /
  `Cart.guests` keep what was typed across that round trip, across `/signin`, and
  across a refused booking.
- **The left column is one form with an `intent`.** Every control below the mode
  tiles posts it, so nothing on the screen can empty anything else on it. The
  CTA sits in the other column and owns the form by `form="…"`, exactly as the
  payment radios already did. It is `intent` on the button rather than a
  `formAction` per button because React encodes which action a `formAction`
  names in that button's own `name`, and the party chips need theirs.
- **"As soon as possible" is an empty field**, with a hint saying so. The pill
  that used to carry it is gone and the artifact draws nothing in its place, but
  the meaning is real — no `readyAt` at all is what `POST /orders` reads as "as
  soon as you can" — and an empty `--:--` cannot say it by itself.

**Still not the artifact's, and now recorded rather than assumed:** its guest
**stepper**. The chips are kept because the deposit beside them is the server's
(`depositAmd` for that party) and each press is a round trip that refetches it;
a `−`/`+` pair would be the same round trip with two more presses to reach a
party of six. And the artifact draws "Ready at" for a dine-in basket as well as a
pickup one, which contradicts the rule in `SCREENS.md` §5 that the table already
answered that question. That contradiction is older than this pass and is left
open there, not settled here.

### What the previous artifact said, kept for the record

Its ordering flow **is built** as of 2026-08-03 (see
[apps/web/README.md](../../apps/web/README.md)) — the earlier note here, that it
was a proposal Phase 9 had declined, is out of date. What the artifact draws is
now the visual specification for the web checkout: the 440px right-hand panel,
the 24px quantity chips, the uppercase section labels, the ready-time pills, the
payment rows and the confirmation card are all transcribed from it.

The two places the implementation departs from it are recorded below, under
"Contradicts the code", and one more that the refresh introduced: **the drawer
and the confirmation modal became routes.** A drawer that is only a state
vanishes on reload, and the confirmation carries the pickup code, which has to
survive one. Both keep the artifact's appearance; both now have a URL.

### Refreshed 2026-08-03 — what the new export changed

Re-read against the code, declaration by declaration: **117 of the artifact's
144 distinct measurements already matched `globals.css` verbatim.** The header,
hero, category rail, filter chips, restaurant cards, banner, rating card, menu
tabs and dish cards were all still accurate and were left alone. Three things
had genuinely moved, and were transcribed:

- **The logo.** The pin now holds a fork *and* a knife and carries a clock badge
  on its shoulder; it used to be a fork and spoon with no badge. The clock is
  the product in one glyph — this is order-ahead, not delivery. Now
  `components/Brand.tsx`, shared by the header and the footer.
- **The wordmark.** `amragrir.am`, Latin and lowercase with only `.am` in the
  accent colour, at 18px — it was the translated brand name at 21px, entirely
  in accent. The artifact hardcodes it *outside* its `L` dictionary while
  everything around it comes from inside one, which is how it says this is a
  logotype and not a string.
- **The footer**, rebuilt: logo and wordmark open the brand column, three social
  marks close it, the copyright line moved inside the container as a
  rule-separated bottom bar, headings went from `--ink3` to `--ink`, and the
  grid went `2fr` → `1.6fr` with a 40px gap.

One more divergence the audit turned up, unrelated to the refresh: the dish
**add button** was a pale `--accent-soft` chip at 34px where the artifact draws
a solid `--accent` disc at 38px with a shadow. Fixed.

**Not transcribed at the time: the sticky order panel** on the restaurant screen
(`1fr 380px`, `position:sticky`, lines with 28px quantity steppers,
subtotal/service/total and a checkout button). The reasoning recorded here —
that it could not be built without either losing the pre-rendering or letting
the client compute a total — held only for building it *in the page*. **Built
2026-08-06** as a client component over a route handler; see the entry above.
`StickyBasket`, the bar that stood in for it, is gone.

### Reconciled against the implemented backend, 2026-08-03

Agrees: all 26 palette tokens; the menu tabs (`Popular/Mains/Sides/Drinks`)
match `MenuTab` exactly; the service badges match `RestaurantService`.

**Contradicts the code in two places.**

*Cash is offered as a payment method* — `payNames` ends in `Cash` / `Наличные` /
`Կանխիկ`. `PaymentMethod` has no such value and says why: an order is paid for
before the kitchen ever sees it, so nothing can owe money at the counter
(BUSINESS_LOGIC.md §5). The design is wrong here, not the code.

*"Reserve Table" leads nowhere.* The filter chip and the per-restaurant badge
are drawn, but no booking flow exists in the artifact — no date, guests, slots
or deposit — while the API implements all of it. **Closed by the 2026-08-05
refresh**, which draws the date-and-time field, the guest stepper and the
deposit card on its checkout screen; only the slot grid is still ours, because
the artifact picks a time from a clock and the API offers the times a table is
actually free.

**Absent from the artifact, and therefore designed in code rather than
transcribed** — each was built to the artifact's own tokens and measurements,
and each is a place a future refresh should be checked against reality: order
tracking (the artifact stops at the confirmation modal, and there are eight
order statuses); a failed payment and the unpaid order it leaves behind;
cancellation, and that paying ends the right to it; the deposit and referral
lines in the totals; basket limits; the one-restaurant-per-basket rule;
sold-out dishes; **branches** (the artifact treats a restaurant as a single
place — a restaurant has up to ten, each with its own address, hours and menu);
and **any authentication at all**, though placing an order requires an
identity, so the web's phone-and-OTP screen has no artifact behind it.

Two of its six filter chips did not map to an API parameter: "Near Me" needs an
origin, and "Ready in 15 min" is a threshold where the API offers a sort. **"Near
me" is now built** — the header's district gives it the origin it was missing, so
it is `sort=nearest`, and it is only offered once a district is chosen. "Ready in
15 min" is still `sort=fastest`.

## What `Amragrir (mob).dc.html` actually contains

Twelve screens — home, search, restaurant, pre-order, checkout, tracking,
basket, orders, favorites, profile, referral, settings — plus the five-tab bar,
the filter sheet and the auth gate. Four mock restaurants, five dishes, three
languages, light and dark.

### Reconciled against the implemented backend, 2026-08-04

**All 15 palette tokens match `packages/ui/src/tokens.ts` verbatim, in both
themes.** Only two colours in it had no token — `--danger` and `--dangerSoft`,
which the tracking screen uses for a declined card, a cancelled order and the
cancel button. Both were added; nothing existing changed, so `apps/web` and
`apps/admin` render exactly as before.

It agrees with the backend in the places the landing artifact did not. Its
`payNames` is Apple Pay / Google Pay / card with **no cash** — the contradiction
recorded above for the web artifact is not repeated here. Its order statuses are
`OrderStatus` exactly, including the eight-state `statusDesc` table. Its money
matches `BUSINESS_LOGIC.md`: a `0.9 × 400` service fee is 360֏, and `5 × 400`
per guest is the 2000֏ deposit, marked credited rather than added.

**Its whole filter sheet is supported by the API** — `openNow`, `dietary[]`,
`service[]`, `priceMin`/`priceMax`, `sort`, `distMax` and `minRating` are all in
`ListRestaurantsDto`. What had fallen behind was the mobile client's own query
type, not the backend.

**Contradicts the code in three places.**

*Settings offers "delivery addresses."* There are no couriers
(`AI_CONTEXT.md`, "What NOT to do"). The row is not built.

*The auth gate offers Apple and Google sign-in,* and splits log-in from sign-up.
Customer identity is phone + OTP only, and `verify-code` takes an optional name
and upgrades the guest in place — there is no second flow to tab to.

*The price filter is drawn as "price per person", 4000–24000֏.* The API filtered
on a branch's **average menu-item price**, which across seeded data is
1 480–3 900֏ — the two ranges did not overlap at all, so the slider as drawn
matched everything or nothing. **Settled 2026-08-10 the first way:** the API's
notion of "per person" is now a meal rather than one dish
(`AVG(price_amd) × SPEND_ITEMS_PER_PERSON`, which is 2). The slider's bounds
come from `packages/shared` rather than from the artifact, so a client cannot
draw a range the server has never heard of. The sheet is built.

**Absent from the artifact, and so still designed in code rather than
transcribed:** branches (it treats a restaurant as a single place), sold-out
dishes, the one-restaurant-per-basket rule and basket limits.

The line that used to end this list — that no endpoint reports the 340 points,
28 orders and 3 coupons on its profile screen — was wrong: `GET /me` returns
`rewardPoints`, `ordersCount` and `couponsCount`, which is where the web
profile's counters come from.
