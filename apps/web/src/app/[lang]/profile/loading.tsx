import { SkeletonPanel, SkeletonRows, SkeletonScreen } from '@/components/Skeleton';

/**
 * The account screen, while its orders and counters are read.
 *
 * The gradient banner is drawn for real, as the home hero is: it needs no data
 * at all, and only the name and the counters on top of it are worth waiting
 * for. Below it the page's `1fr 380px` split — the order history on the left,
 * the account menu on the right.
 */
export default function ProfileLoading() {
  return (
    <SkeletonScreen>
      <section className="profile-hero skel-hero">
        <div className="skel avatar" />
        <div className="who">
          <div className="skel skel-line short" />
          <div className="skel name" />
        </div>
        <ul className="profile-stats">
          {[0, 1, 2].map((tile) => (
            <li key={tile}>
              <div className="skel skel-line" />
              <div className="skel skel-line short" />
            </li>
          ))}
        </ul>
      </section>

      <div className="profile-grid">
        <div>
          <SkeletonRows count={3} />
        </div>
        <SkeletonPanel rows={5} />
      </div>
    </SkeletonScreen>
  );
}
