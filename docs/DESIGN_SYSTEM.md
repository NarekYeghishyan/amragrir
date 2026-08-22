# DESIGN_SYSTEM.md

> Amragrir.am design system. Values are extracted directly from the design (CSS variables, inline styles). Warm amber palette, light/dark themes.

**In code these live in `packages/ui/src/tokens.ts` — one source for all three
apps.** `apps/mobile` imports the objects; `apps/web` and `apps/admin` consume
`tokens.css`, which is generated from that file
(`pnpm --filter @amragrir/ui build:css`). A test fails if a generated file
drifts from the source, so the palette cannot quietly differ between the phone
and the website. This document stays the human-readable spec — when a value
changes, change both.

---

## 1. Colors (CSS variables)

The design is built on CSS custom properties. There are two themes — `:root` (light) and `.theme-dark`.

### Light theme (`:root`)

| Variable | Value | Purpose |
|---|---|---|
| `--stage` | `#e9e6df` | "Stage" background around the device |
| `--bg` | `#F6F5F2` | App background |
| `--card` | `#FFFFFF` | Cards, surfaces |
| `--ink` | `#1A1712` | Primary text |
| `--ink2` | `rgba(26,23,18,.56)` | Secondary text |
| `--ink3` | `rgba(26,23,18,.32)` | Tertiary text / icons |
| `--line` | `rgba(26,23,18,.09)` | Borders, dividers |
| `--accent` | `#EA5B12` | Accent (amber-orange), CTA |
| `--accent2` | `#FF8A3D` | Secondary accent (gradients) |
| `--accentSoft` | `#FFF0E6` | Soft accent fill (badges) |
| `--chip` | `#F1EFEA` | Chip / toggle background |
| `--ph1` / `--ph2` | `#EFE7DD` / `#E6DACB` | Image placeholders (hatching/skeletons) |
| `--good` | `#12A150` | Success, "open", deposit credit |
| `--danger` | `#D64524` | Declined card, unpaid order, cancel action |
| `--dangerSoft` | `#FDEAE4` | Soft fill behind a `--danger` state |
| `--shadow` | `rgba(60,40,15,.12)` | Shadows |
| `--glass` | `rgba(246,245,242,.78)` | Glass surfaces (blur) |
| `--scrim` | `rgba(26,23,18,.42)` | Backdrop behind a modal or bottom sheet |

### Dark theme (`.theme-dark`)

| Variable | Value |
|---|---|
| `--stage` | `#0a0908` |
| `--bg` | `#100E0B` |
| `--card` | `#1B1815` |
| `--ink` | `#F6F3EE` |
| `--ink2` | `rgba(246,243,238,.6)` |
| `--ink3` | `rgba(246,243,238,.34)` |
| `--line` | `rgba(246,243,238,.1)` |
| `--accent` | `#FF6A1F` |
| `--accent2` | `#FF9A52` |
| `--accentSoft` | `rgba(255,106,31,.15)` |
| `--chip` | `#26221D` |
| `--ph1` / `--ph2` | `#241F19` / `#2F2820` |
| `--good` | `#2EC76F` |
| `--danger` | `#F26B48` |
| `--dangerSoft` | `rgba(242,107,72,.16)` |
| `--shadow` | `rgba(0,0,0,.55)` |
| `--glass` | `rgba(16,14,11,.72)` |
| `--scrim` | `rgba(0,0,0,.62)` |

**Additional spot colors:** rating star `#F5A623` (`--star`); destructive action
(Log out) `#E23755` (`--destructive`). A QR/barcode is drawn in `#111`
(`--qr-ink`) on white (`--qr-paper`).

Those four are the same in both themes, and the QR pair deliberately so: dark
modules on a light field is what the format assumes, so a code that inverted
itself under a dark theme is one a counter's handheld scanner may refuse to
read — and the theme is the staff member's choice, not the scanner's. They are
generated from `packages/ui/src/tokens.ts` like every other token; nothing may
hard-code them.

