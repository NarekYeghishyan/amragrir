'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatAmd } from '@/lib/format';
import { toggleFavoriteDish } from '@/app/[lang]/actions';
import type { CardDish } from '@/lib/api';

/**
 * The dishes on a card that is answering a category filter — **one dish per
 * slide, the full width of the card**.
 *
 * It began as a row of small tiles, and small tiles are the wrong shape for
 * this: the plate is the thing being chosen, and at a third of a card's width
 * it is a thumbnail beside two other thumbnails, with the third sliced off at
 * the border. One photograph filling the slot the cover used to fill puts the
 * food at the size somebody actually judges it at, and the card keeps its
 * shape — a filtered feed does not jump about as cards come and go.
 *
 * **The controls appear only once this has mounted, deliberately.** Every dish
 * is a real `<a href>` in the server-rendered HTML, so a crawler and a visitor
 * without JavaScript get every slide and can still swipe or scroll between
 * them; what they do not get is a row of buttons that would answer nothing at
 * all — the same rule the card's heart follows.
 *
 * Once they are there they **stay** there, dimmed and disabled at the ends
 * rather than removed. That is a different question from the one above: a
 * button with no JavaScript behind it can never work, while one at the end of
 * the list works again the moment you go back — and a control that vanishes
 * mid-interaction moves the other one under the cursor.
 *
 * **Each slide carries its own heart**, where the caller can save one. That
 * heart saves *the dish*, not the restaurant: a card wearing the plates that
 * matched a filter is not showing a dining room, and the heart over a
 * photograph of khinkali quietly saving the address was answering a question
 * nobody asked. One per slide rather than one over the frame, because a form
 * posted from the server cannot know which slide is showing — and a heart on
 * the plate is the honest place for it anyway. Same `<form>` as the card's, so
 * it works with JavaScript off.
 */
export function DishSlider({
  dishes,
  href,
  labels,
  favorite,
}: {
  dishes: CardDish[];
  /** The restaurant's page — where each slide leads, at its own dish. */
  href: string;
  labels: { prev: string; next: string; goTo: string };
  /**
   * What a slide's heart needs, where the screen can save a dish at all.
   *
   * Absent, no heart is drawn — a control that looks pressable and answers
   * nothing is worse than one fewer control. `saved` is the ids this visitor has
   * saved, resolved on the server like the card's own heart, so the slider ships
   * in the right state rather than flickering into it.
   */
  favorite?: {
    language: string;
    returnTo: string;
    saved: string[];
    labels: { add: string; remove: string };
  };
}) {
  const strip = useRef<HTMLDivElement>(null);
  /** Which slide is showing — what the dots colour in. */
  const [at, setAt] = useState(0);
  /** False on the first render, which is the one the server produced and the
   *  one a scriptless visitor keeps. */
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  /**
   * Which slide is showing, measured rather than counted.
   *
   * A slide is the card's width, and that changes with the breakpoint, so
   * anything derived from a hard-coded number would drift the moment the grid
   * reflows. The nearest child to the left edge is the honest answer at any
   * size.
   */
  const sync = useCallback(() => {
    const el = strip.current;
    if (!el) {
      return;
    }
    const slides = [...el.children] as HTMLElement[];
    const nearest = slides.reduce(
      (best, slide, index) => {
        const distance = Math.abs(slide.offsetLeft - el.scrollLeft);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Infinity },
    );
    setAt(nearest.index);
  }, []);

  const scrollTo = (index: number): void => {
    const el = strip.current;
    const slide = el?.children[index] as HTMLElement | undefined;
    if (el && slide) {
      // `scrollLeft` rather than `scrollIntoView`, which would also scroll the
      // page to bring the card into view — a sideways nudge should not move the
      // listing vertically.
      el.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    }
  };

  return (
    <div className="slider">
      <div className="slider-frame">
        <div className="card-dishes" ref={strip} onScroll={sync} role="list">
          {dishes.map((dish) => {
            const saved = favorite?.saved.includes(dish.id) === true;
            return (
              // The slide is the scroll child and the link is what fills it: a
              // <form> is interactive content and may not sit inside an <a>, so
              // the heart has to be the link's sibling. Same restructure the
              // card itself needed when it grew a heart.
              <div key={dish.id} role="listitem" className="card-dish-slide">
                <Link
                  className="card-dish"
                  // Two halves doing two jobs, both on the server: `?item=` opens
                  // the menu on the heading that dish sits under, and the hash
                  // scrolls to its card. No JavaScript in either.
                  href={`${href}?item=${dish.id}#dish-${dish.id}`}
                >
                  <div className={dish.photoUrl ? 'media' : 'media ph'}>
                    {dish.photoUrl && <img src={dish.photoUrl} alt="" loading="lazy" />}
                  </div>
                  {/* Over the foot of the photograph rather than under it: the card
                      already carries a name and a price lower down — the
                      restaurant's — and two stacked name/price pairs read as one
                      confused block. On the picture, this one is plainly about the
                      picture. */}
                  <span className="card-dish__cap">
                    <span className="card-dish__name">{dish.name}</span>
                    <span className="card-dish__price">{formatAmd(dish.priceAmd)}</span>
                  </span>
                </Link>

                {favorite && (
                  <form className="fav-form" action={toggleFavoriteDish}>
                    <input type="hidden" name="lang" value={favorite.language} />
                    <input type="hidden" name="menuItemId" value={dish.id} />
                    <input type="hidden" name="favorited" value={saved ? '1' : '0'} />
                    <input type="hidden" name="returnTo" value={favorite.returnTo} />
                    {/* The label names the action, the state and the dish — a
                        slider is several near-identical controls, and "add to
                        favourites" alone would announce all of them the same
                        way. No `aria-pressed` beside it: a toggle says one or
                        the other. */}
                    <button
                      type="submit"
                      className={saved ? 'fav on' : 'fav'}
                      aria-label={`${saved ? favorite.labels.remove : favorite.labels.add} — ${dish.name}`}
                    >
                      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                        <path
                          d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                          fill={saved ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>

        {/* At the ends they go **dim and dead, not away**. An arrow that
            disappears takes the other one's position with it — the row of
            controls shifts under the cursor between slides — and a control that
            comes and goes is one somebody has to look for. `disabled` rather
            than a class, so it is genuinely unpressable and announced as
            unavailable rather than merely painted that way. */}
        {ready && (
          <>
            <button
              type="button"
              className="slider-nav prev"
              aria-label={labels.prev}
              disabled={at === 0}
              onClick={() => scrollTo(at - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="slider-nav next"
              aria-label={labels.next}
              disabled={at >= dishes.length - 1}
              onClick={() => scrollTo(at + 1)}
            >
              ›
            </button>
          </>
        )}
      </div>

      {ready && dishes.length > 1 && (
        <div className="slider-dots" role="tablist" aria-label={labels.goTo}>
          {dishes.map((dish, index) => (
            <button
              key={dish.id}
              type="button"
              role="tab"
              className={index === at ? 'dot on' : 'dot'}
              aria-selected={index === at}
              aria-label={dish.name}
              onClick={() => scrollTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
