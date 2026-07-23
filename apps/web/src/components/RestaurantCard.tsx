import Link from 'next/link';
import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';
import { formatDistance, formatPriceLevel, formatRating } from '@/lib/format';
import { restaurantPath } from '@/lib/site';

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
  };
  language: Language;
}

export function RestaurantCard({ restaurant, language }: Props) {
  const label = t(language);

  // Built as a list and joined, so a missing field leaves no stray separator.
  const meta = [
    restaurant.cuisine,
    formatPriceLevel(restaurant.priceLevel ?? null),
    restaurant.prepMin === null ? null : `${restaurant.prepMin} ${label('minutes')}`,
    formatDistance(restaurant.distanceKm ?? null),
  ].filter(Boolean);

  return (
    <Link className="card" href={restaurantPath(language, restaurant.slug)}>
      <div className="name">{restaurant.name}</div>
      <div className="meta">
        ★ {formatRating(restaurant.rating)}{' '}
        <span className="faint">
          ({restaurant.reviewsCount} {label('reviews')})
        </span>
      </div>
      {meta.length > 0 && <div className="meta">{meta.join(' · ')}</div>}
      <div style={{ marginTop: 10 }}>
        <span className={restaurant.isOpen ? 'badge open' : 'badge closed'}>
          {restaurant.isOpen ? label('open') : label('closed')}
        </span>
      </div>
    </Link>
  );
}
