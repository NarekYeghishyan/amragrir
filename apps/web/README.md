# @amragrir/web

Placeholder — not yet scaffolded. Customer-facing web (search, restaurant pages, booking/order flow).

## Stack

Next.js (App Router). Chosen over a plain React SPA specifically because public
restaurant/menu pages need SEO and fast first paint for discovery traffic — see
[docs/DEVELOPMENT_GUIDE.md](../../docs/DEVELOPMENT_GUIDE.md).

## Next step

Scaffold in place (run from this folder):

```
pnpm dlx create-next-app@latest . --typescript --app --src-dir --import-alias "@/*"
```

Then wire up `@amragrir/shared`, `@amragrir/i18n` and `@amragrir/ui` instead of
duplicating types, dictionaries, or primitives already defined there.
