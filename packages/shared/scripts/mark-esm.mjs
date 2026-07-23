import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Marks `dist/esm` as ES modules.
 *
 * The package itself is CommonJS (the NestJS API requires it), so without this
 * file Node would read `dist/esm/*.js` as CommonJS too and throw on the first
 * `export`. One line of JSON is the whole dual-package setup.
 */
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'esm');
writeFileSync(join(dist, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
