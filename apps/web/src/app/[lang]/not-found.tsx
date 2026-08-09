import Link from 'next/link';
import { Language } from '@amragrir/shared';
import { t } from '@/lib/language';
import { homePath } from '@/lib/site';

/**
 * A not-found page cannot read the route params that produced it, so it shows
 * the default language. Getting the language right here would mean reading
 * headers and giving up static rendering for every page in the tree — a poor
 * trade for one error page.
 *
 * The glyph between the two fours is the artifact's own cloche, on the disc it
 * draws it on. Decorative, so `aria-hidden`: the heading below already says
 * what happened, and "four plate four" read aloud is noise.
 */
export default function NotFound() {
  const label = t(Language.Hy);

  return (
    <section className="notfound">
      <div className="nf-mark" aria-hidden="true">
        <span className="digit">4</span>
        <span className="disc">
          <svg width="76" height="76" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 5h16M6 5c0 5 2 8 6 8s6-3 6-8M8 19h8M12 13v6"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="digit">4</span>
      </div>

      <h1>{label('notFound')}</h1>
      <p className="nf-sub">{label('notFoundHint')}</p>
      <Link className="cta-action" href={homePath(Language.Hy)}>
        {label('notFoundCta')}
      </Link>
    </section>
  );
}
