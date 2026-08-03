import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';

/**
 * The landing hero, transcribed from the web design artifact.
 *
 * A gradient panel rather than bare page text: the artifact's home screen opens
 * on it, and it is the only place the accent is used at that size. The two
 * translucent discs bleeding off its corner are drawn in CSS — they carry no
 * meaning and do not belong in the markup a crawler reads.
 *
 * The CTA is an in-page anchor rather than a scroll handler: it works with
 * JavaScript off, and it is the restaurant list — the thing the page is for —
 * that it points at.
 */
export function Hero({ language }: { language: Language }) {
  const label = t(language);

  return (
    <section className="hero rise">
      <div className="hero-body">
        <span className="promo-tag">⚡ {label('promoTag')}</span>
        <h1>{label('heroTitle')}</h1>
        <p className="hero-sub">{label('heroSub')}</p>
        <a className="cta-primary" href="#restaurants">
          {label('orderAhead')} →
        </a>
      </div>
    </section>
  );
}
