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

## Domain components

### RestaurantCard
Large Home / See all feed card.
- **Props:** `image`, `name`, `rating`, `reviewsCount`, `cuisine`, `priceLevel`, `distanceKm`, `prepMin`, `isOpen`, `services: string[]`, `isFavorite`, `onPress`, `onToggleFavorite`.

### RestaurantListItem
Horizontal row (Favorites / search results).
- **Props:** `image`, `name`, `meta`, `prepMin`, `rating`, `onPress`.

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
Pickup / Dine-in.
- **Props:** `mode: 'pickup'|'dine_in'`, `onChange`.

### Calendar
Monthly booking calendar.
- **Props:** `month`, `year`, `selectedDate`, `onSelectDate`, `onPrevMonth`, `onNextMonth`, `disabledBefore` (today), *`availableDates?`*.

### TimeSlotGrid
Slot grid (reservation time / food ready at).
- **Props:** `slots: {time,available}[]`, `selected`, `onSelect`.

### GuestPicker
Guest chips + stepper.
- **Props:** `guests`, `onChange`, *`options?`*, *`min?`*, *`max?`*.

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

### OrderSteps
Status tracker (Confirmed→Preparing→Almost ready→Ready).
- **Props:** `steps: string[]`, `currentIndex`.

### PickupCodeCard
QR/pickup code.
- **Props:** `code`, `instruction`, *`tableNo?`*.

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
- **An action this build has no sentence for renders its raw verb.** A panel can be deployed behind the API, and an entry that silently vanishes from an audit trail is worse than an ugly one. Same for a role the enum no longer has.

### MenuHistoryDialog (`apps/admin/src/menu-history.tsx`)
Everything that has happened to one dish, oldest first — a dialog off its row on the Menu screen.
- **Props:** `itemId: string`, `dish: string` (the name as the panel currently shows it — the title), `canOpenStaff: boolean`.
- **Offered on every row, not only to `menu:write`.** It reads `GET /restaurant/menu-items/{id}/history` on `menu:read`, which everybody looking at the screen holds; the actions column that used to appear only for an editor is now always rendered, with Delete the one thing inside it still gated.
- **A dialog, like the two feeds above**, and reusing the same `.dialog` and `.timeline`. It adds one layout of its own — `.diff`, the `field: from → to` list under each entry, a definition list rather than a table because the fields differ per entry and columns would leave most cells empty.
- **Fetched on open, and re-fetched on every open.** A price moves while the panel is looking at another branch, and a timeline held from last time is wrong exactly when somebody is checking it. Guards against a response landing in a dialog that has since closed — or in the next dish's.
- **Names link to `/people?person=` only when `canOpenStaff`.** A shift holds `menu:read` and not `staff:read`; a link to a tab their sidebar does not show is a dead end. An account since deleted renders "a staff account since removed" rather than an empty line — `actor_staff_id` is `ON DELETE SET NULL`, so that is a real answer.

### OrderQrDialog / QrPlate (`apps/admin/src/order-qr.tsx`)
An order's full code as a QR code — a dialog off the **QR** button on every card of the order board.
- **OrderQrDialog props:** `t: Translate`, `order: StaffOrder`. Takes the translator as a prop rather than calling `useT()`, the way the board's `OrderHistoryDialog` beside it does — the card already holds one.
- **QrPlate props:** `value: string` (what is encoded), `label: string` (the accessible name — already translated). Exported for `render.spec.tsx`, since the dialog around it only opens on a click.
- **It encodes `orders.code`, not the pickup code.** The four digits printed across the card are unique only among the orders in front of the counter; `AMR-` + 8 digits names exactly one order in the database, and being able to hand *that* to a scanner instead of retyping it is the whole point. The dialog's title still says the pickup code, because that is the order as the card and the counter refer to it.
- **The plain code is written under the picture.** A scanner can be flat, out of reach, or absent; a QR nobody can read with their eyes is a dead end when it is.
- **Nothing is encoded until it opens.** Radix mounts dialog content only while open, and the work sits inside `QrPlate` rather than in the card — a board holds fifty of these.
- **`role="img"` with the order code as its label.** A path of several hundred squares says nothing to a screen reader otherwise.
- **`--qr-ink` on `--qr-paper`, in both themes** (DESIGN_SYSTEM.md §1). Dark-on-light is what the format assumes, and an inverted code is one a counter's handheld may refuse to read.

### encodeQr (`apps/admin/src/qr.ts`)
The code as SVG path data — `{ size, path }` in module units, quiet zone included. Tested directly (`qr.spec.ts`) against the encoder's own matrix: a path that is off by one module or drawn transposed is still a picture of a QR code, and the only other place that shows up is a scanner that will not beep.
- **The encoding comes from `qrcode-generator`**, the panel's one non-Radix runtime dependency; the rendering is ours. An SVG path rather than the library's `<img>` or `<table>` so the code inherits `currentColor` and scales; runs of adjacent dark modules merge into one subpath rather than a rect per module.
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
- **The ceilings (10,000,000 dram, 480 minutes) are left to the API.** It answers in a sentence the panel would only be paraphrasing, and two more numbers to keep in step buy nothing.

### PhotoField / usePhotoUpload / photoRefusal (`apps/admin/src/photo.tsx`)
The dish photograph: what may be sent, and the control that sends it. Shared by both dish forms.
- **PhotoField props:** `id: string` (from `Field`), `url: string` (what the form currently holds), `upload: PhotoUpload`, *`disabled?`*.
- **The native file input, restyled** — already labelled, already keyboard-reachable, already says which file is chosen. The hidden-input-behind-a-button pattern rebuilds those three and usually rebuilds them worse.
- **It uploads on choosing, not on submit** (`POST /uploads/menu-photo`), so the picture is on screen and already stored before anything is saved. `usePhotoUpload(onUploaded)` holds no URL of its own — the form owns it, or there would be two answers to "which photograph is this dish getting".
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

## Providers / hooks (shared)

- `ThemeProvider` + `useTheme()` — light/dark theme tokens, 3 expressive parameters (accent, surface temp, depth).
- `I18nProvider` + `useT()` — hy/ru/en dictionaries, `hy` default.
- `useCart()` — items, quantity, subtotal/service/total, branch binding.
- `useAuth()` — session, guest, tokens.
- `formatMoney(amd)` — formats `12 500 ֏` (space thousands separator, ֏ symbol).

> Web (Next.js) reuses the same types and domain logic; presentational components are duplicated for the DOM, but the props contracts are identical.
