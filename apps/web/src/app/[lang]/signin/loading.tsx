import { SkeletonScreen } from '@/components/Skeleton';

/**
 * The sign-in card, while the page behind it is resolved.
 *
 * The card is a fixed 440px panel whatever it ends up holding — a phone field
 * or a code field — so it is drawn as itself and only its contents stand in.
 */
export default function SignInLoading() {
  return (
    <SkeletonScreen>
      <div className="auth-page">
        <div className="auth-card">
          <div className="skel skel-heading" />
          <div className="skel skel-line" />
          <div className="skel skel-input" />
          <div className="skel skel-cta" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
