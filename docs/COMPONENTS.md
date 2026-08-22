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
>   `branchId`, `language`, `returnTo`, `endpoint`, `labels`, `name`,
>   `className`. It takes the **branch** the page resolved to, since 2026-08-13:
>   a favourite is one address (DATABASE.md §13), and one address is what this
>   page is showing. `RestaurantCard`'s heart is server-rendered in the state the
>   account is in, because every screen that draws a card already renders per
>   request; a restaurant page is HTML on disk in three languages, so this one
>   ships hollow and asks `GET /[lang]/saved?branch=` what it should be once
>   it mounts — the same trade `OrderPanel` makes, for the same page. It is
>   still a `<form>` posting `toggleFavorite`, so a scriptless visitor can save
>   from here; un-saving is the one thing a page that cannot know the state
>   cannot offer, and `/favorites` is where it exists for them. It posts
>   `revalidate=0`, because revalidating would throw away a pre-rendered page to
>   change nothing on it. **Since 2026-08-17 it reads through `lib/saved-client`**
>   rather than fetching directly, because the menu's rows now ask the same
>   question — see `DishHeart`.
> - `DishHeart` — the heart on one row of a **pre-rendered** menu (2026-08-17).
>   **Props:** `menuItemId`, `language`, `returnTo`, `endpoint`, `labels`, `name`.
>   It saves the **dish** (DATABASE.md §13a), not the restaurant the banner's
>   heart saves, and it makes the same trade `FavoriteButton` does for the same
>   page: hollow in the HTML, its state read in the browser, still a `<form>`
>   posting `toggleFavoriteDish` so a scriptless visitor can save from here.
>   **Every heart on the page shares one request** — twenty rows asking separately
>   would be twenty identical requests for one answer — through the module-level
>   promise cache in `lib/saved-client.ts`, which is dropped on submit because the
>   press has just changed the answer it holds. Module-level rather than context:
>   the hearts sit in markup the *server* renders, so there is no client component
>   high enough to hold the state without making the whole menu one.
> - `FavoriteDishCard` — a saved dish on `/favorites` (2026-08-17). **Props:**
>   `dish` (a `FavoriteDish`), `language`, `href`, `returnTo`. Built from the
>   menu's own parts — the media placeholder, `.name`, `.desc`, `.price` — so a
>   dish reads here as it did where it was saved, plus the one thing the menu did
>   not have to say: which kitchen, since a dish saved at two branches is two rows
>   with the same name. The heart is always filled and always removes. `href` is
>   the caller's, and is `/r/{branchId}?item=…#dish-…`: the menu **at** the dish,
>   because that is what having saved a dish was for.
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
>   card does not. It carries `branchId` — a favourite is one address
>   (DATABASE.md §13), and so is everything else on this card. The heart is an
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
>   the projection between pixels and coordinates is **ellipsoidal** Mercator
>   (EPSG:3395), which is what Yandex's tiles use. That arithmetic moved to
>   `@amragrir/shared` (`map-view`) on 2026-08-11 when the phone grew the same
>   picker; `lib/map-frame.ts` is the web's name for it and adds nothing.
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
>   than the dictionaries — `countryOptions`, which **moved into
>   `packages/shared` on 2026-08-10** when the phone grew the same picker
>   (`lib/phone.ts` is gone; its spec stayed where the runner is). A client
>   component only for live feedback: it checks
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

### PhoneField (mobile)
The sign-in screen's country-and-number field (`apps/mobile/src/components/PhoneField.tsx`, 2026-08-10).
- **Props:** `country: PhoneCountry`, `national`, `onChangeCountry`, `onChangeNational`, `autoFocus?`.
- **States:** picker closed / open (a bottom sheet of the eight countries), and
  a hint under the field once the number is wrong rather than unfinished.
- **The country is chosen, not inferred.** `+374` was a constant here, which
  meant a number from anywhere else was sent as Armenian and refused; the dial
  code is a button now, and what the screen sends is `toE164(country, national)`
  — the E.164 spelling `users.phone` is unique on.
- **One source for the shape and the check.** `formatNational` groups the digits
  and caps their length, `isValidNational` decides whether Continue is enabled,
  `countryOptions` names the countries — all from `@amragrir/shared`, the same
  module the web field and the API's `normalizePhone` read. A country this
  picker offers cannot be one the server rejects.
- **The hint waits.** A number is not "wrong" until it is at least as long as a
  right one would be, or until the field is left — the web field's rule, so both
  clients scold at the same moment.
- **Backspace is the one thing it does that the web's does not have to.**
  Deleting onto a separator leaves the digits unchanged, so reformatting would
  put the space straight back and the key would look dead; `retypeNational`
  (`src/phone.ts`, tested) takes the digit in front of it instead. It does *not*
  restore a caret as the web field does: a controlled `TextInput` has no
  reliable way to place one, and the phone's editing gesture is backspace from
  the end, which is exactly the case handled.
- **The country name may degrade to its ISO code.** `Intl.DisplayNames` is the
  corner of `Intl` Hermes builds on the platform's own libraries and may lack;
  the row therefore leads with the flag and the dial code, which are derived
  from the code itself and always render.

### Name field (mobile sign-up)
Not a component — a `TextInput` inside `app/auth.tsx`, listed here because it
borrows this field's rules and must keep matching them.
- **States:** empty / typing / left-and-empty. The label carries the screen's
  only `*`; the invalid state is `colors.danger` on the border plus a hint under
  it, exactly as above, so the two fields of one form scold in one voice.
- **Required on the sign-up tab since 2026-08-11**, at two characters or more
  after trimming, capped at the API's 120. Continue is disabled until then — the
  same bargain the number makes, rather than a refusal fetched from the server.
- **The hint waits, then insists.** Silent while the field is untouched; it
  speaks once the field is left *or* once the number is whole, which is the
  moment Continue would otherwise be lit and a dead button would have nothing
  explaining it.
- **The rule is not written here.** `MIN_NAME`, `normalizeName` and
  `isValidName` live in `apps/mobile/src/name.ts` (tested), because the sheet
  below asks for the same field and the two must not drift — the same reason
  `PhoneField` reads its rules from `@amragrir/shared`.

