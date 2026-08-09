import { SkeletonHeading, SkeletonPanel, SkeletonScreen } from '@/components/Skeleton';

/**
 * Checkout, while the basket, the slots and the branch's hours are read.
 *
 * The most expensive read on the site — mode, timing and payment are one page
 * now, and it cannot draw any of them until it knows what is in the basket and
 * when the kitchen can have it. Three blocks on the left, the summary on the
 * right, as the page arrives.
 */
export default function CheckoutLoading() {
  return (
    <SkeletonScreen className="screen screen--checkout">
      <div className="skel skel-back" />
      <SkeletonHeading title />

      <div className="checkout-grid">
        <div>
          <SkeletonPanel rows={2} />
          <SkeletonPanel rows={3} />
          <SkeletonPanel rows={3} />
        </div>
        <SkeletonPanel rows={5} />
      </div>
    </SkeletonScreen>
  );
}
