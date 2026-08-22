# @amragrir/web

Customer-facing web — Next.js 15 (App Router). Public restaurant and menu
pages, server-rendered so they can be found.

## Running it

Needs the API (see [apps/api/README.md](../api/README.md)):

```bash
docker compose up -d                        # from the repo root
pnpm --filter @amragrir/api dev             # API on :3000
pnpm --filter @amragrir/web dev             # site on :3001
```

`API_URL` defaults to `http://localhost:3000/v1`, `SITE_URL` to
`https://amragrir.am` (used for canonical URLs, Open Graph and the sitemap —
override it on a preview deployment so it does not advertise production URLs).

## Why this app exists

`apps/mobile` is the product; this is the front door. Its job is that a page
about a restaurant can be indexed, so its whole design follows from one rule:
**the HTML that leaves the server already contains the content.** Verified —
strip every `<script>` from a restaurant page and the name, menu and prices are
still there.

## Layout

```
src/
├── middleware.ts        # maps the published URLs onto the [lang] tree
├── app/
│   ├── [lang]/          # Armenian at the bare domain; /ru and /en prefixed
│   │   ├── page.tsx     # listing + cuisine links
│   │   ├── search/      # noindex, follow
│   │   ├── r/[slug]/    # the page that matters: restaurant + menu + JSON-LD
│   │   ├── actions.ts   # every write in the app, as Server Actions
│   │   ├── cart/        # ─┐
│   │   ├── checkout/    #  │ the order flow — noindex, and
│   │   ├── preorder/    #  │ disallowed in robots.txt
│   │   │                #  │   (redirects into checkout, which absorbed it)
│   │   ├── signin/      #  │
│   │   ├── orders/      # ─┘ list + tracking
│   │   ├── basket/      # route handler: the priced basket, as JSON
│   │   ├── saved/       # route handler: is this branch favourited?
│   │   ├── profile/     # the account: counters, history, reorder, sign out
│   │   ├── favorites/   # the branches hearted, listed — and un-hearted here
│   │   ├── session/     # route handler: mints/refreshes, then bounces back
│   │   ├── [...missing]/# anything else → the designed 404, inside the layout
│   │   ├── not-found.tsx
│   │   └── loading.tsx  # one per segment, incl. the two above — see below
│   ├── robots.ts
│   └── sitemap.ts       # every restaurant × every language, with alternates
├── components/
└── lib/                 # api, language, jsonld, format, locations,
                         # session + cart (cookies), basket (priced), ready-times
```

## Decisions worth knowing

**A press is answered on the frame it happens, not when the server answers.**
Server rendering is what makes the catalogue indexable; the cost is that every
navigation is a round trip, and until it lands the browser holds the *old* page
unchanged — which reads as "nothing happened", so people press again. Two things
fill that gap. **Every segment has a `loading.tsx`**, so the router swaps a
skeleton in immediately and the visitor is already on the next screen while its
data is fetched; the skeletons are built from each page's real layout classes
(`components/Skeleton.tsx`), so what arrives settles into the shape on screen
rather than shoving it around. And **`RouteProgress`** in the layout draws the
thread of accent colour at the top of the window, marks the control that was
pressed, and stays silent for the first 140ms so the cached moves — most of them
— raise nothing. Its rules and arithmetic are in `lib/navigation-progress.ts`,
away from the DOM and unit-tested. Note the `<Suspense>` around it: it reads
`useSearchParams()` because the filter chips and a new search change nothing but
the query string, and without a boundary that would drag every page out of
static rendering.

**Language is in the URL, not in a header.** The API negotiates by
`Accept-Language` and this app did too, until the obvious problem: a crawler
sends one header, so only one of the three languages would ever be indexed —
which defeats the reason for building this app at all. Each language now has
its own address, linked with `hreflang` and `x-default`.

