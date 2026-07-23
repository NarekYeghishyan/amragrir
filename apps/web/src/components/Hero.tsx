import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';

/**
 * The landing hero, transcribed from the web design artifact.
 *
 * The CTA is an in-page anchor rather than a scroll handler: it works with
 * JavaScript off, and it is the restaurant list — the thing the page is for —
 * that it points at.
 */
export function Hero({ language }: { language: Language }) {
  const label = t(language);

  return (
    <section className="hero">
      <span className="promo-tag">{label('promoTag')}</span>
      <h1>{label('heroTitle')}</h1>
      <p className="hero-sub">{label('heroSub')}</p>
      <a className="cta-primary" href="#restaurants">
        {label('orderAhead')}
      </a>
    </section>
  );
}
