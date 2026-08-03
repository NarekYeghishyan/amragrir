import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';
import { BrandMark, Wordmark } from './Brand';

/**
 * Site footer, transcribed from the web design artifact (refreshed 2026-08-03).
 *
 * The refresh rebuilt the brand column: the logo and wordmark now open it, a
 * row of social marks closes it, and the copyright line moved *inside* the
 * container as a rule-separated bottom bar rather than sitting outside as its
 * own block. Column headings also went from `--ink3` to full `--ink`, which is
 * what stops the three lists reading as one grey wash.
 *
 * The column items render as **plain text, not links**. Every destination the
 * design lists — About us, Careers, Gift cards, Terms — is a page that does
 * not exist yet, and a footer of dead links on the one app built for crawlers
 * is worse than a footer of labels. They become links when the pages do.
 *
 * The social marks follow the same rule for the same reason, and are
 * `aria-hidden` on top of it: three emoji with no destination are decoration,
 * and announcing "camera, blue book, aeroplane" to a screen reader is worse
 * than announcing nothing. They become real links, with real labels, when
 * there are accounts to point them at.
 */
export function Footer({ language }: { language: Language }) {
  const label = t(language);

  const columns = [
    { head: label('footCompany'), items: label('footCompanyItems') },
    { head: label('footForYou'), items: label('footForYouItems') },
    { head: label('footSupport'), items: label('footSupportItems') },
  ];

  return (
    <footer className="site-footer">
      <div className="foot-inner">
        <div className="foot-grid">
          <div className="foot-brand">
            <div className="foot-logo">
              <BrandMark />
              <Wordmark />
            </div>
            <p className="foot-blurb">{label('footBlurb')}</p>
            <div className="foot-social" aria-hidden="true">
              {['📷', '📘', '✈️'].map((mark) => (
                <span key={mark} className="foot-social-mark">
                  {mark}
                </span>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.head} className="foot-col">
              <div className="foot-head">{column.head}</div>
              <ul>
                {column.items.split(',').map((item) => (
                  <li key={item.trim()}>{item.trim()}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="foot-bottom">
          <span>{label('footCopyright')}</span>
          {/* The flag is decoration beside the words that already say it. */}
          <span className="foot-made">
            <span aria-hidden="true">🇦🇲</span>
            {label('footMadeIn')}
          </span>
        </div>
      </div>
    </footer>
  );
}
