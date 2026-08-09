# COMPONENTS.md

> UI components for **React Native (Expo)** and **Next.js (web)**. Shared logic/types live in a shared package. All visual values come from `DESIGN_SYSTEM.md` (theme tokens). Components do not hardcode colors — they use `useTheme()`.

Legend: **Props** (type), *optional* in italics.

---

## Primitives (design-system)

### Button
Primary action button.
- **Props:** `variant: 'primary'|'secondary'|'outline'|'dashed'|'destructive'`, `size: 'lg'|'md'|'sm'`, `label: string`, `leftIcon?`, `rightIcon?`, `loading?: boolean`, `disabled?: boolean`, `onPress: () => void`, `fullWidth?: boolean`.
- States: default / pressed (`scale .98`) / disabled / loading (spinner instead of label).

### IconButton
Round icon button (back, favorite, close).
- **Props:** `icon`, `onPress`, `variant: 'card'|'glass'`, *`size?`* (default 42), *`badge?`*.

### Input / TextField
- **Props:** `value`, `onChangeText`, `placeholder`, *`label?`*, *`keyboardType?`* (`phone-pad` for phone), *`leftIcon?`*, *`error?`*, *`maxLength?`*.

### Toggle / Switch
- **Props:** `value: boolean`, `onChange`, *`disabled?`*.

### Slider (RangeInput)
- **Props:** `min`, `max`, `step`, `value`, `onChange`, *`formatLabel?`*.

### Chip / Pill
- **Props:** `label`, `selected: boolean`, `onPress`, *`icon?`*, *`variant: 'filter'|'time'|'guest'`*.

### SegmentedControl
Language switch hy/ru/en.
- **Props:** `options: {value,label}[]`, `value`, `onChange`.

### Stepper
Quantity/guest counter.
- **Props:** `value`, `onDec`, `onInc`, *`min?`*, *`max?`*, *`label?`*.

### Badge
- **Props:** `text`, *`tone: 'accent'|'good'|'neutral'`*, *`dot?`*.

### Skeleton
- **Props:** `width`, `height`, *`radius?`*. Shimmer animation.

### BottomSheet
- **Props:** `visible`, `onClose`, `children`, *`maxHeight?`*. Overlay + slide up (`sheetUp`).

### Card / Surface
Surface wrapper.
- **Props:** `children`, *`padding?`*, *`elevation?`*.

### EmptyState
- **Props:** `icon`, `title`, `description`, *`ctaLabel?`*, *`onCta?`*.

---