### NameSheet (mobile settings)
The one field behind Settings → "Edit profile" (`app/settings.tsx`, 2026-08-11).
- **Props:** `visible`, `value`, `error`, `saving`, `onChange`, `onCancel`,
  `onSave`.
- A bottom sheet on `PhoneField`'s picker measurements — one input and two
  buttons is not a page, and a route would put a back gesture where Cancel
  belongs. Seeded with the current name: this is an edit, not a new answer.
- **Save is disabled until the name is valid** by the shared rule above, and
  **not optimistic** — a switch is one bit that can be put back, this is text
  somebody would have to retype. Spinner in the button, sheet closes on the
  answer, and the caller writes the name the *server returned* into the session.
- One hint line carries both the requirement and the API's refusal: they answer
  the same button, and two lines under one field would be one too many.

### RestaurantCard
Large Home / See all feed card.
- **Props:** `image`, `name`, `rating`, `reviewsCount`, `cuisine`, `priceLevel`, `distanceKm`, `prepMin`, `isOpen`, `services: string[]`, `dishes?`, `isFavorite`, `onPress`, `onPressDish?`, `onToggleFavorite`, `isDishFavorite?`, `onToggleDishFavorite?` (web: `savedDishes?: string[]`).
- **Under a category filter the card wears its dishes instead of its cover**
  (2026-08-16). `dishes` arrives on the row from `GET /restaurants?category=` —
  up to `CARD_DISH_SLIDER_LIMIT` (10) matching dishes with picture, name and
  price, bestsellers first — and the cover gives way to a horizontal strip of
  them. A guest who tapped "Sushi" is choosing between kitchens on the strength
  of the sushi; a photograph of the dining room does not help. The open/closed
  badge, which normally floats on the cover, moves into the card's tags.
  `onPressDish` opens the branch at that dish (SCREENS.md §3); a screen that
  cannot route to a dish passes neither prop and the card is unchanged.
  **Absent and empty differ**: no filter (cover), versus a filter whose every
  match is sold out tonight (cover, and the card is still true).
- **The slide is square**, and so as tall as the card is wide. It matched the
  cover's height first, to keep a card the same size filtered or not — and that
  was the wrong thing to optimise for: a cover is a room, which a letterbox
  suits, and this is a plate. A plate cropped to a third of its height is a
  photograph of a table edge. The open/closed badge, the rating and the heart
  keep the corners they always occupied; they sit over the *frame* rather than
  inside a slide, so they hold still while the photographs move under them.
- On the **web** the strip sits *outside* the card's own `<Link>`: each plate is
  a link of its own, nested anchors are invalid, and the browser would drop one
  of them. Its href carries both `?item=` (which heading to open, resolved on
  the server) and `#dish-` (which row to scroll to), so a tap lands on the dish
  with no JavaScript at all.
- **The heart sends the row's `id`, which is the branch** (2026-08-13). A card
  *is* one address — its distance, its opening state and its prep time all
  belong to that address — and so is a favourite (DATABASE.md §13). It sent
  `restaurantId` until then, so a chain's cards all went red together and none
  of them could be given back on its own. `restaurantId` is still returned by
  `GET /restaurants`, for the name and rating that do belong to the business.
- **The card opens that branch too**, by id rather than by slug: a slug resolves
  to the oldest branch, so the heart on a card and the heart on the page behind
  it would otherwise disagree about the same press.
- **While the card is wearing dishes, the heart saves the dish** (2026-08-17,
  DATABASE.md §13a). The card is not showing a dining room then, and a heart over
  a photograph of khinkali that saved the address was answering a question nobody
  asked. In the app the card has one heart and it acts on the slide showing — the
  slider's index is held by the card for exactly that, clamped on read so a
  narrowed `dishes` cannot leave it pointing past the end. On the web each slide
  carries its own instead, because a `<form>` rendered on the server cannot know
  which slide is showing; the card's branch heart is then not drawn at all, since
  two hearts in one corner would be a card asking somebody to aim. Both fall back
  to the branch heart when the screen passes no dish props — a control that looks
  pressable and answers nothing is worse than one fewer control.
- `onToggleFavorite` is optional in the app: where a screen cannot act on a
  favourite the heart is **not drawn**, rather than drawn dead. It was drawn
  dead until 2026-08-09 — a control that looked pressable and answered nothing.
- The app fills the heart **before** the request lands and puts it back on a
  refusal; the web has no such state to keep, and its revalidation redraws the
  heart the way the server actually has it.
- **On the phone a guest's heart works** (2026-08-11): it fills like anyone
  else's, and the list is kept on the device until sign-in hands it to the
  account (SCREENS.md §5). It used to route to sign-in and back, which answered
  a tap on a heart with a phone-number form. The card itself is unchanged — the
  screen decides where the write goes. On the **web** a guest still goes to
  sign-in: a server-rendered heart has no device store behind it.

### DishSlider (`apps/web/src/components/DishSlider.tsx`) / `DishStrip` (in the app's card)
The matching dishes on a filtered card — **one dish per slide, the card's full
width**.
- **Props (web):** `dishes: CardDish[]`, `href`, `labels: {prev,next,goTo}`,
  `favorite?: {language, returnTo, saved: string[], labels: {add,remove}}` — given,
  every slide draws a heart that saves **that dish**; omitted, none does.
  **Props (app `DishStrip`):** `dishes`, `onPressDish?`, `at`, `onAt` — the index
  is the card's, since the card's heart acts on the dish it points at.
- **One plate per slide, not a row of tiles.** It shipped as small tiles first
  and they were the wrong shape: the plate is the thing being chosen, and at a
  third of a card's width it is a thumbnail beside two other thumbnails with the
  third sliced off at the border — which reads as a layout bug rather than as an
  invitation to swipe. One square photograph the width of the card shows the
  food at the size somebody decides on it.
- **The name and price sit over the foot of the photograph**, on a gradient. Not
  under it: the card already carries a name and a price lower down — the
  restaurant's — and two stacked name/price pairs read as one confused block.
- **Dots under the picture**, one per dish, the current one widened rather than
  merely darkened, because a six-pixel colour change is not a difference
  anybody notices in passing. They go below rather than on the photo: the
  caption already occupies its foot, and dots over a gradient over a photograph
  is three layers of contrast to get right for one control.
