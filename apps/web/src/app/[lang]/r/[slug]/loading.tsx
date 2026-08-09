import {
  SkeletonBanner,
  SkeletonChips,
  SkeletonDishes,
  SkeletonHeading,
  SkeletonPanel,
  SkeletonScreen,
} from '@/components/Skeleton';

/**
 * A restaurant, while its page and its menu are read.
 *
 * The slowest move on the site and the one that matters most: it is two API
 * calls, and it is what a card on the home page opens. Drawn down to the
 * `1fr 380px` split, so the menu and the order panel are already where they
 * will be when they arrive.
 */
export default function RestaurantLoading() {
  return (
    <SkeletonScreen>
      <div className="skel skel-back" />
      <SkeletonBanner />

      <div className="rest-grid">
        <div>
          <div className="rest-head">
            <div>
              <SkeletonHeading title />
              <div className="tags">
                <span className="skel skel-tag" />
                <span className="skel skel-tag" />
                <span className="skel skel-tag" />
              </div>
            </div>
            <div className="skel skel-score" />
          </div>

          <SkeletonChips count={4} tabs />
          <SkeletonDishes />
        </div>

        <SkeletonPanel rows={5} />
      </div>
    </SkeletonScreen>
  );
}
