import Link from 'next/link';
import { RestaurantService, type Language } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import { t } from '@/lib/language';
import { formatDistance, formatPriceLevel, formatRating } from '@/lib/format';
import { restaurantPath } from '@/lib/site';
import { toggleFavorite } from '@/app/[lang]/actions';
import { DishSlider } from '@/components/DishSlider';
import type { CardDish } from '@/lib/api';

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
    /** The branch this card describes — what the heart saves, and what its
     *  opening state and prep time belong to. See `toggleFavorite`. */
    id: string;
    /** The business behind it, which owns the name, cuisine and rating. */
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
    /**
     * Which branch this is, where the caller knows.
     *
     * A listing row does not: `/restaurants` reports a distance rather than an
     * address, because a card there answers "how far" and not "where". The
     * favourites grid does, and needs to — two branches of one chain are two
     * cards, and without a street they are the same card drawn twice.
     */
    address?: string | null;
    /**
     * The dishes that matched an active category filter.
     *
     * Absent means no filter is on and the card wears its cover. Present means
     * the guest asked for sushi, and a photograph of the dining room is the
     * wrong answer to that — so the matching plates take the cover's place.
     * Empty means the filter is on and every match is sold out tonight, which
     * is a card still worth showing, wearing its cover again.
     */
    dishes?: CardDish[];
  };
  language: Language;
  /** Whether this account has saved it. Always false for a visitor who is not
   *  signed in — the heart is still drawn, and pressing it signs them in. */
  isFavorite?: boolean;
  /**
   * Which **dishes** this account has saved, of the ones in `dishes`.
   *
   * Given, the slider draws a heart on each plate and the card's own heart is
   * not drawn while the plates are showing: under a filter the card is about the
   * food, and one heart per subject is the whole point. Absent, the card keeps
   * its branch heart — a screen that cannot save dishes should not draw controls
   * that pretend to.
   */
  savedDishes?: string[];
  /** Where the heart posts back to, so the press returns to this listing. */
  returnTo: string;
  /**
   * Where the card leads, when the restaurant's canonical page is not it.
   *
   * Defaults to `/r/{slug}`, which is the page this site publishes and the one
   * every listing should link. The favourites grid overrides it with the branch
   * that was actually saved: a slug resolves to the oldest branch, so a saved
   * second branch would otherwise open a page about a different street — with a
   * hollow heart on it.
   */
  href?: string;
}

export function RestaurantCard({
  restaurant,
  language,
  isFavorite = false,
  savedDishes,
  returnTo,
  href,
}: Props) {
  const label = t(language);

  // Built as a list and joined, so a missing field leaves no stray separator.
  const meta = [
    restaurant.cuisine,
    formatPriceLevel(restaurant.priceLevel ?? null),
    formatDistance(restaurant.distanceKm ?? null),
    restaurant.address,
  ].filter(Boolean);

  const page = href ?? restaurantPath(language, restaurant.slug);
  const dishes = restaurant.dishes ?? [];
  /** Whether the plates on this card carry their own hearts. When they do, the
   *  card's heart stands down: the subject on screen is the dish. */
  const dishHearts = dishes.length > 0 && savedDishes !== undefined;

  return (
    // An <article> rather than the link itself, because the card now holds two
    // controls: the link into the restaurant, and the heart. A <form> is
    // interactive content and may not live inside an <a>, so the two are
    // siblings and the heart is positioned over the photo.
    <article className={dishes.length > 0 ? 'card rise card--strip' : 'card rise'}>
      {/* Under a category filter the cover gives way to the dishes that matched
          it — and they are *not* inside the card's link, because each is a link
          of its own into the menu at that dish. Nested anchors are invalid HTML
          and the browser would drop one of them, so the slider sits outside and
          the card's own link stays wrapped around the name and the meta. */}
      {dishes.length > 0 ? (
        <div className="card-strip">
          <DishSlider
            dishes={dishes}
            href={page}
            labels={{
              prev: label('sliderPrev'),
              next: label('sliderNext'),
              goTo: label('sliderGoTo'),
            }}
            favorite={
              savedDishes === undefined
                ? undefined
                : {
                    language,
                    returnTo,
                    saved: savedDishes,
                    labels: {
                      add: label('addFavoriteDish'),
                      remove: label('removeFavoriteDish'),
                    },
                  }
            }
          />

          {/* The two badges the cover carries, kept exactly where they were.
              They sit over the *frame* rather than inside a slide, so they stay
              put while the photographs move under them — and `pointer-events`
              are off, or they would swallow a press meant for the dish. The
              category chip they answer to is lit at the top of the page; a
              third badge repeating it on every card would be the page saying
              the same word twenty times. */}
          <span
            className={restaurant.isOpen ? 'badge status open' : 'badge status closed'}
            aria-hidden="true"
          >
            <span className="dot" />
            {restaurant.isOpen ? label('open') : label('closed')}
          </span>
          <span className="badge rating" aria-hidden="true">
            <span className="star">★</span>
            {formatRating(restaurant.rating)}
          </span>
        </div>
      ) : null}

      <Link className="card-link" href={page}>
        {dishes.length === 0 && (
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
        )}

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
          the press meant to go.

          Not drawn while the plates are: each slide has its own heart then, and
          two hearts in one corner — one for the dish, one for the address —
          would be a card asking somebody to aim. The restaurant is still savable
          from its own page, where the cover is what the heart sits on. */}
      {!dishHearts && (
        <form className="fav-form" action={toggleFavorite}>
          <input type="hidden" name="lang" value={language} />
          <input type="hidden" name="branchId" value={restaurant.id} />
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
      )}
    </article>
  );
}
