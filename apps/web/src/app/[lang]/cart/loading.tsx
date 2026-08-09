import {
  SkeletonHeading,
  SkeletonLines,
  SkeletonPanel,
  SkeletonScreen,
} from '@/components/Skeleton';

/**
 * The basket, while it is re-priced.
 *
 * This screen never has its money ready: every amount on it comes back from
 * `POST /cart/quote`, so there is always a round trip between opening it and
 * seeing a total. On the basket's own narrower column, as the page is.
 */
export default function CartLoading() {
  return (
    <SkeletonScreen className="screen screen--basket">
      <div className="skel skel-back" />
      <SkeletonHeading title />

      <div className="basket-grid">
        <div>
          <SkeletonLines />
        </div>
        <SkeletonPanel rows={4} />
      </div>
    </SkeletonScreen>
  );
}
