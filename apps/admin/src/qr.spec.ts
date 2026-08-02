import { describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import { QR_QUIET_ZONE, encodeQr } from './qr';

/**
 * The path an order's QR code is drawn as.
 *
 * The encoding belongs to `qrcode-generator` and is tested there. What is
 * tested here is everything between it and the screen — the run-merging, the
 * quiet zone, the coordinate system — because a path that is off by one module
 * or drawn transposed is still a picture of a QR code, and the only place that
 * shows up otherwise is a scanner at a counter that will not beep.
 *
 * The path this file asserts about was also rasterised and read back with a
 * real decoder once, by hand, and came out as the order code. That is not
 * automated here: it would cost the panel an image library and a QR *reader* as
 * dev dependencies to re-prove something these assertions already pin.
 */

/** An order code, in the shape `orders.code` actually takes. */
const CODE = 'AMR-48219031';

/** The cells a path covers, read back out of its `M…h…v1h-…z` subpaths. */
function cellsOf(path: string): Set<string> {
  const cells = new Set<string>();
  for (const [, x, y, run] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let step = 0; step < Number(run); step += 1) {
      cells.add(`${Number(x) + step},${y}`);
    }
  }
  return cells;
}

/** The same payload as the library sees it, to hold the path against. */
function reference(text: string) {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  return code;
}

describe('encodeQr', () => {
  it('draws every dark module the encoder produced, and nothing else', () => {
    const code = reference(CODE);
    const cells = cellsOf(encodeQr(CODE).path);

    const dark = new Set<string>();
    for (let row = 0; row < code.getModuleCount(); row += 1) {
      for (let column = 0; column < code.getModuleCount(); column += 1) {
        if (code.isDark(row, column)) {
          dark.add(`${column + QR_QUIET_ZONE},${row + QR_QUIET_ZONE}`);
        }
      }
    }

    // A transposed path — row read as x — passes a count check and fails this
    // one, which is the mistake worth catching: the code still looks like a QR
    // code and decodes to nothing.
    expect(cells).toEqual(dark);
  });

  it('leaves the quiet zone the spec asks for on all four sides', () => {
    const { size, path } = encodeQr(CODE);
    const cells = [...cellsOf(path)].map((cell) => cell.split(',').map(Number));

    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(QR_QUIET_ZONE);
      expect(y).toBeGreaterThanOrEqual(QR_QUIET_ZONE);
      expect(x).toBeLessThan(size - QR_QUIET_ZONE);
      expect(y).toBeLessThan(size - QR_QUIET_ZONE);
    }
  });

  it('is the whole code wide, quiet zone included', () => {
    // The smallest QR there is (version 1) holds an order code at level M, and
    // the payload's shape is fixed — so this is 21 + 4 + 4 until the code
    // format itself changes.
    expect(encodeQr(CODE).size).toBe(reference(CODE).getModuleCount() + QR_QUIET_ZONE * 2);
    expect(encodeQr(CODE).size).toBe(29);
  });

  it('puts a finder pattern in three corners and not the fourth', () => {
    // Independent of the library's own matrix: this is the geometry a scanner
    // looks for first, and it is what says the path is the right way up.
    const { size, path } = encodeQr(CODE);
    const cells = cellsOf(path);
    const inner = size - QR_QUIET_ZONE;

    // The outer ring of each 7×7 finder — one corner of it is enough to catch
    // an offset, and the centre of the pattern is dark in every version.
    expect(cells.has(`${QR_QUIET_ZONE},${QR_QUIET_ZONE}`)).toBe(true);
    expect(cells.has(`${inner - 1},${QR_QUIET_ZONE}`)).toBe(true);
    expect(cells.has(`${QR_QUIET_ZONE},${inner - 1}`)).toBe(true);
    // The bottom-right corner carries no finder, which is how a reader tells
    // which way round the code is.
    expect(cells.has(`${inner - 1},${inner - 1}`)).toBe(false);
  });

  it('merges a row of dark modules into one subpath', () => {
    // The timing pattern alone is a 5-module run in version 1; a path with a
    // subpath per module would be several hundred of them.
    const { path } = encodeQr(CODE);
    const subpaths = path.split('z').length - 1;
    expect(subpaths).toBeLessThan(cellsOf(path).size);
  });

  it('grows the grid rather than failing when the payload is longer', () => {
    // Nothing today encodes more than an order code, but the version is picked
    // by the library rather than fixed here precisely so that stays true.
    expect(encodeQr(CODE.repeat(6)).size).toBeGreaterThan(encodeQr(CODE).size);
  });
});
