'use client';

import { useEffect, useState } from 'react';
import { toggleFavorite } from '@/app/[lang]/actions';
import type { SavedAnswer } from '@/app/[lang]/saved/route';

interface Props {
  restaurantId: string;
  language: string;
  /** Where a press returns to — and where sign-in comes back to. */
  returnTo: string;
  /** The route this reads its state from; see `savedApiPath`. */
  endpoint: string;
  labels: { add: string; remove: string };
  /** Named in the button's label, so "Add to favourites" says what to. */
  name: string;
  className?: string;
}

/**
 * The heart on a **pre-rendered** page.
 *
 * `RestaurantCard`'s heart is server-rendered in the state the account is in,
 * because every screen that draws a card already renders per request. A
 * restaurant page does not: it is HTML on disk, in three languages, for every
 * restaurant — which is the one thing that page exists to be. So this one ships
 * hollow in that HTML and asks `/[lang]/saved` what it should be once it mounts.
 *
 * **It is still a `<form>` posting the same Server Action.** Without JavaScript
 * the heart is hollow and pressing it saves the restaurant — which is right for
 * the common case and, because `POST /favorites` is idempotent, harmless in the
 * other one. What a scriptless visitor loses is the ability to *un*-save from
 * this page, and there is no way to give them that on a page that cannot know
 * the state: the favourites screen is where it exists for them, and it renders
 * per request.
 *
 * The press flips the heart before the action answers. Nothing on this page
 * depends on the outcome — that is what `revalidate=0` tells the action — so
 * there is no server answer coming that would correct it, and a heart that
 * waited for one would sit hollow for a round trip.
 */
export function FavoriteButton({
  restaurantId,
  language,
  returnTo,
  endpoint,
  labels,
  name,
  className,
}: Props) {
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    let live = true;

    fetch(endpoint, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<SavedAnswer>) : null))
      .then((data) => {
        if (live && data) {
          setFavorited(data.favorited);
        }
      })
      .catch(() => {
        // A heart that could not read its state stays as it was drawn. Nobody
        // reading this page can do anything about it, and pressing it still
        // works — the account is the authority, not this.
      });

    return () => {
      live = false;
    };
  }, [endpoint]);

  return (
    <form
      className={className ? `fav-form ${className}` : 'fav-form'}
      action={toggleFavorite}
      onSubmit={() => setFavorited((current) => !current)}
    >
      <input type="hidden" name="lang" value={language} />
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="favorited" value={favorited ? '1' : '0'} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {/* Nothing this page renders depends on the answer — the heart's state is
          read in the browser, not from the page — so revalidating would throw
          away a pre-rendered page to change nothing on it. */}
      <input type="hidden" name="revalidate" value="0" />
      <button
        type="submit"
        className={favorited ? 'fav on' : 'fav'}
        aria-label={`${favorited ? labels.remove : labels.add} — ${name}`}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
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
