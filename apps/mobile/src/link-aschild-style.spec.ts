// @ts-nocheck — a source-scanning meta-test: it reads files with Node's `fs`,
// which the React Native app's tsconfig intentionally excludes from its type
// environment. Jest runs it in Node, so `node:fs`/`__dirname` resolve at
// runtime; tsc skips this file rather than pull @types/node into the RN app.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * expo-router's `<Link asChild>` clones its child through a Slot that merges a
 * single style object onto it. Passing an **array** style to that child throws
 * at render time — "You are passing an array of styles to a child of <Slot>" —
 * which no unit test, typecheck or Metro bundle catches (it is a render-time
 * error). Flattening the style with `StyleSheet.flatten([...])` fixes it.
 *
 * This guard scans the screens for the footgun so a future `asChild` cannot
 * quietly reintroduce the crash.
 */
const ROOTS = [join(__dirname, '..', 'app'), __dirname];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        out.push(...tsxFiles(full));
      }
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// Matches `asChild>`, any JSX comments/whitespace, then the child's opening tag,
// capturing that tag's attributes (up to its closing `>`).
const CHILD_OF_ASCHILD = /asChild\s*>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*<[A-Za-z][\w.]*\b([^>]*)>/g;

describe('a child of <Link asChild> never receives an array style', () => {
  const files = tsxFiles(ROOTS[0]!).concat(tsxFiles(ROOTS[1]!));

  it('scans a non-empty set of screens', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('finds no array style on a child of <Link asChild>', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(CHILD_OF_ASCHILD)) {
        if (match[1]!.includes('style={[')) {
          offenders.push(file);
        }
      }
    }
    // Flatten offenders with StyleSheet.flatten([...]) — see the note above.
    expect(offenders).toEqual([]);
  });
});
