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

**Money is formatted here and computed nowhere.** The server owns every total.

## Not built

The ordering and booking flow. It exists in `apps/mobile`, and duplicating
checkout, payment and tracking here would be a second implementation of the
riskiest code in the product for no new capability — the restaurant pages link
to the app instead. Revisit when there is evidence of web visitors wanting to
order without installing anything.