`--danger` and `--destructive` are not interchangeable either, and the mobile
artifact uses both on purpose. `--destructive` is the fixed red of a *deliberate*
action the customer is choosing — the Log out row — and is the same colour in
both themes. `--danger` is a *state that went wrong* and is still theirs to
fix: a declined card, an order left unpaid, the button that cancels it. That one
is theme-aware, because it has to stay legible on a dark background as well as a
light one.

`--scrim` and `--glass` are not interchangeable. `--glass` is a *surface* that
floats over content and stays legible (the status badge over a restaurant
photo); `--scrim` is the layer that pushes content back behind a modal. Both
themes darken, so a scrim cannot be derived from `--ink` — that inverts.

**`--glass` is a tinted panel *and* a blur, and the panel is the part that does
the work.** Every glass surface in the artifact is `background: var(--glass);
backdrop-filter: blur(N)` — a 78% opaque fill in light, 72% in dark, with the
blur behind it. On mobile all five of them were built as the blur alone
(`BlurView`, no `backgroundColor`), so `colors.glass` was in `packages/ui` and
used by nothing, and the surfaces were worth however much tint the blur's
`intensity` happened to produce. Over a photo that is close to nothing: the
favourite heart on a restaurant's cover was on screen and hard to see, its dark
`ink` stroke landing on whatever the photograph happened to be. Fixed
2026-08-11 across the card's status badge and heart, the restaurant cover's back
and favourite discs, and the tab bar. **A `BlurView` with no `colors.glass`
under it is the bug, not a style choice** — `intensity` sets how far the blur
reaches, never what colour the surface is.

### Two design artifacts, one authority

There are two design artifacts: the **mobile app** (820×1020, 12 screens
— the one this document was transcribed from) and the **web app**
(1280×860, 6 screens), which succeeds the earlier web landing.

Both are now in the repository — `Amragrir (mob).dc.html` and
`Amragrir Web (standalone).html` — so every row of the table below can be
re-derived instead of believed. See [design/README.md](./design/README.md).

They agree on the whole palette except:

| Token | Mobile | Web |
|---|---|---|
| `--shadow` light | `rgba(60,40,15,.12)` | `rgba(60,40,15,.1)` |
| `--shadow` dark | `rgba(0,0,0,.55)` | `rgba(0,0,0,.5)` |
| `--glass` light | `rgba(246,245,242,.78)` | `rgba(246,245,242,.8)` |
| `--glass` dark | `rgba(16,14,11,.72)` | `rgba(16,14,11,.75)` |

**The mobile artifact is authoritative** — it is the fuller design and the one
every app already matches.

`--stage` is deliberately **not** a code token: it is the backdrop around the
phone in the mockup, i.e. the design tool's own chrome, not a surface any
product screen renders.

> **Development rule:** never hardcode hex in components — always use theme tokens. In React Native, extract them into `theme.light` / `theme.dark`.

---

## 2. Typography

- **Family:** system stack — `-apple-system, "SF Pro Text", system-ui, sans-serif`. Smoothing: `-webkit-font-smoothing: antialiased`.
- In production, pin: **SF Pro** (iOS) / **Roboto** (Android) / an **Inter**-compatible web font for consistency. For Armenian, ensure glyph coverage (e.g. system font or Noto Sans Armenian).

### Type scale (from the design)

| Role | Size | Weight | Other |
|---|---|---|---|
| Screen title (H1) | 27px | 700–800 | letter-spacing −.6px |
| Large counter (timer) | 52px | 800 | tabular-nums, letter-spacing −1.5px |
| Restaurant title (detail) | 25px | 800 | −.5px |
| Card title | 17px | 700 | −.3px |
| Section title | 19px | 700 | −.4px |
| Uppercase subhead | 12–13px | 700–800 | text-transform uppercase, letter-spacing .4px |
| Body | 15–15.5px | 500–600 | |
| Secondary body | 13–13.5px | 500 | color `--ink2` |
| Caption | 11–12.5px | 500–600 | color `--ink2/3` |
| Nav label | 10.5px | 600 | |

Numeric values (prices, timers, counters) use `font-variant-numeric: tabular-nums`.

---

## 3. Sizes and spacing

