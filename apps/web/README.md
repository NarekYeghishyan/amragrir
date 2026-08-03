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
│   │   ├── preorder/    #  │ the order flow — noindex, and
│   │   ├── checkout/    #  │ disallowed in robots.txt
│   │   ├── signin/      #  │
│   │   ├── orders/      # ─┘ list + tracking
│   │   ├── @modal/      # (.)checkout — the same panel as a slide-over
│   │   └── session/     # route handler: mints/refreshes, then bounces back
│   ├── robots.ts
│   └── sitemap.ts       # every restaurant × every language, with alternates
├── components/
└── lib/                 # api, language, jsonld, format,
                         # session + cart (cookies), basket (priced), ready-times
```

## Decisions worth knowing

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
measurement in `globals.css` — the 1220px column, the 72px glass header, the
28px-radius gradient hero, the 180px card media, the chip paddings — comes from
[docs/design/web-landing.html](../../docs/design/web-landing.html), which is in
the repository so the next person can diff rather than guess. Where the artifact
names a token this app uses the repo's spelling: `--accentSoft`, `--ph1`,
`--ph2` and a literal `#F5A623` are `--accent-soft`, `--placeholder`,
`--placeholder2` and `--star` here.

The artifact's **cart button, per-dish `＋`, sticky order panel and checkout
slide-over are all built** — see "Ordering" below. Three things in it are
deliberately **not**, and each is a decision rather than a gap. Its **location
selector** needs the visitor's coordinates, which is a client geolocation flow.
Its **avatar** implies a profile screen that does not exist yet, though signing
in does. And its **menu tabs filter** the dish list, where this app renders them
as anchors that scroll — a tab that hid three quarters of the menu would defeat
the one rule the app exists for.

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

**Two cookies, on purpose.** The basket is httpOnly; a second cookie holds
nothing but the item count and *is* readable. That second one exists so the
header badge and the sticky "View basket" bar can be drawn in the browser —
reading a cookie on the server would opt every page, including every restaurant
page, out of pre-rendering, which would undo the decision three paragraphs up.
The badge is the one thing that needs JavaScript, and it is decoration on a path
that works without it: every screen links to the basket in its own markup.

**Checkout is one component in two presentations.** Reaching `/[lang]/checkout`
by clicking renders the design's right-hand drawer, via an intercepting route;
loading that URL directly — a reload, a pasted link, no JavaScript — renders the
same component as a full page. The drawer keeps a real URL instead of being a
state that vanishes on refresh.

**Order confirmation is a page, not the artifact's toast.** What it carries is
the pickup code, and that has to survive a reload, be reachable again from the
orders list, and still be there at the counter twenty minutes later. A toast can
do none of those.

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

**Tracking polls; it does not use the order socket.** `router.refresh()` every
ten seconds re-runs the server component, so the status and timer come from the
API rather than a copy in the browser. The gateway needs its own authenticated
handshake and the token deliberately lives in a cookie the page cannot read;
the socket is the upgrade once that token can be handed over server-side.
Without JavaScript the page renders every fact and offers a refresh link.

**The order pages are `noindex` *and* disallowed in `robots.txt`.** `noindex` is
only read after a fetch, and these are pages a crawler should not fetch at all:
they do real work per request — pricing a basket, reading an order — for a
client that can never have either. For the same reason the orders screens send a
visitor with no session to sign in rather than through the guest-minting route,
which would otherwise loop forever for anything that keeps no cookies.

## Not built

App-store links belong in the restaurant CTA once such URLs exist; the branch
phone sits there today beside the basket link.

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
