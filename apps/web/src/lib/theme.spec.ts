import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_KEY } from './theme';

const here = dirname(fileURLToPath(import.meta.url));
const themeSource = readFileSync(join(here, 'theme.ts'), 'utf8');
const layoutSource = readFileSync(join(here, '..', 'app', '[lang]', 'layout.tsx'), 'utf8');

describe('THEME_KEY', () => {
  it('is the literal storage key', () => {
    expect(THEME_KEY).toBe('amragrir.theme');
  });

  it('lives in a server-safe module', () => {
    // The layout is a Server Component and inlines THEME_KEY into the pre-paint
    // <script>. If this module were 'use client', the server would import a
    // client-reference proxy instead of the string, and `getItem('${THEME_KEY}')`
    // would render as `getItem('function () { throw new Error(...) }')` — broken
    // JavaScript that silently kills the flash-of-wrong-theme guard. Nothing but
    // reading the rendered HTML catches that, so guard the cause here. Match a
    // 'use client' *directive* — a line that is only the string — not a mention
    // of it in a comment (this file's own docs explain the hazard by name).
    expect(themeSource).not.toMatch(/^\s*['"]use client['"]\s*;?\s*$/m);
  });

  it('is inlined by the layout from the server-safe module, not the client toggle', () => {
    expect(layoutSource).toMatch(/import\s*\{\s*THEME_KEY\s*\}\s*from\s*'@\/lib\/theme'/);
    // A regression to importing the key from the 'use client' component is
    // exactly what produced the broken script.
    expect(layoutSource).not.toMatch(/THEME_KEY[^\n]*from '@\/components\/ThemeToggle'/);
    // The script must reference the constant, not a hand-copied literal that
    // could drift from what the toggle writes.
    expect(layoutSource).toContain("getItem('${THEME_KEY}')");
  });
});
