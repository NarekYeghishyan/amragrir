import Link from 'next/link';
import { RestaurantService, type Language } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import { t } from '@/lib/language';
import { formatDistance, formatPriceLevel, formatRating } from '@/lib/format';
import { restaurantPath } from '@/lib/site';
import { toggleFavorite } from '@/app/[lang]/actions';

/**
 * The service badges a restaurant advertises.
 *
 * Copy taken verbatim from the design artifact rather than translated afresh —
 * these are the artifact's own short forms ("Տանել", not the filter chip's
 * longer "Վերցնել"), and a card has room for the short one.
 */
const SERVICE_LABEL: Record<string, TranslationKey> = {
  [RestaurantService.Pickup]: 'svcPickup',
  [RestaurantService.DineIn]: 'svcDineIn',
  [RestaurantService.Reserve]: 'svcReserve',
};

interface Props {
  restaurant: {
    /** The business. `id` on a listing row is the *branch*, and a favourite is
     *  stored against the restaurant — see `toggleFavorite`. */
    restaurantId: string;
    slug: string;
    name: string;
    cuisine: string | null;
    rating: number;
    reviewsCount: number;
    priceLevel?: number | null;
    prepMin: number | null;
    isOpen: boolean;
    distanceKm?: number | null;
    coverUrl?: string | null;
    /** Absent from search results, which do not carry it. */
    services?: string[];
  };
  language: Language;
  /** Whether this account has saved it. Always false for a visitor who is not
   *  signed in — the heart is still drawn, and pressing it signs them in. */
  isFavorite?: boolean;
  /** Where the heart posts back to, so the press returns to this listing. */
  returnTo: string;
}

export function RestaurantCard({ restaurant, language, isFavorite = false, returnTo }: Props) {
  const label = t(language);

  // Built as a list and joined, so a missing field leaves no stray separator.
  const meta = [
    restaurant.cuisine,
    formatPriceLevel(restaurant.priceLevel ?? null),
    formatDistance(restaurant.distanceKm ?? null),
  ].filter(Boolean);

  return (
    // An <article> rather than the link itself, because the card now holds two
    // controls: the link into the restaurant, and the heart. A <form> is
    // interactive content and may not live inside an <a>, so the two are
    // siblings and the heart is positioned over the photo.
    <article className="card rise">
      <Link className="card-link" href={restaurantPath(language, restaurant.slug)}>
        <div className={restaurant.coverUrl ? 'media' : 'media ph'}>
          {restaurant.coverUrl && <img src={restaurant.coverUrl} alt="" loading="lazy" />}
          <span className={restaurant.isOpen ? 'badge status open' : 'badge status closed'}>
            <span className="dot" />
            {restaurant.isOpen ? label('open') : label('closed')}
          </span>
          <span className="badge rating">
            <span className="star">★</span>
            {formatRating(restaurant.rating)}
          </span>
        </div>

        <div className="body">
          <div className="name">{restaurant.name}</div>
          {meta.length > 0 && <div className="meta">{meta.join(' · ')}</div>}
          <div className="tags">
            {restaurant.prepMin !== null && (
              <span className="tag prep">
                ⏱ {restaurant.prepMin} {label('minutes')}
              </span>
            )}
            {restaurant.services?.map((service) =>
              SERVICE_LABEL[service] ? (
                <span key={service} className="tag">
                  {label(SERVICE_LABEL[service])}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </Link>

      {/* A form, not a client-side toggle: it writes to the account, and this
          keeps the heart working with JavaScript off like every other write in
          this app. The current state rides along so the action knows which way
          the press meant to go. */}
      <form className="fav-form" action={toggleFavorite}>
        <input type="hidden" name="lang" value={language} />
        <input type="hidden" name="restaurantId" value={restaurant.restaurantId} />
        <input type="hidden" name="favorited" value={isFavorite ? '1' : '0'} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {/* The label names the *action*, and changes with the state — so it
            carries what the filled heart shows, and there is no `aria-pressed`
            beside it. A toggle does one or the other: both together announces
            "remove from favourites, pressed", which is a riddle. */}
        <button
          type="submit"
          className={isFavorite ? 'fav on' : 'fav'}
          aria-label={`${label(isFavorite ? 'removeFavorite' : 'addFavorite')} — ${restaurant.name}`}
        >
          {/* One path, filled or merely stroked. Drawn rather than an emoji so
              it inherits the card's colours and matches the app's own heart. */}
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <path
              d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
              fill={isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </article>
  );
}
