import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import { SITE_URL, cartPath, homePath, searchPath } from '@/lib/site';
import { BrandMark, Wordmark } from '@/components/Brand';
import { SearchBar } from '@/components/SearchBar';
import { Footer } from '@/components/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { THEME_KEY } from '@/lib/theme';
import { BasketButton } from '@/components/BasketButton';
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
  modal,
  params,
}: {
  children: ReactNode;
  /** The intercepted checkout drawer, or nothing. See `@modal/default.tsx`. */
  modal: ReactNode;
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
            {/* The visible mark is the logotype; the translated name is the
                link's accessible name, so a screen reader still says
                "Ամրագրիր" where the eye reads "amragrir.am". */}
            <Link className="brand" href={homePath(language)} aria-label={label('brand')}>
              <BrandMark />
              <Wordmark />
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
            {/* The design's header basket. Drawn in the browser on purpose —
                see BasketButton for why the count cannot be read here. */}
            <BasketButton href={cartPath(language)} label={label('basket')} />
          </div>
        </header>
        <main className="wrap">{children}</main>
        {modal}
        <Footer language={language} />
      </body>
    </html>
  );
}
