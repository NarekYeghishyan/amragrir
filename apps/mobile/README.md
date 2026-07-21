# @amragrir/mobile

Placeholder — not yet scaffolded. Customer-facing app (the primary product surface).

## Stack

React Native + Expo (expo-router for screens = routes). See
[docs/DEVELOPMENT_GUIDE.md](../../docs/DEVELOPMENT_GUIDE.md).

## Next step

Scaffold in place (run from this folder):

```
pnpm dlx create-expo-app@latest . --template blank-typescript
```

Then wire up `@amragrir/shared` (statuses/constants) and `@amragrir/i18n`
(hy/ru/en, hy default) instead of hardcoding either. Build order follows the
roadmap in [docs/DEVELOPMENT_GUIDE.md](../../docs/DEVELOPMENT_GUIDE.md) §4:
auth → catalog → restaurant+menu → basket → pre-order (pickup) → checkout →
payment → tracking → orders, before dine-in/favorites/referrals.
