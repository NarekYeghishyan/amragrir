// `.js` extension on purpose: this compiles to real ESM that Node runs
// directly (the CSS generator imports it), and Node requires the extension.
// Bundlers resolve it back to the `.ts` source without complaint.
import { HIT_TARGET, palette, radius, spacing, spot, type ThemeName } from './tokens.js';

/**
 * Renders the tokens as CSS custom properties.
 *
 * Kept as a pure string-producing function rather than a build script that
 * writes files directly, so a test can assert the checked-in `tokens.css`
 * still matches. Regenerating is a command; *forgetting* to regenerate is a
 * failing test.
 */

const CAMEL_TO_KEBAB = /[A-Z]/g;

function cssName(token: string): string {
  return token.replace(CAMEL_TO_KEBAB, (letter) => `-${letter.toLowerCase()}`);
}

function themeBlock(theme: ThemeName): string {
  return Object.entries(palette[theme])
    .map(([token, value]) => `  --${cssName(token)}: ${value};`)
    .join('\n');
}

export function renderTokensCss(): string {
  const shared = [
    ...Object.entries(spot).map(([token, value]) => `  --${cssName(token)}: ${value};`),
    ...Object.entries(spacing).map(([token, value]) => `  --space-${token}: ${value}px;`),
    ...Object.entries(radius).map(([token, value]) => `  --radius-${token}: ${value}px;`),
    `  --hit-target: ${HIT_TARGET}px;`,
  ].join('\n');

  return `/* GENERATED FILE — do not edit.
 *
 * Source: packages/ui/src/tokens.ts
 * Regenerate: pnpm --filter @amragrir/ui build:css
 *
 * Editing this by hand puts it out of step with the mobile app, which reads
 * the same tokens as JavaScript. A test fails if this file drifts.
 */

:root {
${themeBlock('light')}

${shared}

  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
${themeBlock('dark')
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
  }
}

/* An explicit choice always wins over the system preference — the apps offer a
   theme switch, and it has to beat the media query above. */
:root[data-theme='light'] {
${themeBlock('light')}
}

:root[data-theme='dark'] {
${themeBlock('dark')}
}
`;
}
