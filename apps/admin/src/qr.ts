import qrcode from 'qrcode-generator';

/**
 * An order's code as a QR code, in the one shape the panel needs: SVG path
 * data.
 *
 * The encoding itself comes from `qrcode-generator` rather than from here.
 * Drawing twenty icons by hand is a morning's work (see `ui/icons.tsx`);
 * Reed–Solomon codewords, the version tables, mask selection and the format
 * bits are not, and a QR the counter's scanner silently refuses to read is a
 * bug nobody notices until somebody is standing at the counter. Same trade the
 * panel makes with Radix for dialogs.
 *
 * What is ours is the rendering: an SVG path instead of the library's own
 * `<img>` or `<table>`, so the code inherits `currentColor`, scales to whatever
 * box it is put in, and stays crisp when a tablet is held at arm's length —
 * none of which a rasterised GIF data URL does.
 */

/**
 * The quiet zone, in modules.
 *
 * Four is what the spec asks for, and it is not decoration: a scanner finds
 * the code by its border, so a QR drawn flush to the edge of its plate is one
 * that reads slowly or not at all. Included in the path's viewBox rather than
 * left to CSS padding, because it has to survive whatever the plate around it
 * does.
 */
export const QR_QUIET_ZONE = 4;

/**
 * Error correction level `M` — 15% recoverable.
 *
 * The payload is an order code, so even `M` fits in the smallest QR there is
 * (21×21 modules for `AMR-` + 8 digits). Going higher would buy redundancy
 * this does not need — the code is read off a screen, once, from arm's length
 * — at the cost of a denser grid, and a denser grid is the thing that actually
 * makes a scan fail on a tablet with a fingerprint on it.
 */
const EC_LEVEL = 'M';

/**
 * The smallest version that fits the data.
 *
 * `0` is the library's "work it out", which is what keeps the code as coarse
 * as possible: a longer payload later grows the grid on its own instead of
 * failing to encode.
 */
const AUTO_VERSION = 0;

export interface QrCode {
  /** The code's width in modules, quiet zone included — the SVG's viewBox. */
  size: number;
  /** Path data for the dark modules, in module units. */
  path: string;
}

/**
 * The dark modules of `text`, as one path.
 *
 * One path rather than a rect per module: a 21×21 code is up to ~440 elements,
 * and a board that can open a dialog per card should not put that many nodes
 * in the document for a picture. Each run of adjacent dark modules in a row
 * becomes a single subpath, which halves it again.
 *
 * Coordinates are module units — the SVG scales them — so no cell size is
 * decided here. Whoever renders it picks the size in CSS.
 */
export function encodeQr(text: string): QrCode {
  const code = qrcode(AUTO_VERSION, EC_LEVEL);
  code.addData(text);
  code.make();

  const modules = code.getModuleCount();
  const parts: string[] = [];

  for (let row = 0; row < modules; row += 1) {
    let run = 0;
    // One past the last column, so a run touching the right edge is closed by
    // the loop rather than needing the same code again after it.
    for (let column = 0; column <= modules; column += 1) {
      const dark = column < modules && code.isDark(row, column);
      if (dark) {
        run += 1;
        continue;
      }
      if (run > 0) {
        const x = column - run + QR_QUIET_ZONE;
        const y = row + QR_QUIET_ZONE;
        parts.push(`M${x} ${y}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }

  return { size: modules + QR_QUIET_ZONE * 2, path: parts.join('') };
}
