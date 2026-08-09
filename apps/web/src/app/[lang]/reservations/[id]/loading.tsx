import {
  SkeletonHeading,
  SkeletonPanel,
  SkeletonScreen,
  SkeletonText,
} from '@/components/Skeleton';

/** One booking, while it is read: when, how many, and what the deposit covers. */
export default function ReservationLoading() {
  return (
    <SkeletonScreen>
      <div className="skel skel-back" />
      <SkeletonHeading title />
      <SkeletonText lines={1} />
      <SkeletonPanel rows={4} />
    </SkeletonScreen>
  );
}