- **Base screen padding:** `58px 20px 24px` (top accounts for the device status bar). Screens with a bottom CTA: bottom `130px`.
- **Spacing grid:** multiples of ~4px. Common gaps: `8, 10, 12, 14, 16, 18px`.
- **Device width (mockup):** iOS frame 402×874.
- **Button heights:** primary CTA `56px`; secondary `46–54px`; input field `52px`.
- **Icons:** nav 24px; inline 15–19px; large emoji 22–30px.
- **Hit target:** minimum 44px (± step buttons 30–46px; account for this when porting to RN).

### Web page columns

The web artifact gives **each screen its own column**, centred, rather than one
width for the whole site. `.wrap` holds the widest and `.screen--*` pulls the
narrower ones in, so a screen never lays a second set of gutters inside the
first:

| Screen | `<main>` width | Content width |
|---|---|---|
| Home, restaurant, profile | 1220px | 1164px |
| Checkout | 980px | 924px (`.screen--checkout`) |
| Basket | 900px | 844px (`.screen--basket`) |
| 404 | 720px | 664px (`.notfound`) |

Gutters are 28px throughout. Every screen but the catalogue also starts 10px
higher — 24px of air above the back button rather than 34px above the hero.

**The footer is held against the bottom of the screen.** The page is a column —
header, `<main>`, footer — at least `100dvh` tall, and `.wrap` takes whatever
slack is left over. On a short screen (a 404, an empty basket, a profile asking
someone to sign in) the footer lands on the bottom edge instead of floating
mid-screen above a band of page colour; on a long one nothing changes, because
`.wrap` grows from its own content height and is never allowed to shrink.

### Corner radii

| Element | Radius |
|---|---|
| Large restaurant card | 22px |
| Card/surface | 18–20px |
| Modal (bottom sheet) | 26px (top corners) |
| Detail container | 26px (top corners) |
| Primary CTA | 18px |
| Input field | 14px |
| Chip / pill | 20px (or full for round) |
| Round button (back, fav) | 50% (21px at 42px) |
| Badge | 11–13px |

### Shadows

- Card: `0 8px 22px var(--shadow)` (large), `0 5px 16px` / `0 4px 14px` (medium).
- Primary CTA: `0 12px 26px var(--shadow)`.
- Floating round buttons: `0 3px 10px var(--shadow)`.

---

## 4. Buttons

| Type | Style |
|---|---|
| **Primary (CTA)** | `background: var(--accent)`, text `#fff`, height 56px, radius 18px, weight 700, shadow `0 12px 26px`. Active: `transform: scale(.98)`. |
| **Secondary / outline** | `background: var(--card)`, border `1px solid var(--line)`, text `--ink`. |
| **Dashed (add more)** | border `1px dashed var(--line)`, text `--accent`, transparent bg. |
| **Icon round** | 42px circle, `--card` + border or `--glass` + blur (over photos). |
| **Step +/−** | `+` → `--accent` bg #fff; `−` → `--chip` bg, `--line` border. 30–34px. |
| **Destructive** | text `#E23755`, bg `--card`. |
| **Chip / filter** | selected: `--accent`/#fff; unselected: `--chip`/`--ink2`. |
| **Pill (time/date)** | selected: `--accent`/#fff + shadow; unselected: `--card`/`--ink` + border. |
| **Menu tab** | selected: bg `--ink`, text `--bg`; unselected: `--chip`/`--ink2`. |

Common press effect: `transform: scale(.85–.98)` with `transition: transform .12s`.

---

## 5. Cards

- **Restaurant card:** 162px photo header (hatch placeholder), overlaid status badge (glass + blur) and favorite button; body: name + rating, meta (cuisine · price · distance), badge row (⏱ prep, services). radius 22px, `--line` border, shadow `0 8px 22px`.
  - **The favourite button** is a 34px glass disc top-right of the photo — the
    same `--glass` + `blur(8px)` as the badges beside it — holding a 17px heart
    stroked in `--ink2`, filled and stroked in `--destructive` once saved. On
    the web the photo is 180px and the rating badge shifts to `right: 56px` to
    clear it; the app keeps its rating in the body row, so nothing moves there.
    Hover on the web tints the heart and scales it 1.08 (dropped under
    `prefers-reduced-motion`), and the disc paints its own background, so the
    keyboard ring is an explicit `:focus-visible` outline in `--accent`.