**Armenian is the default and has no prefix.** It is the market's language and
the overwhelming majority of the traffic, so it is served at the bare domain —
`amragrir.am/`, `amragrir.am/r/sunny-table` — and only Russian and English are
prefixed (`/ru`, `/en/r/sunny-table`). The middleware *rewrites* an unprefixed
path onto the `[lang]` tree, so the visitor keeps the short URL, and redirects
`/hy/…` to it with a 308: `/hy/r/x` and `/r/x` are one page, and serving both
would split its ranking between two addresses.

**Nothing reads `Accept-Language` any more.** It used to pick where a visitor
at `/` landed. That cannot survive an unprefixed default: a Russian-speaking
visitor who deliberately clicks "HY" is sent to `/`, and a header redirect
would bounce them straight back to `/ru` — leaving no way to ask for Armenian
at all. The URL is now the only thing that decides a language.

**An unknown prefix is a 404, not a fallback.** `/de/r/sunny-table` must not
quietly serve Armenian at a URL that would then be indexed. (It reaches the
`[lang]` tree as `/hy/de/r/sunny-table`, which matches no route.)

**Pages are pre-rendered, not rendered per request.** `generateStaticParams`
builds every restaurant in every language; `dynamicParams` stays on, so a
restaurant added after the build is still served and then cached.

**Data is revalidated every 60s.** Short because `isOpen` is on these pages — a
restaurant that stopped taking orders must not keep looking open. Names and
prices would tolerate hours.

**Search is `noindex, follow`.** Per-query pages are near-infinite and duplicate
the listings; letting a crawler enumerate them spends its budget on the wrong
pages. `follow` keeps the restaurant links discoverable.

**Home filter chips are real links, and a filtered home is `noindex`.** The
quick filters (Open now, Top rated, Ready soonest, Pickup, Reserve, Dine-in) are
`<Link>`s to `/[lang]?openNow=1&service=…` — they work with JavaScript off and a
crawler follows them. Each maps to a real `/restaurants` parameter; none is
decorative. But a filtered view is one of near-infinite permutations that
duplicate the listing, so — exactly as with search — an active filter makes the
page `noindex, follow`, and the canonical always points at the bare `/[lang]`.
The design's "Near me" chip is deliberately not built: it needs the visitor's
coordinates, which only the browser can supply, so it belongs to a client
geolocation flow rather than a server-rendered link.

**The listing asks for restaurants, not branches.** A row from `/restaurants` is
a branch — the thing a guest travels to. The app tells a chain's branches apart
by distance; this app has no coordinates and exactly one page per restaurant, so
ungrouped it drew Green Bean five times, five identical cards all linking to the
same URL, under a heading counting 78 "restaurants" where there were 23. The
listing passes `groupByRestaurant=1`, which collapses after filtering and
ordering and picks the branch `/restaurants/{slug}` itself resolves to — so a
card reading "open · 8 min" agrees with the page behind it. `sitemap.ts` and
`generateStaticParams` collapse by slug for the same reason; they are the two
places that already got this right.

**The design is transcribed from the artifact, not approximated.** Every
measurement in `globals.css` — the per-screen columns (1220px for the catalogue,
980 for the checkout, 900 for the basket), the 72px glass header, the 28px-radius
gradient hero, the 180px card media, the chip paddings — comes from
[docs/design/Amragrir Web (standalone).html](../../docs/design/Amragrir%20Web%20(standalone).html),
which is in the repository so the next person can diff rather than guess. That
diff is the point, and it has been worth running twice: a second read on
2026-08-06 turned up eight places where the built screen and the drawing had
quietly parted company, including a header control that was the wrong shape
entirely. `docs/design/README.md` records what moved and what deliberately did
not. Where the artifact
names a token this app uses the repo's spelling: `--accentSoft`, `--ph1`,
`--ph2` and a literal `#F5A623` are `--accent-soft`, `--placeholder`,
`--placeholder2` and `--star` here.

The artifact's **cart button, per-dish `＋`, sticky order panel, checkout
slide-over, avatar and location dialog are all built** — see "Ordering" and
"Where the visitor is" below.