- **The controls appear only once mounted** (web). Every dish is a real
  `<a href>` in the server-rendered HTML, so a crawler and a scriptless visitor
  get every slide and can still swipe or scroll between them — what they do not
  get is a row of buttons that would answer nothing. The same rule the heart
  follows.
- **Arrows are overlaid on the photograph and stay put**, dimmed and `disabled`
  at the ends rather than removed: an arrow that disappears shifts the other one
  under the cursor between slides, and a control that comes and goes is one
  somebody has to look for. `disabled` rather than a class, so it is genuinely
  unpressable and announced as unavailable instead of merely painted that way.
  This is a different question from the mount gate above — a button with no
  JavaScript behind it can never work, while one at the end of the list works
  again the moment you go back.
- **Both measure rather than assume.** A slide is one card wide and that changes
  with the breakpoint, so the web reads the nearest slide's `offsetLeft` and the
  app pages on a width taken from `onLayout`. A hard-coded number drifts the
  moment the grid reflows, and then a slide comes to rest showing two halves.

### RestaurantListItem
Horizontal row (Favorites / search results).
- **Props:** `image`, `name`, `meta`, `where`, `prepMin`, `rating`, `onPress`, `onRemoveFavorite`.
- On the Favorites screen the heart is always filled, and its one job is to give
  the branch back — the row leaves the list on the press, and returns if the
  call is refused.
- **`where` is the branch's address** (2026-08-13), drawn as `📍 …` under the
  meta line, with the branch's own name and then its city standing in. A row is
  one address now, so two branches of a chain are two rows — identical but for
  this line, which is also why it goes into the remove button's label.

### FavoriteDishRow
Horizontal row on the Favorites screen's **Dishes** tab (2026-08-17).
- **Props (app, inline in `favorites.tsx`):** the `FavoriteDish` row — photo, dish
  name, `restaurant · address`, price, a "sold out"/"closed" note where either is
  true, and a filled heart. The web equivalent is `FavoriteDishCard` above.
- **It names the kitchen, not just the dish.** A dish saved at two branches is two
  rows with the same name and the same photograph; the restaurant and its street
  are what tell them apart, and they go into the remove button's label for the
  same reason the branch row's address does.
- **Sold out and closed are two different absences** and are said differently.
  Neither drops the row: it is still saved, and a list that hid a dish because
  the kitchen shut for the night would flicker with opening hours.
- **The row opens the menu at the dish** — `?item=` on the phone's route and
  `?item=…#dish-…` on the web — because coming back to that dish is what saving
  it was for.

### DishCard
Menu item.
- **Props:** `image`, `name`, `description`, `caloriesKcal`, `prepMin`, `priceLabel`, `onAdd`, `isFavorite`, `onToggleFavorite`.
- **The heart sits beside the name, not beside the `＋`** (2026-08-17). They do
  different things — one saves the dish for later, the other orders it now — and a
  pair of controls side by side invites the wrong one to be pressed. The name is
  also where the eye already is, on the thing being saved. The label names the
  action, the dish and the state, because a menu is twenty near-identical
  controls. On the web this row is a plain `<div>`, so the heart's `<form>` sits
  inside it (`.dish-head`); see `DishHeart` for how a pre-rendered page fills it.

### MenuTabs
The branch's own menu headings, with a "Popular" pill in front where it has
bestsellers (2026-08-16). It was four fixed values until then — see
BUSINESS_LOGIC.md §6 for why the branch owns this axis and the platform owns the
category one.
- **Props:** `tabs: {id,label}[]`, `active`, `onChange`.
- The pills come from the menu response's `sections`, in the branch's order and
  the reader's language, with the empty ones dropped — a pill that empties the
  list when pressed is worse than one fewer division.
- **Popular is not a section**: its pill is prepended, its id is
  `POPULAR_SECTION_ID` (never a uuid, so it cannot collide), and it draws from
  the whole menu on `isPopular`.
- On the **web** the filtering is still CSS with no JavaScript, but the rules
  can no longer live in `globals.css`: the ids are per branch, so the restaurant
  page emits one `:has(input[value="…"]:checked)` rule per heading in an inline
  `<style>`. `globals.css` keeps the half that is fixed — hiding every section,
  guarded by `@supports selector(:has(*))` so a browser that cannot filter is
  never left with a blank column.

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

> **Built on mobile (2026-08-11)** as the home screen's location row plus the
> two components below. The row is the selector: it prints the chosen place, or
> what the device reverse-geocoded to, or "Near you" / "Turn on location", and
> it always opens the sheet — it was only pressable when the permission had been
> refused before.

### LocationSheet (mobile)
The artifact's `LOCATION PICKER`, and the phone's half of a feature the website
has had since its header grew a pin.
- **Props:** `open`, `chosen: Place | null`, `onClose`, `onConfirm(place | null)`.

> The same five ways to answer "where are you" as the web's `LocationPicker`:
> the map (any point, by tapping), address search, recently chosen places, the
> device's own position, and the ✕ on the badge that gives the choice back.
> **Nothing is stored until Confirm** — one refetch of the feed per visit to the
> sheet rather than one per point tried — and confirming also files the point in
> the recents (`src/place.ts`, AsyncStorage, `withRecent` from
> `@amragrir/shared`, so both clients agree that two points 120m apart are the
> same corner).
>
> **Clearing means something different here than on the web, deliberately.**
> There a cleared choice is the whole city, because a browser that has not been
> asked has no position at all. A phone has one, so `null` hands the feed back
> to the GPS (`useOrigin`) rather than to the centre of Yerevan — which is why
> the badge reads "Near you" with nothing chosen.
>
> **Addresses come from `GET /geocode`** — the API's proxy, holding the Yandex
> key, exactly as the website has its own route holding its own copy. So a
> search answers **in the alphabet it was typed in** (`queryLang`), five results
> at a time, and a tapped point is named in the app's language.
>
> It used the **device's** geocoder for a day (`expo-location`: no key, works
> offline, three results because each name cost a second round trip) and that
> was the mistake. SDK 57's `geocodeAsync` takes an address and nothing else —
> no locale — so it answered in the language of the *operating system*, and an
> Armenian query on a Russian phone came back in Russian. A search that cannot
> answer in the alphabet it was asked in is the moment a search box stops
> feeling like it understood you.
>
> **The search box is not drawn where nothing can answer it.** `canGeocode`
> asks the API once per session (`GET /geocode` with no parameters, which
> answers `available`) and the box appears only for a deployment that has a key
> — the same rule the website follows, for the same reason: a box that can
> answer nothing is worse than no box. A refused or broken search says "Search
> is temporarily unavailable" rather than "Nothing found".

