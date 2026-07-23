/**
 * Design tokens for the app.
 *
 * The values themselves live in `@amragrir/ui`, which is also what generates
 * the CSS variables `apps/web` and `apps/admin` use. This file only re-exports
 * them, so there is one palette in the repo rather than one per app.
 *
 * Components still read colours through `useTheme()`; nothing here should be
 * imported directly by a screen.
 */
export {
  HIT_TARGET,
  palette,
  radius,
  spacing,
  spot,
  typography,
  type ThemeColors,
  type ThemeName,
} from '@amragrir/ui';
