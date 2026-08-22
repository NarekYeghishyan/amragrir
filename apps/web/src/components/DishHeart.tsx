'use client';

import { useEffect, useState } from 'react';
import { toggleFavoriteDish } from '@/app/[lang]/actions';
import { forgetSaved, readSaved } from '@/lib/saved-client';

interface Props {
  /** The dish this heart saves. It names its own branch through the menu, so
   *  nothing here has to pass one (DATABASE.md §13a). */
  menuItemId: string;
  language: string;
  /** Where a press returns to — and where sign-in comes back to. */
  returnTo: string;
  /** The route this reads its state from; see `savedApiPath`. One request serves
   *  every heart on the page — see `readSaved`. */
  endpoint: string;
  labels: { add: string; remove: string };
  /** Named in the button's label, so "Save dish" says which. */
  name: string;
}

/**
 * The heart on one row of a **pre-rendered** menu.
 *
 * `RestaurantCard`'s hearts are server-rendered in the state the account is in,
 * because every screen that draws a card renders per request. A restaurant page
 * does not: it is HTML on disk, in three languages, for every restaurant — which
 * is the one thing that page exists to be. So this ships hollow in that HTML and
 * asks `/[lang]/saved` what it should be once it mounts, sharing one request with
 * the banner's heart and every other row.
 *
 * **Still a `<form>` posting the same Server Action**, so it works with
 * JavaScript off: the heart is hollow and pressing it saves the dish, which is
 * right for the common case and harmless in the other one because `POST
 * /favorites/dishes` is idempotent. What a scriptless visitor cannot do from here
 * is *un*-save, and there is no way to give them that on a page that cannot know
 * the state — the favourites screen is where it exists for them, and it renders
 * per request. The same trade `FavoriteButton` documents for the branch.
 */
export function DishHeart({ menuItemId, language, returnTo, endpoint, labels, name }: Props) {
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    let live = true;

    void readSaved(endpoint).then((saved) => {
      if (live) {
        setFavorited(saved.dishes.includes(menuItemId));
      }
    });

    return () => {
      live = false;
    };
  }, [endpoint, menuItemId]);

  return (
    <form
      className="fav-form"
      action={toggleFavoriteDish}
      onSubmit={() => {
        // Flipped before the action answers: nothing on this page depends on the
        // outcome — that is what `revalidate=0` tells the action — so there is no
        // server answer coming that would correct it.
        setFavorited((current) => !current);
        // The cached answer describes the state this press has just changed.
        forgetSaved(endpoint);
      }}
    >
      <input type="hidden" name="lang" value={language} />
      <input type="hidden" name="menuItemId" value={menuItemId} />
      <input type="hidden" name="favorited" value={favorited ? '1' : '0'} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="revalidate" value="0" />
      <button
        type="submit"
        className={favorited ? 'fav on' : 'fav'}
        aria-label={`${favorited ? labels.remove : labels.add} — ${name}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
            fill={favorited ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
