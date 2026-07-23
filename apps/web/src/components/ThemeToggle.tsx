'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY, type Theme } from '@/lib/theme';

/**
 * Light/dark toggle, matching the design's per-screen theme switch.
 *
 * The heavy lifting is already done by the tokens: `tokens.css` emits
 * `:root[data-theme='…']` blocks that beat the `prefers-color-scheme` media
 * query, so switching a theme is only a matter of setting one attribute on
 * `<html>` and remembering it.
 *
 * A `null` initial state is deliberate. The server cannot know the visitor's
 * stored choice, so it renders the neutral glyph; the first client render must
 * match that exactly or React logs a hydration mismatch. The real theme is read
 * from the DOM (where the pre-paint script in the layout already applied it)
 * only after mount.
 */
export function ThemeToggle({ label }: { label: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    setTheme(stored === 'dark' ? 'dark' : 'light');
  }, []);

  const flip = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode with storage disabled: the choice just does not persist.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={flip}
      aria-label={label}
      title={label}
    >
      {theme === null ? '🌗' : theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
