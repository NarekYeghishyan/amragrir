import { SkeletonHeading, SkeletonPanel, SkeletonScreen } from '@/components/Skeleton';

/**
 * One order's tracking screen, while it is read.
 *
 * The page it stands in for is a narrow centred column — the state mark, the
 * countdown, then the money — so these are centred with it rather than laid
 * out across the full width.
 */
export default function OrderLoading() {
  return (
    <SkeletonScreen>
      <div className="tracking">
        <div className="skel skel-mark" />
        <SkeletonHeading title />
        <SkeletonPanel rows={4} />
      </div>
    </SkeletonScreen>
  );
}
