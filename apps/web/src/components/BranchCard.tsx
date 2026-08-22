import Link from 'next/link';
import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';
import { formatPriceLevel, formatRating } from '@/lib/format';
import { toggleFavorite } from '@/app/[lang]/actions';

/**
 * Which restaurant, and which of its branches, an order belongs to.
 *
 * The basket used to say this in one grey line — the restaurant's name and a
 * prep time, under a back button carrying the same name again. That is enough
 * to recognise a restaurant and not enough to *check* one: a customer about to
 * pay could not see from this screen which address they were collecting from,
 * or whether the kitchen was open.
 *
 * The card is the answer, and it is deliberately built out of the parts the
 * catalogue already uses — `.tag`, `.tag.prep`, `.tag.good`, the media
 * placeholder — so the restaurant reads the same here as it does on the card
 * that was pressed to get here.
 *
 * **The checkout draws it too**, for the same reason and more urgently: that is
 * the screen where money is committed, and it said less about the restaurant
 * than the basket did — a name and a prep time in one grey line, the exact
 * shape this card replaced. A customer should not have to go back a screen to
 * check which address they are collecting from before they pay.
 *
 * **A branch, not a restaurant.** Everything below `branch` is per-address:
 * `Dolmama` is two kitchens on two streets, and the one this basket is priced
 * against is the only one whose address and opening state mean anything. See
 * the caller for how it is fetched.
 *
 * The whole card is the link, as `RestaurantCard` is — it is the route back to
 * the menu, and a name-sized target for it would be the smallest thing on the
 * screen. The heart is the one thing beside it, and only where `favorite` is
 * given: see that prop.
 */
interface Props {
  restaurant: {
    name: string;
    cuisine: string | null;
    priceLevel: number | null;
    rating: number;
    reviewsCount: number;
    coverUrl: string | null;
    branch: {
      name: string | null;
      address: string | null;
      city: string | null;
      isOpen: boolean;
    };
  };
  language: Language;
  /** Where the menu is — the caller owns the URL, since only it knows whether
   *  the basket was collected by slug or by branch id. */
  href: string;
  /**
   * How long *this basket* takes, not how long the branch usually takes.
   *
   * The quote prices the dishes that are actually in it, so a basket of one
   * drink and a basket of four grills report different numbers and both are
   * true. `branch.prepMin` is the restaurant's general answer and belongs on
   * the catalogue, where there is no basket to be specific about.
   *
   * **Omitted where there is no basket to time.** A checkout holding a table
   * and no food has no quote, and the branch's general figure is not a
   * substitute — it would promise a wait for an order nobody has placed. The
   * tag is dropped rather than filled with a number that means nothing.
   */
  prepMin?: number;
  /**
   * The heart, where the screen wants one.
   *
   * **Optional, and absent on the checkout.** The basket is a screen somebody
   * is still browsing from — the card is the way back to the menu, and saving
   * the place you are ordering from is a reasonable thing to want there. The
   * checkout is the screen where money is committed, and a control that
   * quietly writes to the account beside the button that charges the card is
   * one press away from being the wrong one. So the same card draws a heart on
   * `/cart` and none on `/checkout`.
   *
   * Carries `branchId`, like everything else on this card: a favourite is one
   * address (DATABASE.md §13), and this card is about one address.
   */
  favorite?: {
    branchId: string;
    isFavorite: boolean;
    /** Where the press returns to — and where sign-in comes back to. */
    returnTo: string;
  };
}

export function BranchCard({ restaurant, language, href, prepMin, favorite }: Props) {
  const label = t(language);

  // Joined from a list, so a restaurant with no cuisine or no price level
  // leaves no stray separator — the same shape `RestaurantCard` uses.
  const meta = [restaurant.cuisine, formatPriceLevel(restaurant.priceLevel)]
    .filter(Boolean)
    .join(' · ');

  // The address is the useful one; the branch's own name ("Republic Square") and
  // then the city stand in when a branch has not been given one.
  const where = restaurant.branch.address ?? restaurant.branch.name ?? restaurant.branch.city;

  return (
    // The row is the container and the link is the item that fills it, rather
    // than the link being the row — a <form> is interactive content and may not
    // sit inside an <a>, so the heart has to be the link's sibling. Same
    // restructure `RestaurantCard` needed, done as a flex item here because
    // this card is a row with a place to put one, not a photo to float over.
    <div className="branch-card">
      <Link className="branch-link" href={href}>
        <div className={restaurant.coverUrl ? 'media' : 'media ph'}>
          {restaurant.coverUrl && <img src={restaurant.coverUrl} alt="" />}
        </div>

        <div className="who">
          <div className="name">{restaurant.name}</div>
          {meta && <div className="meta">{meta}</div>}
          <div className="tags">
            {prepMin !== undefined && (
              <span className="tag prep">
                ⏱ {prepMin} {label('minutes')}
              </span>
            )}
            {where && <span className="tag where">📍 {where}</span>}
            <span className={restaurant.branch.isOpen ? 'tag good' : 'tag'}>
              {restaurant.branch.isOpen ? label('open') : label('closed')}
            </span>
          </div>
        </div>

        <div className="rating">
          <div className="value">
            <span className="star">★</span> {formatRating(restaurant.rating)}
          </div>
          <div className="reviews">
            {restaurant.reviewsCount} {label('reviews')}
          </div>
        </div>
      </Link>

      {favorite && (
        <form className="fav-form in-row" action={toggleFavorite}>
          <input type="hidden" name="lang" value={language} />
          <input type="hidden" name="branchId" value={favorite.branchId} />
          <input type="hidden" name="favorited" value={favorite.isFavorite ? '1' : '0'} />
          <input type="hidden" name="returnTo" value={favorite.returnTo} />
          <button
            type="submit"
            className={favorite.isFavorite ? 'fav on' : 'fav'}
            aria-label={`${label(favorite.isFavorite ? 'removeFavorite' : 'addFavorite')} — ${restaurant.name}`}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
                fill={favorite.isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      )}

      {/* Decoration: the row is already a link, and "chevron" is not worth
          announcing to anyone who cannot see it. Outside the link now, so it
          stays at the row's edge with the heart between it and the rating. */}
      <span className="chev" aria-hidden="true">
        ›
      </span>
    </div>
  );
}