- **Dish card:** horizontal — 104px photo + text (name, description, kcal · prep,
  price + `＋` button). Price and `＋` share one row at the **foot of the text
  column** (`margin-top: auto`), so every card in a row lines its price up with
  its neighbours' however long the description above it runs; the `＋` belongs to
  the price it acts on, not to the card's right edge.
- **Basket line:** 66px photo + name/price + quantity stepper. On the **web** it
  is its own card rather than a row in a list — 72px photo, radius 20px, padding
  16px, shadow `0 6px 18px var(--shadow)`, 14px between lines — with the line
  total right-aligned on a 88px column. Below 560px it becomes a two-row grid
  (dish above, stepper and total below, photo spanning both): five things in one
  row leave the dish's name a few pixels.
- **Info/summary card:** `--card`, border, radius 18–20px, inner dividers `1px solid var(--line)`.
- **Summary column** (web basket/checkout/restaurant panel): the `<aside>` *is*
  the card, so what goes in it is plain rows — 8px apart, with a `--line`
  border-top and 12px above the total — never a second bordered box. A boxed
  summary inside a boxed column reads as a mistake. The standalone version on
  `orders/[id]`, which has no column around it, keeps its border.
- **Header basket** (web): accent pill, height 44px, padding `0 18px`, radius
  22px, `#fff` at 14.5px/700, gap 9px, shadow `0 6px 16px var(--shadow)`,
  carrying a cart glyph and the running total. Count badge at `top/right: -4px`,
  min-width 20px, `--ink` on `--bg` with a 2px `--bg` ring — accent-on-accent
  would have nothing to stand out against.

---

## 6. Forms

- **Text input:** height 52px, radius 14px, border `1px solid var(--line)`, bg `--card`, text `--ink`, `outline: none`, padding `0 14px`, font 15.5px.
- **Range slider:** track height 6px, radius 3px, bg `--chip`; thumb 24px circle `--accent` with 3px `--card` border and shadow.
- **Toggle (switch):** pill track + round knob; on → `--accent`, off → `--chip`. Active: scale(.96).
- **Segmented (language):** container `--chip` radius 15px, active segment highlighted.
- **Stepper (qty, basket line):** `− [number] +`, deliberately lopsided — minus
  is a quiet 34px chip, plus the same solid accent disc as the `＋` on a dish.
  Adding one more is the ordinary thing to want; taking one away is the
  correction.
- **Stepper (guests):** the *even* pair, because a party of two is as ordinary
  as a party of four. Both buttons 52px, radius 16, `--card` background and an
  accent glyph at 24px/700; only the border differs — `--line` on `−`,
  `--accent` on `+`, marking where the eye starts rather than what to press.
  Gap 16px, the count between them at 26px/800 in a 44px-wide box, baseline
  aligned with a 12px `--ink3` suffix that appears only at the maximum. Active:
  scale(.9). Disabled: `--ink3` glyph at .5 opacity, still occupying its place.
- **Guest chips:** *removed* 2026-08-07 — both clients use the stepper above.
- **Clock field (web checkout — "Date & time", "Ready at"):** one row, height
  50px, radius 15px, border `1px solid var(--line)`, bg `--card`, padding
  `0 14px`, gap 10px; an 18px accent glyph (calendar / clock) then a native
  `datetime-local` or `time` filling the rest at 15px/600 on a transparent
  background with no border. The row is the `<label>`, so pressing anywhere on
  it opens the browser's own picker. Out of range → the row's border turns
  `--accent`.

  **`color-scheme` has to follow the theme switch, not just the system.** The
  picker these fields open is the browser's, drawn in its own chrome, and no
  token reaches inside it — `color-scheme` is the only lever. `tokens.css` sets
  `light dark` on `:root`, which tracks the system; `globals.css` adds
  `:root[data-theme='light'|'dark']` so an explicit choice wins here as it does
  everywhere else. Without it a page somebody has put into dark opens a white
  calendar over it.

---

## 7. UI components (inventory)

