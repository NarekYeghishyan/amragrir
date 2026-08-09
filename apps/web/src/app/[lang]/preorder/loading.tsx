import { SkeletonHeading, SkeletonScreen, SkeletonText } from '@/components/Skeleton';

/**
 * The old "when & how" step, which now only redirects to checkout.
 *
 * It renders no screen of its own — but the redirect is still a round trip,
 * and without this file the segment would borrow the home page's skeleton and
 * flash a catalogue that is not on its way. Two lines and a title: enough to
 * say something is happening, and shaped like nothing in particular, because
 * what arrives is another address entirely.
 */
export default function PreorderLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHeading title />
      <SkeletonText />
    </SkeletonScreen>
  );
}