Its **menu tabs filter** the dish list, and so do these — since 2026-08-06. They
were anchors that scrolled through a page showing every section at once, because
a tab that hid three quarters of the menu would defeat the one rule this app
exists for. The premise held and the conclusion did not: the tabs filter **in
CSS**. Each pill is a `<label>` around a radio, `.menu:has(input:checked)` picks
the section to paint, and every section is in the markup either way — so the
crawler still receives the whole menu, and the tabs still work with JavaScript
off. The rule is gated behind `@supports selector(:has(*))`: without `:has()` the
hiding would apply and the un-hiding would not, and the page would be a menu with
no dishes on it. A browser that old gets every section at once, under headings,
which is exactly the page this replaced.

Two of its six filter chips were dropped for the same reason as "Near me":
"Ready in 15 min" is a threshold the API does not offer (it sorts), and "Near
Me" needs coordinates. The four that map are kept, with two more the artifact
lacks.

**Money is formatted here and computed nowhere.** The server owns every total.

## Ordering

The web is a storefront now, not a shop window. Phase 9 had deferred ordering
on the grounds that it would duplicate the riskiest code in the product; that
call was reversed, and the whole chain works here: add dishes → basket →
when & how → sign in → pay → pickup code and tracking. Pickup and dine-in both,
and a ready time up to a week out, which is the thing the product is named for.

**No API work was needed.** Every endpoint already existed and was tested —
`/auth/guest`, `/auth/send-code`, `/auth/verify-code`, `/cart/quote`,
`/restaurants/{id}/availability`, `/reservations`, `/orders`, `/payment-methods`,
`/payments`. This app was simply the one client that never called them.

**The browser never talks to the API.** Every write is a Server Action driven by
`<form action={…}>`; the Next server holds the tokens and makes the call. That
keeps the rule the read path already followed — no `NEXT_PUBLIC_API_URL`, no API
address in the bundle, no CORS — and adds two more. Tokens live in an httpOnly
cookie, so no script on the page can read one. And because every step is a plain
form POST followed by a redirect, **the entire flow works with JavaScript
disabled**: stepping quantities, booking a table, signing in, paying.

**On a restaurant page the redirect is skipped.** Nothing the server renders
there depends on the basket — that is what keeps the page pre-rendered — so
rebuilding the whole route to add one dish threw away and re-made a page of menu
for the sake of two numbers drawn in the browser. `addToBasketLive` and
`changeLineQtyLive` do the same write and neither revalidate nor redirect; they
return the priced basket instead (`lib/basket-panel.ts`, shared with
`GET /[lang]/basket` so the two cannot disagree), and `lib/basket-live.ts` hands
it from the dish `＋` to the panel. The forms are untouched underneath: the live
path is taken only once React is driving (`useScripted`), so with JavaScript off
the page behaves exactly as the paragraph above says. The quantity moves
optimistically; **no amount does** — money is the server's on this page as on
every other.

**The basket is a cookie holding ids and quantities — never money.** Every total
on every screen comes from `POST /cart/quote`, re-priced on each render, because
a dish can sell out or a branch can close between two page views and the number
on the Pay button has to be the number that gets charged. A price kept in a
cookie is a price the customer can edit. The cookie is re-validated on read
against `ORDER_MAX_LINES` and `ORDER_MAX_ITEM_QTY` from `packages/shared` — the
same bounds the API enforces — so a hand-edited basket is refused here rather
than three screens later.

**A guest account is minted on the first deliberate act**, not on a page view.
Adding a dish creates one; browsing or crawling the catalogue does not, which
keeps the users table free of rows that were never going to order anything.

**The basket screen says which *branch*, and asks for it by id.** `POST
/cart/quote` returns the restaurant's name and nothing else about it, so the
card at the top of `/cart` (`BranchCard`) fetches the catalogue's own record —
by `cart.branchId`, never by the slug. A slug resolves to one branch of a
restaurant that may have several (`dolmama` is always the Saryan kitchen), and a
screen that prints an address has to name the branch its quote was priced
against. The same fetch feeds the dish photographs, which the quote does not
carry. Both are wrapped in a `catch`: the totals come from the quote, and the
basket must still show what was collected and what it costs when the catalogue
is unreachable.

