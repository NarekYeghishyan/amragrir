import { useMemo } from 'react';
import type { StaffOrder } from './api';
import type { Translate } from './language';
import { encodeQr } from './qr';
import { Button, Dialog, DialogBody } from './ui';

/**
 * An order's code, big enough to scan off the screen.
 *
 * The board already prints the pickup code across the top of every card, which
 * is the number the counter says out loud — four digits, unique only among the
 * orders in front of it. `orders.code` (`AMR-` + 8 digits) is the one that
 * names exactly one order in the database, and until now it was only ever
 * something to read out and retype: into the board's own search, into a
 * handheld, into the note on a refund. Retyping twelve characters at a counter
 * is where the wrong order gets picked.
 *
 * So the card offers it as a QR code instead. Anything that scans — a phone, a
 * counter's handheld, the wedge scanner that types what it reads — gets the
 * full code with no keystrokes, and a scanner pointed at this screen puts that
 * code into the search box on the next one.
 *
 * **The plain code stays under it**, in the same dialog: a scanner is a thing
 * that can be flat, out of reach, or not there at all, and a QR nobody can read
 * with their eyes is a dead end when it is.
 */
export function OrderQrDialog({ t, order }: { t: Translate; order: StaffOrder }) {
  // Uncontrolled, unlike the History dialog beside it: that one has to know
  // when it opened, because that is when it fetches. This has everything it
  // needs on the card already, so open/closed is Radix's business alone.
  return (
    <Dialog
      title={t('orderQrTitle', { code: order.pickupCode })}
      description={t('orderQrDesc')}
      trigger={<Button icon="qr">{t('orderQrAction')}</Button>}
    >
      <DialogBody className="order-qr">
        {/* Nothing is encoded until the dialog is open: this is one card of a
            board that routinely holds fifty, and a QR per card is fifty codes
            generated for the one somebody wanted. Radix mounts the content
            only while it is open, so the work lives in here rather than in the
            component above. */}
        <QrPlate value={order.code} label={t('orderQrImageLabel', { code: order.code })} />
        <p className="order-qr__code num">{order.code}</p>
        <p className="order-qr__hint">{t('orderQrHint')}</p>
      </DialogBody>
    </Dialog>
  );
}

/**
 * The code itself, on the light plate a scanner expects.
 *
 * `role="img"` with a label rather than a bare `<svg>`: what this is cannot be
 * worked out from a path of six hundred squares, and a screen reader landing on
 * it should hear the order code — which is the whole content of the picture.
 *
 * The plate is white and the modules `#111` in both themes (`--qr-paper` /
 * `--qr-ink`). A code that inverted itself under the dark panel is one a
 * handheld may decline to read, and the panel's theme is not something the
 * person holding the scanner chose.
 *
 * Exported for `render.spec.tsx`: the dialog around it only opens on a click,
 * so this is the only way the drawn code reaches a test at all.
 */
export function QrPlate({ value, label }: { value: string; label: string }) {
  const code = useMemo(() => encodeQr(value), [value]);

  return (
    <div className="order-qr__plate">
      <svg
        className="order-qr__svg"
        viewBox={`0 0 ${code.size} ${code.size}`}
        role="img"
        aria-label={label}
        // Modules are whole units in the viewBox and land on fractional device
        // pixels once scaled; without this the browser antialiases every edge
        // and the softened boundary is what a scanner reads worst.
        shapeRendering="crispEdges"
      >
        <path d={code.path} fill="currentColor" />
      </svg>
    </div>
  );
}
