import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette, radius, spacing, spot } from './tokens.js';
import { renderTokensCss } from './css.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const GENERATED = [
  join(root, 'apps', 'web', 'src', 'app', 'tokens.css'),
  join(root, 'apps', 'admin', 'src', 'tokens.css'),
];

describe('the generated stylesheets', () => {
  it.each(GENERATED)('is in step with tokens.ts: %s', (path) => {
    // The whole point of one source is that nothing can quietly diverge from
    // it. Editing tokens.ts and forgetting to regenerate fails here rather
    // than shipping a web app whose accent colour differs from the phone's.
    expect(readFileSync(path, 'utf8')).toBe(renderTokensCss());
  });
});

describe('palette', () => {
  it('defines the same tokens in both themes', () => {
    // A token present in light but not dark renders as `undefined` in React
    // Native and as an empty custom property on the web.
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });

  it('has no empty values', () => {
    for (const [theme, colors] of Object.entries(palette)) {
      for (const [token, value] of Object.entries(colors)) {
        expect(value, `${theme}.${token}`).not.toBe('');
      }
    }
  });

  it('matches the values DESIGN_SYSTEM.md records', () => {
    // These four are quoted in the doc, so a silent edit here would make the
    // documentation wrong rather than out of date.
    expect(palette.light.accent).toBe('#EA5B12');
    expect(palette.dark.accent).toBe('#FF6A1F');
    expect(palette.light.bg).toBe('#F6F5F2');
    expect(palette.dark.bg).toBe('#100E0B');
  });
});

describe('renderTokensCss', () => {
  const css = renderTokensCss();

  it('converts camelCase tokens to kebab-case custom properties', () => {
    expect(css).toContain('--accent-soft:');
    expect(css).not.toContain('--accentSoft:');
  });

  it('carries both themes and an explicit override', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    // The apps offer a theme switch, so an explicit choice has to beat the
    // system preference.
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain("[data-theme='light']");
  });

  it('adds px to numeric scales', () => {
    expect(css).toContain(`--space-lg: ${spacing.lg}px;`);
    expect(css).toContain(`--radius-md: ${radius.md}px;`);
  });

  it('includes the theme-independent spot colours', () => {
    expect(css).toContain(`--star: ${spot.star};`);
    expect(css).toContain(`--destructive: ${spot.destructive};`);
  });

  it('says it is generated', () => {
    expect(css.startsWith('/* GENERATED FILE')).toBe(true);
  });
});

describe('the package barrel', () => {
  // apps/mobile imports `@amragrir/ui` and Metro bundles it from THIS source
  // file (package `main` points at src). Metro resolves a bare `./tokens` to
  // tokens.ts, but a `./tokens.js` specifier makes it look for a file that does
  // not exist ("Unable to resolve module ./tokens.js"); it also cannot resolve
  // css.ts's own `./tokens.js` import, so the CSS generator must stay out of the
  // barrel entirely. Neither rule is enforced by tsc, Vitest resolution or the
  // web build — only Metro, which no unit test runs — so this guards both
  // against a silent reintroduction that would break the mobile app alone.
  const source = readFileSync(join(here, 'index.ts'), 'utf8');
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  it('re-exports with no file extension (Metro cannot map ./x.js to x.ts)', () => {
    for (const specifier of specifiers) {
      expect(specifier, specifier).not.toMatch(/\.[a-z]+$/);
    }
  });

  it('does not re-export the CSS generator into the mobile bundle', async () => {
    const barrel = await import('./index.js');
    expect(barrel.palette).toBeDefined();
    expect('renderTokensCss' in barrel).toBe(false);
  });
});