**Two cookies, on purpose.** The basket is httpOnly; a second cookie holds
nothing but the item count and *is* readable. That second one exists so the
header basket can be drawn in the browser — reading a cookie on the server would
opt every page, including every restaurant page, out of pre-rendering, which
would undo the decision three paragraphs up. The count comes from that cookie and
the total from `GET /[lang]/basket`, which returns money already formatted, so
nothing here adds anything up. Both are the part that needs JavaScript, and they
are decoration on a path that works without it: every screen links to the basket
in its own markup.

**That count cookie is polled, not listened for** (`lib/basket-count.ts`). A
basket write is a Server Action answering with `redirect()`, which Next resolves
as a client-side re-render rather than a document load — so `pageshow`, `focus`
and `storage` never fire, and the header badge and the restaurant page's order
panel, which both waited for exactly those, were never told the basket had
changed. They read the cookie through `useSyncExternalStore` over a 250ms poll
now (the events are kept for a restored or refocused tab). No cookie-change
event exists in every browser, and the obvious alternative — reading the basket
in the layout — is the thing this app may not do.

**Checkout is one page: mode, timing and payment together.** It used to be two —
`/preorder` chose how and when, `/checkout` was the design's right-hand drawer
with the payment in it — and the refreshed artifact draws a single two-column
screen instead. `/preorder` now redirects here (bookmarks and back buttons still
have to land somewhere sensible) and the intercepting drawer route is gone.

Two consequences worth knowing. The payment radios are on the left and "Place
order" is in the right-hand summary, which HTML already has an answer for: a
submit button outside a form owns it by `form="…"`, so choosing a method and
paying is still one native POST with no JavaScript in the path. And **nobody is
asked to sign in on arrival any more** — that was right when this page was only
the payment, but it would now be a toll gate in front of choosing take-away and
a time. Booking and paying each redirect to `/signin` and come back; everything
chosen lives in the basket cookie, so nothing is lost on the way.

**Its two times are native fields, and that makes the left column one form.**
The artifact draws a `datetime-local` for the table and a `time` for the food,
and this app now draws both (`docs/design/README.md`, eighth pass). A native
field holds its value nowhere but the page, so anything that reloads the screen
loses it unless the reload carries it — which rules out the row of `<Link>`s the
party size used to be, and the form-per-control the rest of the screen used to
be. Everything below the mode tiles is therefore one `<form>`, and the buttons
say what they meant in plain HTML:

| Button | Sends | `submitCheckout` does |
|---|---|---|
| a party-size chip | `guests=<n>` | stores what the fields say, redraws |
| the CTA, dine-in with no table | `intent=book` | stores, then `POST /reservations` |
| the CTA, otherwise | `intent=pay` | stores, then `POST /orders` + `POST /payments` |

`intent` on the button rather than a `formAction` per button, because React
encodes which action a `formAction` names **in that button's own `name`** — and
the party chips need theirs for the number they carry. Storing first is what
makes the sign-in round trip and a refused booking both come back to the time
already typed; `Cart.reservedFor` and `Cart.guests` are in the cookie for that
reason alone. An unrecognised submit falls through to store-and-redraw, which is
the harmless answer.

**A field can name a time the API refuses, and that is the trade.** The grid it
replaced only ever offered times `GET /availability` had just listed. `min`,
`max` and `step` keep the obviously-impossible out of the browser's own picker —
the next half hour, `ORDER_MAX_LEAD_DAYS` out, on the half-hour — and
`POST /reservations` answers the rest with a 422 that the page draws above the
fold. Leaving "Ready at" **empty** means as soon as possible, which is the
absence of a `readyAt` rather than a value of one; a hint under the field says
so, because an empty `--:--` cannot.

**Order confirmation is a page, not the artifact's toast.** What it carries is
the pickup code, and that has to survive a reload, be reachable again from the
orders list, and still be there at the counter twenty minutes later. A toast can
do none of those.