> **On the web.** `apps/web` implements five of the domain components below —
> `RestaurantCard`, `DishCard`, `CategoryRail`, `FilterRail` and `SearchBar` —
> as server-rendered markup plus classes in `globals.css`, transcribed from
> [design/Amragrir Web (standalone).html](<./design/Amragrir Web (standalone).html>).
> They take no callbacks: every one is a `<Link>` or a `<form>`, because the page
> has to work before JavaScript arrives. `onAdd` is a `<form>` posting to a Server
> Action rather than a callback, and the same is true of every other action in the
> order flow — `onToggleFavorite` included, since **2026-08-09**: the web's
> `RestaurantCard` draws the same heart the app does, as a `<form>` posting
> `toggleFavorite`. It listed favourites without setting them until then, which
> made `/favorites` a list nobody could add to from the site that showed it.
> `LocationSelector` exists now, as `LocationPicker` below. `MenuTabs`
> **filters**, as the design draws it — it rendered as anchors that scroll until
> 2026-08-06, on the reasoning that the whole menu must stay in the HTML a
> crawler receives. It still does: every section is in the markup
> unconditionally, and CSS (`:has(:checked)`, gated on `@supports`) picks the one
> on screen, so the tabs need no JavaScript either.
>
> The web adds components the app has no equivalent for, because they exist to
> keep pages pre-rendered rather than to draw anything new:
>
> - *(gone)* `CheckoutPanel` — the old artifact's slide-over, rendered as a
>   drawer by an intercepting route and as a page on direct load. The refreshed
>   artifact draws checkout as one two-column page, so the component, the
>   intercepting route and the layout's `@modal` slot were all removed and the
>   markup lives in `checkout/page.tsx`.
> - `FavoriteButton` — the heart on a **pre-rendered** page's banner. **Props:**
>   `restaurantId`, `language`, `returnTo`, `endpoint`, `labels`, `name`,
>   `className`. `RestaurantCard`'s heart is server-rendered in the state the
>   account is in, because every screen that draws a card already renders per
>   request; a restaurant page is HTML on disk in three languages, so this one
>   ships hollow and asks `GET /[lang]/saved?restaurant=` what it should be once
>   it mounts — the same trade `OrderPanel` makes, for the same page. It is
>   still a `<form>` posting `toggleFavorite`, so a scriptless visitor can save
>   from here; un-saving is the one thing a page that cannot know the state
>   cannot offer, and `/favorites` is where it exists for them. It posts
>   `revalidate=0`, because revalidating would throw away a pre-rendered page to
>   change nothing on it.
> - `BasketButton` — the header's basket. **Props:** `href`, `endpoint`,
>   `label`. The artifact draws a solid accent pill carrying a cart glyph, the
>   **running total** and a count badge, always present; it is the one control in
>   the header meant to be pressed. The count comes from a small readable
>   cookie and the total from `GET /[lang]/basket` — the same route handler
>   `OrderPanel` reads, returning money **already formatted as strings** —
>   because reading the basket on the server would opt every restaurant page out
>   of pre-rendering. The badge is `--ink` on `--bg`, not accent: it sits *on* an
>   accent pill, where the accent it used to be had nothing to stand out
>   against. Empty, the pill keeps its place and closes up around the glyph
>   rather than vanishing — a control that disappears is one nobody learns the
>   position of.
>   **The count is watched, not listened for** (`lib/basket-count.ts`,
>   2026-08-08). A basket write is a Server Action answering with `redirect()`,
>   which Next resolves as a client-side re-render — so `pageshow`, `focus` and
>   `storage`, which this used to wait for, never fire. The badge therefore held
>   whatever it read on the first paint: removing a line left the old number and
>   the old total on the button, and emptying the basket left a badge on a button
>   that opened an empty screen. It now reads the `amr_n` cookie through
>   `useSyncExternalStore` over a 250ms poll (plus those same events, for a tab
>   restored or returned to). There is no cookie-change event every browser has,
>   and the alternative — reading the basket in the layout — costs the catalogue
>   its pre-rendering.
> - `AddDish` — the design's per-dish `＋` on a restaurant page.
>   **Props:** `language`, `branchId`, `slug`, `menuItemId`, `returnTo`, `label`.
>   Still a `<form>` posting `addToBasket`, so adding works with JavaScript off,
>   and it still reads no cookies, which is what keeps the page pre-rendered.
>   With JavaScript it takes the submit over and calls `addToBasketLive`, which
>   **neither revalidates nor redirects** — nothing the server rendered on that
>   page depends on the basket, so rebuilding the whole route to add one dish
>   threw away and re-made a page of menu: the panel blanked, the press cost most
>   of a second, and a long menu lost its scroll position. It answers with a green
>   tick for 1.2s, because a `＋` that looks unchanged after a press is one people
>   press twice. The one outcome still worth a navigation is a dish from another
>   restaurant, which the basket page asks about.
> - `BasketEditor` — the basket page's editing controls (2026-08-08). Three
>   exports: `BasketEditor`, which draws the `.basket-grid` and owns the one
>   transition everything inside it writes through; `BasketLine` (**props:**
>   `menuItemId`, `qty`, `lineTotal`, `returnTo`, `labels`), the `− n +`, the
>   line total and the ✕ for one line, returned as a **fragment** because
>   `.line` is a grid and all three are placed by `grid-area`; and `BasketMoney`
>   (**props:** `tag?`, `className`, `children`), which adds `.settling` to
>   server-rendered amounts while that transition is in flight.
>   **Every button is still a submit button in a `<form>`** posting
>   `changeLineQty` / `removeLine`, so the basket works with JavaScript off
>   exactly as before. With JavaScript the press is intercepted as `GuestStepper`
>   and `ModeSwitch` intercept their own, and calls `changeLineQtyInPlace` /
>   `removeLineInPlace` — the same writes **without the redirect**. Unlike the
>   restaurant page's `changeLineQtyLive`, these still **revalidate**: everything
>   on this screen is the server's answer to a basket that just changed, so the
>   rebuilt tree is the answer rather than an expense. The redirect was not.
>   **One transition for the whole screen, not one per line**, because a press
>   re-prices the summary down the side as well as the row it landed on.
>   **Only the quantity is optimistic** — every amount stays last second's under
>   `.settling` until the quote lands, and nothing here computes money. A line
>   taken to zero shows no optimistic 0: that is a removal, and the row goes when
>   the server says it has.
> - `BranchCard` — which restaurant, and which of its branches, an order
>   belongs to. **Props:** `restaurant` (a `RestaurantDetail`), `language`,
>   `href`, `prepMin?`, `favorite?`. Cover, name, cuisine · price level, rating
>   and reviews, and a `.tag` row carrying the prep time, the address and
>   Open/Closed. Built from the catalogue's own parts — `.media`, `.tag`,
>   `.tag.prep`, `.tag.good` — so a restaurant reads the same here as on the card
>   that was pressed to get here, and the whole card is the link, as
>   `RestaurantCard` is.
>   **`favorite` is optional, and that is the difference between the two screens
>   it appears on (2026-08-09):** `/cart` passes it and draws a heart, `/checkout`
>   omits it and draws none. The basket is a screen somebody is still browsing
>   from — the card is the way back to the menu — and saving the place you are
>   ordering from belongs there; the checkout is where money is committed, and a
>   control that writes to the account one press from the button that charges the
>   card does not. It carries `restaurantId`, since a favourite is stored against
>   the business while everything else on this card is per-branch. The heart is an
>   ordinary flex item between the rating and the chevron rather than a disc on
>   glass, and wears `--chip`: this card is a row, not a photograph, so there is
>   nothing under it to blur. Adding it meant the same restructure
>   `RestaurantCard` needed — the row is the container and the link is the item
>   filling it, because a `<form>` may not live inside an `<a>` — and the chevron
>   moved out of the link with it so it stays at the row's edge.
>   **A branch, not a restaurant:** everything under `branch` is per-address, and
>   the caller fetches it by **branch id** — a slug resolves to one branch of a
>   restaurant that may have several, so a screen printing an address must name
>   the branch its quote was priced against. `prepMin` is passed in rather than
>   read off the branch, because on the basket the truthful number is the
>   quote's: it prices the dishes actually collected, so a basket of one drink
>   and a basket of four grills report different times and both are right.
>   **`prepMin` is optional (2026-08-08)** and the tag is dropped without it —
>   the booking-only checkout has no quote, and the branch's general figure is
>   not a stand-in there: it would promise a wait for food nobody has ordered.
>   Used on the Basket, where it replaces a back button that said the
>   restaurant's name and nothing else, and on the **Checkout** (2026-08-08),
>   which said even less about the restaurant than the basket did — see
>   SCREENS.md §6.
> - `ModeSwitch` — the checkout's "how is this order fulfilled" block: the
>   Pre-Order / Table booking tiles, the take-away / eat-in choice under them,
>   and, as `children`, everything below that the answer changes.
>   **Props:** `language`, `current`, `modes`, `modeAction`, `pickup`,
>   `pickupLabel`, `pickupAction`, `bookingDoor`, `onModeChange?`,
>   `onPickupChange?`, `children`.
>   **Every tile is still a submit button in its own `<form>`**, posting the
>   redirecting action (`modeAction` / `pickupAction`) — switching mode is a
>   server change, since the basket is an httpOnly cookie, so with JavaScript
>   off the browser posts, the cookie moves and the page is drawn again exactly
>   as before. With JavaScript the press is intercepted as `GuestStepper`
>   intercepts its own: `preventDefault`, the tile moves at once
>   (`useOptimistic`), and `changeServiceModeLive` / `changePickupOptionLive`
>   write and revalidate **without redirecting**, so React swaps what differs
>   instead of the router replacing the page. This was the control that changed
>   the most on the screen, so its redirect was felt worst — the whole checkout
>   blinked and the viewport jumped while the API re-priced the basket.
>   **Only the tile is optimistic.** The calendar, the deposit, the totals and
>   the CTA are the server's answer to a basket that has changed mode, and this
>   client neither prices baskets nor decides whether a table can be had — they
>   wear `.settling` until the real answer lands. The two presses carry
>   **separate pending states**: a mode change dims everything it decides, a
>   pickup ending dims only its own row, because that press moves a tick and
>   dimming the payment section for it would be the screen shouting about a
>   small thing.
>   It holds **no i18n and no rules** about what this restaurant offers: the
>   tiles arrive already translated and the sections are chosen by the page from
>   the quote, the same contract `GuestStepper` has.
> - `DateTimeField` — the checkout's "Date & time", a month calendar over the
>   API's own slot grid. **Props:** `language`, `name`, `value`, `min`, `max`,
>   `step`, `today`, `horizonDays`, `branchId`, `guests`, `endpoint`, `label`,
>   `noSlotsLabel`, `closeLabel`, `chooseLabel`. Monday-first grid from
>   `monthGrid` (`@amragrir/shared`), arrows disabled onto a month with nothing
>   bookable, days outside the window greyed rather than hidden; the slots come
>   from `GET /[lang]/availability` for the chosen day and the current party, so
>   nothing offered can be refused for being shut, off the half-hour or too
>   small.
>   **Month left, times right** (2026-08-08c) — a scrolling column with ▲/▼
>   arrows that move it three rows at a time, and the chosen time scrolled into
>   view when the panel opens. The times were briefly a grid *under* the
>   calendar, grouped by part of day; beside it they need no headings, and
>   *when* now sits next to *which day* so moving between them is a glance.
>   **The column is taken out of flow** (`position: absolute` on its three
>   children) so the month decides the panel's height. `align-items: stretch`
>   alone could not: stretch sizes every item to the tallest, and twenty-four
>   times *is* the tallest, so the calendar was being stretched to 464px to match
>   a column that was only that tall because it had been stretched.
>   **A past time and a taken table are different states.** The API reports both
>   as `available: false`; the past is dropped and only genuinely taken tables
>   are struck through, because a struck-through 20:00 says somebody has that
>   table — worth knowing when picking 20:30 — while a struck-through 10:00 on a
>   day half gone says nothing, and today's grid used to open with nine of them
>   stacked before the first choosable time.
>   **Slots are `disabled` while a new day is in flight**, not merely dimmed:
>   they are the *previous* day's times until the answer lands, and pressing one
>   booked the day the calendar had already stopped showing. **The native
>   `datetime-local` is still underneath**: `useScripted` flips to the panel one
>   commit after mount, which is also what keeps the first client render equal to
>   the server's, so a browser with no JavaScript books exactly as before. The
>   posted value is the same `YYYY-MM-DDTHH:mm` under the same `name` in both
>   modes. The server's `value` wins on every re-render — this holds a draft, not
>   a second source of truth.
> - `ReadyAtField` — the checkout's "Ready at". **Props:** `language`, `name`,
>   `value`, `min`, `step`, `earliestReadyAt`, `label`, `asapLabel`,
>   `hintLabel`, `closeLabel`. "As soon as possible" first — the **absence** of
>   a time, which is what `POST /orders` defaults to and what a clock field could
>   only say as `--:--` — then the quarter-hours from `readyTimeOptions`. Its
>   leading `earliest` entry is filtered out, because the button above says it
>   better. Its times sit in a **four-column grid** rather than the booking
>   picker's column: there is no calendar here to sit beside, and these are two
>   hours of a single evening rather than a whole day. Same fallback and same
>   posted `HH:mm` as above; mirrors `DateTimeField`.
> - `OrderPanel` — the artifact's sticky order panel on a restaurant page.
>   **Props:** `language`, `branchId`, `endpoint`, `returnTo`, `basketHref`,
>   `canBook`, `labels`. The same constraint as the badge, answered properly:
>   it fetches `GET /[lang]/basket`, a route handler that reads the httpOnly
>   basket cookie, prices it with `POST /cart/quote` and returns lines and
>   totals **as formatted strings** — so the page stays static HTML and the
>   client still computes no money. Quantity steppers are `<form>`s posting the
>   same Server Actions the basket page uses; "Book a Table" posts
>   `chooseServiceMode`, and is drawn **wherever the restaurant takes bookings**
>   — the artifact's `sc-if` is on that alone, above the empty basket as well as
>   above a full one. It is **disabled until this restaurant's basket has a dish
>   in it** (`bookTableState` in `lib/order-panel.ts`): the calendar lives on
>   `/checkout`, which prices a basket, and `POST /cart/quote` refuses one with
>   no lines, so a press could only land on "add a dish". It used to be *absent*
>   in that state, which made a restaurant that takes bookings look like one that
>   does not at the moment somebody was still deciding where to eat. It replaced
>   `StickyBasket`, the fixed "View basket" bar that stood in for it.
>   **Its steppers write live** (2026-08-08). Same shape as `AddDish`: the
>   `<form action={changeLineQty}>` is still there for a browser with no
>   JavaScript, and with one the submit is taken over and `changeLineQtyLive`
>   does the write without the redirect. **The quantity moves on the frame it is
>   pressed** (`useOptimistic` over `applyQtyLocally`), and **the amounts do
>   not** — they are the server's and stay last second's, dimmed with
>   `.settling`, until it has re-priced. An optimistic subtotal would be this
>   client computing money, which it does not do.
>   Three things it had to be told before that could work: it re-asks when the
>   count cookie moves (for changes made in another tab), the empty state waits
>   to be told (`null` is "not asked yet", and drawing it as 🧺 claimed an empty
>   basket on every first paint and after every press, which remounts it), and
>   the last known basket per branch now lives in `lib/basket-live.ts`, where the
>   dish `＋` publishes what its own write returned.
> - `OrderRefresh` — polls the order page every 10s. No props but the interval;
>   it renders nothing.
> - `LocationPicker` — the header's location control and the dialog behind it.
>   **Props:** `language`, `labels` (translated by the layout, because this one
>   runs in the browser). A client component for `BasketButton`'s reason: the
>   choice is a cookie, and reading a cookie in the root layout would opt every
>   restaurant page out of pre-rendering, so the server draws "all districts" and
>   the browser fills in the district. What it is for is `lat`/`lng` on
>   `GET /restaurants`: the distance on a card and the "near me" chip both need
>   an origin, and this is the only one a server-rendered page can have.
>
>   **The artifact's overlay, transcribed** — 760×640 over a 50% scrim, title and
>   hint, a ✕, a search box and chips floating over the map, the chosen place
>   named on a glass badge, and "use current location" beside a full-width
>   confirm. It is a `<details>` with `open` under React's control, and with
>   JavaScript it is what a dialog owes its reader — Escape and the scrim close
>   it, focus moves in and comes back, the page behind stops scrolling — around
>   everything that needs a browser: the map, address search, and geolocation.
>   Selection is **pending until confirmed**, as drawn, so trying four points
>   costs one navigation rather than four.
>
>   **Choosing a place needs JavaScript.** The district radios that used to be
>   the scriptless answer were removed (2026-08-06); the summary still opens the
>   panel natively and the ✕ and confirm are still `<form>` submits posting
>   `chooseLocation`, but there is nothing left in there that a page without
>   script can answer, so what confirm posts is an empty place — the whole city,
>   which is where such a reader already was. The listing itself is unaffected:
>   it ranks by distance only when it has an origin, and has always rendered
>   without one.
>
>   **What is stored is a point** (`Place` — `lat`, `lng`, `label`), not a
>   district id. The map is real, so there is somewhere to tap between the pins,
>   and `GET /restaurants` has always taken a coordinate. The six districts
>   (`AREAS` in `lib/locations.ts`) are no longer a control — they were a row of
>   radio chips until 2026-08-06 — but they remain the vocabulary behind one:
>   `nearestArea` names a tapped point after the district it falls in whenever no
>   geocoder can name it better, and `DrawnMap` still draws their six pins.
>
>   **Recently chosen points sit at the top of the dialog**, five of them, in
>   `localStorage` (`lib/recent-places.ts`) rather than a cookie — only this
>   dialog ever reads them, and a cookie would ride along on every request to
>   every page for a row of chips most visits never see. Two entries within 120m
>   of each other are the same place, so a map tap repeated slightly off does not
>   fill the row with one street corner.
>
>   **One key, and the page never holds it.** The map is Yandex's public widget
>   in a frame and takes none; the geocoder's key cannot be domain-restricted, so
>   it stays on the server behind `GET /[lang]/geocode` and the browser is told
>   only whether there is one. Without it the map still takes any point — the
>   point is named after the nearest district instead of by its address — and the
>   **search box is not rendered at all**. It used to have a second job with no
>   key, filtering the district row; with that row gone, typing there could
>   affect nothing, and a box that answers nothing is worse than no box. So an
>   unkeyed deployment is map, recents and confirm. Two departures from the
>   drawing are recorded in `docs/design/README.md`: the drawn placeholder is
>   fitted rather than sliced, and a way back out of a chosen place is kept —
>   now a ✕ on the badge that names it, since the "all districts" radio that
>   used to do that job went with the district row.
>
>   **A search is answered in the alphabet it was asked in**, not in the
>   language of the page (`queryLang` in `lib/geocode.ts`): typing `Վարդանանց`
>   on the Russian pages returns `Վարդանանց փողոց, 10`, and Cyrillic on the
>   Armenian pages returns Russian. Latin is the exception and keeps the page's
>   language — both other alphabets are routinely transliterated into it, so it
>   is evidence of nothing. A tap on the map asks in no alphabet at all, so its
>   address follows the page.
> - `YandexMap` — the map, split out from the picker. **Props:** `language`,
>   `value`, `onPick`, `labels` (`map`, `credit`, `zoomIn`, `zoomOut`). It
>   reports a coordinate and holds no state: what that coordinate is called and
>   whether it gets stored belong to `LocationPicker`.
>
>   **An `<iframe>`, not the JS API** — the API needs a key, and a map that is
>   blank wherever nobody configured one is not a map. The cost is that nothing
>   inside a cross-origin frame can be read: a tap and a pan in there are both
>   invisible out here. So the frame is made `inert` and this component owns the
>   viewport instead — the pin is drawn on top, the pan is a CSS transform, and
>   `lib/map-frame.ts` projects between pixels and coordinates in **ellipsoidal**
>   Mercator (EPSG:3395), which is what Yandex's tiles use.
>
>   Tapping picks the point under the finger; dragging looks around and chooses
>   nothing. Neither reloads: the frame is drawn `BLEED` pixels larger than its
>   box on all sides, so a drag slides real tiles into view, and only a zoom or a
>   pan that has spent the margin re-points the URL. **It opens on Yerevan**
>   (`YEREVAN` in `lib/locations.ts` — Republic Square at zoom 12, the same
>   centre `lib/geocode.ts` biases searches around) whenever nothing is chosen,
>   and goes back to it when the badge's ✕ un-chooses: somebody who has just
>   asked for the whole city should not be left framed on the one street they
>   rejected. A place chosen *elsewhere* —
>   a recent chip, a search result, geolocation — is taken to and framed at street
>   zoom, because somebody who asked for a specific address wants to see which
>   building it is. A tap never moves the map: it writes its own point in on the
>   way out, so it is not mistaken for a request to travel, and neither is the
>   geocoder renaming that point 300ms later.
>
>   It is built **when the dialog opens**, because a frame inside a closed
>   `<details>` still loads and this control is in the header of every page. The
>   theme rides in the URL (a frame inherits no tokens), and so does the
>   language — all three are real Yandex locales, Armenian included, and the
>   widget draws its labels and its own controls in it. The widget's own credit
>   sits in a corner the bleed hides, so a link to the same view on
>   `yandex.ru/maps` is drawn in its place.
>
>   **The pin on it is `MapPin`'s**, at 26×35 with its point — not its middle —
>   on the coordinate. It used to be a CSS box rounded into a teardrop, which is
>   an egg: it had no point on it, so the one thing a marker exists to say —
>   *which* spot on the street is chosen — was the thing it did not.
> - `MapPin` — the artifact's map pin: a shape, not a screen element.
>   **Exports:** `MapPinShape` (`fill`), drawn around its own point at the
>   origin, plus `PIN_VIEW_BOX` and `PIN_TIP` for a caller that needs it to be an
>   `<svg>` of its own. Both maps in the picker mark a point with it — the drawn
>   placeholder inside its own coordinate space, the real one as an element over
>   the frame — so the two cannot drift apart, which is how they drifted before.
> - `LanguageSwitch` — the header's hy/ru/en switch. **Props:** `language`,
>   `label` (translated by the layout, as this one runs in the browser). Each
>   link is **this page** in that language — `translatedPath()` in `lib/site.ts`
>   swaps the language segment and keeps the rest of the address, query string
>   included. They used to link the *home* page, so switching language halfway
>   down a menu cost you the menu. A client component because the path is the one
>   thing a layout is not given: it receives `params`, and the way to get the
>   path — reading the request's headers — would opt every pre-rendered page out
>   of static rendering, `BasketButton`'s trade again. Only the **query** part
>   waits for the browser (`useSearchParams` cannot be read while pre-rendering);
>   the pre-rendered HTML already carries links to the right page, which is what
>   a crawler and a visitor without JavaScript get.
>   **The links are plain `<a>`, not `<Link>`**, and must stay that way: this is
>   the only navigation that changes the `[lang]` segment, which remounts the
>   root layout, and React 19 re-acquires the `<html>` singleton by stripping
>   every attribute on it — `data-theme` among them, since the pre-paint script
>   sets it outside React. A client-side switch therefore lost the chosen theme
>   and left the page on the OS preference. A document load re-runs that script
>   before the first frame; `language.spec.ts` guards the anchor.
> - `Brand` — `BrandMark` (the pin with fork, knife and clock badge) and
>   `Wordmark` (`amragrir` + `.am` in the accent colour). One component because
>   the header and the footer draw the same logo. The wordmark is Latin in all
>   three languages and deliberately not an i18n string — it is a logotype built
>   on the domain — while the *translated* brand name (`Ամրագրիր`, `Амрагрир`)
>   is passed as the home link's `aria-label`, so the design is honoured and the
>   localisation is not lost.
> - `Footer` — four columns, brand block with social marks, and a
>   rule-separated bottom bar. **Props:** `language`. Column items and social
>   marks render as plain text, not links: every destination is a page that does
>   not exist yet, and dead links on the one app built for crawlers are worse
>   than labels. The social marks are `aria-hidden` on top of that — three emoji
>   with no destination are decoration.
> - `PhoneField` — country, then the number, on the sign-in screen.
>   **Props:** `countries`, `defaultCountry` (Armenia), `label`, `countryLabel`,
>   `invalidHint`. Posts two fields (`country`, `phone`) rather than one string,
>   because a chosen country removes the ambiguity a leading `0` carries. The
>   countries come from `PHONE_COUNTRIES` in `packages/shared`, which the API's
>   `normalizePhone` reads too, and the names from `Intl.DisplayNames` rather
>   than the dictionaries. A client component only for live feedback: it checks
>   with the same `isValidNational` the server uses, and with JavaScript off the
>   plain select and input still post and get a translated answer. **Each option
>   leads with the dial code** (`🇦🇲 +374 Armenia`): the closed select stands
>   where the artifact prints a plain `+374`, and is narrow enough to leave the
>   number room — so it truncates, and only the country name may be lost.
>   **The number takes its country's shape as it is typed** — `99 12 34 56` for
>   Armenia — via `formatNational` from the same shared module, so the grouping,
>   the length cap and the check can never disagree. The dial code appears only
>   on the select; repeating it inside the number field would print the same
>   fact twice on one row. **Typing stops at the country's own length** rather
>   than accepting a digit too many and refusing it on submit — eight for
>   Armenia, nine only for somebody who wrote the trunk `0`, which is the one
>   thing that buys the extra digit. A pasted whole international number loses
>   its duplicate dial code, a trunk `0` keeps its own group, and the caret is
>   put back where it was so an edit in the middle is not thrown to the end.
>   The invalid hint waits until the number is as long as a right one would be,
>   **or until the field is left** — an unfinished number should be called out
>   when somebody moves on, not while they are still typing.
>
>   **Both controls fill the 54px pill, and the hairline between them is its own
>   26px element** (2026-08-07). The artifact draws exactly that: a `1px × 26px`
>   divider inset in a full-height row. Transcribing it as the input's
>   `border-left` moved the *divider's* height onto the *field* — `#phone` was
>   26px tall, so only a band across the middle of the right half took a click,
>   and `:focus-visible` ringed that band rather than the field. The focus ring
>   is on the **pill** now, which is the field somebody sees and the same shape
>   the invalid state already turns accent; per-control rings remain as the
>   fallback where `:has` is unsupported.
> - `AuthPanel` — the sign-in card's first step: the Log in / Sign up tabs, the
>   heading above them and the form below. **Props:** `language`, `next`,
>   `initialRegister`, `loginHref`, `registerHref`, `name`, `countries`,
>   `defaultCountry`, `phoneError`, `labels`, `action` (`requestCode`).
>   **The tabs stay links to `?mode=register`** — the href is real, the page
>   renders whichever tab the query string names, and a browser without
>   JavaScript navigates as before. With a client, the press is intercepted:
>   the tabs only choose whether "Full name" shows and what the heading and the
>   button say, and spending a round trip to a `force-dynamic` page on that
>   rebuilt the card, replayed its entry animation and emptied the number field
>   somebody was halfway through. The switch is local state now, and
>   `history.replaceState` corrects the address behind it — `replaceState`, not
>   `pushState`, because the two tabs are one screen and Back belongs to
>   whatever sent the visitor here. Modified clicks (⌘, ctrl, shift, middle) are
>   left alone, so "open in new tab" still opens the real address.
>   **The name field is hidden, not unmounted**, so a name typed on the sign-up
>   tab survives a look at the log-in one; it posts on both tabs, which costs
>   nothing, since `requestCode` reads `name` only when `mode` is `register`.
>   A `?error=phone` clears on a tab switch, because the switch rewrites the URL
>   to one that no longer carries it.

