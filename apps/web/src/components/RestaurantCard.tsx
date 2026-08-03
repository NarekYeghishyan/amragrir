import Link from 'next/link';
import { RestaurantService, type Language } from '@amragrir/shared';
import type { TranslationKey } from '@amragrir/i18n';
import { t } from '@/lib/language';
import { formatDistance, formatPriceLevel, formatRating } from '@/lib/format';
import { restaurantPath } from '@/lib/site';

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
}

export function RestaurantCard({ restaurant, language }: Props) {
  const label = t(language);

  // Built as a list and joined, so a missing field leaves no stray separator.
  const meta = [
    restaurant.cuisine,
    formatPriceLevel(restaurant.priceLevel ?? null),
    formatDistance(restaurant.distanceKm ?? null),
  ].filter(Boolean);

  return (
    <Link className="card rise" href={restaurantPath(language, restaurant.slug)}>
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
  );
}