The code is printed as digits **and as a scannable QR** (`components/PickupQr`,
encoding with `@amragrir/ui`'s `encodeQr` at render — a server component, so the
encoder never reaches the browser). It earns the picture because the code stopped
being something read out loud: the back office cannot mark an order collected
without being told it, so a counter *types* those six digits, and six digits off
a stranger's screen at a queue is where the wrong order gets handed over. The
plate is white with dark modules in both themes — that choice belongs to the
scanner, not to the reader's theme.

**Paying is committing.** An order can be cancelled only while it is unpaid
(`BUSINESS_LOGIC.md §4`) — paying commits it for the customer *and* the
restaurant, because the kitchen has started. The screens say so before the
button, not after it.

**Card only, and the wallets say why.** `GET /payment-methods` returns Apple Pay
and Google Pay too, but both need a browser payment SDK and merchant validation
this app does not have. They are rendered visible and disabled, labelled
"available in the app", rather than as live buttons that cannot pay — which is
the dead end the previous design pass existed to remove. There is no cash path
at all; the design artifact still draws one, and `BUSINESS_LOGIC.md §5` is the
authority.

**Tracking watches the order; it does not reload to find out.** The kitchen
moves an order from the back office, and the four steps — Confirmed, Preparing,
Almost ready, Ready — have to follow it. They used to, by re-running the whole
server component every ten seconds and swapping the tree for the answer: the
entire page rebuilt to change one word, and nothing moved until the round trip
landed. `OrderLive` asks a much smaller question instead —
`GET /[lang]/orders/[id]/status`, three fields — and `OrderSteps` and
`Countdown` repaint from it in place. No navigation, no scroll jump, no flash,
and the new step is announced in a polite live region because nothing reloads
to announce it any more.

**The server component still re-runs, but only when something it drew has
changed** — the status, or the promise the clock counts to. Whether the order
can still be cancelled, whether the headline reads confirmed or cancelled,
whether there is a countdown at all, what time it says the food arrives: the
server's to decide, and not to be guessed at in the browser. So a *change*
triggers `router.refresh()` behind the repaint that already happened. A falling
`secondsLeft` is not a change — it differs in every answer, and refreshing on it
would be the old behaviour back at twice the rate. The watcher stops
entirely once the order can no longer move, and on a `401` or `404` — a session
that ended, an order that is not this visitor's — because neither improves by
being asked again.

**Still polling, not the order socket.** The gateway authenticates in its first
message and this page has no token to put there: the session is an httpOnly
cookie, deliberately unreadable from the browser. Bridging the socket
server-side — the Next server holding the upstream connection and streaming it
down as SSE — is the upgrade, and it costs a WebSocket client in the server plus
one held connection per viewer, which is a deployment decision rather than a
component one. The route handler needs neither.

**The header bell took that upgrade; this page has not yet.** See below — the
same wall, two answers, and the tracking page is the one that can afford to
wait: it is already asking every five seconds, and it is open for minutes rather
than for as long as the tab is. Moving it onto the stream is a small change now
that the bridge exists (`app/[lang]/notifications/stream/route.ts` is the whole
pattern), and it would drop this page's request count to zero between changes.

## The bell, and the two ways this app is told things

`NotificationBell` in the header is **pushed**, not polled. The browser opens
`GET /[lang]/notifications/stream`, and that route handler — which *does* get
the cookie — reads the session, holds a `watchMe` WebSocket to the API, and
streams what arrives down as Server-Sent Events. Measured at **53ms** from a
kitchen pressing a button to the badge moving, against up to 30 seconds for the
poll it replaced.

Node 22 and later ship a global `WebSocket`, so the "WebSocket client in the
server" the paragraph above worried about costs no dependency at all. What it
does cost is real and unchanged: **one held connection per open tab**, on both
sides of this server. On a host that bills wall-clock or caps request duration,
the 30-second poll in `notifications/route.ts` is still there and still takes
over on its own — the client falls back whenever the stream cannot be opened,
so that deployment loses immediacy and nothing else.

**The stream answers 401, never 500, for a session that ended.** `EventSource`
retries a dropped connection forever but gives up permanently on a response
that was not a stream, which is exactly the behaviour wanted for a signed-out
visitor — and exactly why a 500 there would be a reconnect loop against a
session that is never coming back.

