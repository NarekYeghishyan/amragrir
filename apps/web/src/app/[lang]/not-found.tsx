import { Language } from '@amragrir/shared';
import { t } from '@/lib/language';
import { homePath } from '@/lib/site';

/**
 * A not-found page cannot read the route params that produced it, so it shows
 * the default language. Getting the language right here would mean reading
 * headers and giving up static rendering for every page in the tree — a poor
 * trade for one error page.
 */
export default function NotFound() {
  const label = t(Language.Hy);

  return (
    <>
      <h1>{label('notFound')}</h1>
      <p className="lede">{label('notFoundHint')}</p>
      <p>
        <a className="chip" href={homePath(Language.Hy)}>
          {label('backHome')}
        </a>
      </p>
    </>
  );
}