### YandexMap (mobile)
The same map as the web's, in a `WebView` instead of an `<iframe>`.
- **Props:** `value: Place | null`, `onPick(lat, lng)`, `labels`
  (`map`, `credit`, `zoomIn`, `zoomOut`).
- **`MapFrame` / `MapFrame.web`** — the frame alone. **Props:** `url`, `title`,
  `background`. It is a picture and nothing more; everything that makes it a
  control is `YandexMap`.
- **`useWheelZoom` / `useWheelZoom.web`** — the browser build's half of the zoom
  gesture. **Takes:** the canvas ref and `(spread, centre, settled)`. Nothing on
  a device.

> **Why the widget and not `react-native-maps`.** A native map would mean
> Google's tiles, a Google Cloud project and a key in `app.json` for the Android
> build — for a map whose whole job is to let somebody point at a street. The
> widget embed needs no key, no quota and no account, and it is the same map the
> website already shows.
>
> **The WebView is never asked what happened inside it**, because it cannot
> answer: everything in there is another origin. It is wrapped in a
> `pointerEvents="none"` view — the `inert` of the web version — and this
> component owns the viewport: the pin is drawn here with `react-native-svg`,
> the pan is a transform driven by a `PanResponder`, and the projection is
> `@amragrir/shared`'s, shared with the web so a tap cannot land on a different
> street on the two clients. Tapping picks the point under the finger, dragging
> looks around and chooses nothing, and only a zoom or a pan that has spent
> `BLEED × 0.6` of the margin re-points the URL.
>
> **Two fingers zoom** (2026-08-11) — the gesture a map on a phone owes its
> reader. The widget cannot be *asked* to zoom, so a pinch scales the picture
> under the fingers and becomes a zoom level when they lift, about the point
> pinched rather than the middle of the box, clamped to `MIN_ZOOM`/`MAX_ZOOM`.
> A gesture too small to reach a level leaves the map alone rather than snapping
> it, and a finger lifted mid-pinch does not turn the gesture into a pan. Before
> this the responder knew only one finger, so a pinch slid the map sideways.
>
> **It took three goes to make that gesture feel like one** (2026-08-11), and
> each failure is worth keeping, because none of them is visible in a test that
> only asks whether the code runs.
>
> - **The threshold was a rounded logarithm** — `round(log₂(spread))` — which
>   means nothing at all happens until the fingers are `√2` apart, half as far
>   again as they started. On a box the size of a phone's that is most of the
>   box: people pinched, watched the picture grow and spring back unchanged, and
>   reported that pinching does not work. `zoomSteps` in `@amragrir/shared` now
>   answers a whole level past `PINCH_STEP` (a quarter larger) and rounds only
>   to decide between one level and several — compared as a ratio, so that in
>   and out are equally hard.
> - **The scaling was anchored on the middle of the box**, so whatever was under
>   the fingers slid away from them as the map grew. It is anchored on the
>   fingers now (`pivot`), which is also what lets the frame land on the point
>   that was pinched without having to undo the scaling.
> - **The baseline was read from the first `move`**, by which time the hand had
>   already travelled. `onPanResponderStart` fires for the *second* finger
>   landing, which is the one moment the fingers are exactly as far apart as the
>   gesture began — worth ~5% of every pinch, which is the difference between
>   1.28× reaching a level and just missing it.
>
> Two smaller rules: the picture may not shrink past the point where the bleed
> stops covering the box (`shownScale`), or the gesture becomes a rectangle of
> background with a map in it; and page coordinates with one measured origin are
> used for the centroid rather than each touch's `locationX`, which is measured
> from whatever that finger happened to land on — the zoom keys, say.
>
> **The finger that leaves last is not choosing a place** (2026-08-11). Fingers
> never come off the glass together, and the leftover one used to *pick a
> location*: the badge, the ± keys and the credit all sit above the touch
> overlay, so when the finger holding the overlay lifted first React Native saw
> no touch of its own left and handed the gesture back — and the finger still
> down took it again through `onMoveShouldSetPanResponder`, as a new gesture a
> few pixels long, which is a tap. `fingers` counts what a gesture has had and
> is forgotten in only two places: a finger landing on an empty screen, and the
> last one leaving. Anything that has ever had two fingers cannot become a tap
> or a pan, however often the responder changes hands. A tap made deliberately
> after a zoom still works, because by then the glass has been clear.
>
> **A trackpad's pinch is not a touch.** In the browser build it arrives as a
> `wheel` event with `ctrlKey` set and never reaches the `PanResponder` at all,
> which is why "two fingers" appeared to do nothing there long after it worked
> on a device. `useWheelZoom` (`wheelZoom.web.ts`, a no-op on a device) hears
> wheels and reports them in the same shape a pinch has — this much larger,
> about this point, and whether it has stopped — so `YandexMap` cannot tell the
> two apart. An ordinary mouse wheel is a level a notch. The pause after the
> last notch stands in for the fingers lifting: one reload per gesture, not one
> per notch.
>
> **The frame is the only platform-specific part** (`MapFrame`): a `WebView` on
> a device, an `<iframe>` — the website's own element — in the web build, where
> `react-native-webview` has none and renders a line of red text saying so. Both
> are the same widget at the same URL, so `expo start --web` shows the real map
> rather than a stand-in, and the viewport logic above them is one file for both.
> A drawn placeholder was tried on the web build first and removed on
> 2026-08-11: this control exists to point at a street, and a hand-drawn city
> that is not Yerevan cannot be pointed at.

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

- **It draws two kinds of row**, orders and bookings, and picks the words by
  **reminder marker first, then kind, then status** (`drawnBy` on web, the same
  shape on mobile). The marker comes first because a reminder does not move a
  booking — it is `confirmed` before and after — so status alone would draw the
  confirmation's sentence at a guest who booked weeks ago.
  Both kinds have a `confirmed` and mean different things by it — a kitchen
  accepting an order, a restaurant accepting a table — so a lookup keyed by
  status alone would quietly render the other's sentence. The maps are
  `ORDER_STATUS_COPY` (total) and `RESERVATION_NOTIFICATION_COPY` (partial: only
  the three booking statuses that say anything), both in `@amragrir/i18n`.