### `public/notifications-sw.js`

A service worker that caches nothing, intercepts nothing and does not make this
app work offline. It exists because **Android Chrome refuses
`new Notification()`** and will only show one through the worker — and a phone
with the site open is the case a browser alert is for. It also owns the click,
so tapping an alert focuses the tab that is already open rather than opening a
second one.

Adding a `fetch` handler would put it in front of every request this site makes,
which is a large thing to take on for a bell and hard to undo in a browser that
has already installed it. It is deliberately not a PWA.

The alert is raised **by the page, from the stream it is already holding** —
there is no push subscription and no VAPID key, so it only happens while the
site is open somewhere. Real push, with the site closed, is `POST /devices` and
needs FCM/APNs credentials that live outside this repository. Permission is
asked from a press inside the bell panel and never on load: every browser now
penalises a prompt raised on load, and a refusal is permanent from this app's
side. On an iPhone the whole control is hidden — Safari has no `Notification`
at all until the site is installed to the home screen, and offering a button
that cannot work is worse than not offering one.

**The countdown ticks between answers, and re-syncs from each one.** Five
seconds is the right cadence for a status and the wrong one for `mm:ss`, so
`Countdown` counts on from the server's `secondsLeft` once a second. It counts
*elapsed time* rather than holding a number of its own, measured against
`Date.now()` so a throttled or sleeping tab comes back right instead of minutes
behind, and every answer from the watcher replaces what it reached — a kitchen
that pushes `readyAt` back lands here rather than leaving the clock running out
against a promise nobody made. The server is still the only thing that decides
what is left.

With JavaScript off none of this runs and nothing is lost that was not already
lost: the page renders every fact the server knew, and the refresh link below
the steps is the way forward.

**The order pages are `noindex` *and* disallowed in `robots.txt`.** `noindex` is
only read after a fetch, and these are pages a crawler should not fetch at all:
they do real work per request — pricing a basket, reading an order — for a
client that can never have either. For the same reason the orders screens send a
visitor with no session to sign in rather than through the guest-minting route,
which would otherwise loop forever for anything that keeps no cookies.

**The restaurant page shows a live basket without giving up its pre-rendering.**
These 69 pages are the ones discovery traffic lands on, so they are HTML on
disk; a single `cookies()` call in one of them would make every one render per
request. The design's order panel needs the basket anyway — so it is a client
component reading `GET /[lang]/basket`, a route handler that reads the httpOnly
cookie, prices it with `POST /cart/quote`, and answers with **strings the server
formatted**. The page stays static, the panel fills in after hydration, and the
rule that no client computes money is untouched: the browser receives
`"1 860 ֏"` and has nothing to add up. With JavaScript off there is no panel,
and the block above the menu still links to the basket in plain HTML.

That route **refreshes the token itself** on a 401. An access token lives
fifteen minutes and a menu can be open for longer, so an expired one is the
ordinary case here, not an exception — and swallowing it would leave the panel
saying "your basket is empty" beside a header badge reading 3. A Route Handler
may write cookies where a page may not, which is the same fact `/session` exists
because of.

**Every refresh goes through one shared rotation (`lib/session-refresh.ts`).**
A refresh token is single-use: the API rotates it and revokes the old one, so
the *second* request to present the same token gets a 401. Three things here can
notice an expired access token at once — `/session` (a reload), the basket panel,
and the tracking page's status poll — and before this each called `api.refresh`
on its own. Two firing together meant one 200 and one 401, and when the loser was
`/session`, its 401 path **mints a guest** — silently turning a signed-in
customer into one and bouncing them back to sign in. That is the "I refreshed the
page and got logged out" bug, and the tracking poll (five-second) is what made it
easy to hit. The helper keys an in-flight-and-just-settled promise on the token
being spent, so concurrent callers share one rotation and one new pair, each
writing it to its own response. It is **in-process** — one Next server, like the
API's single-instance order emitter; the complete cross-instance and
cross-client (mobile too) fix is a short **grace window on the API's rotation**,
where a token consumed a moment ago returns the same new pair to a concurrent
retry instead of a 401. That is the next step if this is ever run as more than
one web instance.

