'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LANGUAGES } from '@/lib/language';
import { translatedPath } from '@/lib/site';

interface Props {
  /** The language the page is being read in — the one drawn as current. */
  language: string;
  /** Translated by the layout: this component runs in the browser and has no
   *  dictionary there. */
  label: string;
}

/**
 * The header's hy/ru/en switch.
 *
 * Each link is **this page** in that language, not that language's home page.
 * The home page is where these used to point, which meant switching language
 * halfway down a menu cost you the menu.
 *
 * A client component only because the address is not knowable on the server: a
 * layout is given its `params`, never the path below it, and the way to get the
 * path there — reading the request's headers — would opt every pre-rendered
 * page out of static rendering, the same trade `BasketButton` and
 * `LocationPicker` describe. `usePathname()` costs nothing: it is known at build
 * time for a pre-rendered page and is whatever the browser shows after
 * hydration, and `translatedPath` reads both of the forms it can take.
 */
export function LanguageSwitch(props: Props) {
  return (
    // The query string is not part of a statically rendered page, so
    // `useSearchParams` bails out to the browser and Next requires the boundary
    // that says what to render meanwhile. The fallback is this same switch
    // without the query: pre-rendered HTML therefore carries real links to the
    // right page, which is what a crawler and a visitor without JavaScript get,
    // and the browser upgrades them to links that also keep `?q=…` and the home
    // filters.
    <Suspense fallback={<Links {...props} query="" />}>
      <WithQuery {...props} />
    </Suspense>
  );
}

function WithQuery(props: Props) {
  const query = useSearchParams().toString();
  return <Links {...props} query={query === '' ? '' : `?${query}`} />;
}

/**
 * Plain `<a>`, deliberately — **not** `next/link`.
 *
 * A language switch is the one navigation on this site that changes the
 * `[lang]` segment, and that is the one navigation React cannot do in place:
 * changing the segment remounts the root layout, React 19 re-acquires the
 * `<html>` singleton, and re-acquiring it **strips every attribute** before
 * re-applying the ones it rendered. `data-theme` is not one of those — the
 * pre-paint script in the layout sets it from `localStorage`, outside React —
 * so a client-side switch silently threw the visitor's chosen theme away and
 * left the page on whatever the operating system prefers. Choosing Russian on a
 * machine set to dark turned the page black.
 *
 * A document load re-runs that script before the first frame, which is where
 * the theme is meant to be applied anyway. It is also the honest thing to do
 * for this particular link: everything in the document changes language, down
 * to `<html lang>`, and Next itself hard-navigates when a root layout changes.
 * `language.spec.ts` guards it — the fault is invisible to a unit test and
 * "modernising" these back to `<Link>` would bring it straight back.
 */
function Links({ language, label, query }: Props & { query: string }) {
  const pathname = usePathname();

  return (
    <nav className="langs" aria-label={label}>
      {LANGUAGES.map((code) => (
        <a
          key={code}
          className={code === language ? 'lang current' : 'lang'}
          href={`${translatedPath(pathname, code)}${query}`}
          hrefLang={code}
        >
          {code.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