Header/greeting, Search bar, Location selector, Category rail (horizontal scroll), Filter rail + filter FAB with badge, Restaurant card, Dish card, Menu tabs, Cart CTA (sticky), Bottom sheet (filters), Calendar (month), Time wheel (`HH`:`MM`, phone), Time-slot grid (web), Guest picker, Deposit card, Order summary, Payment method list, Countdown ring, Step tracker, QR/pickup code card, Order history row, Favorite card, Profile stats, Referral card, Settings rows, Toggle rows, Language segmented, Bottom tab bar (5 tabs), Skeleton loaders, Toast/status badges.

---

## 8. Component states

| State | Implementation in the design |
|---|---|
| **default** | Base tokens (`--card`, `--line`, `--ink`). |
| **hover** (web) | `opacity: .82` on links; on cards — slight lift/shadow (web version). |
| **active / pressed** | `transform: scale(.85–.99)` with `transition .12s`. Selected pills/tabs/chips → `--accent` bg (or `--ink` for menu tabs), contrasting text, shadow. |
| **selected** | Accent bg + shadow + `--accent` border (pills, pickup/dine mode, date, time, payment method — with a radio dot). **The time wheel is the exception:** its settled row is not filled but *lifted* — `--accent` text at 20/800 against `--ink3` at 16/600 for its neighbours — because the `--card` lens behind it already marks the position, and filling the row as well would put two selection marks on one value. Nothing is highlighted at all while the wheel has no answer. |
| **disabled** | Past calendar days: `disabled`, lowered opacity/`--ink3`, blocked cursor; unavailable time slots — muted. Buttons without actions — reduced contrast. |
| **loading** | `.skel` skeletons — `--placeholder` blocks with a `--placeholder2` band sweeping across them (`skelSweep`, 1.5s). On the web these are built from the page's own layout classes so the blocks sit where the words will (COMPONENTS.md → `Skeleton (web)`), and each route's `loading.tsx` assembles them; rows stagger by 0.08s via an inherited `--skel-delay`. Reduced motion keeps the blocks and drops the sweep. |
| **navigating** (web) | Between a press and a server-rendered page. `.route-progress` — a 3px accent→accent2 bar at the top of the window (`z-index: 60`, above header and dialog), silent for the first 140ms, approaching 90% and never arriving; `.is-pending` on the control that was pressed (`navPulse`, breathing to `opacity: .5`); `[data-navigating]` on `<html>` → `cursor: progress`. See COMPONENTS.md → `RouteProgress (web)`. |
| **settling** (web) | `.settling` — `opacity: .55`, `transition .15s`. Content the server is still working out, where this client is not allowed to guess it: money being re-priced (order panel), and the half of the checkout a change of service mode decides. Deliberately understated, because it is often one frame and a spinner for one frame is worse than nothing. On the checkout it composes with `.mode-swap`, which adds `pointer-events: none` — the controls under it describe the mode on its way out, so they are dimmed *and* sealed. |
| **empty** | Empty basket, "No active orders" — illustrative icon + title + description + CTA. |

**Selected states move before the server answers, where it is safe.** A mode
tile, a pickup ending and the guest count are chosen by the person pressing
them, so they are drawn optimistically and eased (`border-color`,
`background-color`, `box-shadow` .18s; `transform` .12s on `:active`).
`border-width` and the padding that compensates for it are **never**
transitioned — the two fight and the tile twitches. What the press *implies* —
totals, deposits, whether a table can be had — is never moved optimistically;
it wears `.settling` until the server says. See COMPONENTS.md (`ModeSwitch`,
`GuestStepper`).

### Animations (keyframes from the design)

- `scIn` — screen enter (fade + slide up 10px, .32s).
- `shimmer` — skeletons (mobile). On the web this is `skelSweep`: a translucent
  band moved with `transform` so thirty of them on a menu cost nothing.
- `navPulse` — the pressed link or button, while its page is on the way.
- `checkPop` — order-confirmed checkmark (scale-pop).
- `floaty` — gentle float (indicators, emoji).
- `sheetUp` — bottom sheet slide up.
- `fadeIn` — overlay fade.

---

## 9. Expressive tokens (theme tweaks)