- **A row leads to the thing it is about**: `${ordersBase}/${orderId}` or
  `${reservationsBase}/${reservationId}` on web, `/tracking/{id}` or
  `/booking/{id}` on mobile. A row whose kind this build does not know is
  skipped rather than rendered blank — a newer API talking to an older page.

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

### BookingCalendar (`apps/mobile/src/components/BookingCalendar.tsx`)
Choosing a day, a time and a party size — one calendar, two screens.
- **Props:** `availability`, `date`, `month`, `guests`, `today`, `horizonDays`, `selected`, `busy`, and four callbacks (`onDate`, `onMonth`, `onGuests`, `onSelect`). Fully controlled since 2026-08-12 — the one piece of local state left is whether the panel is folded; the open *stretch of the day* went with the tabs.
- **It reports a chosen time; it does not book one.** `onSelect` used to be `onSlot` and the screens posted a reservation from it, which made every mis-tap in a grid of seventy chips a held table and an authorised deposit — and left no such thing as a *chosen* time, only a booked one. The screen's own footer button commits now, as the browser and the design have always done.
- **It opens on a sheet (2026-08-12).** The artifact keeps the chosen day and hour on one row — "📅 Sat 15 Aug · 19:30" — with the month and the hour picker in a card behind it and a "Done" button that folds it away. Here the row raises a `PickerSheet` instead, and the button is still not copied: it confirms nothing the row does not already show. That row is also where the choice is *shown*: a highlighted row inside the trough is off screen by the time the guest stepper is reached. **It starts closed** — it used to start open whenever nothing was chosen, which was right for a panel unfolding in place but wrong for an overlay that would then throw itself over the screen on arrival. **Choosing does not close it either**, which reverses the rule the grid was under: a chip was one press and one answer, a wheel answers continuously, and a sheet that shut on the first hour under the lens would close before the wanted one arrived. The guest count and the deposit card stay on the page, as in the artifact: they are answers, not a picker.
- **The hour is asked on a `TimeWheel`** (2026-08-12, below) rather than a chip grid. At `RESERVATION_SLOT_MINUTES` a branch answers with ~70 starts; as a grid that was twenty rows, which is why this component grew morning/afternoon/evening tabs. The wheel scrolls, so the tabs went with the grid that needed them — the artifact never drew them, and they were phone-only, so `slotsByPartOfDay` now has no caller outside its own spec. `upcomingSlots` (in `@amragrir/shared`) still drops what has already gone, so the phone and the browser keep the same times. **Taken slots are then filtered out entirely**, because a wheel comes to rest on whatever is under the lens and a dead row in it would be a choice nobody made.
- **`busy` covers booking *and* refetching.** The screens leave the previous day's times on screen while the next answer is in flight rather than blanking to a spinner, so the wheel must stop scrolling — blanking made the screen jump on every tap.
- **It exists because there are two ways to book.** A table comes with food, and on its own from a restaurant's page. Since 2026-08-12 both are shapes of one screen (`preorder.tsx`) rather than two screens, but the component still earns its keep: it is one reading of one availability answer, and the way a second reading fails is silent — a screen offering a slot the API then refuses.
- **The horizon is a prop, not a constant.** A table carrying food is capped at the *order* horizon, because offering a day the kitchen will not cook on takes a deposit for a meal that is then refused at the payment. A table booked alone is bound only by `RESERVATION_MAX_LEAD_DAYS`. Both are passed by the same screen now, one shape each.
- **Every bound comes off `availability`** — the party cap is `min(maxGuests, maxSeats)`, the branch talking about itself, so a branch running a hall counts past twelve.

### PickerSheet (`apps/mobile/src/components/PickerSheet.tsx`)
The bottom sheet the two time pickers on "When & how" open into, built 2026-08-12.
- **Props:** `open`, `title`, `onClose`, `children`.
- **It exists because a wheel cannot share a screen with a scrolling page.** Both pickers unfolded in place, which put a vertical scroll inside a vertical scroll: a drag that meant "turn the hour" was as likely to be read as "scroll the checkout". Lifted onto a fixed sheet, the wheel is the only thing that scrolls and every drag over it means what it looks like.
- **It is the app's existing sheet**, not a second kind of overlay: the same `Modal visible transparent animationType="slide"`, scrim, grabber, title row and ✕ as `FilterSheet` and `LocationSheet`, and the same measurements.
- **The body is deliberately not a `ScrollView`.** An outer scroll here would put back the exact nesting the sheet exists to remove, so everything a picker asks is meant to fit; `maxHeight` is 92% rather than the filter sheet's 88% to buy the calendar the room.
- **The ✕ is not "Done" in disguise.** Nothing is confirmed on the sheet — the choice was reported as it was made, and the row behind is already showing it. It closes an overlay, which is the one thing an overlay always needs and the inline panel never did.

