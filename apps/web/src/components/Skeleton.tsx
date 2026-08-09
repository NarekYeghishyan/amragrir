import type { ReactNode } from 'react';

/**
 * The shapes a screen is drawn as while its data is still on the way.
 *
 * Every page here renders on the server, so between a press and a screen there
 * is a round trip. What each route's `loading.tsx` puts on that gap is built
 * out of these: the page's own layout classes — `.grid`, `.card`, `.dishes`,
 * `.order-row`, `.banner` — with the words and the photographs replaced by
 * placeholder blocks.
 *
 * Reusing the real classes rather than inventing skeleton ones is the point.
 * The blocks land where the words will land, at the size the words will be, so
 * the arriving page settles into the shape already on screen instead of shoving
 * it around — and there is one set of measurements to keep in step with the
 * design, not two.
 *
 * None of it is announced. A `loading.tsx` is handed no route params, so it has
 * no language to translate a "loading" into; `RouteProgress` in the layout says
 * it once, in the visitor's own language, and everything here stays
 * `aria-hidden`.
 */

/** The frame a skeleton screen sits in: hidden from readers, and staggered. */
export function SkeletonScreen({
  children,
  className,
}: {
  children: ReactNode;
  /** The screen classes the real page carries, where it narrows the column. */
  className?: string;
}) {
  return (
    <div className={className ? `skel-screen ${className}` : 'skel-screen'} aria-hidden="true">
      {children}
    </div>
  );
}

/**
 * The home page's banner.
 *
 * Drawn in full rather than as a grey box: the gradient, the radius and the
 * discs are in the stylesheet and need no data at all, so the one thing worth
 * waiting for is the words on top of it. Those are the blocks — in white over
 * the accent, like everything else that sits on this panel.
 */
export function SkeletonHero() {
  return (
    <section className="hero">
      <div className="hero-body skel-hero">
        <div className="skel tag" />
        <div className="skel head" />
        <div className="skel head short" />
        <div className="skel sub" />
        <div className="skel cta" />
      </div>
    </section>
  );
}

/** The cuisine rail under the hero. */
export function SkeletonCats({ count = 8 }: { count?: number }) {
  return (
    <div className="cats">
      {Array.from({ length: count }, (_, index) => (
        <div className="skel skel-cat" key={index} />
      ))}
    </div>
  );
}

/** A row of pills — the home page's quick filters, a menu's tabs. */
export function SkeletonChips({ count = 5, tabs = false }: { count?: number; tabs?: boolean }) {
  return (
    <div className={tabs ? 'menu-tabs' : 'filters'}>
      <div className={tabs ? 'skel-chip-row' : 'chips skel-chip-row'}>
        {Array.from({ length: count }, (_, index) => (
          <span className="skel skel-chip" key={index} />
        ))}
      </div>
    </div>
  );
}

/** A heading on its own — `title` for the `h1` size, plain for a section's. */
export function SkeletonHeading({ title = false }: { title?: boolean }) {
  return <div className={title ? 'skel skel-heading title' : 'skel skel-heading'} />;
}

/** The heading-and-count row the listings put above a grid. */
export function SkeletonSectionHead() {
  return (
    <div className="section-head">
      <div className="skel skel-heading" />
      <div className="skel skel-count" />
    </div>
  );
}

/**
 * A run of text: full-width lines with the last one short, the way a wrapped
 * paragraph actually ends.
 */
export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return (
    <div className="skel-lines">
      {Array.from({ length: lines }, (_, index) => (
        <div
          className={index === lines - 1 ? 'skel skel-line short' : 'skel skel-line'}
          key={index}
        />
      ))}
    </div>
  );
}

/**
 * The restaurant grid, in the shape `RestaurantCard` will fill.
 *
 * Six by default — two rows of the three-up grid, which is about what the
 * 1220px column shows before the fold. Fewer would leave it half empty and let
 * the arriving page jump.
 */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: count }, (_, index) => (
        <article className="card" key={index}>
          <div className="media skel" />
          <div className="body">
            <div className="skel skel-line title" />
            <div className="skel skel-line short" />
            <div className="tags">
              <span className="skel skel-tag" />
              <span className="skel skel-tag" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** The order and reservation lists: who, what state, how much. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <ul className="order-list">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <div className="order-row">
            <span className="who">
              <span className="skel skel-line mid" />
              <span className="skel skel-line short" />
            </span>
            <span className="skel skel-pill" />
            <span className="amount">
              <span className="skel skel-line" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The basket's lines: the photograph, the dish, and what you do to it.
 *
 * Its own shape rather than `SkeletonRows`, because `.line` puts a 72px
 * photograph in front of the text. Standing that column in as text would land
 * every name 88px to the left of where it arrives.
 */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <ul className="lines">
      {Array.from({ length: count }, (_, index) => (
        <li className="line" key={index}>
          <div className="media skel" />
          <div className="text">
            <div className="skel skel-line mid" />
            <div className="skel skel-line short" />
          </div>
          <div className="stepper">
            <span className="skel skel-pill" />
          </div>
          <div className="line-total">
            <span className="skel skel-line" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A restaurant's cover photograph. */
export function SkeletonBanner() {
  return <div className="banner skel" />;
}

/** The dish cards on a restaurant's menu. */
export function SkeletonDishes({ count = 6 }: { count?: number }) {
  return (
    <div className="dishes">
      {Array.from({ length: count }, (_, index) => (
        <div className="dish" key={index}>
          <div className="media skel" />
          <div className="text">
            <div className="skel skel-line mid" />
            <div className="skel skel-line" />
            <div className="dish-foot">
              <div className="skel skel-line short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A card of stacked lines — the sticky order summary, the account menu, the
 * checkout's payment block.
 */
export function SkeletonPanel({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skel-panel">
      <div className="skel skel-line mid" />
      {Array.from({ length: rows }, (_, index) => (
        <div className="skel skel-line" key={index} />
      ))}
    </div>
  );
}
