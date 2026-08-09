import {
  SkeletonCards,
  SkeletonCats,
  SkeletonChips,
  SkeletonHero,
  SkeletonScreen,
  SkeletonSectionHead,
} from '@/components/Skeleton';

/**
 * The catalogue, while it is being read.
 *
 * This segment's `loading.tsx` covers the home page and nothing else — every
 * screen below it has one of its own, so none of them ever borrows this shape.
 *
 * It is what makes a press on this site feel like a press: with it, the router
 * swaps this in on the frame the link is pressed and the visitor is already on
 * the next page while its data is fetched. Without it the browser sits on the
 * old page until the server answers, which is the "did my click register"
 * everyone then answers by clicking again.
 */
export default function HomeLoading() {
  return (
    <SkeletonScreen>
      <SkeletonHero />
      <SkeletonCats />
      <SkeletonChips />
      <SkeletonSectionHead />
      <SkeletonCards />
    </SkeletonScreen>
  );
}
