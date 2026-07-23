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