The design supports 3 tunable theme parameters (passed via inline `--` variables on the container): **accent color**, **surface temperature** (warmth of surfaces), and **depth/finish** (shadow depth/finish). Build these as theme parameters during development.

---

## 10. Back office (`apps/admin`)

Everything above describes the **customer** products — a phone app and a
storefront. The internal panel uses the same palette and the same tokens (it
imports the generated `tokens.css` like the web app does, and the only hex in
`styles.css` is `#fff` where something sits on accent), but it is a tool
somebody works in for a whole shift
rather than a storefront somebody visits. Three values differ, deliberately:

| | Customer apps | Back office | Why |
|---|---|---|---|
| Control height | 56px CTA / 52px input | **40px** (32px for inline/small) | Density. A screen of 56px rows shows a third of the dishes. |
| Corner radius | 18–22px surfaces | **14px** surfaces, 10px controls | Tighter reads as an instrument, not a card feed. |
| Base type | 15–15.5px body | 15px body, 12.5–13px meta | Unchanged; only the secondary scale tightens. |

**The exception is the order board.** It is the one screen used on a tablet in a
kitchen, so its status buttons keep the full **44px** hit target from §3 — the
`.btn--touch` class exists for exactly that.

**The page header is the accent bar.** `.page-header` is solid `--accent` with
white text — the one saturated surface in the panel, sticky at the top of every
screen. Being accent costs it accent as a signal, so the controls on it invert:
`.btn--primary` becomes white with accent text, `.btn--secondary` and
`.btn--ghost` become white outlines, and a `.badge` swaps only its ground to
white so its tone still carries (the order board's "live" dot is green because
green is the message). The glass blur is gone with it — content scrolling under
an opaque bar is already hidden — and a `--shadow` lift replaces the bottom
hairline, which a 9%-ink rule could not draw on a saturated ground.

> **Contrast.** White on `--accent` measures **3.5:1** in light and **2.86:1** in
> dark. The 22px/700 title clears AA-large (3:1) in light only; the 13px
> description clears neither, and nor does the inverted primary button's label.
> Near-black (`#1A1712`) on the same bar measures 5.11:1 and 6.24:1 — it is the
> ink that would pass. White is the deliberate choice here; this note exists so
> it stays a choice.

**Components.** The panel's primitives are built on
[Radix](https://www.radix-ui.com/primitives) (dialog, alert-dialog,
dropdown-menu, select, tabs, toast, tooltip, switch, separator, label) and live
in `apps/admin/src/ui`. Radix supplies behaviour and accessibility; the
appearance is CSS in `apps/admin/src/styles.css`, tokens only. Props are listed
in [COMPONENTS.md](./COMPONENTS.md) under "Back-office primitives".

**States** follow §8, with four additions the panel needs and the phone does not:

| State | Implementation |
|---|---|
| **loading (action)** | Button keeps its width and swaps its icon slot for a spinner, so a row does not reflow on every click. |
| **late / overdue** | Order past its promised time: `--destructive` border plus a soft ring, marked in place rather than re-sorted. |
| **arrived at** | The row a link from another screen was following (`.role--found`, and `.row--found` for a table row — a menu's dish, arrived at from a line of an order): a 3px `--accent` inset edge and a 12% `--accent` band, flashed in from 34% over 2s by `role-found`. Layout-neutral — an inset shadow and a margin the padding gives back, so nothing shifts against the rows beside it. In a table the tint and the edge go on the cells instead, because a `<tr>`'s box is laid out by the table rather than by itself. |
| **disclosed** | A branch with its team open (`.branch--open`): a `--chip` band down the branch and the rows it disclosed, so the two read as one block where indentation alone stops carrying. Neutral, not accent — an **arrived-at** row is marked in accent *inside* this band, and accent on accent would leave the two arguing over which is the answer. Layout-neutral in the same way, and horizontal only: vertical padding would push the branches below it down at the moment of the click, on top of the team already unfolding. |

The **arrived-at** tint settles rather than fading out. A flash that has finished
playing cannot answer "which row was I sent to" for somebody who looked away, and
under `prefers-reduced-motion` — where the panel collapses every animation to
0.01ms — a fade-out would leave nothing behind at all.