**Where the visitor is, is a point.** `GET /restaurants` computes `distanceKm`
and can sort by it, but only for a caller that sends `lat`/`lng`. So the header's
control stores a `Place` — `lat`, `lng` and the name to show for it — in a
**readable** cookie, and the home page turns it into those two parameters. Two
consequences follow from the pre-rendering rule above: the control itself is a
client component, because reading a cookie in the root layout would opt all 69
restaurant pages out of static rendering; and the cookie is deliberately not
httpOnly, like the basket count, because nothing in it decides money. The "near
me" chip is `sort=nearest` and appears only once a place is chosen — with no
origin the API answers in its default order, and a chip that lit up and changed
nothing would be a lie about the listing.

It was six districts for as long as the picker's map was a drawing, because
there was nothing between the pins to click. **The map is a real one now**
(`components/YandexMap.tsx`), so there is — and as of 2026-08-06 the districts
are not a control at all: the row of chips is gone. `AREAS` stays as the
vocabulary the app names points in (`nearestArea` labels a tapped point when no
geocoder can do better, and the drawn placeholder still shows their pins), but
nothing in the dialog offers them to press.

**The map is Yandex's public widget in an `<iframe>`**, not their JS API. The
API needs a key, and a map that is blank wherever nobody has configured one is
not a map. The widget needs nothing — no key, no quota, no script running on
this page — and it always works.

What it cannot do is talk. Everything inside the frame is another origin: a tap
in there is not reportable out here, and neither is a pan, so a frame left to
its own devices would show one place while the pin claimed another. **So the
frame is never asked.** It is made `inert`, and this app owns the viewport: the
pin is an element drawn on top, panning is a CSS transform, and
`lib/map-frame.ts` does the projecting between pixels and coordinates. That is
ellipsoidal Mercator (EPSG:3395), the projection Yandex's tiles use, and not the
spherical one most maps use — the difference is 0.4% of every north-south move,
which is a pin in the wrong street and no error message anywhere. A round trip
cannot catch that, so the test asserts the gap against the spherical formula
written out beside it.

Two consequences worth knowing before editing it. The frame is drawn `BLEED`
pixels larger than its box on every side, because changing its URL reloads the
widget: a drag slides real tiles into view for free, and only a zoom, or a pan
that has used up the margin, costs a reload. And the frame is built **when the
dialog opens**, never before — an `<iframe>` inside a closed `<details>` still
loads, so a map left in the markup would fetch the widget on every page of this
site for the great majority of visits that never open the dialog. The
placeholder until then is the artifact's drawing, which is also the whole map on
a page with no JavaScript.

The widget draws its own logo and terms link in a corner the bleed pushes out of
sight, so the credit is put back by hand as a link to the same view on
`yandex.ru/maps`. Its theme is passed in the URL for the same reason: a frame on
another origin inherits none of this page's tokens, and a dark page would
otherwise open a dialog with a white rectangle in it.

The cookie's format is `lat~lng~base64url(label)`, and the odd-looking choice of
alphabet is the point: every character it can produce is one
`encodeURIComponent` leaves alone. Next URL-encodes cookie values on the way
out and the browser reads `document.cookie` raw, so any other format would be a
bug that only shows up for names with a space in them.

Behind it is **the design's dialog**, a `<details>` whose `open` React controls —
which is how it manages to be a modal for a browser and a plain disclosure for a
reader without one. With JavaScript: Escape and the scrim close it, focus moves
in and returns, the page behind stops scrolling, and the map, the address search
and **"use current location"** appear. Nothing is stored until confirm, so
trying four points is one navigation, not four.

