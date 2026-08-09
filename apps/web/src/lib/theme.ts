/**
 * The persisted-theme contract, shared by the server layout and the client
 * toggle.
 *
 * This lives in a plain module — **not** the `'use client'` ThemeToggle —
 * on purpose. The layout is a Server Component and inlines this key into the
 * pre-paint `<script>` that applies the stored theme before the first frame.
 * Importing the key from a client module does not give the server the string:
 * it gives a client-reference proxy that stringifies to
 * `function () { throw new Error("Attempted to call THEME_KEY() …") }`, so
 * `localStorage.getItem('${THEME_KEY}')` renders as broken JavaScript and the
 * flash-of-wrong-theme guard silently does nothing.
 *
 * One literal, imported by both sides, keeps the writer (toggle) and the reader
 * (pre-paint script) from ever drifting.
 */
export const THEME_KEY = 'amragrir.theme';

export type Theme = 'light' | 'dark';

/**
 * Which of the two schemes the page is *showing*, as opposed to which one was
 * chosen.
 *
 * `tokens.css` answers this in CSS — `:root[data-theme='…']` beats the media
 * query — and anything that has to hand the answer to something outside CSS
 * has to work it out the same way round. The location picker's map is that
 * thing: it is a frame on another origin, which cannot inherit a single one of
 * this page's colours and has to be *told* in its URL.
 */
export function themeShown(chosen: string | undefined, prefersDark: boolean): Theme {
  if (chosen === 'dark' || chosen === 'light') {
    return chosen;
  }
  return prefersDark ? 'dark' : 'light';
}
