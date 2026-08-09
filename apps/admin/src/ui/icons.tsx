import type { ReactNode, SVGProps } from 'react';

/**
 * The panel's icon set, drawn inline.
 *
 * Here rather than from an icon package because the back office needs about
 * twenty glyphs and every one of them has to inherit `currentColor` — a nav
 * item, a destructive confirm and a disabled button each tint their icon from
 * the same token as their label, with no second colour to keep in step. A
 * dependency would ship hundreds of icons to get that.
 *
 * One geometry for all of them (24px box, 1.75 stroke, round caps) is what
 * makes a set look drawn by one hand instead of collected.
 */
const ICONS = {
  orders: (
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 2h6v4H9z" />
      <path d="M8 12h8M8 16h5" />
    </>
  ),
  menu: (
    <>
      <path d="M2 5h5.5A3.5 3.5 0 0 1 11 8.5V20a2.5 2.5 0 0 0-2.5-2H2z" />
      <path d="M22 5h-5.5A3.5 3.5 0 0 0 13 8.5V20a2.5 2.5 0 0 1 2.5-2H22z" />
    </>
  ),
  restaurants: (
    <>
      <path d="M3.5 9 5 4h14l1.5 5" />
      <path d="M4.5 9v10a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9" />
      <path d="M3.5 9h17" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  people: (
    <>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  dashboard: (
    <>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </>
  ),
  customers: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  platform: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.1-7.1A2 2 0 0 1 3 12.1V4a1 1 0 0 1 1-1h8.1a2 2 0 0 1 1.4.6l7.1 7.1a2 2 0 0 1 0 2.7z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6h17" />
      <path d="M8.5 6V4.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V6" />
      <path d="M18.5 6l-.9 13.1a1.5 1.5 0 0 1-1.5 1.4H7.9a1.5 1.5 0 0 1-1.5-1.4L5.5 6" />
    </>
  ),
  /** A pencil over the thing it writes on — an edit that opens a form, as
   *  against the switches and the price box that are edited in the row. */
  pencil: (
    <>
      <path d="M4 20l1.2-4.2L16.3 4.7a2.4 2.4 0 0 1 3.4 3.4L8.2 18.8z" />
      <path d="m14.3 6.7 3.2 3.2" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="12" cy="19" r="1.3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  signOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4.5M12 17.2h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.2 1.9" />
    </>
  ),
  /** The shell's bell — a branch being told something, which is a different
   *  thing from `warning` (this order is late) and from `clock` (this one is
   *  due at). */
  bell: (
    <>
      <path d="M18 8.6a6 6 0 1 0-12 0c0 6-3 6.9-3 6.9h18s-3-.9-3-6.9" />
      <path d="M13.7 19.4a2 2 0 0 1-3.4 0" />
    </>
  ),
  /** A clock wound backwards — the trail an order left, not the time it has
   *  left, which is what `clock` says on the same card. */
  history: (
    <>
      <path d="M3.1 10.4A9 9 0 1 1 3 12.6" />
      <path d="M3 5v5.5h5.5" />
      <path d="M12 7.5v5l3.2 1.9" />
    </>
  ),
  /** Three finder squares and a scatter of modules — a QR code at 24px, where
   *  drawing an actual one would be a grey square. */
  qr: (
    <>
      <rect x="3.2" y="3.2" width="7" height="7" rx="1.4" />
      <rect x="13.8" y="3.2" width="7" height="7" rx="1.4" />
      <rect x="3.2" y="13.8" width="7" height="7" rx="1.4" />
      <path d="M13.8 13.8h3M20.8 13.8v3M17.3 17.3h3.5M13.8 20.8h3.5M20.8 20.8h.01" />
    </>
  ),
  /** A pushpin driven straight in — the board held on one order while the rest
   *  of the queue is set aside. Head-on rather than leaning the way a map pin
   *  does: at 17px a tilted pin reads as an arrow, and an arrow on a card full
   *  of buttons looks like something that moves the order along. */
  pin: (
    <>
      <path d="M9 3h6l-.8 6.3 2.6 2.9a1 1 0 0 1-.7 1.7H7.9a1 1 0 0 1-.7-1.7l2.6-2.9z" />
      <path d="M12 13.9V21" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-5.5l-1.7 3h-5.6l-1.7-3H2" />
      <path d="M5.6 4.5h12.8L22 12v5.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V12z" />
    </>
  ),
  mail: (
    <>
      <path d="M3 6.5h18v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <path d="m3.4 7 8.6 6 8.6-6" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
