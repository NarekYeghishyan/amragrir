import { SkeletonCards, SkeletonHeading, SkeletonScreen } from '@/components/Skeleton';

/** The saved restaurants, while the account's list is read. */
export default function FavoritesLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHeading title />
      <SkeletonCards count={3} />
    </SkeletonScreen>
  );
}
