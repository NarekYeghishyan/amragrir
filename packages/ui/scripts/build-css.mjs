import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { renderTokensCss } from '../dist/css.js';

/**
 * Writes the generated stylesheet into every app that consumes CSS variables.
 *
 * Written into each app rather than imported from `node_modules`: Next.js and
 * Vite both handle a local `.css` import with no configuration, and a file in
 * the repo is visible in a diff when the palette changes.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');

const TARGETS = [
  join(root, 'apps', 'web', 'src', 'app', 'tokens.css'),
  join(root, 'apps', 'admin', 'src', 'tokens.css'),
];

const css = renderTokensCss();
for (const target of TARGETS) {
  writeFileSync(target, css, 'utf8');
  console.log(`wrote ${target}`);
}
