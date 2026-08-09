import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(join(here, '..', 'components', 'BasketEditor.tsx'), 'utf8');
const actions = readFileSync(join(here, '..', 'app', '[lang]', 'actions.ts'), 'utf8');
const page = readFileSync(join(here, '..', 'app', '[lang]', 'cart', 'page.tsx'), 'utf8');

/** One function's source, from its declaration to the `}` in column 0 that ends
 *  it — enough to say what that one does and does not do. */
function body(name: string): string {
  const start = actions.indexOf(`function ${name}(`);
  expect(start, `${name} is gone from actions.ts`).toBeGreaterThan(-1);
  return actions.slice(start, actions.indexOf('\n}\n', start));
}

/**
 * Source guards for the basket page's editing controls.
 *
 * Two things pull in opposite directions here and both have to survive. A press
 * must not reload the page — that is what the live path is for — and the same
 * press must still work with JavaScript off, which is what the forms under it
 * are for. Losing either while polishing the other would be silent: every
 * browser we look at runs JavaScript, and a redirect that creeps back in looks
 * like nothing more than a slow screen.
 */
describe('the basket page controls', () => {
  it('keeps a real form posting a Server Action under each stepper button', () => {
    expect(editor.match(/<form\s+action=\{changeLineQty\}/g)).toHaveLength(2);
    expect(editor).toMatch(/<form\s+action=\{removeLine\}/);
  });

  it('takes the live path only once React is driving', () => {
    // Both handlers — the stepper's and the ✕'s — or the one without it would
    // preventDefault a press the browser was about to handle on its own.
    expect(editor.match(/if \(!scripted\) return;/g)).toHaveLength(2);
  });

  it('does not let the in-place writes redirect', () => {
    // A redirect to the page you are already on is a navigation, which is the
    // whole thing these exist to avoid.
    expect(body('changeLineQtyInPlace')).not.toMatch(/\bredirect\(/);
    expect(body('removeLineInPlace')).not.toMatch(/\bredirect\(/);
  });

  it('does let them revalidate, which is how the totals arrive', () => {
    // Unlike the restaurant page's live writes: everything on this screen is
    // the server's answer to a basket that just changed, so the rebuilt tree is
    // the answer rather than an expense.
    expect(body('storeLineQty')).toContain('revalidatePath');
    expect(body('storeLineRemoval')).toContain('revalidatePath');
  });

  it('keeps the redirect on the actions the forms themselves post', () => {
    expect(body('changeLineQty')).toMatch(/\bredirect\(/);
    expect(body('removeLine')).toMatch(/\bredirect\(/);
  });

  it('leaves every amount to the server', () => {
    // The quantity is optimistic; no price is. The page hands the line total
    // over already formatted, and the editor never sees an amount in ֏ — so
    // there is nothing there to scale by a quantity it has just guessed at.
    expect(page).toContain('lineTotal={formatAmd(line.lineTotalAmd)}');
    expect(editor).not.toMatch(/Amd\b/);
  });
});
