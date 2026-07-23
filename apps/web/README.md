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
├── middleware.ts        # negotiates a language once, then redirects
├── app/
│   ├── [lang]/          # every page lives under /hy, /ru or /en
│   │   ├── page.tsx     # listing + cuisine links
│   │   ├── search/      # noindex, follow
│   │   └── r/[slug]/    # the page that matters: restaurant + menu + JSON-LD
│   ├── robots.ts
│   └── sitemap.ts       # every restaurant × every language, with alternates
├── components/
└── lib/                 # api (server-side fetch), language, jsonld, format
```

## Decisions worth knowing

**Language is in the URL, not in a header.** The API negotiates by
`Accept-Language` and this app did too, until the obvious problem: a crawler
sends one header, so only one of the three languages would ever be indexed —
which defeats the reason for building this app at all. Each language now has
its own address, linked with `hreflang` and `x-default`. `Accept-Language` is
still consulted once, in the middleware, to decide where a visitor at `/` lands.

**An unknown prefix is a 404, not a fallback.** `/de/r/sunny-table` must not
quietly serve Armenian at a URL that would then be indexed.

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

**Money is formatted here and computed nowhere.** The server owns every total.

## Not built

**The ordering flow — and the web design disagrees.** The Claude Design web
artifact contains a cart drawer, ready-time pills, payment methods and an
order-confirmed modal. Phase 9 deferred all of it on the grounds that it would
be a second implementation of the riskiest code in the product (checkout,
payment, tracking) for no new capability, with the restaurant pages linking to
the app instead.

That call is worth revisiting, but it is a product decision rather than a
missing task: it is the difference between the web being a shop window and the
web being a second storefront.

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