### TimeWheel (`apps/mobile/src/components/TimeWheel.tsx`)
The artifact's `HH`:`MM` wheel — two snapping columns behind a lens — built 2026-08-12.
- **Props:** `times` (the offerable instants, each `{ at, time }` with `time` already formatted `HH:MM` in Yerevan), `value` (the chosen instant or `null`), `onChange`, `disabled`.
- **It exists because "When & how" asks the same question twice.** The booking's "Reservation time" and the pre-order's "Exact time" are one picker over different instants, and the artifact draws them from one set of measurements. Two copies would be two chances to disagree about how an hour is chosen.
- **The measurements are the artifact's:** 46px rows, a 184px trough on `chip`, a `card` lens inset 14 at `(184−46)/2 = 69`, 69px of padding at each end so the first and last rows can reach the middle, a 56px fade over each end, and a 10px `:` between the columns. A settled row is `accent` at 20/800; the rest are `ink3` at 16/600.
- **The columns are the branch's answer, not a clock.** The artifact runs a free cross product of 11–22 against every five minutes because it has no server to contradict it. Here the hours are the hours that hold an offerable time and the minutes are the minutes free within the hour on screen, so the wheel cannot rest on a time `POST /reservations` or `POST /orders` would refuse. **Callers must drop what the server would refuse before passing it in** — a grid can grey a slot out, a wheel that snaps onto one has already chosen it.
- **Changing the hour keeps the minute where it can** and falls to that hour's first offer where it cannot: 19:40 exists and 20:40 may not.
- **Nothing is highlighted while `value` is `null`.** The wheel rests on the first offer without claiming it, which is the artifact's own `wheelItem(!rdyAsap && …)`, so "as soon as possible" and "Choose time" still read as unanswered.
- **The row under the lens is read on every scroll event**, not on an ending, which is how the artifact reads its wheels too. It was wired to `onMomentumScrollEnd` + `onScrollEndDrag` for one afternoon and that was a bug: **react-native-web delivers neither**, so the column scrolled with the numbers under it never changing. `onScroll` needs `scrollEventThrottle` — without it react-native-web sends no scroll events at all. Reported even when the row has not moved, because coming to rest on the row the wheel opened on is still an answer, and while nothing is chosen it is the only way that first row is ever picked.
- **Snapping is done by hand, because `snapToInterval` is native-only.** On the web it leaves `scroll-snap-type: none`, so a column would rest wherever the finger let go with the row a few pixels out of the lens. 140ms of quiet after the last scroll event stands in for the snap; on native the wheel has already snapped by then and the correction finds nothing to do.
- **The fades are SVG.** They have to be real gradients and this app carries no gradient view; `react-native-svg` is already a dependency.

### Book a table (the table-only shape of `apps/mobile/app/preorder.tsx`)
A table with nothing in the basket — the one thing the phone could not do that the browser could.
- **Booking used to exist only inside the pre-order funnel**, so a guest who wanted Saturday and had not decided what to eat had to put food in a basket to ask for one. `POST /reservations` has never wanted an order; the web dropped that requirement in August and this is the same door on the phone.
- **It was `app/book/[branchId].tsx` from 2026-08-10 to 2026-08-12**, and is now a shape of the pre-order screen instead — the same correction the web made when it folded `/book/{slug}` back into the checkout. The screen is told which branch by the press (`?branchId=&name=`), since an empty basket names no restaurant; `tableOnly` is what decides, and a basket at *another* restaurant counts as none.
- **Sign-in is asked before the deposit, not after.** A table belongs to a verified account, so a guest is sent to Auth on the booking press rather than by a 403 after the money. Since the merge this holds for the basket shape as well, which used to let the refusal come back from the API.
- **`replace`, not `push`, on success.** Swiping back to a calendar that has already taken a deposit would offer to take a second one. Only this shape navigates: a basket's booking stays on the screen, because the food still has to be paid for.
- **One idempotency key per slot**, held across retries and rotated when the slot changes — one bargain for both shapes now, which is the point of them sharing a screen.

### My bookings (`apps/mobile/app/bookings.tsx`, `apps/mobile/app/booking/[id].tsx`)
The list of this account's tables, and one of them with the button that gives it back.
- **`GET /reservations` and `POST /reservations/{id}/cancel` were in the phone's client and nothing called either.** A table booked here could not be checked afterwards and could only be given back by ringing the restaurant.
- **Two lists, and the API decides which is which** — `upcoming` is every active status, `past` every terminal one. Splitting them from a status here would be the app and the back office disagreeing about whether a booking is over.
- **What the deposit did is reported, not computed.** `depositCredited` and the status arrive settled; `depositLabelFor` only picks the sentence. Working the outcome out on the client would be a second copy of a rule about somebody's money.
- **Cancelling asks twice.** The button becomes "Confirm" before it fires — a table is money, and a stray tap should not spend it. The screen is then redrawn from the booking the API answers with, not from an assumption about what cancelling did.
- **A guest sees the empty state and a way in**, rather than a failed request: the endpoint refuses an unverified account, and asking anyway spends two round trips to be told what the session already knows.

### FilterSheet (`apps/mobile/src/components/FilterSheet.tsx`, `apps/mobile/src/filters.ts`)
The last screen of the mobile design artifact, built 2026-08-10 — see BUSINESS_LOGIC.md §"Catalog" for the units problem that held it up for a year.
- **Edits are local until Apply.** A sheet that filtered on every chip would refetch the feed four times behind an overlay covering it, and "Reset" would mean nothing distinct from clearing them one at a time.
- **It reopens on what the feed is showing**, never on an abandoned draft — which would tell somebody the feed is narrowed in ways it is not.
- **Stepped price chips rather than a slider.** React Native ships no `Slider`; a row of taps is the same choice on a phone and says the numbers out loud.
- **The distance section is hidden without coordinates**, because the API ignores `distMax` without a `lat`/`lng` pair and offering it would be the sheet claiming to narrow something it does not.
- **`openNow` is deliberately not offered here** although the DTO has it: the artifact does not draw it in the sheet, and "serving right now" on a screen whose purpose is ordering *ahead* answers a question nobody arrived with. Since 2026-08-11 it is a **chip on the feed** instead — one press for the guest who did arrive with that question — and the sheet still leaves it out. Both edit one `Filters`, so the flag survives an Apply that never showed it and Reset clears it with the rest.
- The arithmetic — what counts as set, what gets sent — is in `filters.ts` with a spec, for the reason the cart's is: those decisions are wrong in ways a type check never catches, and testing them through a bottom sheet would mean mounting one.

### ChipRail + `FILTER_CHIPS` (`apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/filters.ts`)
The artifact's quick-filter row above the home feed, built 2026-08-11 — the same seven chips the web has, in the same order, so the two clients narrow the feed by the same things.
- **No chip is decorative.** Each maps to a real `/restaurants` parameter: `bool` → `openNow`, `sort` → the single active sort, `service` → one of `restaurants.services`, OR-ed server-side so several may be on at once.
- **The artifact's eight are seven.** "Special Offers" has no discount model behind it, and a chip that lights up while narrowing nothing is worse than one that is not there. Its "Ready in 15 min" is built as `fastest`: the API sorts by prep time and has no threshold, so fifteen would be a promise the server never made.
- **A lit sort turns itself off**, back to the API's `recommended`, rather than leaving the feed stuck on an order with no other way out.
- **All seven always show**, unlike the web, which hides `nearest` until a district is chosen. This app always has coordinates — the device's own, or Republic Square (`src/origin.ts`) — so the API can always honour the sort.
- **`HOME_FILTERS` starts the feed on `nearest` as real state.** The screen used to rewrite an unset sort into `nearest` on the way to the API, which was invisible until a chip read the same state: the list came back ordered by distance under an unlit chip, and pressing it twice changed nothing either time.

