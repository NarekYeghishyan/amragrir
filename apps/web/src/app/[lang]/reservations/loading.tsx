import { SkeletonHeading, SkeletonRows, SkeletonScreen } from '@/components/Skeleton';

/** The table bookings, upcoming and past, while both are read. */
export default function ReservationsLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHeading title />

      <SkeletonHeading />
      <SkeletonRows count={2} />

      <SkeletonHeading />
      <SkeletonRows count={2} />
    </SkeletonScreen>
  );
}
