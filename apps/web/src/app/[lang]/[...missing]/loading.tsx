import { SkeletonHeading, SkeletonScreen, SkeletonText } from '@/components/Skeleton';

/**
 * Everything under a language prefix that is not a page.
 *
 * What this segment renders is a 404, so there is nothing to lay out in
 * advance — this exists to stop the miss borrowing the home page's skeleton
 * and promising a catalogue that is not coming.
 */
export default function MissingLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHeading title />
      <SkeletonText />
    </SkeletonScreen>
  );
}