## Domain components

### RestaurantCard
Large Home / See all feed card.
- **Props:** `image`, `name`, `rating`, `reviewsCount`, `cuisine`, `priceLevel`, `distanceKm`, `prepMin`, `isOpen`, `services: string[]`, `isFavorite`, `onPress`, `onToggleFavorite`.
- **The heart sends `restaurantId`, not the row's `id`.** A card is a *branch*;
  a favourite is stored against the *restaurant* (DATABASE.md §13). `GET
  /restaurants` returns both fields for this reason.
- `onToggleFavorite` is optional in the app: where a screen cannot act on a
  favourite the heart is **not drawn**, rather than drawn dead. It was drawn
  dead until 2026-08-09 — a control that looked pressable and answered nothing.
- The app fills the heart **before** the request lands and puts it back on a
  refusal; the web has no such state to keep, and its revalidation redraws the
  heart the way the server actually has it.
- A guest has no favourites (ROLES_AND_PERMISSIONS.md §1), so their hearts are
  hollow and a press routes to sign-in and back.

### RestaurantListItem
Horizontal row (Favorites / search results).
- **Props:** `image`, `name`, `meta`, `prepMin`, `rating`, `onPress`, `onRemoveFavorite`.
- On the Favorites screen the heart is always filled, and its one job is to give
  the restaurant back — the row leaves the list on the press, and returns if the
  call is refused.

### DishCard
Menu item.
- **Props:** `image`, `name`, `description`, `caloriesKcal`, `prepMin`, `priceLabel`, `onAdd`.

### MenuTabs
Popular/Mains/Sides/Drinks tabs.
- **Props:** `tabs: string[]`, `active`, `onChange`.

### CategoryRail
Horizontal cuisine category rail.
- **Props:** `categories: {key,icon,name}[]`, `activeKey`, `onSelect`.

### FilterRail
Quick filter row + FAB.
- **Props:** `filters`, `activeIdxs`, `onToggle`, `onOpenSheet`, `activeCount`.

