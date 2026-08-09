import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LANGUAGES, parseLanguage, t } from '@/lib/language';
import {
  SITE_URL,
  basketApiPath,
  cartPath,
  geocodeApiPath,
  homePath,
  notificationsApiPath,
  notificationsStreamPath,
  ordersPath,
  profilePath,
  searchPath,
} from '@/lib/site';
import { BrandMark, Wordmark } from '@/components/Brand';
import { AREAS } from '@/lib/locations';
import { LocationPicker } from '@/components/LocationPicker';
import { SearchBar } from '@/components/SearchBar';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Footer } from '@/components/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { THEME_KEY } from '@/lib/theme';
import { BasketButton } from '@/components/BasketButton';
import { NotificationBell, type StatusCopy } from '@/components/NotificationBell';
import { RouteProgress } from '@/components/RouteProgress';
import { ORDER_STATUS_COPY } from '@/lib/notification-watch';
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

  // The eight status sentences, resolved here so the bell can draw a line
  // without the three dictionaries being shipped to the browser to do it.
  const statusCopy = Object.fromEntries(
    Object.entries(ORDER_STATUS_COPY).map(([status, keys]) => [
      status,
      { title: label(keys.title), body: label(keys.body) },
    ]),
  ) as StatusCopy;

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
        {/* Says a page is on its way, from the frame the link is pressed —
            every screen here is server-rendered, so without it the browser
            shows the old page unchanged and the press looks lost. What fills
            the page itself is each route's `loading.tsx`. */}
        <RouteProgress label={label('loading')} />
        <header className="site">
          <div className="inner">
            {/* The visible mark is the logotype; the translated name is the
                link's accessible name, so a screen reader still says
                "Ամրագրիր" where the eye reads "amragrir.am". */}
            <Link className="brand" href={homePath(language)} aria-label={label('brand')}>
              <BrandMark />
              <Wordmark />
            </Link>
            {/* The design's location control. Translated here and handed over as
                strings: it renders in the browser (see the component) and has no
                dictionary there. */}
            {/* One key, and it never leaves this process. The map is Yandex's
                widget in a frame and takes no key at all; the geocoder's cannot
                be restricted to a domain, so the browser is told only whether
                there is one and calls this app's own route for the answers.
                Without it the picker still takes any point on the map — the
                point is named after the nearest district instead of by its
                address. */}
            <LocationPicker
              language={language}
              canGeocode={Boolean(process.env.YANDEX_GEOCODER_API_KEY)}
              geocodeEndpoint={geocodeApiPath(language)}
              labels={{
                all: label('locAllCity'),
                heading: label('chooseLocation'),
                hint: label('chooseLocationHint'),
                close: label('locClose'),
                searchAddress: label('locSearchAddress'),
                searching: label('locSearching'),
                noMatches: label('locNoMatches'),
                searchFailed: label('locSearchFailed'),
                recent: label('locRecent'),
                pickOnMap: label('locPickOnMap'),
                map: label('locMap'),
                mapCredit: label('locMapCredit'),
                zoomIn: label('locZoomIn'),
                zoomOut: label('locZoomOut'),
                useCurrent: label('locUseCurrent'),
                confirm: label('locConfirm'),
                geoFailed: label('locGeoFailed'),
                areas: Object.fromEntries(
                  AREAS.map((area) => [area.id, label(area.labelKey)]),
                ),
              }}
            />
            <SearchBar
              action={searchPath(language)}
              placeholder={label('searchPlaceholder')}
              label={label('search')}
            />
            {/* Links this page in each language, so a switch is a translation
                and not a trip back to the home page. It needs the current path,
                which a layout is never given — see the component. */}
            <LanguageSwitch language={language} label={label('language')} />
            <ThemeToggle label={label('theme')} />
            {/* The design's header basket, money and all. Drawn in the browser
                on purpose — see BasketButton for why neither the count nor the
                total can be read here. */}
            <BasketButton
              href={cartPath(language)}
              endpoint={basketApiPath(language)}
              label={label('basket')}
            />
            {/* Tells whoever is signed in that their order moved, on whatever
                page they are on. Draws nothing for a signed-out visitor, and
                nothing at all without JavaScript — see the component. */}
            <NotificationBell
              endpoint={notificationsApiPath(language)}
              streamEndpoint={notificationsStreamPath(language)}
              ordersBase={ordersPath(language)}
              labels={{
                bell: label('notifications'),
                empty: label('noNotifications'),
                hint: label('notificationsHint'),
                enableAlerts: label('enableAlerts'),
                alertsOn: label('alertsOn'),
                remove: label('deleteNotification'),
                clearAll: label('clearNotifications'),
              }}
              statusCopy={statusCopy}
            />
            {/* The artifact draws the account's initial here. This header cannot
                know it: the session is httpOnly by design, and reading it would
                cost the whole catalogue its pre-rendering. A neutral mark is the
                honest version — `/profile` asks whoever presses it to sign in. */}
            <Link className="avatar-link" href={profilePath(language)} aria-label={label('navProfile')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="3.6" stroke="#fff" strokeWidth="2" />
                <path
                  d="M5 20c0-3.3 3.1-5.4 7-5.4s7 2.1 7 5.4"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <Footer language={language} />
      </body>
    </html>
  );
}
