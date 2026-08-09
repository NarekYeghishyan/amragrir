/**
 * The artifact's map pin — one shape, both maps.
 *
 * The drawn map transcribed the artifact's pin exactly; the real map did not.
 * It marked the chosen point with a CSS box rounded into a teardrop
 * (`border-radius: … / 44% 44% 60% 60%`), which is an egg: it has no point on
 * it, so the one pixel that matters — *which* spot on the street is chosen —
 * was the one thing the marker did not say. This is the artifact's pin instead,
 * and it is drawn here rather than twice so the two maps cannot drift apart.
 *
 * Drawn around its own point: the tip sits at the origin, the head above it,
 * and the shadow just below. Whatever places this only has to put (0, 0) on the
 * spot being marked — `translate()` inside the drawn map's SVG, and
 * `PIN_VIEW_BOX` plus `PIN_TIP` for a pin that is its own element over the real
 * one.
 */
export function MapPinShape({ fill }: { fill: string }) {
  return (
    <>
      <ellipse cx="0" cy="1" rx="6" ry="2.5" fill="rgba(0,0,0,.22)" />
      <path
        d="M0 2 C0 2 -9 -8 -9 -15 A9 9 0 1 1 9 -15 C9 -8 0 2 0 2 Z"
        fill={fill}
        stroke="#fff"
        strokeWidth="2"
      />
      <circle cx="0" cy="-15" r="3.6" fill="#fff" />
    </>
  );
}

/**
 * The box that holds one pin, for the caller that needs it to be an `<svg>` of
 * its own. Tight to the shape: the head is a circle of radius 9 centred at
 * y=-15 with a 1px half-stroke around it, so the drawing starts at y=-25, and
 * the shadow ends at y=3.5, so 30 units of height clears it.
 */
export const PIN_VIEW_BOX = '-11 -25 22 30';

/** How far down that box the pin's point is — `translate(-50%, -90%)` is what
 *  puts the point, rather than the middle of the head, on the spot. */
export const PIN_TIP = '90%';