### FiltersSheet
Modal filter sheet.
- **Props:** `visible`, `value: {sortBy,priceMax,distMax,minRating,dietary[],services[]}`, `onChange`, `onReset`, `onApply`, `resultsCount`, `onClose`.

### SearchBar
- **Props:** `value`, `onChangeText`, `placeholder`, *`onFocus?`*, *`readOnly?`* (stub button on Home).

### LocationSelector
- **Props:** `label`, `onPress`.

### BasketLine
Cart item row.
- **Props:** `image`, `name`, `priceEach`, `qty`, `total`, `onDec`, `onInc`.

### OrderSummary
Subtotal / Service / Total (+ deposit).
- **Props:** `subtotal`, `serviceFee`, `total`, *`deposit?`*, *`depositCredited?`*.

### ServiceModeSelector
Pre-Order / Table booking — the labels for the two modes; the values keep their old names.
- **Props:** `mode: 'pickup'|'dine_in'`, `onChange`.

### Calendar
Monthly booking calendar.
- **Props:** `month`, `year`, `selectedDate`, `onSelectDate`, `onPrevMonth`, `onNextMonth`, `disabledBefore` (today), *`availableDates?`*.

### TimeSlotGrid
Slot grid (reservation time / food ready at).
- **Props:** `slots: {time,available}[]`, `selected`, `onSelect`.

### GuestPicker
A `− [count] +` stepper — **not** chips, on either client since 2026-08-07.
- **Props:** `guests`, `onChange`, *`min?`*, *`max?`*.
- **States:** `−` disabled at `min`, `+` at `max`; a disabled button keeps its
  place (greyed, half opacity) rather than being hidden, so reaching the limit
  does not shift the number sideways. At `max` a small grey "(max)" sits beside
  the count, which is the only thing that says why `+` stopped.
- On the **web** it is two submit buttons in the checkout form rather than an
  `onChange` — the party size is server state, and this has to work with no
  JavaScript. Each carries the number it would produce, not a direction.

### GuestStepper (web)
The web's `GuestPicker`. A client component wrapping the markup above, and a
client component **only in order to stop its own submit**: without it a press is
a navigation, and the checkout blinks while two API calls re-price one digit.
- **Props:** `guests`, `max`, `fewerLabel`, `moreLabel`, `maxLabel`.
- Intercepts the click, moves the count with `useOptimistic`, and calls
  `changeGuests` — the timing action **without** its redirect, so React patches
  the count and the deposit in place instead of the router replacing the tree.
- Posts the **whole form**, not a number, so a time typed above and not yet
  posted travels with the press (`rememberTiming` reads it back out).
- **Does not move the deposit optimistically.** That is money, and this client
  does no arithmetic on money — the count answers at once, the amount follows.
- **The submit is the fallback, not the mechanism**: with JavaScript off the
  buttons post the form and `chooseTiming` redirects, exactly as before.

### DepositCard
- **Props:** `guests`, `perGuestLabel`, `depositLabel`, `note`.

### PaymentMethodList
- **Props:** `methods: {id,label,icon}[]`, `selected`, `onSelect`.

### CartCTA
Sticky button to basket/checkout.
- **Props:** `count`, `totalLabel`, `label`, `onPress`.

### CountdownRing
Tracking ring + timer.
- **Props:** `secondsLeft`, `totalSeconds`, `readyAt`.

### Countdown (web)
The `mm:ss` inside the tracking page's `.timer`. A client component **only in
order to tick**: everything else on that page is server-rendered.
- **Props:** `seconds` (the API's `secondsLeft`, never null — the block is not
  drawn without one).
- Moves every second between the watcher's answers. Without it the number stood
  still and then jumped, which reads as a stuck order.
- **The server still owns the number.** It counts elapsed time only
  (`lib/countdown.ts`), and every answer `OrderLive` gets replaces whatever it
  reached — including a `readyAt` the kitchen moved — so there is no second
  source of truth to drift.
- Measured against `Date.now()`, not by subtracting one per tick — a background
  tab's interval is throttled and a sleeping laptop's stops, and both would
  otherwise come back minutes behind.
- Renders the server's value on the first paint (no hydration mismatch) and
  stays on it with JavaScript off, which is what the page did before.

### OrderSteps
Status tracker (Confirmed→Preparing→Almost ready→Ready).
- **Props:** `steps: string[]`, `currentIndex`.

### OrderLive (web)
Follows an order while somebody is watching it. Renders **no markup** — it polls
`GET /[lang]/orders/[id]/status` and provides the answer to the two components
that care.
- **Props:** `endpoint` (`orderStatusApiPath(language, id)`), `status`,
  `secondsLeft`, `readyAt` (the server's reading — primitives, so the poll does
  not restart on every render of the page above), `children`.
- **Five seconds**, where the whole-page refresh it replaced ran at ten. The ask
  is three fields rather than a rebuilt tree, and this is the screen whose whole
  job is to say what is happening now.
- **`router.refresh()` only on news** — a new status, or a moved `readyAt`.
  Cancellability, the headline, the "arrives at" beside the clock and whether
  there is a countdown at all are the server's to decide; a falling
  `secondsLeft` is not news, and between changes the page is left alone.
- **Stops** once the order is `completed`/`cancelled`, and on `401`/`404` —
  neither improves by being asked again. Keeps trying through 5xx and a dropped
  connection. Re-asks immediately when a backgrounded tab comes back, whose
  interval the browser had throttled to about once a minute.
- Polling and not the order socket: the gateway authenticates in its first
  message and the session is an httpOnly cookie the page cannot read. Bridging
  the socket server-side is the upgrade.

### OrderSteps (web)
The four steps, following the back office in place.
- **Props:** `labels: string[]` (one per tracker step, already translated by the
  server — naming a status is `ORDER_STATUS_LABEL`'s job), `status` (the
  server's reading, used until the first answer arrives, which is also what an
  unscripted page keeps showing).
- Reads `OrderLive`; falls back to `status` outside it, so the first client
  render is the markup that was sent.
- **Announces the step it moves to** in a `visually-hidden`
  `aria-live="polite"` region. The step used to change only on a reload, which a
  screen reader announces by starting the page again; now it changes under a
  reader who may never look at it.

### PickupCodeCard
The pickup code — six digits and a scannable QR of them.
- **Props:** `code`, `instruction`, *`tableNo?`*.
- **The QR is real, not a drawn placeholder.** It was a white square with the
  digits printed large in it, which was honest while the code was four digits
  read out loud. The code now closes the order — the counter *types* it
  (BUSINESS_LOGIC.md §5) — and six digits off a stranger's screen at a queue is
  where the wrong order gets handed over. Encoded with `encodeQr` from
  `@amragrir/ui`, the same function the back office and the web page use; drawn
  through `react-native-svg` on mobile and inline `<svg>` on web.
- **The payload is the six digits alone.** A URL or a JSON envelope would encode
  the same secret in a denser grid and give the counter's wedge scanner
  something to parse, when the handover box wants exactly these characters.
- **White plate, `#111` modules, in both themes** — the one surface in either
  client whose colours are chosen for a machine. An inverted code is one a
  handheld may refuse, and the theme is not the scanner-holder's choice.
- **The digits stay printed beside it.** A scanner can be flat, out of reach or
  absent, and a QR nobody can read with their eyes is a dead end when it is.

### ActiveOrderCard
Active order card on the Orders tab.
- **Props:** `image`, `restaurantName`, `itemsLabel`, `readyAt`, `countdownText`, `progress`, `onPress`.

### PastOrderRow
- **Props:** `image`, `name`, `date`, `itemsLabel`, `total`, `onReorder`.

### ProfileHeader
- **Props:** `avatar`, `name`, `email`.

### StatCard
- **Props:** `value`, `label`, *`tone?`*.

### ReferralCard / ReferralHero
- **Props:** `title`, `subtitle`, `onPress` (card); `code`, `link`, `onCopy`, `onShare`, `invitedCount`, `earnedLabel`, `steps[]` (screen).

### SettingsRow
- **Props:** `icon`, `label`, *`rightSlot?`* (toggle/chevron), *`onPress?`*.

### TabBar
Bottom navigation (5 tabs).
- **Props:** `active: 'home'|'search'|'orders'|'favorites'|'profile'`, `onChange`. (In Expo — via `expo-router` Tabs.)

### ThemeToggle / LanguageToggle
- **Props:** `value`, `onChange`.

### RouteProgress (web)
The thread of accent colour across the top of the window while the next page is
being fetched. Mounted once, in `app/[lang]/layout.tsx`.
- **Props:** `label` (the translated "loading", already resolved by the server —
  the only place on a route transition that has a language to translate with).
- **Why it exists:** every screen is server-rendered, so a press is answered by
  a round trip. Until the answer lands the browser shows the *old* page
  unchanged, which reads as "nothing happened" — and the second press is the one
  that feels broken.
- **Three signals, no spinner over the content:** the bar itself; `is-pending`
  on the control that was pressed, which dims and breathes so the answer is
  attached to the thing pressed; and `data-navigating` on `<html>`, which turns
  the cursor to `progress`.
- **Silent for the first 140ms** (`GRACE_MS`). Most moves are already in the
  router's cache; a bar that flashes on every one of them teaches people to stop
  looking at it.
- **Never reaches the end on its own** — approaches 90% and slows (`CEILING`,
  `nextProgress`). There is no way to know how far a server render has got, and
  a bar that sits at 100% is a lie the next second exposes.
- **Watches** link clicks, GET form submits (the header search box — every other
  form posts a Server Action and stays put) and `popstate`. `lib/navigation-progress.ts`
  holds the rules and the arithmetic, away from the DOM, and is unit-tested.
- **Announces once**, in a `role="status"` region — the skeletons themselves are
  `aria-hidden`, because a `loading.tsx` is handed no params and so has no
  language.
- Wrapped in its own `<Suspense>`: it reads `useSearchParams()`, which without a
  boundary would drag every page out of static rendering.

### Skeleton (web)
The shapes a screen is drawn as while its data is on the way — `SkeletonScreen`,
`SkeletonHero`, `SkeletonCards`, `SkeletonRows`, `SkeletonLines`,
`SkeletonDishes`, `SkeletonPanel`, `SkeletonBanner`, `SkeletonCats`,
`SkeletonChips`, `SkeletonHeading`, `SkeletonSectionHead`, `SkeletonText`.
- **Props:** mostly `count` / `rows` / `lines`; `SkeletonScreen` also takes
  `className` for the screens that narrow the column (`screen--basket`,
  `screen--checkout`).
- **Built from the real layout classes** — `.grid`, `.card`, `.dishes`,
  `.order-row`, `.line`, `.banner` — with words and photographs replaced by
  placeholder blocks. The blocks land where the words will land, so the arriving
  page settles into the shape already on screen instead of shoving it around,
  and there is one set of measurements to keep in step with the design.