### useOrigin (`apps/mobile/src/origin.ts`)
Where "near me" is measured from, and — since 2026-08-11 — what that place is called.
- **Returns `{ origin, label, denied, retry }`.** `origin`'s identity changes only when the position does: the feed refetches on it, and folding the label in would reload the whole list to put a street name on screen.
- **The label is reverse-geocoded once per fix**, after the coordinates are already in use. Expo's docs call geocoding "resource consuming" and warn against many requests at a time; distances and ordering never wait on it.
- **It falls through what the geocoder actually returned** — `city · street`, then district, then region — rather than printing a separator with nothing on one side. A fix it cannot name has no label, and the row says "Near you", which is still true.
- **`retry` asks again where the OS still prompts and opens app settings where it will not**, read from `canAskAgain`. iOS stops prompting after the first refusal, so a second dialog would be a button that does nothing.

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

### NotificationBell / alerts (`apps/admin/src/notifications.tsx`, `apps/admin/src/alerts.ts`)
The back office's bell — a different component from the customer's above, and a
different problem. It lives in the shell rather than on a screen because the
point of a reminder is that it reaches somebody looking at something else.

- **Three kinds of row.** `prep_due` — a pre-order needs starting —
  `order_placed`, somebody has paid and is waiting to be accepted, and
  `booking_placed`, a table has been booked and is waiting to be accepted. The
  booking row names the party (*a table for four*) rather than a reference,
  because that is what a shift is actually deciding about, and it links to the
  book on the booking's **service date** — a 00:30 table belongs to the night
  still going on, and the calendar date would open tomorrow's empty page. They share
  one payload shape (`StaffNotificationPayload`) rather than a union, because
  they describe the same order from two moments and the detail line draws them
  identically; a kind simply omits what does not apply, as `order_placed` does
  with `prepStartAt`. The headline switch is exhaustive, so a third kind cannot
  be added without deciding what it says.
- **Reaching a kitchen takes more than a badge.** `prep_due` is raised a minute
  before work has to start, and the person it is for is at a stove with the
  panel on a counter behind them. Two answers, deliberately different in kind: a
  **chime**, which needs no permission and works in a tab that is open but
  unwatched, and a **desktop notification**, which reaches a tab that is not in
  front and which the browser grants only from a click.
- **Sound is on by default**, unlike the customer's alerts. A back office is
  opened in order to be told things, and a kitchen that has to find a setting
  before it can hear a reminder has already missed one. The switch is remembered
  per browser (`localStorage`, `amragrir.admin.chime`), not per account: the
  panel by the pass wants sound, a manager's laptop in a meeting may not.
- **`freshNotifications(seen, items)` decides what is news.** The list is
  re-read on a 60-second poll and on every socket frame, so the same rows come
  back repeatedly; a chime on each would train a shift to ignore the one that
  mattered. A row already announced, or already read anywhere, is silent. The
  first read of a session is the baseline rather than news — opening the panel
  at the start of a shift must not sound for every reminder of the last one.
- **One chime however many arrived**, and one desktop notification per row,
  tagged by order id so a second reminder for an order replaces its first
  instead of stacking beside it. The alert text is `notificationHeadline` and
  `notificationDetail` — the same sentences as the row, so this added no copy.
- **The chime is synthesised** (two notes, Web Audio), not an asset: a file is a
  request that can fail on a panel whose network is having the same bad minute
  that produced the reminder. `armChime()` resumes the `AudioContext` on the
  first interaction anywhere, because browsers start it suspended and a panel
  can be signed into and then left alone.
