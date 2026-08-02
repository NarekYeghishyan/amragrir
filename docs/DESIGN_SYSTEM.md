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

`--scrim` and `--glass` are not interchangeable. `--glass` is a *surface* that
floats over content and stays legible (the status badge over a restaurant
photo); `--scrim` is the layer that pushes content back behind a modal. Both
themes darken, so a scrim cannot be derived from `--ink` — that inverts.

### Two design artifacts, one authority

There are two Claude Design artifacts: the **mobile app** (820×1020, 12 screens
— the one this document was transcribed from) and a newer **web landing**
(1280×860). They agree on the whole palette except:

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
- **Dish card:** horizontal — 104px photo + text (name, description, kcal · prep, price + `＋` button).
- **Basket line:** 66px photo + name/price + quantity stepper.
- **Info/summary card:** `--card`, border, radius 18–20px, inner dividers `1px solid var(--line)`.

---

## 6. Forms

- **Text input:** height 52px, radius 14px, border `1px solid var(--line)`, bg `--card`, text `--ink`, `outline: none`, padding `0 14px`, font 15.5px.
- **Range slider:** track height 6px, radius 3px, bg `--chip`; thumb 24px circle `--accent` with 3px `--card` border and shadow.
- **Toggle (switch):** pill track + round knob; on → `--accent`, off → `--chip`. Active: scale(.96).
- **Segmented (language):** container `--chip` radius 15px, active segment highlighted.
- **Stepper (guests/qty):** `− [number] +` inside a card.
- **Guest chips:** round 46px, selecting guest count.

---

## 7. UI components (inventory)

Header/greeting, Search bar, Location selector, Category rail (horizontal scroll), Filter rail + filter FAB with badge, Restaurant card, Dish card, Menu tabs, Cart CTA (sticky), Bottom sheet (filters), Calendar (month), Time-slot grid, Guest picker, Deposit card, Order summary, Payment method list, Countdown ring, Step tracker, QR/pickup code card, Order history row, Favorite card, Profile stats, Referral card, Settings rows, Toggle rows, Language segmented, Bottom tab bar (5 tabs), Skeleton loaders, Toast/status badges.

---

## 8. Component states

| State | Implementation in the design |
|---|---|
| **default** | Base tokens (`--card`, `--line`, `--ink`). |
| **hover** (web) | `opacity: .82` on links; on cards — slight lift/shadow (web version). |
| **active / pressed** | `transform: scale(.85–.99)` with `transition .12s`. Selected pills/tabs/chips → `--accent` bg (or `--ink` for menu tabs), contrasting text, shadow. |
| **selected** | Accent bg + shadow + `--accent` border (pills, pickup/dine mode, date, time, payment method — with a radio dot). |
| **disabled** | Past calendar days: `disabled`, lowered opacity/`--ink3`, blocked cursor; unavailable time slots — muted. Buttons without actions — reduced contrast. |
| **loading** | `.skel` skeletons — gradient `--ph1→--ph2→--ph1` with `shimmer` animation 1.3s. Initial restaurant-list load (~950ms) until `loaded:true`. |
| **empty** | Empty basket, "No active orders" — illustrative icon + title + description + CTA. |

### Animations (keyframes from the design)

- `scIn` — screen enter (fade + slide up 10px, .32s).
- `shimmer` — skeletons.
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
