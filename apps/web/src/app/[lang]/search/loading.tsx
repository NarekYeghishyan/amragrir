import { SkeletonCards, SkeletonHeading, SkeletonScreen } from '@/components/Skeleton';

/**
 * Search results, while the query is being run.
 *
 * The query itself is the `h1`, and it is known before the search finishes —
 * but a `loading.tsx` is handed no params, so it stands in for it like
 * everything else. Three cards, not six: results are usually a short list, and
 * a screen of placeholders that empties down to two is worse than one that
 * fills out.
 */
export default function SearchLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHeading title />
      <SkeletonHeading />
      <SkeletonCards count={3} />
    </SkeletonScreen>
  );
}