- **The hero and the profile banner are drawn for real.** Their gradients need
  no data; only the words on top of them are worth waiting for.
- Assembled by each route's `loading.tsx`. Every segment under `[lang]` has one,
  including the redirect and the catch-all — without them a segment borrows the
  home page's skeleton and promises a catalogue that is not coming.

---

## Back-office primitives (`apps/admin/src/ui`)

A separate vocabulary from the two above, for a separate product: the internal
panel is a dense desktop/tablet tool, not a phone storefront. Built on
[Radix primitives](https://www.radix-ui.com/primitives) — Radix owns behaviour
and accessibility (focus trapping, `Escape`, focus restored to the trigger,
roving arrow keys, `aria-modal`), this layer owns appearance, which is tokens
only. See DESIGN_SYSTEM.md §10 for the density rules.

**Screens import from `./ui`, never from `@radix-ui/*` directly.**

**Every visible string is a prop, and every prop is already translated.** A
component never holds a literal: the labels these primitives own themselves —
the dialog's close button, a toast's dismiss, a confirm dialog's Cancel, the
select's placeholder — come from `useT()`, so the whole layer must be rendered
inside `<LanguageProvider>` (`apps/admin/src/i18n.tsx`). See
DEVELOPMENT_GUIDE.md §5.

### Button
- **Props:** `variant: 'primary'|'secondary'|'ghost'|'danger'` (default `secondary`), `size: 'md'|'sm'`, *`icon?: IconName`*, *`loading?: boolean`*, plus every native `<button>` prop.
- `loading` disables the button and swaps the icon slot for a spinner, keeping its width.
- `.btn--touch` widens it to the 44px hit target (order board only); `.btn--block` to full width.

### IconButton
- **Props:** `icon: IconName`, `label: string` (required — there is no visible text), *`variant?`*.

### Card / Separator / Toolbar / SectionTitle
Surfaces and spacing. `Card` takes native `<div>` props; `card--flush` removes padding for a table.

### PageHeader
The sticky band every screen opens with.
- **Props:** `title: string`, *`description?: string`*, *`actions?: ReactNode`* (falsy is treated as absent, so `canWrite && <Button/>` works).

### Badge
- **Props:** `tone: 'neutral'|'accent'|'good'|'warn'|'danger'`, *`dot?: boolean`*, `children`.

### Banner
A message that stays until acted on — a failed load, an unreconciled payment. Transient feedback goes to `useToast` instead.
- **Props:** *`tone?`* (default `danger`), `children`, *`onDismiss?`*.

### EmptyState
- **Props:** *`icon?: IconName`*, `title: string`, *`description?`*, *`action?: ReactNode`*.

### Pagination
Page navigation for a list the API returns one page of. Numbers with ellipses, prev/next, and the range summary — `1–25 of 312` is what says whether the thing being looked for is even in this list.
- **Props:** `page: number` (1-based), `pageSize: number`, `total: number` (the count matching the query, not `items.length`), `onPage: (page: number) => void`, `labels: {nav, previous, next, page: (n) => string, range: string}`.
- **Renders `null` for a single page.** A pager under a list that fits on one screen is furniture.
- Labels are passed in already translated, so this stays presentational like the rest of the file.
- `pageNumbers(current, pages)` is exported and pure — the strip is always seven slots wide so buttons do not move under the cursor between clicks, and a gap is never allowed to stand in for a single page (same width as the number, less information).

### Skeleton
- **Props:** *`height?: number`* (default 72), *`count?: number`*. Shimmer, `--placeholder → --placeholder2`.

### Field
Label, control and hint as one unit; generates the id that ties them together.
- **Props:** `label: string`, *`hint?`*, *`error?`* (replaces the hint), *`required?`*, `children: (id: string) => ReactNode`.

### TextInput / SearchInput
Native `<input>` props. `SearchInput` adds the search glyph and `type="search"`.

### Select&lt;T&gt;
Radix listbox, styled to the panel — a native `<select>` cannot be.
- **Props:** `value: T | ''`, `onValueChange: (value: T) => void`, `options: {value: T, label: string, hint?: string}[]`, *`placeholder?`*, *`id?`*, *`disabled?`*, *`ariaLabel?`*.
- An empty `value` shows the placeholder and keeps the component controlled. **Option values must be non-empty** — Radix rejects `''` as an item value.
- `placeholder` defaults to the dictionary's `selectPlaceholder`; pass one when "Choose…" is too vague to name what is being chosen.
- The trigger's label is portalled out of the Select content, so it is empty in server-rendered markup and correct in the browser.

### Switch
- **Props:** `checked: boolean`, `onCheckedChange: (checked: boolean) => void`, *`disabled?`*, *`id?`*, *`ariaLabel?`*.
- Used where a label that flips between "Open" and "Close" would not say whether it reports state or action.

### SegmentedTabs&lt;T&gt;
Filter strip with the filtered list as its panel. One tab stop; arrow keys move between segments.
- **Props:** `value: T`, `onValueChange`, `segments: {value: T, label: string, count?: number}[]`, `label: string` (accessible name), `children` (the panel), *`actions?: ReactNode`*.
- **The strip scrolls sideways inside itself** rather than pushing the page wide, and segments are never squeezed — the order board's six stages with counts are wider than a phone, and half a word is not a stage.
- **Nests.** Rendering one inside another's panel gives a sub-filter that appears only while its parent segment is open — the order board's *Paid / Unpaid* under **Paid**. Wrap the inner one in `.subfilter`: it is smaller and outlined rather than filled, because two identical rows of segments read as one control that wrapped.

### Dialog
For a form that would otherwise unfold inside the list it is about.
- **Props:** *`open?`*, *`onOpenChange?`*, *`trigger?: ReactNode`*, `title: string`, *`description?`*, *`wide?: boolean`*, `children`.
- Compose with `DialogBody`, `DialogFooter`, `DialogClose`. Put the `<form>` inside the Dialog wrapping both body and footer, so the submit button is in the form.

### ConfirmDialog
The gate in front of anything this panel cannot undo.
- **Props:** `trigger: ReactNode`, `title`, `description`, `confirmLabel`, *`tone?: 'danger'|'primary'`*, *`busy?`*, `onConfirm: () => void`.
- An alert dialog, not a plain one: focus starts on the safe choice and a click outside does not dismiss it.

### Menu / MenuItem / MenuLabel / MenuSeparator / MenuRadioGroup / MenuRadioItem
Dropdown menu (the account menu).
- **Menu props:** `trigger: ReactNode`, `children`, *`align?: 'start'|'end'`*.
- **MenuItem props:** *`icon?`*, *`tone?: 'neutral'|'danger'`*, `onSelect: () => void`, `children`.
- **MenuRadioGroup props:** `value: string`, `onValueChange: (value: string) => void`, `children`.
- **MenuRadioItem props:** `value: string`, `children`. Renders `role="menuitemradio"`, so the current choice is announced as *chosen* rather than merely ticked — used for the language picker. The tick reserves its width on every item, or selecting one shifts the others.

### Tooltip / TooltipProvider
- **Props:** `label: string`, `children` (the trigger).
- Never the only place something is said — unreachable on touch, invisible when scanning.

### ToastProvider / useToast
Transient feedback for actions.
- **`useToast()`** → `{ success(text), error(text), info(text) }`. Failures last 8s, successes 4s: one is read, the other is acted on.

### Icon
- **Props:** `name: IconName`, *`size?`* (default 18), plus native `<svg>` props. Inline set, inherits `currentColor`.

### Link
The panel's screens have addresses, so going to one is a link. From
`apps/admin/src/router.tsx` rather than `ui/` — it is navigation, not
appearance, and it wears whatever class the place it sits in already used
(`nav__item`, `link-title`, `link-where`, `btn btn--secondary`).
- **Props:** `to: string` (build it with `routePath`/`tabPath` from `navigation.ts`, never by hand), *`replace?: boolean`*, plus every native `<a>` prop except `href`.
- **A real `<a href>`.** The address shows on hover, "copy link" is in the context menu, and ⌘/Ctrl/middle click opens a second tab. The router intercepts only a plain left click — modified clicks belong to the browser, and swallowing them is what makes an in-app link feel worse than a real one.
- `replace` for a move nobody asked for (a redirect), so the back button goes where the person came from rather than bouncing off it again.
- **A disclosure is not a link.** Opening a branch's team stays a `<button>` with `aria-expanded`: it is reading state, not somewhere anyone can be sent.

---

## Back-office screen parts

### ActivityDialog (`apps/admin/src/activity.tsx`)
What one person has done, newest first — a dialog off their row in People.
- **Props:** `person: StaffListEntry`, *`links?: ActivityLinks`*.
- **A dialog, like the order board's History**, and for the same reason: a feed is something you open about somebody, read, and close, not a second thing to keep on screen while working down a list. It needs no layout of its own — it reuses `.dialog` and `.timeline`.
- **Rendered only when the account holds `staff:activity`** (`People` takes `canReadActivity`), so no card offers to open something the API is about to refuse.
- **Its own trigger and its own `open` state.** A `Button icon="history"` on the card, beside `ActAsButton`. `wide`, because an entry is a sentence with a place and a time after it — at the default width every second row wraps.
- **Reads `GET /staff/{id}/activity`**, which merges `audit_log` with `order_events` and applies the caller's reach to both. The dialog never decides what may be seen, so a short feed is a statement about reach rather than about the person.
- **Nothing is fetched until it opens, and the feed is dropped when it closes.** A page of twenty people would otherwise be twenty requests for panels nobody looked at, and reopening must not show a timeline held from last time — this is read to check something current. The page number resets with it.
- **Guards against a stale response**, so a slow request that lands after the dialog closed cannot repopulate it.
- **Every entry's second line reads `subject · place`, and each half is a link.** The subject is what was acted on — the dish, or the order's code; the place is the branch it happened in. They lead to different screens, and keeping each half's destination the same on every row is the point: the place used to carry the dish link, so one entry's "Dolmama · Northern Ave" opened a branch and the next one's opened a dish.
- **`links` is which of those screens this account can open** — `{ menu, orders, restaurants }`, from `menu:read`, `orders:read` and `branch:read`. Defaults to none, so a caller that says nothing offers no dead ends. All three come with `staff:activity` today; they are separate because that permission exists to be splittable, and a link to a tab the sidebar does not show is a dead end.
- **A dish that was taken off the menu stays text.** It is soft-deleted and filtered out of every menu read, so the link would open the right menu with nothing marked on it — which reads as broken rather than as an answer.

### placeHref(entry, links) / subjectHref(entry, links)
Where each half leads, or null. Exported and tested directly (`activity-ui.spec.ts`), the way `Orders.tsx`'s `actorHref` is — every null is a decision.
- **The place is the branch on the Restaurants screen**, the same address a role in the directory below links to, so a branch opened from an entry is the branch opened from a role. A restaurant-wide action opens the restaurant with its branches closed; a platform action leads nowhere, because it happened over no restaurant.
- **The subject is `/menu?branch=…&dish=…`** for a dish — "what did that price become" is the next question after reading that it changed — and `/orders?restaurant=…&branch=…&order=:code` for an order. **That last address is new**: the board used to be addressable by branch only, so an order code could not be a link that landed on the order rather than near it.

### headline(t, entry, language)
Exported from the same module and tested on its own (`activity-ui.spec.ts`), the way `Orders.tsx`'s history sentences are: this is where the feed decides what an entry *means*, and every branch is a row somebody may read in a dispute.
- **A price change is spelled out in full** — "changed the price of X from 2 400 ֏ to 2 600 ֏" — because that is what the feed gets opened for; "edited X" hides the number somebody came to check.
- **Names come off the entry, not a lookup**: the row may be gone, and on a rename the name it had at the time is the one that makes the entry make sense.
- **A change to a restaurant's services reads as what it was left offering**, not as what moved: turning table booking off withdraws the dining room with it (BUSINESS_LOGIC.md §2), and naming only the switch somebody touched would hide the half a guest would notice.
- **An action this build has no sentence for renders its raw verb.** A panel can be deployed behind the API, and an entry that silently vanishes from an audit trail is worse than an ugly one. Same for a role the enum no longer has.

### The pickup ending (`apps/web/.../preorder/page.tsx`, `apps/mobile/app/preorder.tsx`)
**Takeaway**, or **Eat at the Restaurant** — the choice *inside* Pre-Order (the mode stored as `pickup`), on the pre-order screen in **both** clients. It used to live on mobile's basket screen and moved here: at a restaurant the "eat here" button leads to the booking calendar, and a button has to sit beside the thing it opens.
- **Drawn from `quote.pickupOptions` and `quote.eatInRequiresBooking`**, never worked out on the client. They are the same answers `POST /orders` validates against, and deriving them twice from `services` is how the two stop agreeing.
- **At a counter, two live buttons.** No bookings, so both endings are real and the kitchen plates one and bags the other.
- **At a restaurant, one live button and one dead one.** `pickupOptions` holds take-away alone — one button labelled "take away" would be asking somebody to confirm what was never in doubt — but `eatInRequiresBooking` keeps "Eat at the Restaurant" on the screen, dimmed and dashed, reading "only by booking a table". **It is not `disabled`:** a disabled control says "not for you" and then does nothing, and this one has somewhere to send them. Pressing it sets the *mode* to dine-in, which opens the calendar. Never rendered for dine-in, and never where pickup is not offered — a lone dead button under a mode nobody picked is furniture.
- **There is no "take away" flag anywhere.** It is what pickup is; the API defaults to it when nothing is chosen, which is what lets a client that predates the field keep working.
- **Web: `<form action={choosePickupOption}>` posts for the live ones and `<form action={chooseServiceMode}>` for the dead one**, like the modes above them — the basket is an httpOnly cookie, so the choice is a server change either way, and the whole flow keeps working with JavaScript off. Indented under the modes (`.modes--sub`) so it reads as one question and then another, not four options.
- **Mobile: `setPickupOption` and `setServiceMode` on the cart context**, and the chosen ending is part of the quote's cache key — a branch that has started taking bookings refuses the quote, and that refusal belongs on the screen the choice was made on rather than at the payment.
- **Switching to dine-in drops it** (`setServiceMode`), and coming back starts from take-away rather than a remembered choice the place may since have stopped offering. `toBasket` also refuses to send one on a dine-in basket, because a hand-written cookie can hold the pair and the API answers it with a 422. Mobile's `toPayload` leaves it out of a dine-in basket for the same reason — the value is kept, so switching back restores the choice, but it never reaches the wire while a table is involved.

### NotificationBell (`apps/web/src/components/NotificationBell.tsx`, `apps/mobile/src/components/NotificationBell.tsx`)
The customer's bell — see SCREENS.md §15. Two components rather than one,
because the two clients learn about a change differently (below), but they draw
the same thing and read the same endpoints.

- **Web props:** `endpoint` (`notificationsApiPath(language)`), `streamEndpoint`
  (`notificationsStreamPath(language)`), `ordersBase` (`ordersPath(language)`),
  `labels: { bell, empty, hint, enableAlerts, alertsOn }`,
  `statusCopy: Record<OrderStatus, { title, body }>`.
- **Mobile props:** none. It reads `useSession`, `useTranslate` and `useTheme`
  itself, the way every other screen part in that app does.
- **`statusCopy` is resolved on the server** and passed in, so the three
  dictionaries stay out of the browser bundle — the same trade `BasketButton`
  makes with its `label`. The app has its dictionary already and calls `t()`.
- **Renders nothing until it knows.** Signed out, there is no bell; on the web
  it returns `null` until the first answer lands, which also keeps the server's
  HTML and the first paint identical.
- **Opening it clears the badge**, server-side (`POST /notifications/read-all`),
  and the answer is the bell as it now stands rather than a guess. The unread
  dots on the rows stay.
- **Both are pushed.** The app subscribes directly
  (`subscribeToMyNotifications` → `watchMe`); the web opens an `EventSource` on
  `streamEndpoint`, whose route handler holds that same subscription for it.
  Polling at `BELL_POLL_MS` (30s) starts **only** if the stream cannot be opened
  at all, and is the fallback rather than the mechanism.
- **A kind it does not know is skipped, not drawn blank** — a newer API talking
  to an older client.
- **Browser alerts are opt-in and offered only where they can work** — a button
  inside the panel, shown while permission is `default`, hidden once answered.
  See `browser-alerts.ts`.
- **The cross is a sibling of the line's link, never inside it.** A `<button>`
  nested in an `<a>` is invalid HTML and the press would belong to both; on
  mobile the same applies to a `Pressable` inside a `Pressable`. Its
  `aria-label` names the order, so a screen reader hears which line is going
  rather than "delete" eight times.
- **Deleting is optimistic, then settled.** The line goes immediately and the
  server's answer — the whole bell — replaces the guess. The arithmetic is
  `withoutItem` below, not inline, because the badge is what gets it wrong.

### alertState / requestAlerts / raiseAlert (`apps/web/src/lib/browser-alerts.ts`)
The browser's own notification, raised by the open page from the stream it is
already holding. **Not Web Push**: no subscription, no VAPID, so it only ever
happens while the site is open somewhere.
- **`alertState()`** → `unsupported | default | granted | denied`. Reads no
  browser API that might be missing, so it is safe on the server — and
  `unsupported` covers an ordinary iPhone visit, where Safari has no
  `Notification` until the site is installed to the home screen.
- **`requestAlerts()`** asks and registers the worker. **Only from a press** —
  a prompt raised on load is penalised by every browser and a refusal is
  permanent. Granted-but-unregisterable is reported as `unsupported`, because
  from here that is what it is.
- **`raiseAlert({ title, body, url, tag })`** shows one through
  `ServiceWorkerRegistration.showNotification`, which is the only way that works
  on Android Chrome. `tag` is the order id, so an order moving through six
  stages replaces its own alert rather than stacking six.

### toBell / toItem / orderCopy / withoutItem / sameBell / stopWatchingOn (`apps/web/src/lib/notification-watch.ts`)
The browser's half of the bell, kept out of the component that runs it.
- **`toBell(value)`** → `Bell | null`. Validates the route's answer; one
  malformed row is dropped, a malformed envelope keeps the last good badge.
- **`orderCopy(item)`** → the dictionary keys for a line, or `null` for a kind
  this app cannot draw (a promo carries prose and no status), where `title`/
  `body` as sent are used instead.
- **`withoutItem(bell, id)`** → the bell with one line gone, for the optimistic
  delete. The badge drops **only** if that line was unread and **never** below
  zero — the count is the server's and covers everything, while the list is one
  capped page of it, so the two can disagree. An unknown id returns the bell
  unchanged rather than guessing.
- **`sameBell(a, b)`** compares the count and the newest id — the only two
  things drawn — so a poll that found nothing new re-renders nothing. **It is
  deliberately not used for local edits**: deleting a read line from the middle
  moves neither of those two, so the change would be dropped and the cross
  would appear to do nothing. `NotificationBell` has a separate unconditional
  setter for that.
- **`ORDER_STATUS_COPY`** is re-exported from `@amragrir/i18n`; it lives there
  because the app needs the same map, and a copy per client is a copy to forget.

### monthGrid / monthHasBookableDay (`apps/mobile/src/booking-calendar.ts`)
The month behind the pre-order calendar, pulled out of the screen and given a spec of its own.
- **No `Date.now()` anywhere in it.** `today` is passed in, so every rule — what is past, where the horizon falls — is testable without freezing a clock.
- **Everything is a `YYYY-MM-DD` Yerevan date**, the form `GET /availability` takes. They compare correctly as plain strings, which is why no `Date` survives past the arithmetic and no zone can creep in.
- **Monday first.** `getUTCDay()` counts from Sunday; Armenia does not. The offset is shifted rather than used raw, and the spec pins 1 Aug 2026 (a Saturday) to five leading blanks — a Sunday-first grid would put six there and move every date one column.
- **Past days are drawn, not hidden**, and simply not tappable. Hiding them leaves a hole where the reader expects the 1st.
- **`monthHasBookableDay` drives the arrows**, so neither can page onto a month with nothing on it.

### readyTimeOptions (`packages/shared/src/ready-times.ts`)
The "food ready at" grid, shared rather than copied.
- **It moved out of `apps/web/src/lib` when mobile grew the same grid.** Web and mobile draw it from the same `earliestReadyAt`; two copies would eventually offer two different sets of times for one basket.
- **The spec stayed in `apps/web`**, importing from the package: `@amragrir/shared` has no test runner of its own, and adding one to house four assertions is more machinery than the move is worth.
- **Later options sit on clean quarter-hours**, so the grid reads 12:45 / 13:00 rather than 12:47 / 13:02.
- **Pickup only on mobile.** A dine-in basket takes the booked table's instant as its `readyAt`, so it never draws this.

### ServiceRows (`apps/admin/src/screens/Restaurants.tsx`)
How the restaurant will feed people, as three switches — Pre-Order (stored `pickup`), dine-in, table booking — in their own section on a restaurant's page. There is no fourth: `eat_in` stopped being a declared service, and eating in after collecting is now derived from whether the address takes bookings (BUSINESS_LOGIC.md §2).
- **Props:** `t: Translate`, `services: string[]`, `reservationsEnabled: boolean`, `saving: RestaurantService | null`, `onToggle: (service, on) => void`. Stateless: the restaurant's page owns the set, and replaces it with what `PATCH /restaurant/restaurants/{id}/services` answers rather than with what it sent.
- **Rendered only for `restaurant:write`** (`canEditServices`). Everybody else keeps the one-line "Services" fact in the card above — one place says what is offered, and it is the one with the switches in it when there are switches.
- **No switch is dead.** Every row flips, because `toggleService` resolves the conflict instead of refusing to move: turning dine-in on turns table booking off, and the other way round. They are the two ways of seating somebody (BUSINESS_LOGIC.md §2), so choosing one is choosing against the other. The dine-in row used to be disabled until somebody found the booking switch and flipped it first — the rule was enforced as an obstacle rather than as a choice.
- **The row still asks `serviceToggleBreach` from `@amragrir/shared`** — the same function the API validates with, asked as "would the resulting set be legal" rather than by restating any rule. It answers null for every switch in this vocabulary now. It is kept because a rule between three services — where turning one on could not resolve both conflicts at once — would need the row to say so again.
- **The reason, when there is one, is plain text in the row, not a tooltip.** A tooltip is not there on a touch screen and invisible to anyone scanning; a disabled switch with no reason beside it reads as broken.
- **There is no "Takeaway" switch.** It is what a pre-order *is* — there is no configuration in which it is off — and the Pre-Order row says so rather than leaving its absence to be noticed.
- **One click is not always one change.** `toggleService` drops the opposite seating when one is turned on, so the set that is sent is one the API will accept; the section then shows back what was actually stored. The dine-in hint says so in words, because a switch that moves a switch the operator did not touch has to admit it.
- **The `reserve` row says when bookings are switched off anyway.** Advertising bookings (`services`) and taking them (`reservations_enabled`) are two columns and a booking needs both; nothing on this screen can set the second, so the row says so rather than leaving somebody to turn this on and wonder why no table can be booked.
- **Every switch waits for the save in flight.** Two overlapping saves would each send a whole set built from a state the other has already moved.

### SERVICE_KEYS / serviceName / serviceList / blockedReason (`apps/admin/src/services.ts`)
The service vocabulary as the panel says it, shared by the restaurant's page and the activity feed, and tested on its own (`services.spec.ts`).
- **A service this build has never heard of renders as it is stored**, not dropped — a value nobody translated is still one the restaurant advertises.
- **`blockedReason` names the *other* service.** A breach names the pair in one fixed order, which is right for a log entry and wrong for a row: on the dine-in row the reason is the eat-in option, and on the eat-in row it is dine-in. Naming the row's own service back at the reader would read as "unavailable while itself is on".
- **The rules are not here.** They live in `@amragrir/shared`, where the API reads the same ones; this module is names and sentences.

### MenuHistoryDialog (`apps/admin/src/menu-history.tsx`)
Everything that has happened to one dish, oldest first — a dialog off its row on the Menu screen.
- **Props:** `itemId: string`, `dish: string` (the name as the panel currently shows it — the title), `canOpenStaff: boolean`.
- **Offered on every row, not only to `menu:write`.** It reads `GET /restaurant/menu-items/{id}/history` on `menu:read`, which everybody looking at the screen holds; the actions column that used to appear only for an editor is now always rendered, with Delete the one thing inside it still gated.
- **A dialog, like the two feeds above**, and reusing the same `.dialog` and `.timeline`. It adds one layout of its own — `.diff`, the `field: from → to` list under each entry, a definition list rather than a table because the fields differ per entry and columns would leave most cells empty.
- **Fetched on open, and re-fetched on every open.** A price moves while the panel is looking at another branch, and a timeline held from last time is wrong exactly when somebody is checking it. Guards against a response landing in a dialog that has since closed — or in the next dish's.
- **Names link to `/people?person=` only when `canOpenStaff`.** A shift holds `menu:read` and not `staff:read`; a link to a tab their sidebar does not show is a dead end. An account since deleted renders "a staff account since removed" rather than an empty line — `actor_staff_id` is `ON DELETE SET NULL`, so that is a real answer.

### The pin on an order card / pinScope (`apps/admin/src/screens/Orders.tsx`)
An icon button before the order's code that holds the board on that one order — the code goes into the search box and the rest of the queue leaves the screen.
- **Props on the card:** `pinned: boolean`, `onPin: () => void`. One handler for both directions, because it is one control: pressed on a pinned card it lets the queue back in.
- **`pinScope(filters, code)` → `OrderScope`** — the whole of what the pin does, exported and tested on its own (`orders-tabs.spec.ts`) since the board around it needs a document and a run of effects before it says anything. It carries the restaurant and branch through unchanged (`''` → `null`, so an empty picker is "not narrowed" rather than an id that matches nothing) and only sets or clears `orderCode`.
- **It writes `&order=:code`, not a search term.** Same address a line in somebody's activity links to, so the board needed nothing new: the box fills from the URL, and the term is editable exactly as a typed one is. A pinned board can be sent to whoever is asking about that order.
- **`replace`, like the board's pickers.** Narrowing a queue is not a place in the browser's history, and nothing is lost by it — the pinned board is one card, so the control that undoes it is the one already on screen.
- **Only the pin lights the pin.** `pinned` is `order.code === scope.orderCode`, never the search term: somebody who typed a code by hand is looking for an order, not holding the board on one.
- **Unpinning clears the search box itself**, which the address cannot do — the board only ever *sets* `q` from `&order=`, because a URL naming no order is the ordinary board rather than an instruction to empty a box somebody is typing in.
- **The glyph is `pin`, drawn head-on** rather than leaning the way a map pin does: at 17px a tilted pin reads as an arrow, and an arrow among the status buttons looks like something that moves the order along.

### OrderQrDialog / QrPlate (`apps/admin/src/order-qr.tsx`)
An order's full code as a QR code — a dialog off the **QR** button on every card of the order board.
- **OrderQrDialog props:** `t: Translate`, `order: StaffOrder`. Takes the translator as a prop rather than calling `useT()`, the way the board's `OrderHistoryDialog` beside it does — the card already holds one.
- **QrPlate props:** `value: string` (what is encoded), `label: string` (the accessible name — already translated). Exported for `render.spec.tsx`, since the dialog around it only opens on a click.
- **It encodes `orders.code`.** It could not encode the pickup code even if that were wanted: the API sends no staff endpoint that value at all (see `HandoverDialog`). What this is for is the other job — handing twelve characters to a scanner instead of retyping them into a search box, a handheld or a refund note.
- **The plain code is written under the picture.** A scanner can be flat, out of reach, or absent; a QR nobody can read with their eyes is a dead end when it is.
- **Nothing is encoded until it opens.** Radix mounts dialog content only while open, and the work sits inside `QrPlate` rather than in the card — a board holds fifty of these.
- **`role="img"` with the order code as its label.** A path of several hundred squares says nothing to a screen reader otherwise.
- **`--qr-ink` on `--qr-paper`, in both themes** (DESIGN_SYSTEM.md §1). Dark-on-light is what the format assumes, and an inverted code is one a counter's handheld may refuse to read.

### OrderHandoverDialog (`apps/admin/src/order-handover.tsx`)
The **Hand it over** button on a `ready` card, and the only route to `completed`.
- **Props:** `t: Translate`, `order: StaffOrder`, `busy: boolean`, `onDone: () => void`.
- **A dialog with a box in it rather than a status button.** Every other button on a card states what the restaurant has done; this one states that the food left the counter in somebody's hands, and the evidence is the code they showed. The board used to close an order on one press *and* print the code across the card — so the press needed nobody to be standing there. Both halves are gone.
- **It owns the request**, unlike the other moves, which the card delegates upward through `onAdvance`. It has to: it is the thing that shows the refusal, and a mistyped code is the ordinary case at a counter rather than a toast-worthy error. `onDone` only announces the success; the board itself updates from the same broadcast every other move rides on.
- **The check is the API's.** The panel has nothing to compare against and is not trusted to — `handoverCode` validates the *shape* (six digits, trimmed) so a request that would 400 on its face is not sent, and nothing else.
- **`isWrongPickupCode` picks the one failure the panel rewords** — `details.reason === 'pickup_code_mismatch'`, which is why the API sends a reason rather than only a sentence. Every other failure from that endpoint, including the other 422, is shown as the API worded it.
- **Cleared on every open, `autoFocus`, submits on Enter.** A counter's hands are on the guest, not the keyboard, and a wedge scanner pointed at the guest's QR types the digits and an Enter — so the whole handover is one gesture. Reopening after a refusal must not offer the rejected digits back: the next guest is a different guest.
- **`inputMode="numeric"`, not `type="number"`.** The code has leading zeros and is not a quantity.

### encodeQr (`@amragrir/ui`, `packages/ui/src/qr.ts`)
The code as SVG path data — `{ size, path }` in module units, quiet zone included. Tested directly (`qr.spec.ts`) against the encoder's own matrix: a path that is off by one module or drawn transposed is still a picture of a QR code, and the only other place that shows up is a scanner that will not beep.
- **Shared by all three clients.** It lived in `apps/admin/src` while the panel was the only thing that drew a QR; the customer's pickup code needs one too, on web and on mobile. It returns path data in module units and draws nothing itself, so one function serves an `<svg>`, a Next server component and a `react-native-svg` `<Path>`. In `@amragrir/ui` rather than `@amragrir/shared` because that package is enums and business constants with no runtime dependencies, and the API imports it at boot with no use for a QR encoder.
- **The encoding comes from `qrcode-generator`**, now `@amragrir/ui`'s one runtime dependency; the rendering is ours. An SVG path rather than the library's `<img>` or `<table>` so the code inherits `currentColor` and scales; runs of adjacent dark modules merge into one subpath rather than a rect per module.
- **Level `M`, smallest version that fits** — an order code lands in a 21×21 grid, and a coarser grid is what actually survives a fingerprint on a tablet.
- **Four-module quiet zone, inside the viewBox.** A scanner finds the code by its border, and CSS padding around the plate is not something the path can rely on.

### NewDish / EditDish / DishFields (`apps/admin/src/dish-form.tsx`)
The two forms a dish is written in — the one that adds it, and the one behind each row's pencil.
- **NewDish props:** `branchId: string`, `open: boolean`, `onOpenChange`, `onCreated: () => void`.
- **EditDish props:** `item: StaffMenuItem`, `onOpenChange`, `onSaved: () => void`. It has no `open`: the screen mounts it only while a dish is being edited, keyed by that dish, so a second dish is a second form rather than the first one holding somebody else's price.
- **One `DishFields` for both.** They ask for exactly the same things — the three names, price, tab, prep estimate, photograph — and the moment that is written twice is the moment a field lands in one of them only. The forms differ in their title, their footer, and the one hint under the photo field: a dish being added has no picture yet, one being edited already has the picture this would replace.
- **The edit opens on what the dish is now**, which is what makes the photograph replaceable at all rather than merely settable once.
- **Only the fields that moved are sent** (`dishPatch`), and **Save is disabled until one has** — a PATCH that changes nothing writes no history entry at the API either, so reporting success for one would be a lie in the direction people check.
- **Neither form submits while an upload is running.** A dish saved mid-upload keeps the photograph somebody was in the middle of replacing.
- **The price and the sold-out switch are deliberately not here.** They stay in the row: they are what somebody changes mid-shift, and a form is the wrong shape for one number.

### dishForm / dishNames / dishFormValid / dishPatch (`apps/admin/src/dish.ts`)
The form's rules with no React in them, tested directly (`dish.spec.ts`) — these decide whether somebody's price reaches the API.
- **Numbers are held as strings.** `"2500x"` and `""` are states a form can be in, and a `number` cannot hold either without pretending it is `NaN` or zero. They become numbers at the edge, once `dishFormValid` has said they are numbers at all.
- **`dishPatch` returns null when nothing moved** — that is what holds the Save button — and compares names language by language rather than as JSON, since a stored column carries its keys in whatever order the insert did and key order is not a change to a name.
- **An emptied prep-time box sends `null`**, which clears the estimate; an empty photo field sends nothing at all, because `""` is what the field holds mid-upload and the API refuses it. The two blanks mean opposite things, which is why neither is inferred.
- **A typed `0` is a prep time, not an empty box.** It sends `prepMin: 0` — the dish needs no cooking, which is what a bottled drink honestly claims — where blank sends `null` and lets the branch's average stand in. The form used to refuse `0`, so the only way to say it was to leave the box empty and promise a wait that was not there.
- **The ceilings (10,000,000 dram, 480 minutes) are left to the API.** It answers in a sentence the panel would only be paraphrasing, and two more numbers to keep in step buy nothing.

### PhotoField / usePhotoUpload / photoRefusal (`apps/admin/src/photo.tsx`)
A photograph the panel uploads: what may be sent, and the control that sends it. Shared by both dish forms and the restaurant's cover.
- **PhotoField props:** `id: string` (from `Field`), `url: string` (what the form currently holds), `upload: PhotoUpload`, *`disabled?`*.
- **The native file input, restyled** — already labelled, already keyboard-reachable, already says which file is chosen. The hidden-input-behind-a-button pattern rebuilds those three and usually rebuilds them worse.
- **It uploads on choosing, not on submit**, so the picture is on screen and already stored before anything is saved. `usePhotoUpload(onUploaded, send?)` holds no URL of its own — the form owns it, or there would be two answers to "which photograph is this dish getting".
- **`send` is the only thing that differs between callers**: `POST /uploads/menu-photo` by default, `POST /uploads/restaurant-cover` for a cover. The two sit behind different permissions (`menu:write`, `restaurant:write`), so picking the wrong one is a 403 rather than something this module could paper over. The refusals, the clearing and the toast are the same wherever the file is going.
- **A cover has no form to submit afterwards** — the restaurant already exists, so its `onUploaded` PATCHes the URL straight on to it and passes `url=""` to the field, because the section draws the stored picture itself as a small block beside the controls.
- **A failed upload leaves the form's photograph where it was**, and clears the input's selection so that choosing the same file again fires a `change` at all. What is shown is what would be saved; the toast is what says the replacement did not happen.
- **`photoRefusal(file)`** returns the key to complain with, or null — type and size only, from the limits in `@amragrir/shared`. A courtesy, not the rule: the API sniffs the bytes, so a `.jpg` that is really a PDF gets past this and not past that.

### changesOf(t, entry, language) / headline(t, entry) / formatValue(…)
Exported from the same module and tested on their own (`menu-history-ui.spec.ts`), the way the other two timelines' sentences are.
- **The diff is the keys of `after`.** The API adds the dish's `nameI18n` to `before` as a *label* on every edit, changed or not, so walking `before` would render a phantom "Name: Burger → not set" on every price change.
- **A creation and a withdrawal are not dressed up as diffs.** One lists what the dish went on the menu at with nothing on the left, the other what it was with nothing on the right — inventing an empty other side would read as "the price changed from nothing", which is not what happened.
- **The headline names a price change** rather than calling it an edit, and tells the two directions of a sold-out flip apart. It leaves the dish's name out, unlike the activity feed's: the dialog is titled with the dish and would otherwise repeat it on every row.
- **A uuid and a photo URL render as "set".** "The category changed from 8f3c… to b210…" answers nothing anybody asked; that one was set at all is the part a reader can act on.
- **A value whose shape this build does not expect renders as something odd, not a crash.** The entries come out of a JSON column written by whichever build was deployed at the time.

---

### BookingSettings (`apps/admin/src/booking-settings.tsx`)
The five blocks that decide how a branch takes bookings — its tables, the hours
it holds them, the days it does not, the numbers behind the offer, and what a
guest would actually be shown. Rendered inside the branch disclosure on the
Restaurants screen, under the switches that already live there.

- **Only where the branch takes bookings at all.** Tables and seating lengths
  for a counter in a mall would be a form about nothing, and the switch
  immediately above it is where somebody turns that on.
- **Loaded when opened, not when rendered.** A chain's card carries every branch
  under it; three requests apiece across seventy-eight branches is ten seconds
  spent fetching settings nobody asked to see.
- **Two permissions inside one section.** The tables and the policy are
  `branch:write`; the hours and the closed days are `branch:hours`, which a
  shift holds — closing tomorrow because the freezer died happens at 6pm and
  cannot wait for a manager. A person with one and not the other sees both and
  can work only their half.
- **A policy row shows which level answered it.** Without that a manager cannot
  tell a deliberate 90 from an inherited one, sets it again to be sure, and the
  branch acquires an override nobody wanted and stops following the chain
  forever. Turning a row's switch off sends an explicit `null`; turning it on
  sends the figure already in force, so taking the decision over changes nothing
  by itself.
- **Numbers save on blur, not on keystroke.** A PATCH per digit would write
  `seating: 1` on the way to 120.
- **The preview re-runs after every save**, which is what makes it a preview of
  the settings rather than of the settings as they were. An empty calendar is
  the mistake it exists to catch: hours that close before they open, a seating
  longer than the evening.

### ConflictDialog (inside the same module)
What a refused save turns into: the bookings the change would strand — date,
time, party, table, who to ring — and the offer to save it anyway.
- **It says outright that nothing is cancelled.** The shorter wording ("these
  bookings will be cancelled") would be false: the rows survive untouched and
  somebody still has to ring these people.
- The retry closes over the exact request that was refused rather than
  rebuilding it, so "save anyway" cannot send something subtly different from
  what was shown.

### booking-model.ts (`apps/admin/src/booking-model.ts`)
The conversions behind the form, kept out of the component and tested on their
own (`booking-model.spec.ts`).
- **A week is stored sparse and edited as seven rows**, and the two directions
  are held to being inverses: a form that reads a week differently from the way
  it writes one loses a Sunday every time somebody saves.
- **Writing always names all seven days.** A day left unsaid falls through to
  the kitchen's hours and quietly reopens.
- **`null` hours come back as the kitchen's own**, so switching "decide here" on
  starts from what is already true. Starting blank would make that switch a
  destructive act.
- **A closing time at or before the opening one is not an error** — it is a
  night that runs past midnight, and the row says so rather than inviting
  somebody to "fix" it.
- **An empty number box is neither zero nor inheritance.** It is somebody
  mid-edit, and saving on it would wipe a setting or set the deposit to nothing.

---

## Providers / hooks (shared)

- `ThemeProvider` + `useTheme()` — light/dark theme tokens, 3 expressive parameters (accent, surface temp, depth).
- `I18nProvider` + `useT()` — hy/ru/en dictionaries, `hy` default.

### As built in `apps/mobile` (2026-08-04)

Both providers exist under different names, because both had to differ from the
sketch above in ways worth writing down.

- **`ThemeProvider` + `useTheme()`** (`src/theme/useTheme.ts`) — the OS scheme
  with a stored choice layered over it; `preference: null` means "follow the
  OS", which is what the app did before the Settings toggle existed. The three
  expressive parameters are **not** implemented: they are controls on the design
  artifact for exploring alternatives, and the adopted values (Amber, Warm
  cream, Soft & floaty) are the ones already in `packages/ui`.
  `useTheme()` deliberately does not throw outside the provider — the root
  layout itself calls it, and a theme is always answerable.
- **`LanguageProvider` + `useLanguage()` / `useTranslate()`** (`src/language.tsx`)
  — same shape as `apps/admin/src/language.ts`, differing only where the
  platform forces it: `getLocales()` for the device's languages, AsyncStorage
  for the choice. Neither provider blocks the first frame on its (asynchronous)
  storage read; each falls back to what the app did before the preference
  existed. `currentLanguage()` is the non-React reader the API client uses to
  set `Accept-Language` on every request.

`Photo` (`src/components/Photo.tsx`) — **props:** `uri: string | null`,
*`style?`* (box styles only). Every remote picture in the app goes through it:
dish photographs, restaurant covers, order thumbnails. `null` renders the
design's placeholder surface, and so does a failed load — those pictures are
hotlinked, and somebody else's server can refuse one at any moment.

It sends a **`User-Agent` naming the app**. React Native's default is
`okhttp/4.x`, a bare library name, and hosts refuse those — Wikimedia answers
403 by policy, which is how half the demo imagery came out blank in the app and
perfect on the site. The header is good manners and was **not** enough on the
device, so the seed dropped that host as well (`menu-photos.ts`); the header
stays because the next host to care about it should not cost another day.
`photo-headers.spec.ts` scans for a second component fetching an image, which
would go back to the default agent.

The failure mode is worth remembering when reading this component: a refused
image and a restaurant with no cover render the *same* surface, so "the app
correctly shows no picture" and "the app cannot load the picture" look
identical. When a picture is missing in the app but present on the web, suspect
the request, not the data.

`TabIcons` (`src/components/TabIcons.tsx`) — the five bottom-bar glyphs, drawn
as `react-native-svg` paths transcribed from the artifact rather than taken from
an icon font, which would be a different shape nobody chose. They take
`ColorValue`, not `string`, because the navigator supplies the colour.
- `useCart()` — items, quantity, subtotal/service/total, branch binding.
- `useAuth()` — session, guest, tokens.
- `formatMoney(amd)` — formats `12 500 ֏` (space thousands separator, ֏ symbol).

> Web (Next.js) reuses the same types and domain logic; presentational components are duplicated for the DOM, but the props contracts are identical.

> **`useCart()` and `useAuth()` have no web counterpart, on purpose.** The web
> holds both in httpOnly cookies and reads them on the server —
> `lib/cart.ts` + `lib/cart-store.ts` and `lib/session.ts`. A hook would mean
> the basket and the tokens living in the page, which is the thing that design
> avoids: the basket decides what gets charged, and a token in reach of any
> script is a token an injected script can take.