**Without JavaScript the dialog opens and closes but chooses nothing.** The
summary opens it natively, "confirm" is still a `<form>` submit posting
`chooseLocation`, and ✕ is a submit on a second, hidden form that re-posts the
place already stored — a write that changes nothing and redirects back out. What
is gone is the answer: the district radios were removed with the chip row on
2026-08-06, and every control left in there needs a browser. Confirm on such a
page posts an empty `place`, which clears the cookie to the whole city — the
state that reader was already in. Distance on a card and `sort=nearest` are the
only things this costs, and both are already absent for anyone who has not
chosen.

`chooseLocation` therefore reads **one field**, `place`. It used to read a second
one, `preset`, carrying the district radio for exactly the scriptless case above;
nothing sends that name any more and the fallback went with the radios.

**A ✕ on the glass badge** that names the pending place is the way back to the
whole city. "All districts" used to be the first chip in the removed row, and it
was the only un-choose there was — without a replacement, a visitor's first
choice would have been permanent. Pressing it also **takes the map back to
Yerevan** (`YEREVAN` — Republic Square at zoom 12, where the map opens with
nothing chosen and the centre `lib/geocode.ts` biases searches around). Leaving
the view framed at zoom 16 on the street somebody had just rejected, under a
badge reading "all districts", would have been showing the opposite of the
answer.

**Recently chosen points** sit at the top of the dialog, five of them, in
`localStorage` (`lib/recent-places.ts`). Not a cookie: only this dialog reads
them, and a cookie would ride along on every request to every page for a row of
chips most visits never see. The chosen place itself is a cookie because the
*server* needs it — that is the whole difference between the two.

**One key, and it never leaves this process.** The map takes none. The geocoder
takes `YANDEX_GEOCODER_API_KEY`, which Yandex cannot restrict to a domain — so
it stays on the server and the browser calls `GET /[lang]/geocode` here instead,
the same rule `lib/api.ts` states for the product API. All the page is told is
whether there is one. It is optional: without it the map still takes any point,
named after the nearest district rather than by its address, and **the search
box is not rendered at all** — with no key its only job was filtering the
district chips, and those are gone, so a box there would answer nothing.
`.env.example` says this next to the variable.

One note for anyone editing it. The header drops its `backdrop-filter` while
the dialog is open (`header.site:has(.locpick[open])`) because a
`backdrop-filter` makes its element the containing block for fixed-position
descendants, and the dialog is inside the header — without that rule the overlay
is trapped in a 72px strip.

## Not built

App-store links belong in the restaurant CTA once such URLs exist; the branch
phone sits there today beside the basket link.

**Favourites *are* built, and written here — not only read.** Every card carries
the same heart the app draws, as a `<form>` posting `toggleFavorite`
(2026-08-09), and the two clients share one list. It saves the **branch** the
card describes (2026-08-13, DATABASE.md §13), so `/favorites` prints an address
per row and links each one by branch id — `/r/{branchId}` is a URL this site
serves, with its canonical pointing back at the slug. The listings keep their
slug links: those are the canonical pages, and the grouped listing picks the
branch a slug resolves to anyway.

What is genuinely absent from the design's account rows are saved addresses and
stored cards, for stronger reasons: there are no couriers, and
`GET /payment-methods` lists what the platform accepts rather than anything
somebody saved.

**The header's account mark is a person, not an initial.** The design draws the
customer's own letter; this header cannot know it. The session cookie is
httpOnly by design, and reading it here would cost the catalogue its
pre-rendering — so the mark is neutral and `/profile` asks whoever presses it to
sign in.

The light/dark toggle **is** built. It works entirely off the tokens —
`tokens.css` emits `:root[data-theme='…']` blocks that beat the system
preference — so the toggle only sets one attribute on `<html>` and stores the
choice. A tiny inline script in the layout applies the stored theme before the
first paint, so there is no flash of the wrong theme on load.

The `localStorage` key that script and the toggle share lives in `lib/theme.ts`,
a plain (non-`'use client'`) module, on purpose: the layout is a Server
Component, and importing the key from the client toggle would hand the server a
client-reference proxy instead of the string — the inlined script would render
as broken JavaScript and apply no theme. A guard test keeps the key module
server-safe.

The footer's column items are plain text because the pages behind them —
About us, Careers, Terms — do not exist. They become links when the pages do.
