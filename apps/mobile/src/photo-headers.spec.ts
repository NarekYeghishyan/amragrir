// @ts-nocheck — a source-scanning meta-test, on the same terms as
// `link-aschild-style.spec.ts`: it reads files with Node's `fs`, which the RN
// app's tsconfig excludes from its type environment. Jest runs it in Node.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every remote picture in this app is fetched by one component, with a
 * `User-Agent` that says who we are.
 *
 * React Native sends `okhttp/4.x` by default — a bare library name. Wikimedia
 * refuses those outright (403, by policy), and while it hosted half the demo
 * imagery the website showed every picture and the app showed none, with
 * nothing looking broken: `Photo` falls back to the placeholder surface on
 * failure, which is also what it draws when there genuinely is no picture.
 *
 * That is why this is a scan rather than a unit test. The failure is invisible
 * in every layer a test usually reaches — the component renders, the request is
 * made, the fallback is correct — and only a real device shows it. The seed has
 * since moved off that host (`apps/api/prisma/menu-photos.ts` keeps the host
 * list, with its own guard), so this file protects the other half of the
 * lesson: the client identifies itself, and it does so in exactly one place.
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

const PHOTO = join(__dirname, 'components', 'Photo.tsx');

describe('remote images identify the client', () => {
  it('sends a User-Agent naming the app', () => {
    const source = readFileSync(PHOTO, 'utf8');

    expect(source).toMatch(/'User-Agent':\s*'[^']*Amragrir[^']*'/);
    // Passed to the image, not merely declared next to it.
    expect(source).toMatch(/source=\{\{\s*uri,\s*headers:/);
  });

  it('is the only component fetching one', () => {
    // A `<Image source={{ uri: ... }}>` written anywhere else would go back to
    // the default agent and to Wikimedia's 403 — and would look, on screen,
    // exactly like a restaurant that never had a cover.
    const offenders = tsxFiles(ROOTS[0]!)
      .concat(tsxFiles(ROOTS[1]!))
      .filter((file) => file !== PHOTO)
      .filter((file) => /<Image\b/.test(readFileSync(file, 'utf8')));

    // Render the picture through `Photo` instead — see the note above.
    expect(offenders).toEqual([]);
  });
});
