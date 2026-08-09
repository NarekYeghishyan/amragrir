# @amragrir/admin

Internal back office for the **staff roles** — `super_admin`, `platform_admin`,
`restaurant_admin`, `restaurant_manager`, `branch_staff` (see
[docs/ROLES_AND_PERMISSIONS.md](../../docs/ROLES_AND_PERMISSIONS.md)) — one
permission-gated React + Vite SPA, no SSR, no public surface.

Staff are **separate accounts** from customers: their own table, email and
password rather than a phone OTP, and no sign-up at all. An account exists only
because someone who already had one sent an invitation.

## Running it

The panel talks to the local API, so start that first:

```bash
docker compose up -d                        # from the repo root
pnpm --filter @amragrir/api dev             # API on :3000
pnpm --filter @amragrir/admin dev           # panel on :5173
```

The seed creates two dev accounts, and prints them on every run:

| Email | Role |
|---|---|
| `admin@amragrir.local` | `super_admin` — every tab |
| `owner@amragrir.local` | `restaurant_admin` on the seeded restaurants |

Both use the password `change-me-in-dev-only`. Invitation and password-reset
emails are printed to the **API** log (`[EMAIL] [dev] to …`), links included.

It also staffs the whole platform — an admin per restaurant, a manager per
branch and two shifts under each, all on the same password (see
[apps/api/README.md](../api/README.md#staff)). **Sign in as one of them**: a
`branch_staff` account is the only way to see what this panel looks like with
one branch and no People tab, and that is the account most of its users have.

```
manager.tigran-mets@karas.amragrir.local     one branch of a five-branch chain
staff1.tigran-mets@karas.amragrir.local      a shift on that branch
admin@karas.amragrir.local                   the chain's own admin
```

Point it elsewhere with `VITE_API_URL=https://api.example.com/v1 pnpm build`.

## Layout

```
src/
├── App.tsx              # the shell: sidebar, the bell, account menu, which
│                        #   screen shows
├── navigation.ts        # which tab needs which permission, what its address
│                        #   is, and how to read one — pure data + parse/format
├── router.tsx           # the address bar as state: useHref, navigate, <Link>
├── theme.ts             # the light/dark preference
├── language.ts          # the hy/ru/en preference + the translator
├── i18n.tsx             # LanguageProvider, useT() — the React half of the above
├── scope.ts             # restaurant → branch picking, shared by menu and orders
├── acting.tsx           # signing in as somebody: the rule and the button, for
│                        #   the two screens that list people
├── api.ts               # client + endpoints, token storage, refresh
├── order-stream.ts      # the sockets: one for the whole board, one for the
│                        #   shell's bell (different lifetimes — see below)
├── notifications.tsx    # the bell in the sidebar: what a branch has been told,
│                        #   the sentences built from a job's numbers, and the
│                        #   read-marks that are per person rather than per shift
├── order-reminder.tsx   # a pre-order's warning: how much notice the branch
│                        #   wants, the dialog behind the card's button, and the
│                        #   line that says when it is due and when to start
├── menu-history.tsx     # a dish's change log: the dialog behind each menu
│                        #   row's History button, and the sentence + diff it
│                        #   builds out of one recorded entry
├── dish.ts              # the dish form's rules, with no React in them: what
│                        #   it opens on, what may be sent, and what moved
├── dish-form.tsx        # the two dialogs those rules serve — adding a dish
│                        #   and editing one — over one set of fields
├── photo.tsx            # the photograph: what may be uploaded, and the file
│                        #   input both dish forms use
├── customer-orders.tsx  # what one diner has ordered: the dialog behind the
│                        #   orders count on Customers, each row opening in
│                        #   place, each linking to itself on the board
├── order-qr.tsx         # an order's full code as a QR code: the dialog behind
│                        #   each board card's QR button, and the plate it is
│                        #   drawn on
├── qr.ts                # that code as SVG path data — the one thing here the
│                        #   encoder library does not do
├── format.ts            # money, countdown, i18n label picking
├── styles.css           # the back-office design layer (tokens; #fff on accent)
├── ui/                  # the component vocabulary — Radix underneath
│   ├── core.tsx         # Button, Card, Field, Badge, Banner, EmptyState, …
│   ├── controls.tsx     # Select, Switch, SegmentedTabs
│   ├── overlays.tsx     # Dialog, ConfirmDialog, Menu, Tooltip, Toast
│   └── icons.tsx        # the inline icon set
└── screens/
    ├── SignIn.tsx       # email + password, invite acceptance, reset
    ├── Orders.tsx       # live kitchen queue + status buttons, the Booked tab
    │                    #   for orders placed ahead, and the History, QR and
    │                    #   warning dialogs behind each card
    ├── Menu.tsx         # price and availability in the row; add, edit and
    │                    #   delete a dish, and the History dialog behind each
    ├── Restaurants.tsx  # the list, and one restaurant opened: facts, admins,
    │                    #   the business's default cover and services, and
    │                    #   branches that open to show their own cover,
    │                    #   services and bookings plus who works at each
    ├── People.tsx       # who works here: invite, revoke a role, sign in as
    │                    #   somebody, and the way to the restaurant each role
    │                    #   is over
    ├── Dashboard.tsx    # platform: metrics + payment reconciliation
    ├── Users.tsx        # platform: the customer list (read-only), with the
    │                    #   phone reveal and the orders dialog behind two of
    │                    #   its cells, and the switch that brings the guest
    │                    #   sessions back into it
    └── Platform.tsx     # platform: new restaurants, promo coupons
```

## Decisions worth knowing

**Tabs are chosen by permission, not by role.** `TABS` in `navigation.ts` maps
each screen to the permission it needs, and the account's permission list comes
from `GET /auth/staff/me`. A branch manager and a platform admin therefore see
different panels without either being special-cased. The API enforces the same
map independently — this only avoids offering dead ends.

**Navigation lives apart from the shell.** `navigation.ts` imports no UI, so the
permission logic is tested without mounting a panel, and the sidebar reads its
icons and page titles from the same rows that decide access.

**A stale tab falls back.** Roles can be revoked mid-session, so `activeTab`
drops to the first visible tab rather than rendering a screen where everything
403s.

**Every screen has an address.**

| URL | Screen |
|---|---|
| `/orders` | the kitchen queue |
| `/orders?restaurant=:id&branch=:id` | …narrowed to one restaurant, or one of its branches |
| `&order=:code` | …narrowed to one order, from a line of somebody's activity or from a diner's own order list |
| `/menu` | the menu for a branch |
| `/menu?branch=:branchId` | …that branch's, rather than the first one in reach |
| `&dish=:menuItemId` | …with that dish's row marked, from a line of an order |
| `/restaurants` | the restaurant list |
| `/restaurants/:restaurantId` | one restaurant: facts, admins, branches |
| `/restaurants/:restaurantId/branches/:branchId` | …with that branch's team open |
| `?role=:assignmentId` | …and that role's row marked (on either of the two above) |
| `/people` | who works here |
| `/people?person=:staffId` | …narrowed to one of them |
| `/dashboard`, `/customers`, `/platform` | the platform screens |
| `/customers?person=:userId` | …one diner, from their name in an order's history |
| `/sign-in` | the form; `?next=` is where to go afterwards |
| `/accept-invite?token=`, `/reset-password?token=` | the links in an email |

`TABS` in `navigation.ts` carries each screen's `path` beside the permission
that opens it, so "which URL" and "who may see it" cannot be answered from two
different lists. `parseRoute` says what an address means and `routePath` writes
one; they are pure, they are each other's inverse, and `navigation.spec.ts`
tests them as a round trip — a link the panel writes has to be a link the panel
can read.

**The router is thirty lines, not a dependency.** `router.tsx` is the History
API plus `useSyncExternalStore`: read the URL, change the URL, re-render when it
changes by a click, the back button, or a bookmark opened cold. Nested layouts,
loaders, code splitting and revalidation are the reasons to take a routing
library; the panel has one layout, fetches in the screens, and ships one bundle.
Nothing outside `router.tsx` touches `history`, and nothing inside it knows what
a URL means, so swapping in a real router later is two files and no change to
any screen.

**A URL nobody planned for lands somewhere real.** `parseRoute` returns null for
`/`, for a typo, and for a half-written restaurant address; a parsed route can
still name a screen this account may not open. Both fall back to the first
screen it *can*, with `replace` so the back button goes where the person came
from — but only once `GET /auth/staff/me` has answered, because redirecting on
an unknown permission set would erase a deep link before the panel had read it.

**Signing out keeps the door open.** A signed-out browser on a panel address is
sent to `/sign-in?next=<where it was going>` and returns there afterwards, so a
session expiring mid-shift costs a password rather than somebody's place. `next`
is only ever followed when it is a path of this panel's own. The two email links
are left alone — they carry a one-use token, and bouncing an invitation to the
sign-in form spends it on a screen with nowhere to type a new password.

**Links are `<a href>`, not buttons with an onClick.** The sidebar, a restaurant
on the list, the way back to it, the "Orders" button on every branch, and the
role rows on the People screen are all real anchors: hover shows the address,
the context menu offers "copy link", and ⌘/Ctrl/middle click opens a second tab
— which is the point of a panel whose screens have addresses. The router takes
over only a plain left click.

**A restaurant is a route; its filters are not.** `/restaurants/:id` renders
instead of the list rather than beside it, and the Restaurants component stays
mounted either way — so the search box, the two pickers and the page number
survive the trip, and coming back lands where somebody left with no refetch.
Those are not in the URL: they narrow an answer rather than being one, and a
reload is allowed to forget them. The restaurant, the branch and the role are,
because they are what somebody sends a colleague.

**A switch the rule forbids is dead, and the row says why.** A restaurant's
services are three switches, and one of them depends on another: a room with
waiters (`dinein`) needs tables somebody can book (`reserve`), because wherever
there is a dining room the way to a seat is the booking. What decides that is
`serviceToggleBreach` from `@amragrir/shared` — the same rule `PATCH
/restaurant/restaurants/{id}/services` refuses on — asked as "would flipping
this produce a legal set". The panel restates nothing, so it cannot offer a
combination the API is about to refuse. The reason sits in the row as plain
text: a tooltip is not there on a touch screen, and a dead switch with nothing
beside it reads as broken. There is no "eat at the restaurant" switch, and
deliberately: it follows from `reserve` being off, and the pickup row says so.
See BUSINESS_LOGIC.md §2.

**The cover is shown to everyone who can open the restaurant, and changed by
whoever holds `restaurant:write`.** A cover is public the moment it is set, so
there is nothing in the section a reader should not see — what the permission
gates is the file input and the Remove button, not the picture. It sits directly
under the restaurant's facts, because it is one of them, and it is a **small
block with its controls beside it** rather than a banner: the question it
answers is "is there one, and is it the right photograph", and a full-width hero
here would push the branches — usually what somebody came for — below the fold.

**A branch's own settings sit behind its disclosure, and "this branch decides"
is the data model rather than a nicety.** The row stores "not answered"
separately from every answer, because a branch declaring exactly what the
business declares is a different state from one that has not — only the first
survives the business changing its mind. With the switch off the controls show
the restaurant's values, *disabled*, so the screen still says what this address
offers instead of going blank; turning it on starts from what the branch is
already showing, so it changes nothing by itself and only moves who decides.
That is `branch:write`, which a `restaurant_manager` holds — the restaurant-level
sections above are the chain's default and stay `restaurant:write`.

Choosing a file
uploads it and stores it in one go: unlike a dish, there is no form still being
filled in, so `POST /uploads/restaurant-cover` and `PATCH
/restaurant/restaurants/{id}/cover` run back to back and the page re-renders
from what the API answers. A `restaurant_manager` sees the photograph their
branch is sold under and cannot replace it — the cover speaks for every branch.

**The order board's scope is the exception, because it is what a link is for.**
`?restaurant=` and `?branch=` are filters by any other measure, and they are in
the address anyway: every branch on the Restaurants screen has an **Orders**
button, and a button that lands on every branch's queue at once has not answered
the question it was pressed to answer. Working out *which* branch — the chain,
the address, whether it is even open — is what that screen is for, and the
answer used to be good for nothing but reading: getting to its orders meant the
Orders tab and setting the same two pickers again from memory. The board's own
pickers write the same address back (`replace`, so narrowing a queue is not a
place in the browser's history), so the URL always names the queue on screen and
can be sent on. The stage tabs and the search box stay in state — those narrow
an answer rather than being one.

**`&order=:code` narrows the same board to one order**, and is what an order in
somebody's activity links to. The code is not the search box getting an address:
a typed term is a way of looking, while a code names one order and is therefore
an answer — the same argument that puts `?person=` on the two lists of people.
The code reaches the API as the search term, because searching by code is what
the board already does, and the stage stays out of the URL because the board can
work out which one holds the order: the counts on the tabs are taken under the
search and not under the stage, so a board sent to a finished order moves itself
to **Past** rather than landing on an empty **Active**. Typing a code by hand
still leaves you where you are with the counts pointing — that is a search
telling you where to look, and only a link was sent somewhere specific.

**The pin beside each code writes that same address**, which is why the board
needed nothing new to hold itself on one order. Pressing it puts the code in the
search box and leaves that card alone on the screen — what a counter wants while
somebody is on the phone about an order, over a board of fifty cards that
reorders itself every twenty seconds. The alternative was retyping twelve
characters read off the screen you are trying not to lose. It writes `&order=`
rather than setting the search term directly, so a pinned board can be sent to
whoever is asking, and `replace` like the pickers: narrowing a queue is not a
place in the browser's history, and the pinned board is one card, so the pin
that undoes it is the thing already in front of you. **Only the pin lights up
the pin** — a code typed by hand is somebody looking for an order, not the board
being held on one. Taking it out empties the search box too, which is the one
thing the address alone cannot say: an address naming no order is the ordinary
board, not an instruction to clear a box somebody is typing in.

**The menu's branch is in the address for the same reason.** `/menu?branch=:id`
is what a line of an order on the board links to, so which branch's menu is on
screen cannot be state the way the tab filter and the search box are. Its
pickers write the address back exactly as the board's do (`replace`, and the
`&dish=` goes with the move — a mark on a row of another branch's menu is a
mark on a row that is not there). Unlike the board there is no "all branches"
state to fall back to: a menu belongs to a branch, so a bare `/menu` means the
first branch in reach rather than every branch at once. An address naming a
branch this account cannot reach says so and stops, rather than showing a
different branch's menu under a URL that asked for this one — prices are the
kind of thing somebody acts on.

**Which branches are disclosed is reading state, not an address.** The branch in
the URL is the one a link *opens*; a chevron clicked afterwards does not rewrite
it, and several branches can be open at once. Anything else would either make
the address a live mirror of a disclosure or force the panel to pick one branch
as the real one.

**Deploying needs a history fallback.** Every path must serve `index.html` —
`try_files $uri /index.html;` in nginx, or the equivalent — or a reload on
`/restaurants` is a 404 from the static host, which is exactly the deep link
this all exists for. `vite dev` and `vite preview` already do it.

**A sidebar, not a strip of tabs.** Seven destinations across the top wrapped
onto two lines in anything but a wide window, the current one was a coloured
pill among identical pills, and there was nowhere to put the account. Down the
side they are a fixed list that never reflows, grouped into *Restaurant* and
*Platform* — and the grouping headings only appear when an account can see
both, because one heading over the whole sidebar says nothing.

**The content fills the window.** `.main__content` was capped at 1280px, which
is a measure for prose and wrong for this: every screen here is a table, a
board, or a list of cards, and the cap left a wide monitor showing the same
number of orders as a laptop with grey either side of them. The `--content-max`
variable went with it — it had no other reader. The sidebar is still fixed, so
the reading column is what is left of the window, and the screens are built from
grids that reflow into it.

**Radix owns behaviour; this repo owns appearance.** `src/ui` wraps
[Radix primitives](https://www.radix-ui.com/primitives) — focus trapping,
`Escape`, focus restored to the trigger, roving arrow keys, `aria-modal`, the
pointer rules that keep a menu open as the mouse crosses a gap. Each of those is
a day to get right by hand and a permanent bug source after. **Screens import
from `./ui`, never from `@radix-ui/*` directly**, so swapping a primitive is one
file's work rather than seven screens'.

The same trade is why the panel's only other runtime dependency is
[`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) (MIT, no
dependencies of its own). Twenty icons are drawn by hand here because they are
twenty paths; Reed–Solomon codewords, version tables, mask selection and format
bits are not, and a QR the counter's scanner quietly refuses to read is a bug
nobody finds until somebody is standing at the counter. What `qr.ts` keeps is
the rendering — the module runs merged into one SVG path.

**No hex anywhere but `tokens.css` — with one exception.** `styles.css` resolves
every colour to a token from `@amragrir/ui`, so light and dark cost nothing to
keep in step and the panel follows the palette wherever it goes. The exception is
`#fff` where something sits **on** accent — the primary button, the current
pager page, the brand mark, the page header. There is no on-accent token, and
`--ink` is the wrong answer in both directions: it is near-black in light and
near-white in dark, while accent is a mid-luminance orange in both, so a token
would invert the text out from under the one surface that does not change. The
theme toggle in the account menu writes one attribute on `<html>`; `index.html`
applies the stored choice before the first paint so a dark panel never flashes
light.

**The page header is the accent bar.** Solid `--accent` across the top of every
screen, sticky. Being accent costs it accent as a signal, so the controls on it
invert rather than restyle: the primary button becomes white with accent text,
secondary and ghost become white outlines, and a badge swaps only its ground so
its tone still carries — the order board's "live" dot is green because green is
the message, and green on orange is not a message anybody reads across a
kitchen. The glass blur went with the change, since content scrolling under an
opaque bar is already hidden, and a `--shadow` lift replaces the bottom hairline,
which `--line` at 9% could not draw on a saturated ground. **Contrast is the
known cost:** white measures 3.5:1 on the light accent and 2.86:1 on the dark
one, so the 22px title clears AA-large in light only and the 13px description
clears nothing — the description is held at 88% rather than the usual `--ink2`
step-back for exactly that reason. Near-black would measure 5.11:1 and 6.24:1;
see the note in DESIGN_SYSTEM §10.

**Armenian, Russian and English, and no string in a component.** Every label
comes from `@amragrir/i18n/admin` through `useT()`; `hy` is the reference, so a
key added there and forgotten in `ru` or `en` is a compile error. The language
is a stored preference like the theme — the panel is behind a sign-in with
nothing to index, so it needs no `/hy` URLs the way `apps/web` does — and is
switched from the account menu, or from the three buttons on the sign-in card,
which are there because somebody who cannot read the panel cannot reach a menu
behind a password. It rides along as `Accept-Language` on every request, so the
API's error messages and dish names come back in the same language the screen is
in. Counts go through `t.plural()` and `Intl.PluralRules`, because Armenian's
singular covers zero and Russian's covers 21. See DEVELOPMENT_GUIDE.md §5.

**Controls are 40px, not the 56px of the phone design.** A tool somebody works
in all day wants more on screen than a storefront does. The **order board keeps
full 44px touch targets**, because that is the one screen used on a tablet with
wet hands.

**Destructive actions are confirmed, everything else is not.** Deleting a dish,
removing a role, withdrawing an invitation and cancelling an order go through an
alert dialog that takes focus to the safe choice and will not close on a stray
click outside. Flipping a branch closed or a dish sold out does not — those are
reversible with the same switch that made them.

**A dish cannot be added without a photograph.** "Add a dish" asks for three
things — the Armenian name, the price, and the picture — and the submit button
stays disabled until it has all three. The rule is the API's (`photoUrl` is
required on `POST /restaurant/menu-items`); the form only avoids sending a
request it knows will come back 400.

**A dish can be changed after it is on the menu.** The pencil on each row opens
the same form the dish was added with, filled in with what it is now: the
photograph, the three names, the price, the tab and the prep estimate. One form
for both jobs (`dish-form.tsx`) rather than two that happen to match — the moment
they are written twice is the moment a field lands in one of them only. Before
this, a wrong picture or a name missing its Russian meant deleting the dish and
adding it again, which is not what "edit" should cost.

**Only the fields that moved are sent, and Save is held until one has.**
`dishPatch` (in `dish.ts`, tested in `dish.spec.ts`) diffs the form against the
row and returns null for a form nobody changed — a PATCH that moves nothing
writes no history entry at the API either, so reporting success for one would be
a lie in the direction people check. Sending only what moved also means an edit
does not overwrite what somebody else changed in the other browser while this
form was open.

**The price and the sold-out switch stay in the row.** They are what somebody
changes mid-shift, and a form is the wrong shape for one number — the dialog is
for the things a row cannot hold. Emptying the prep-time box sends `null` and the
dish stops claiming a time; the branch's own average stands in. That is the one
field where `null` means something rather than being a mistake, and it is the
opposite of the photograph, which the API refuses to blank.

**The photo is uploaded, and it goes up before the dish exists.** Whoever adds a
dish has a photograph of it on the machine in front of them, not a URL, so the
field is a file input — the native one, restyled: it is already labelled,
already keyboard-reachable and already says which file is chosen, three things
the hidden-input-behind-a-button pattern has to rebuild and usually rebuilds
worse. Choosing a file uploads it immediately (`POST /uploads/menu-photo`) and
what comes back is shown as a thumbnail, so the picture is confirmed before
anybody commits to the dish; `photoUrl` then carries the stored URL. The cost of
that order is an orphaned file when a form is abandoned, which is the cheaper
half of the trade — the other order shows somebody their photograph for the
first time after the dish is already on the menu.

Type and size are checked here *and* on the API (`photoRefusal`, from the limits
in `@amragrir/shared`). Only the API's check counts — it reads the bytes, so a
`.jpg` that is really a PDF gets past the panel and not past it — but a 40 MB
screenshot deserves an instant answer about photographs rather than a slow one
about media types.

**Every dish shows its photograph in the menu table.** A 44px thumbnail next to
the name, `alt=""` because the name is the next thing in the row. Without it the
panel is the one place that never displays what a customer actually sees, so a
wrong or missing picture is invisible to everybody but them. A dish from before
the rule renders as an empty dashed frame rather than a stand-in: the gap is the
point, and it is the list of what still needs photographing.

**Feedback splits by lifetime.** A toast reports what an action did; it is read
once and goes. A banner stays for what somebody must act on — a list that failed
to load, an unreconciled payment. The old panel kept both in component state
next to the form that caused them, which is often not where the eye is after a
click.

**Status buttons come from `ORDER_STATUS_FLOW` in `@amragrir/shared`,** not from
a list written here. The buttons shown are exactly the moves the API accepts, so
the panel cannot offer one that 422s. `paid` is filtered out because only a
payment makes an order paid.

That table is also why **Cancel appears only on an order nobody has paid for
yet**, and why the panel needed no change when that became the rule: from
`paid` onwards the flow offers the next move and nothing back out, and the card
renders exactly what the flow offers. A branch that cannot fulfil a paid order
has no button for it here, deliberately — see BUSINESS_LOGIC.md §4.

**A cooking order is the one card with two moves: *Almost ready* and *Ready*.**
`almost_ready` warns the counter that something is about to need handing over,
and a dish plated in one motion never waits at the pass — pressing twice to say
so would leave behind a record of a stage the food was never in. The state
machine admits `preparing → ready` as a move of its own, so this is still the
card rendering what the flow offers rather than the panel running two calls
together. Only the first button is filled: two solid buttons side by side are
two things asking to be pressed, and the shortcut should not compete with the
step it skips. Both keep the 44px touch target — a shortcut you have to aim at
is not one.

**The queue is oldest-first, and late orders are marked in place.** A kitchen
works in the order things arrived. An order past its promised time gets a red
ring rather than being sorted to the top, because a queue that reorders itself
under someone's hand is worse than one they have to scan.

**Every line of an order says what it cost, and opens the dish it came from.**
A card used to list `2× Burger` and nothing else, so the two questions a ticket
raises next — "why is this order 14,200" and "what is actually in this, is it
still on, how long does it take" — were answered by adding the prices up from
the menu and by the Menu tab, its two pickers set again from memory, and a
search for a name the dish may have been renamed out of since. The price of
each line now sits on the right of it, and the dish is a link to its own row
on that branch's menu: `/menu?branch=:branchId&dish=:menuItemId`, which lands
with the row marked and brought into view. The line's *name* stays the snapshot
taken when the order was placed — what the diner bought — while the link goes
by the dish's id, so a rename cannot break it and cannot quietly change what
the ticket says either. The link is offered only to an account holding
`menu:read`; a shift that watches the board without it reads plain text, the
same way the History dialog's names do without `staff:read`.

**Every card can hand its order's code to a scanner.** The card prints
`orders.code` (`AMR-` + 8 digits) across its top — the one thing that names
exactly one order — and it is still twelve characters somebody would otherwise
retype: into the board's own search, into a handheld, into the note on a refund.
Twelve characters retyped at a counter is where the wrong order gets picked. The
**QR** button opens that code as a QR code, big enough to scan across a counter,
so anything that reads one — a phone, a wedge scanner that types what it sees —
gets it with no keystrokes. The plain code stays written under the picture: a
scanner can be flat, out of reach, or not there.

The code is drawn as an SVG path (`encodeQr`, in `@amragrir/ui`) rather than the encoder's own image,
so it inherits `currentColor`, scales to its box and stays crisp on a tablet
held at arm's length. It is **`--qr-ink` on `--qr-paper`, which are the two
tokens that do not follow the theme**: dark-on-light is what the format assumes,
and a code that inverted itself under the dark panel is one a counter's handheld
may simply refuse to read — the panel's theme is not the scanner's choice.
Nothing is encoded until the dialog opens; a board holds fifty cards.

**Every dish carries its own history, because the row can only say what is true
now.** The menu is a table of current values, and every cell in it is an UPDATE
that overwrote the previous answer — so "who put this here", "what did it cost
last week" and "which of the two managers marked it sold out on Saturday" had no
answer on screen, even though the API has recorded all three to `audit_log`,
inside the transaction that made each change, since the table existed. The
History button on each row opens `GET /restaurant/menu-items/:id/history` in a
dialog. A dialog rather than a column, for the reason the order board's History
is one: a timeline is something you open about one thing, read, and close, and
fifty dishes each carrying their own is a page nobody can read and a request per
row for panels nobody opened.

**The diff comes off the keys of `after`, and getting that backwards is a
phantom rename on every price change.** The API records only the fields that
moved — but it adds the dish's `nameI18n` to `before` as a *label* on every
edit, changed or not, so an entry can say which dish it is about without a
second request. `changesOf` therefore walks `after`, and the two ends of a
dish's life are not dressed up as diffs: a creation lists what it went on the
menu at with nothing on the left, a withdrawal lists what it was with nothing on
the right. A uuid and a photo URL are shown as "set" rather than printed —
"the category changed from 8f3c… to b210…" answers nothing anybody asked.

**A name in a dish's history is a link only with `staff:read`.** The same rule
the order board's timeline follows, and the reason `Menu` takes `canOpenStaff`:
a shift holds `menu:read` and can see that Ani changed the price without being
able to open the directory Ani is in, and a link to a tab their sidebar does not
show is a dead end. An account since deleted says so out loud rather than
rendering a blank line — `actor_staff_id` is `ON DELETE SET NULL`, so "somebody
whose account is gone" is a real answer and an empty line would read as a bug.

**Cards in a row of the board are all the same height.** Orders carry between
one and a dozen dishes, and cards left at their content height gave a row of
ragged bottoms where the shortest card read as the least urgent — which is not
what a card's height means. The grid stretches every card in a row to the
tallest of them, and the slack goes above the status buttons rather than below,
so the moves also line up across the row for a hand working left to right.

**Tokens live in `localStorage`, and that is a trade-off.** Any script on the
page can read them, where an httpOnly cookie could not. Accepted because this is
an internal tool with no third-party embeds, and the alternative needs cookie
auth on the API — **revisit before exposing this beyond the restaurant's own
network.** Persisting at all is not optional: access tokens last 15 minutes and
a kitchen panel stays open all shift.

**Refresh is single-flight.** Refresh tokens are single-use and rotated, so two
requests expiring at once would each try to spend the same one and the loser
would be logged out. Everyone waits on the same promise.

**A branch is chosen through its restaurant, not out of one flat list.** Both
the menu and the order board pick the restaurant first and then offer only its
branches (`scope.ts`). A single list of every branch with the restaurant as a
grey hint underneath is readable at two and a list you search at a dozen — and
two branches called "Northern Ave" belonging to different restaurants are told
apart only by that small print. That hint now shows **only while the list spans
restaurants**; once one is chosen it just repeats the control above it.

The restaurant picker appears only when there is more than one to choose. The
branch picker is shown when there is more than one branch **or when a
restaurant has been chosen** — including a restaurant that turns out to have a
single branch. Hiding it there made the control vanish at the moment somebody
narrowed to a restaurant, which reads as the filter bar breaking and leaves the
one branch they are now looking at unnamed anywhere on screen. What stays
hidden is the genuinely useless case: an account whose whole reach is one
branch, with no restaurant chosen. That is most kitchens.

**A restaurant with one branch has that branch selected** on the order board
(`soleBranchOf`), rather than sitting on "All branches" — one option and one
outcome is not a question, and leaving it unanswered costs a click that could
not have gone another way. Not the same as the menu's `firstBranchOf`, which
lands on *a* branch because a menu must belong to one; this selects only where
there is nothing to choose between. It refuses to act on an empty restaurant
id, or an account whose whole reach is one branch would find that branch
selected by picking **All restaurants** — the control that clears the scope
setting it instead.

Choosing a restaurant on the menu lands on one of its branches rather than
clearing the selection: a menu belongs to a branch, so "none" is not a state
that screen has.

**The order board filters on the server, not in the browser.** The board used
to fetch one page of active orders and sort them into stage tabs itself, which
is only true while every order fits on a page — past that, a tab reading "3
ready" meant "3 ready among the twenty I happened to fetch". Stage, search,
restaurant and branch all go to `GET /restaurant/orders`, and the tab counts
come back with the page. They are taken under everything **except** the stage,
so searching a code from the live board and seeing `Active 0 · Done 1`
tells you where the order went — the alternative is an empty board and no
reason given. `past` also made finished orders reachable at all; before this
the panel only ever asked for active ones.

**The stage tabs are the state machine: *Booked · Paid · Confirmed · Preparing ·
Almost ready · Ready · Done*.** One per status, in the order an order moves
through them — with *Booked* ahead of all of it, which is the one that is not a
status at all (below). They used to be coarser — a single *New* spanning `created`, `paid` and
`confirmed`, and a *Preparing* that swallowed `almost_ready` — on the argument
that a kitchen makes one decision there rather than three. It does not:
accepting an order, starting to cook it and plating it are three different
people's moments, and a tab that mixed them could not say how many of each were
waiting. Every count on the strip is now a number somebody can act on.

*Done* is the one tab that still folds two statuses together, because nobody
sorts finished orders by how they finished.

*Almost ready* is the one tab an order can miss out entirely, because the card
before it offers a way past — so it counts what somebody deliberately flagged
for the counter, not everything on its way to the pass.

**The last move is not a button, and the board does not know the code.** Every
step up to *Ready* is a statement about the kitchen and goes through on one
press. *Done* is not: it says the food left the counter in somebody's hands, and
the only evidence of that is the six-digit pickup code the guest shows. So a
`ready` card offers **Hand it over**, which opens a box, and the API refuses
`completed` without a code that matches `orders.pickup_code`.

The board could not check it itself even if it wanted to. **No staff endpoint
returns that code** — not this screen, not the platform-admin customer list, not
a `prep_due` notification. It used to be printed across the top of every card,
which is precisely what would have made a handover check theatre: a counter that
reads the code off its own board never has to ask anybody for it. What the panel
can do is *find* an order by it — type six digits into the search box and the
guest who remembers nothing else is located — matched whole, never as a
substring, so the box cannot be walked digit by digit into a code nobody gave.

A mistyped digit is the ordinary case at a counter, so it is not a toast: the
API answers 422 with `details.reason = "pickup_code_mismatch"`, and the dialog
says "that code is not this order's" beside the box that was typed into. Every
other failure from that endpoint is shown as the API worded it. There is no
override — a guest who cannot produce their code cannot have the order closed —
which is a product decision, written down in BUSINESS_LOGIC.md §5 along with
what would replace it if a real counter proves it too rigid.

**The board opens on Paid**, and that is where clearing the filters returns it.
It is the only stage whose next move belongs to the restaurant — the money is
in, nobody has accepted the order, and a diner is watching a timer that has not
started. Everything after it is work under way or work finished. *Booked* is
first in the strip and deliberately not the landing tab: the difference between
"here if you want it" and "here is what to do next".

**Booked is a question about time, not about status.** Its orders are `paid` or
`confirmed` exactly like an order at the counter, and what tells them apart is
`orders.reminder_at` still being in the future. It exists because the board sorts
by when the kitchen must start: without it, an order placed today for next
Tuesday is the *oldest* paid order for a week and sits pinned above the work
somebody is doing. Every other tab is implicitly the other half of that split.
The API decides which side a card is on — against the same instant it selected
the page under — so the panel's own clock can never put one on the wrong tab.

**A card leaves Booked by the clock, not by anybody pressing anything.** Nothing
in the panel confirms a pre-order either: paying for one accepts it outright
(BUSINESS_LOGIC.md §4), so it arrives here already `confirmed`, and when its
hour comes it simply appears under Confirmed with the rest of the shift's work.
The bell is what makes that visible — see below.

**Each booked card carries a warning button showing its own notice** — "Warn 40
min ahead". The number comes from the menu's prep estimate plus a buffer, which
is a reasonable default and a poor rule: the estimate is the slowest dish on the
ticket and knows nothing about the coals a skewer wants lighting first. Pressing
it opens `order-reminder.tsx`, which takes minutes before the food is due —
bounded by the same `shared` constants the DTO validates, so a form cannot offer
a value the API refuses — and previews the moment it would land, because "45"
means nothing on its own to somebody deciding whether it is enough. Saving
patches the one card rather than refetching the board: the board is live, and
re-reading fifty orders to record that one number moved would let a stale
response overwrite a status the socket delivered while it was in flight.

**The countdown and the late warning are both suppressed on a booked card.**
`secondsLeft` counts to the moment the food is due, so on an order placed for
next Tuesday it reads "ready in 8,640 min" and goes negative the second it is
paid for. Warning a kitchen that it is late for work it was not meant to have
started is how a warning stops meaning anything. The card says the day and hour
it is due and when to start on it instead.

**`active` is not on the strip.** It was the old default and answered "show me
everything", which is not a question with an action attached: it mixed a paid
order nobody had accepted in with one sitting ready on the pass. The value
stays, and the API still defaults to it for a caller that names no stage — the
panel simply never asks for it. It is also why the counts do not sum to the
number of orders: `active` overlaps every working stage.

**Open Paid and a quieter strip appears under the tabs: *Paid* and *Unpaid*.**
The two halves of one question — did the money arrive. *Unpaid* is the `created`
status: an order placed and never paid for, an abandoned basket or a card that
was declined. It hangs off Paid rather than taking a place on the strip, because
the strip is the path an order takes through a kitchen and an unpaid order never
enters it. It is worth reaching at all because **nothing expires those rows** —
no job in the API touches an abandoned basket, so without a tab they pile up
entirely out of sight.

**The nesting is presentation only.** Both levels are ordinary `QueueFilter`
values, so picking *Unpaid* just asks the API for a different stage: there is no
second filter in the board's state and none in the request. The top strip shows
Paid as open for either (`topStage`), and both counts come from the same `counts`
object the page arrives with.

**The restaurants list narrows the same way the order board does** — one search
box over restaurant names, slugs and branch names/addresses, plus the two
pickers, plus a pager. What comes back under a card depends on what matched: a
search for a branch name shows that branch, a search for the chain shows all of
them. The card's count stays the restaurant's **real** total either way and
says "1 of 5 branches" when a filter hid the rest — reporting the filtered
length would tell somebody a five-branch chain has one.

**A restaurant opens from its name, not from its card.** The card holds a
switch per branch and an "add a branch" button, and a card that is itself one
click target turns each of those into a trap — a miss on the switch navigates
away. The name is a `<button>` rather than a div with an `onClick`, so it is
reachable by keyboard and announced as something that opens.

**The restaurant's own page asks for its people separately, because they need a
separate permission.** `branch:read` opens the restaurant; `staff:read` says who
works there. A `branch_staff` account holds the first and not the second, so the
people are asked for only when they can be had — one response with a section
that is sometimes missing would have to mix two permissions in one guard, and a
403 rendered mid-page is a screen that looks broken rather than one that
answered what it was opened for. A people request failing on its own says so
where it would have rendered and leaves the rest of the page standing.

**People appear where they are read, not in a section of their own.** The admins
run the whole restaurant, so they sit **with the restaurant's facts**; everybody
else works at one branch, so they sit **under that branch**, disclosed by
clicking its name. A single "who works here" list had to name a branch on every
row to be intelligible, which is a column repeating what the reader already
clicked, and it separated a branch's team from the branch's own switch by the
length of the page.

**A branch's team is fetched when the branch is opened, and then kept.** A chain
of forty branches is thirty-nine teams nobody looked at; closing a branch and
opening it again is a disclosure, not a refresh. It also removes a page
boundary that had no honest place to fall — at fifty rows a branch's staff could
land on page two, away from the branch. Each request is one scope's whole team,
so the role groups inside it are complete by construction. Several branches stay
open at once, because comparing two of them is the reason to open either.

**The branch name is the disclosure, not the row.** The row holds the
open/closed switch, and a row that is itself one click target turns that switch
into a trap. A `<button>` with `aria-expanded` and `aria-controls`, so it is
reachable by keyboard and announced as something that opens; the chevron flips
up and down rather than sliding sideways, which is what the restaurant name on
the list does to promise a page.

**Roles are grouped by seniority and counted, one row per assignment.** Somebody
who manages two branches appears under both, which is the honest answer to "who
works here and as what". Removing a role is **not** offered here: it lives on
the People tab, where a person's roles are all visible at once, and taking one
away in a place that shows only this branch's is how one gets removed in the
belief it was the last.

**Signing in as somebody is offered wherever people are listed.** A super admin
opens any staff account and uses the panel as that person — from the People
directory, and from a restaurant's teams, which is where you already are when
checking what a branch is reporting. The button sits at the end of the row in
both.

**A list pointed at one person says so, and says how to get out.** `?person=`
narrows the People directory and the Customers table to a single row, and both
screens draw a chip beside the search box next to a Clear that leaves the
address — clearing it in state alone would put it straight back on the next
read, and a reload would land in the filter somebody had just dismissed. On
People the pending-invitations section is hidden while it applies: an invitation
has no staff account to be that person, so every one of them would answer a
question nobody asked.

An empty answer means different things on the two screens, and each says its
own. On People it is "that person does not work anywhere you can see", because
the API scopes the directory to the caller's reach and the id came from a link
that knew who it meant — "nobody matches those filters" would read as a broken
link. On Customers, which sees every diner there is, it is an account that no
longer exists.

**The Customers list leaves out the sessions nobody was.** A `users` row is
written every time somebody opens the storefront — `POST /auth/guest`, an
anonymous account with no name and no number until a phone is verified. They
outnumber customers quickly and they are the newest rows, so a list ordered
newest-first was page after page of "No name · no phone · 0 · 0" with the people
who actually order buried nine pages back. `GET /admin/users` now leaves out the
guests that never ordered unless asked, and the switch in the toolbar is what
asks. Hidden rather than deleted: a guest is a real session, one that *did* order
is a diner and stays in the list either way, and an `id` — the link from a name
in an order's history — is never filtered at all, or the link would land on "that
account no longer exists".

**Two of the Customers table's cells open, and neither grew a button to do it.**
A masked phone and an order count were both facts with the answer withheld. The
number is withheld on purpose; the count was not — it said somebody had bought
eleven things and offered no way to see one of them, and the only route to those
orders was the board, which searches by customer *name* and therefore finds every
Aram in Yerevan. In both cases the thing somebody is already looking at is the
control: a button beside the count would be a second target saying the same
number.

**The number is unmasked one account at a time, and the API records it.** The
panel is never sent digits it is not showing — `+374******56` is what the list
endpoint returns, so nothing here is defeated by a developer console — and
clicking asks `GET /admin/users/{id}/phone`, which writes an `audit_log` row
before it answers. That is why the reveal is a request and not a flag on the
list: fetching them with the page would record twenty-five reveals for a page
nobody read, and a record that logs everything says nothing. The cache is
dropped on every load, so a revealed number does not survive a search; and the
reveal does not undo, because hiding it again would offer to un-know something
whose record is already written. A badge says the cell is showing rather than
masked, so a screen read over a shoulder cannot be mistaken for the ordinary
state.

**The orders dialog carries whole orders, and opens them in place.** One request
per page of ten, each row already holding its lines, its bill and its payment —
expanding one costs nothing, where a summary plus a detail route would be eleven
requests to read what one query had joined. One row open at a time: two is a
scroll, and the question this gets opened for is about one of them.

**It searches and filters like the board, because it is read like the board.**
Search box in a toolbar, four segments under it with the API's counts on them —
the same arrangement, so anybody who works the queue already knows this. A
regular's three hundred orders is thirty pages, and paging back through them to
find a cancellation from March is not a way to answer a support call. The search
matches the order code, a dish on the order, or where it was bought; not the
customer's name, which the board matches and which would match every row here by
construction.

**The segments are `all` / in progress / completed / cancelled**, which is
`CustomerOrderFilter` in `shared` rather than the board's `QueueFilter`. A
kitchen's stages — new, preparing, ready — are work still to be done, and three
of the five would match nothing for all but the last hour of a diner's life.
Cancelled gets a segment of its own instead of being one twelfth of "past",
because it is the row somebody opens this dialog to find.

**The counts are taken under the search but not under the segment.** Type a code
and the strip reads `All 1 · In progress 0 · Completed 0 · Cancelled 1` — which
is the answer, before anybody has clicked a filter. Counting under the segment
too would make each one report its own selection, which every list already does
by existing. The board's rule, for the board's reason.

**Closing the dialog clears the filters.** They live in state, not in the
address: nothing here is linkable, and reopening a dialog still narrowed to a
search somebody ran about a different customer is a list that looks empty for a
reason nothing on screen explains.

**Every order in it links to itself on the board**, at
`/orders?restaurant=&branch=&order=CODE` — the same address a line of somebody's
activity uses, so an order opens in the same place from wherever the panel names
it. The link is the one control inside the opened half rather than the row
itself: opening is looking at it here, the link leaves for another screen, and a
row that did both would make "which of the two did I just do" a question about
where somebody clicked. It is offered only with `orders:read`, the same rule
`actorHref` follows, and the dialog closes on the way out so no modal is left
over a screen that has been replaced.

**Both get it from `acting.tsx`, not from a copy each.** The two screens show a
different shape of row — the directory lists people with their roles hanging off
them, a team lists roles with the person hanging off each — so the rules would
have been written twice and drifted. `mayActAs` is the predicate (not yourself,
not deactivated, holds a role, and the caller may at all), `ActAsButton` renders
nothing where it would not work, and callers place it unconditionally. The
capability arrives as one nullable `Acting` object rather than three flags,
because it threads four levels deep to reach a branch's team rows and three
flags would have to be kept in step at each one. Null is the "may not" case.

**The impersonated session is a swap, not a second sign-in.** `acting` in
`api.ts` stashes the super admin's own pair, puts the impersonation token in its
place, and swaps back on the way out — their refresh token was never revoked, so
returning costs no round trip and needs no endpoint. The impersonation token has
**no refresh half** by design (see ROLES_AND_PERMISSIONS.md), which is also how
`refreshSession` recognises one: a 401 with an impersonation in storage means the
session expired, so it restores the super admin and reloads rather than signing
anyone out. A permanent strip across the top says whose panel this is and holds
the way back, and it cannot be dismissed.

**Switching identity remounts every screen.** `Shell` is keyed on who is being
acted as, because each screen holds a page of somebody's orders or people
fetched with the token that was current when it mounted, and there is no version
of "keep what you have" that is right when the account changed underneath it.

**The people list searches over the whole card.** A name, an email, or the
restaurant or branch somebody is assigned to — those are the three things on a
person's card, and whoever is typing knows which of them they remember. The
role picker beside it is the same narrowing without typing. Both go to the API
along with the page.

**Every role names its restaurant, and is the way there.** A branch assignment
names only the branch, so reading the column out raw left a shift's row saying
"Northern Ave" — a branch of three different restaurants — under a label meaning
the whole platform. The API now answers with the restaurant the role *reaches*,
and the row is a button: it opens that restaurant, on that branch when the role
is over one, which is the row somebody actually clicked. Landing on the chain
with every branch closed would mean finding it again in a list of forty. A
platform role is over no restaurant and stays text, and so does every row for an
account that cannot open the Restaurants tab — the absent callback is the gate,
not a second flag saying the same thing.

**Opening the branch is not enough; the page scrolls to it.** The seventh of ten
branches is below the fold on arrival, and a page that opened the right branch
off screen has left the hunting exactly where it was. `scrollIntoView` once, and
`.branch` carries a `scroll-margin-top` that clears the sticky page header —
without it a branch high enough in a chain for the page to reach `start` exactly
lands underneath it. Once, not once per render: flipping a switch reloads the
restaurant, and yanking the page back to where somebody arrived is not what
flipping a switch three branches down asks for.

**And the branch is not the answer either — the person is.** A team is a dozen
rows, so a jump that stops at the open branch leaves the same reading-down-a-list
it was meant to replace, one level lower. The row somebody clicked is tinted
(`.role--found`, §"arrived at" in DESIGN_SYSTEM) and nudged into view with
`block: 'nearest'`, which is a no-op for a row already on screen — this is a
nudge for the rows that need one, not a second jump. It runs when the team lands
rather than on a timer, because the row does not exist until then, and `teams`
changing *is* that arrival. The tint stays after the flash: somebody who looks
away and back still has to be able to tell which row they came for.

**Marked by assignment, not by person.** A team is rows of assignments, and
somebody managing two branches is in two of them — the person's id would mark
both, only one of which was clicked. The same id makes the DOM id unique, since
`GET /restaurant/branches/:id/people` filters strictly on the branch and an
assignment therefore appears in exactly one team. `aria-current` carries what the
tint says, because a tint is not read out.

**Filtering by role picks people, not roles.** A card still shows every
assignment within reach after a role filter, unlike the restaurants list, which
does narrow the branches under a card to what matched. The difference is what
the nested thing *is*: a branch there is a row you are navigating to, while an
assignment here is a permission somebody may be about to revoke — and a card
showing one of a person's three roles is how one gets taken away in the belief
it was the last.

**Long lists are paged, and the count is shown.** The customer list runs 25 a
page against the API's `page`/`limit` (capped at 50), the people list 20, the
restaurants 10; the pager's range summary reports the `total` behind it — a
list that quietly stops at the first fifty rows is a list that is wrong without
saying so. The page numbers come from `pageNumbers()` in `ui/core.tsx`, which is
pure and tested: the strip keeps one width so buttons do not move under the
cursor, and an ellipsis never stands in for a single page.

The one list with **no** pager is a team — a restaurant's admins, or one
branch's people. Both are asked for a scope at a time and neither is near the
API's cap of 50, so a pager would be a control that never does anything. It
takes the whole 50 and, if `total` is larger, says how many it is not showing
rather than stopping quietly.

The People tab carries **two pagers**, because it is two lists: open
invitations above the directory, filtered together and walked separately.
Reaching page 3 of the staff says nothing about which invitations somebody
wants to see. The invitations run 10 a page — the section sits above the people
everyone came for — and its pager renders nothing below that, which is nearly
always. It is there so the eleventh open invitation is reachable rather than
silently dropped off the end.

**Nothing is set optimistically on the order board.** Advancing a status waits
for the server's broadcast, so what is on screen is what was recorded — a
kitchen acting on a status that did not actually save is worse than a moment of
latency.

**The bell lives in the shell, not on the board.** The whole point of a reminder
is that it reaches somebody who is looking at something else: an order due at
eight is announced at ten past seven, and nobody is watching the Booked tab at
ten past seven. It sits at the foot of the sidebar, above the account menu,
gated on `orders:read` — every notification that exists is about an order.

It has **a socket of its own**, which is the reason `order-stream.ts` exports
two. The board's opens when somebody looks at the queue and closes when they
leave it; sharing it would leave the bell deaf on every screen but Orders. What
arrives on it is deliberately thin — an id and a branch — and the bell re-reads
the list rather than rendering the frame: `GET /staff/notifications` is where
reach is checked and where "have *I* seen this" is answered.

**Read is per person, and the API is what makes that possible.** A branch's bell
is read by people, one at a time, so opening it marks only the ids that were on
screen when it opened — a row that arrives while it is open stays new, which is
the honest answer. A colleague on their own tablet still sees everything as new.
A failed mark is swallowed rather than surfaced: failing to record that somebody
looked at a list is not worth interrupting them over, and the next open retries.

**Nothing in a notification is prose from the API.** The rows are written by a
job, and a job has no request to take a language from, so they carry a type and
some numbers and the sentences are built here — exactly as order statuses and
history entries are.

**Every card has a History button, because the card itself can only show the
present.** A badge reading "Preparing" cannot say when the order came in, who
confirmed it, or whether the card that paid for it was declined twice first —
and those are the questions asked at the counter when something is disputed.
The dialog behind it renders `GET /restaurant/orders/{id}/history`: the
placement, every status change with the person who made it, and every payment
attempt, oldest first.

It fetches **on every open**, not once. An order moves while the panel is
looking elsewhere, so a timeline held from the last time it was read would be
wrong exactly when somebody is checking it. It is not fetched with the board
either — fifty cards would be fifty timelines nobody asked for, on a screen that
is already polling every twenty seconds.

The button needs `orders:read`, the same permission as the board itself, rather
than `orders:advance`. Reading how an order got here is part of watching the
queue, and the person at the counter is often not the one allowed to move
anything.

**An entry that was not witnessed says so.** Two entries can look identical and
mean different things: one was written as the change happened, another was
worked out afterwards from the order row — `backfilled` for the orders that
predate the history table, `reconstructed` for the ones the dev seed inferred a
status change for. `noteLine` renders the caveat under the entry, because a
reader who cannot tell a record from a deduction is reading a story.

**A name in the timeline is a link to the person.** "Who confirmed this" is
rarely the last question — the next one is who they are, where else they work,
or what else this diner has ordered — and the answer used to be a name to
memorise and retype into another screen's search box. Staff open at
`/people?person=`, diners at `/customers?person=`, both narrowed to that one
person by id rather than by a search term: names are shared, and a `contains`
over them would answer with a colleague.

Only the name is the link. The words around it — "· customer", ", acting as this
account" — describe the entry rather than the person, so `actorSentence` cuts
the translated string at its `{name}` and `Who` renders the three pieces. The
alternative is markup inside a dictionary translators edit.

**A link is offered only where it leads somewhere.** `actorHref` returns null
when nobody is named, when the account is gone (`ON DELETE SET NULL` takes the
id with the name — a dangling id would be a link to an empty screen), and when
this account cannot open that screen: a shift holds `orders:read` and neither
`staff:read` nor `platform:users`, so for them the dialog reads exactly as it
did. The API enforces the same thing independently, and a staff id from outside
the caller's reach lists nobody rather than reaching past it. The impersonator
in an "acting as" line links too, always to People — only staff impersonate, and
only staff are impersonated.

## Tests

```bash
pnpm --filter @amragrir/admin test
```

`render.spec.tsx` renders every screen to a string and asserts it does not
throw. `tsc` proves the panel compiles; it cannot prove a hook is inside its
provider or a Radix part inside its parent, and those are exactly the mistakes a
component layer introduces. It renders through `react-dom/server`, so it needs
no jsdom and no testing library — effects never run, which means it covers the
first paint (the loading state) and nothing calls the API. Every screen is
rendered in all three languages, with the language pinned rather than resolved:
`resolveLanguage()` reads `localStorage` and `navigator`, and a suite whose
expected strings depend on the machine running it is worthless.

`language.spec.ts` covers what the type system cannot — a key that is present
but empty, a `{placeholder}` no caller passes, and the plural categories, where
Russian's `one` covers 21 and Armenian's covers 0.

`menu-history-ui.spec.ts` covers the sentence and the diff a dish's history
builds out of one recorded entry, away from the dialog that lists them: which of
`before`/`after` is the diff, that a price change is named rather than called an
edit, and that a value whose shape this build does not expect renders as
something odd rather than throwing — the entries come out of a JSON column
written by whichever build was deployed at the time. `order-history-ui.spec.ts`
and `activity-ui.spec.ts` do the same for the other two timelines. Every case in
all three is a line somebody will one day read in an argument about who changed
what, so a wrong one is worse than a missing one.

`customer-orders-ui.spec.ts` is the same idea for the dialog behind a customer's
order count, and the cases are the ones somebody acts on: that a deposit reads as
credited rather than charged, that a discount carries its sign, that an order
with no payment row says it was never paid for rather than going blank, and that
a row's link lands on the board scoped to its branch and narrowed to its code. It
also asserts that **every order status falls into exactly one of the three
narrowing filters** — a status in two is double counted on the segments and one
in none disappears from them, and neither fails loudly anywhere else.

`reminder-ui.spec.ts` covers pre-orders as the panel presents them: the notice a
shift may type (whole minutes, inside the same bounds the DTO enforces — a
half-typed "4.5" is not a number yet), the moment that notice would land
(**counted back from when the food is due**, which is the whole contract), the
card's two lines about a booking, and the sentences the bell builds out of a
job's numbers. It also pins the queue's sort key, including that a row which
never recorded a start time sorts **last** rather than first — the API's rule
too, and the two disagreeing would reorder the board under somebody's hand.
