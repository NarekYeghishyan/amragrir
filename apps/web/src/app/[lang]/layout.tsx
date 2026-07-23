import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { SITE_URL, homePath, searchPath } from '@/lib/site';
import '../globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Amragrir — order ahead in Yerevan',
    // Every page appends the brand, so a search result never shows a bare
    // restaurant name with no context.
    template: '%s · Amragrir',
  },
  description:
    'Pre-order food and book tables at restaurants in Yerevan. Browse menus and prices, order ahead, skip the queue.',
  openGraph: { siteName: 'Amragrir', type: 'website' },
};

/** Pre-renders all three language trees at build time. */
export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const language = parseLanguage(lang);
  // An unknown prefix is a 404 rather than a silent fallback: /de/r/x must not
  // quietly serve Armenian at a URL that would then get indexed.
  if (!language) {
    notFound();
  }

  const label = t(language);

  return (
    <html lang={language}>
      <body>
        <header className="site">
          <div className="inner">
            <a className="brand" href={homePath(language)}>
              {label('brand')}
            </a>
            <form className="searchbar" action={searchPath(language)} method="get" role="search">
              <input
                type="search"
                name="q"
                placeholder={label('searchPlaceholder')}
                aria-label={label('search')}
              />
              <button type="submit">{label('search')}</button>
            </form>
            <nav className="langs" aria-label="Language">
              {LANGUAGES.map((code) => (
                <a
                  key={code}
                  className={code === language ? 'lang current' : 'lang'}
                  href={homePath(code)}
                  hrefLang={code}
                >
                  {code.toUpperCase()}
                </a>
              ))}
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
