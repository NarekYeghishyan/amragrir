import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { SITE_URL, homePath, searchPath } from '@/lib/site';
import { SearchBar } from '@/components/SearchBar';
import { Footer } from '@/components/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { THEME_KEY } from '@/lib/theme';
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
    // suppressHydrationWarning: the script below sets data-theme on <html>
    // before React hydrates, which would otherwise be flagged as a mismatch.
    <html lang={language} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before the first paint. Anything later —
            an effect, a component — flashes the wrong theme for a frame. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <header className="site">
          <div className="inner">
            <Link className="brand" href={homePath(language)}>
              {label('brand')}
            </Link>
            <SearchBar
              action={searchPath(language)}
              placeholder={label('searchPlaceholder')}
              label={label('search')}
            />
            <nav className="langs" aria-label="Language">
              {LANGUAGES.map((code) => (
                <Link
                  key={code}
                  className={code === language ? 'lang current' : 'lang'}
                  href={homePath(code)}
                  hrefLang={code}
                >
                  {code.toUpperCase()}
                </Link>
              ))}
            </nav>
            <ThemeToggle label={label('theme')} />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <Footer language={language} />
      </body>
    </html>
  );
}
