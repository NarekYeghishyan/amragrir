import { encodeQr } from '@amragrir/ui';

/**
 * The pickup code as something a counter can scan.
 *
 * The code closes the order — the back office cannot mark one collected
 * without being told it — so it stopped being a number read out loud and became
 * one that gets typed. Six digits off a stranger's phone, at a queue, is where
 * the wrong order gets handed over; a scanner reads this in one gesture
 * instead, and the digits stay printed beside it for when there is no scanner.
 *
 * The payload is the code alone. A URL would encode the same secret in a denser
 * grid and give the counter's wedge scanner something to parse, when what the
 * handover box wants is exactly these six characters.
 *
 * A server component: the encoding is a pure function of the code, so it runs
 * once at render rather than shipping the encoder to the browser. That is also
 * why it lives in `@amragrir/ui` and not in this app — the panel and the phone
 * draw the same path data from the same function.
 */
export function PickupQr({ code, label }: { code: string; label: string }) {
  const qr = encodeQr(code);

  return (
    <div className="pickup-qr">
      <svg
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        // The content of the picture is the code, which cannot be worked out
        // from a path of several hundred squares.
        role="img"
        aria-label={label}
        // Modules are whole units in the viewBox and land on fractional device
        // pixels once scaled. Without this the browser antialiases every edge,
        // and a softened boundary is what a scanner reads worst.
        shapeRendering="crispEdges"
      >
        <path d={qr.path} fill="#111" />
      </svg>
    </div>
  );
}
