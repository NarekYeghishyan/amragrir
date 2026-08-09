import { SkeletonHeading, SkeletonRows, SkeletonScreen } from '@/components/Skeleton';

/**
 * The order history, while both halves of it are read.
 *
 * Two lists, as the page has them: what is cooking now, and what is done. Both
 * are fetched before either is drawn, so the section headings stand in too.
 */
export default function OrdersLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHeading title />

      <SkeletonHeading />
      <SkeletonRows count={2} />

      <SkeletonHeading />
      <SkeletonRows count={3} />
    </SkeletonScreen>
  );
}
