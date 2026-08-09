'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToBasket, addToBasketLive } from '@/app/[lang]/actions';
import { publishBasket } from '@/lib/basket-live';
import { useScripted } from '@/lib/scripted';

/**
 * The design's per-dish `＋`.
 *
 * Still a `<form>` posting `addToBasket`, so adding to the basket works with
 * JavaScript off — and it still reads no cookies, which is what lets the
 * restaurant page stay pre-rendered. What is new is what happens when there
 * *is* JavaScript: the submit is taken over and the same write goes out through
 * `addToBasketLive`, which does not redirect.
 *
 * The redirect is what this exists to avoid. Nothing the server rendered on a
 * restaurant page depends on the basket, so rebuilding the whole route to add
 * one dish threw away and re-made a page of menu — the panel blanked, the press
 * took most of a second, and on a long menu the scroll position was the
 * visitor's problem. Now the only things that change are the two controls that
 * were wrong: this button, and the panel beside it.
 *
 * **It answers.** A `＋` that does nothing visible until a panel somewhere else
 * catches up is a `＋` people press twice. It goes to a tick for a moment, and
 * on to the next press from there.
 */
export function AddDish({
  language,
  branchId,
  slug,
  menuItemId,
  returnTo,
  label,
}: {
  language: string;
  branchId: string;
  slug: string;
  menuItemId: string;
  returnTo: string;
  label: string;
}) {
  const scripted = useScripted();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <form
      action={addToBasket}
      onSubmit={(event) => {
        if (!scripted) return;
        event.preventDefault();
        startTransition(async () => {
          const result = await addToBasketLive({ lang: language, branchId, slug, menuItemId });
          if (!result.ok) {
            // A dish from another restaurant. Two kitchens in one basket is
            // never allowed, and the basket page is where that gets asked
            // about — the one outcome that is still worth a navigation.
            router.push(result.go);
            return;
          }
          // The panel beside this menu wants exactly what came back, and the
          // header wants to know the count moved. Publishing does both, so the
          // panel is told rather than left to fetch its own copy of an answer
          // this press already has.
          publishBasket(branchId, result.panel);
          setAdded(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setAdded(false), 1200);
        });
      }}
    >
      <input type="hidden" name="lang" value={language} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="menuItemId" value={menuItemId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {/* The glyph swaps inside a disc of fixed size, so nothing on the card
          moves; the accessible name is the label either way. */}
      <button className={added ? 'add added' : 'add'} type="submit" aria-label={label}>
        <span aria-hidden="true">{added ? '✓' : '＋'}</span>
      </button>
    </form>
  );
}
