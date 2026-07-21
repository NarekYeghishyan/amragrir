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

## Providers / hooks (shared)

- `ThemeProvider` + `useTheme()` — light/dark theme tokens, 3 expressive parameters (accent, surface temp, depth).
- `I18nProvider` + `useT()` — hy/ru/en dictionaries, `hy` default.
- `useCart()` — items, quantity, subtotal/service/total, branch binding.
- `useAuth()` — session, guest, tokens.
- `formatMoney(amd)` — formats `12 500 ֏` (space thousands separator, ֏ symbol).

> Web (Next.js) reuses the same types and domain logic; presentational components are duplicated for the DOM, but the props contracts are identical.
