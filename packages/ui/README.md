# @amragrir/ui

Design tokens — **the single source** for colours, spacing, radii and type,
transcribed from [docs/DESIGN_SYSTEM.md](../../docs/DESIGN_SYSTEM.md).

## Why this exists

The palette used to be hand-copied into three files: `apps/mobile`'s theme,
`apps/admin`'s stylesheet and `apps/web`'s. Changing the accent colour meant
three edits, and nothing caught a missed one — the phone and the website could
disagree about the brand colour and no test would notice.

Now there is one file, and a test that fails if anything drifts from it.

## How each app consumes it

| App | How |
|---|---|
| `apps/mobile` | imports the objects (`palette`, `spacing`, …) directly — React Native needs numbers, not CSS |
| `apps/web` | `@import './tokens.css'` in `globals.css` |
| `apps/admin` | `@import './tokens.css'` in `styles.css` |

`tokens.css` is **generated**, not written. After changing `src/tokens.ts`:

```bash
pnpm --filter @amragrir/ui build:css
```

That regenerates both apps' copies. Forgetting to run it is caught by
`pnpm --filter @amragrir/ui test`, which compares the checked-in files against
what the generator produces.

## Adding a token

1. Add it to `ThemeColors` in `src/tokens.ts` — **both themes**, or it will not
   compile.
2. Regenerate the CSS.
3. Record it in `docs/DESIGN_SYSTEM.md`, which is the human-readable spec.

An app-specific value that is not part of the design system (web's wider corner
radius, for instance) stays in that app's own stylesheet, layered on top.

## Not here yet

Shared React primitives (Button, Input, Card) for `apps/web` and `apps/admin`.
Both apps currently style with plain CSS classes; extracting components is worth
doing once the same one is needed in both, not before.
