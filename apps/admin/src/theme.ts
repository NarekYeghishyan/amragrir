/**
 * The panel's light/dark preference.
 *
 * `tokens.css` does the actual work: it emits `:root[data-theme='…']` blocks
 * that beat the `prefers-color-scheme` media query, so switching themes is one
 * attribute on `<html>` plus remembering the choice.
 *
 * The same key as the customer web app (`apps/web/src/lib/theme.ts`) on
 * purpose — different origins in production, but one name to reason about, and
 * one behaviour if they ever share a host.
 */
export const THEME_KEY = 'amragrir.theme';

export type Theme = 'light' | 'dark';

/**
 * What the panel should open in: the stored choice, else the system's.
 *
 * `index.html` runs this same resolution in a pre-paint inline script, so the
 * first frame is already the right theme. This copy is what the toggle reads
 * back on mount, and the reason both live in one module is that a drift
 * between them shows up as a flash of the wrong palette on every load.
 */
export function resolveTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    // Storage disabled (private mode, locked-down kiosk): fall through to the
    // system preference rather than failing to render.
  }
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice simply does not persist; the panel still switches.
  }
}
