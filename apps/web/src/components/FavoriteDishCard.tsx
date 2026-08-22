import Link from 'next/link';
import type { Language } from '@amragrir/shared';
import type { FavoriteDish } from '@/lib/api';
import { t } from '@/lib/language';
import { formatAmd } from '@/lib/format';
import { toggleFavoriteDish } from '@/app/[lang]/actions';

/**
 * A saved dish, on the Favourites screen.
 *
 * Built out of the same parts as the menu's own dish card — the media
 * placeholder, `.name`, `.desc`, `.price` — so a dish reads the same here as it
 * did on the page it was saved from. What it adds is the kitchen: a dish belongs
 * to one address, and a list holding "khinkali" twice is telling somebody about
 * two different kitchens.
 *
 * **The link opens the menu at this dish** (`?item=…#dish-…`), not the top of it:
 * the whole point of having saved a dish is to come back to that dish, and the
 * page already knows how to answer that link on the server. It links by
 * `branchId` rather than by slug, because a slug resolves to the oldest branch of
 * the business — which is not necessarily where this dish is cooked.
 *
 * The heart is always filled and always removes: everything on this screen is
 * saved, so that is the only thing it can usefully mean here.
 */
export function FavoriteDishCard({
  dish,
  language,
  href,
  returnTo,
}: {
  dish: FavoriteDish;
  language: Language;
  /** The menu, at this dish. Built by the caller, which owns the URL rules. */
  href: string;
  /** Where the heart posts back to, so removing returns to this list. */
  returnTo: string;
}) {
  const label = t(language);

  // Whose kitchen, and where. The street is the useful one; the branch's own
  // name and then its city stand in for a branch that has not been given one.
  const where = dish.address ?? dish.branchName ?? dish.city;
  const kitchen = where ? `${dish.restaurantName} · ${where}` : dish.restaurantName;

  return (
    <div className="dish-result">
      <Link className="dish" href={href}>
        <div className={dish.photoUrl ? 'media' : 'media ph'}>
          {dish.photoUrl && <img src={dish.photoUrl} alt="" loading="lazy" />}
        </div>

        <div className="text">
          <div className="name">{dish.name}</div>
          <div className="desc">{kitchen}</div>
          <div className="facts">
            {[
              // Two different absences, said differently: the dish is off
              // tonight, or the kitchen is shut. Either means it cannot be
              // ordered right now, and neither is a reason to drop the row — it
              // is still saved.
              dish.isAvailable ? null : label('soldOut'),
              dish.isAvailable && !dish.isOpen ? label('closed') : null,
              dish.prepMin === null ? null : `${dish.prepMin} ${label('minutes')}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="dish-foot">
            <div className="price">{formatAmd(dish.priceAmd)}</div>
          </div>
        </div>
      </Link>

      <form className="fav-form in-row" action={toggleFavoriteDish}>
        <input type="hidden" name="lang" value={language} />
        <input type="hidden" name="menuItemId" value={dish.menuItemId} />
        {/* Filled, so the press means "remove". */}
        <input type="hidden" name="favorited" value="1" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          type="submit"
          className="fav on"
          // The kitchen is in the label as well as on the card: one dish saved at
          // two branches is two rows with the same name.
          aria-label={`${label('removeFavoriteDish')} — ${dish.name}, ${kitchen}`}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <path
              d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