- **Not shared with `apps/web/src/lib/browser-alerts.ts`.** That one has no
  sound (a phone buzzing is the OS's job) and needs a service worker, because
  Android Chrome refuses `new Notification()` and a customer is on a phone. This
  one is the opposite case, and the package they would both have to live in is
  consumed by the API, which has no DOM.

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
- **NewDish props:** `branchId: string`, `sections: StaffMenuSection[]`, `categories: CategoryOption[]`, `open: boolean`, `onOpenChange`, `onCreated: () => void`.
- **EditDish props:** `item: StaffMenuItem`, `sections`, `categories`, `onOpenChange`, `onSaved: () => void`. It has no `open`: the screen mounts it only while a dish is being edited, keyed by that dish, so a second dish is a second form rather than the first one holding somebody else's price.
- **The two axes are two fields** (2026-08-16). **Section** is where the dish
  sits on this branch's page, from the branch's own headings. **Category** is
  what the city files it under, and its first option is *inherit*, naming the
  category the section supplies — because that is what nearly every dish should
  say and tagging forty dishes one at a time is not how a menu gets entered. A
  dish whose section maps to nothing and which names nothing itself draws a
  warning banner, since the API refuses it: such a dish is reachable from no
  chip in the app. A **Popular** switch sits under them; it is a property, not a
  place, so the dish keeps its section and category.
- **One `DishFields` for both.** They ask for exactly the same things — the three names, price, section, category, prep estimate, photograph — and the moment that is written twice is the moment a field lands in one of them only. The forms differ in their title, their footer, and the one hint under the photo field: a dish being added has no picture yet, one being edited already has the picture this would replace.
- **The edit opens on what the dish is now**, which is what makes the photograph replaceable at all rather than merely settable once.
- **Only the fields that moved are sent** (`dishPatch`), and **Save is disabled until one has** — a PATCH that changes nothing writes no history entry at the API either, so reporting success for one would be a lie in the direction people check.
- **Neither form submits while an upload is running.** A dish saved mid-upload keeps the photograph somebody was in the middle of replacing.
- **The price and the sold-out switch are deliberately not here.** They stay in the row: they are what somebody changes mid-shift, and a form is the wrong shape for one number.

### SectionsDialog (`apps/admin/src/menu-sections.tsx`)
The shape of one branch's menu — its headings, their order, and what each maps
onto in the platform's categories.
- **Props:** `branchId`, `sections: StaffMenuSection[]`, `categories: CategoryOption[]`, `open`, `onOpenChange`, `onChanged: () => void`.
- **A dialog rather than a screen**: whoever opens it is already looking at the
  dishes it arranges, and a second sidebar entry would split two decisions that
  are always made together ("add a Сеты shelf" / "put the sets on it").
- **The category select is the important control**, not the name: a mapped shelf
  gives every dish under it a category for free.
- **Delete is offered only on an empty shelf.** The API refuses the rest with a
  409 and the count; not offering it is how somebody learns the rule without an
  error message.
- Renaming replaces **only the language the panel is set to** — the other two
  are carried through, or a rename in Russian would strip the Armenian name off
  a heading every Armenian phone reads.

### Categories screen (`apps/admin/src/screens/Categories.tsx`)
The platform's category vocabulary, behind `categories:write` — which only
`super_admin` holds, so the sidebar draws the tab for nobody else.
- **The key is shown as code and cannot be edited**: it travels in
  `?category=`, in both clients' deep links and in the seed's placeholder
  filenames. The display name is what changes.
- **Retire, don't delete.** The switch flips `isActive` — the chip leaves the
  rail and the filters, every dish filed under it keeps its row, and the same
  switch puts it back. The trash button is disabled while any dish or menu
  section points at the row, which is the state the API refuses anyway.
- Each row carries **what is riding on it**: live dishes with this as their own
  category, and live menu sections mapped to it.

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

### Bookings (`apps/admin/src/screens/Bookings.tsx`)
The book for one service. The endpoints behind it were written months ago and
had nothing calling them: `GET /restaurant/reservations` and its status PATCH
were tested, permissioned and unreachable, and `reservations:read` opened
nothing.
- **Built as the order board is built** — the same header, the same toolbar, the
  same stage strip, the same cards on the same `.board` grid. A shift moves
  between the two all evening, and two screens answering "who is next" with
  different furniture make the second one something to learn rather than
  something to read. It first shipped as a dense striped list, which was a
  second visual language for the same job.
- **The card is `.order`'s**, shared by naming both in the stylesheet rather
  than by giving this screen a copy of the padding, the radius and the actions
  row. A copy is how the two would come to differ by 2px.
- **The hour is the card's name**, where an order's code is: the one thing that
  has to be readable at arm's length across a board.
- **"All" is `*`, not `''`.** Radix reserves the empty string for the
  placeholder state, so an option carrying it renders a trigger reading
  "Choose…" instead of "All restaurants" — which on this screen was both
  pickers, in their default state, on arrival. The board's `ANY` sentinel, for
  the board's reason.
- **The pickers appear only when there is a choice**, via the same
  `restaurantsOf` / `showsBranchFilter` / `soleBranchOf` the board uses. Most
  kitchens are one branch of one restaurant, and two selects reading "All" is
  furniture.
- **Restaurant, branch and day are all in the address**, and the pickers narrow
  by navigating (`replace`) rather than by setting state — so "look at Saturday
  at Northern Ave" is a link somebody can send rather than a sentence they
  re-enter at the other end. The day used to live in state, which meant the
  screen only ever *read* it from the URL and never wrote it back.
- **Clearing keeps the day.** Widening from one branch to all of them is still a
  question about Saturday; a "clear" that dropped the date would land on
  nothing, which is why the date is not counted as a filter.
- **The stage strip is counted here, not by the API** — the one place this
  differs from the board, and for a reason: the board pages through hundreds and
  must ask the server what each stage holds, where a book is one day and arrives
  whole. `bookingsPartial` is what keeps that honest, saying so out loud when a
  day overflows the page rather than letting the counts quietly undercount.
- **Two views of the same day.** The list answers "who is coming next" and fits
  a phone; the room answers "what is free at nine", which is what somebody at
  the door with four people is asking and which no list answers well. The view
  switch rides in the stage strip's `actions` slot, drawn smaller like the
  board's Paid sub-filter: a second strip as loud as the first competes with it.
- **The room needs one branch.** Across every branch in reach there is no single
  set of rows to draw, so the grid says which of the two reasons it fell back to
  a list rather than silently showing one.
- **Every table gets a row, including the empty ones** — a grid of only the busy
  tables hides exactly the answer being looked for.
- **A pressed bar opens the same card the list is made of**, so acting on a
  booking is one thing to learn rather than two. A booking whose table has gone
  gets its own heading underneath: a card with no bar above it otherwise reads
  as a rendering fault.
- **The buttons come from the shared transition table**, so the panel cannot
  offer a move the API is about to refuse. Only the ordinary next step is
  filled, as on the board — "No-show" should never compete with "Seated".
- The customer's phone number is a `tel:` link on every card: a booking nobody
  can ring is a table nobody can free.
- `BookingCard` is exported for `render.spec.tsx` alone. The screen paints a
  skeleton on its first frame and fills in from an effect, so a test that
  renders only the screen never sees a card — which left everything a shift
  actually reads with nothing asserting it renders.

### bookings.ts (`apps/admin/src/bookings.ts`)
The book's arithmetic, tested on its own (`bookings.spec.ts`).
- **A sitting after midnight keeps counting** — 01:00 on the night of the 1st is
  1500 minutes, not 60 — so it lands to the right of the evening it belongs to
  rather than at the far left of the wrong day.
- **The span comes from the bookings**, rounded out to whole hours: a day with
  two bookings at eight should not be drawn as thirteen empty hours with a mark
  in it. An empty book still gets a shape to be empty in.
- **Bars are placed as percentages of the span**, so the grid scales with its
  container instead of with a pixel-per-minute constant that would need a second
  copy in the stylesheet.
- **A booking whose table has gone is set aside, not dropped.** It is still a
  guest arriving, and a grid that silently omitted them would be worse than one
  with an awkward row underneath.
- **The stages are the board's `STAGE_TABS` idea, counted locally.** `all` is
  offered and is where the screen opens, which the board deliberately does not
  do: there, "everything" mixed work nobody had accepted with work sitting on
  the pass. A book has no such problem — everyone in it is coming today, and
  seeing that list is why it was opened.
- **Covers, not bookings.** `coversOf` is the number a kitchen staffs and preps
  for, and the one thing a book knows that counting its rows does not say.

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
