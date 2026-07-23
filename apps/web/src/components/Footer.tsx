import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';

/**
 * Site footer, transcribed from the web design artifact.
 *
 * The column items render as **plain text, not links**. Every destination the
 * design lists — About us, Careers, Gift cards, Terms — is a page that does
 * not exist yet, and a footer of dead links on the one app built for crawlers
 * is worse than a footer of labels. They become links when the pages do.
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
        <div className="foot-brand">
          <div className="brand">{label('brand')}</div>
          <p className="muted">{label('footBlurb')}</p>
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
        <span className="faint">{label('footCopyright')}</span>
        <span className="faint">{label('footMadeIn')}</span>
      </div>
    </footer>
  );
}
