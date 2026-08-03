import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { parseLanguage, t } from '@/lib/language';
import { loadBasket } from '@/lib/basket';
import { CheckoutPanel } from '@/components/CheckoutPanel';
import { cartPath, checkoutPath, signinPath } from '@/lib/site';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Checkout as the design's slide-over.
 *
 * An *intercepting* route: reaching `/[lang]/checkout` by clicking renders this
 * over whatever page the visitor was on, as the artifact draws it. Loading the
 * same URL directly — a reload, a pasted link, JavaScript disabled — skips the
 * interception and renders `checkout/page.tsx` instead. Same component, same
 * URL, so the drawer is a real page rather than a state that vanishes on
 * refresh.
 */
export default async function CheckoutModal({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }

  const basket = await loadBasket(language, checkoutPath(language));
  if (!basket) {
    redirect(cartPath(language));
  }
  if (!basket.session.verified) {
    redirect(signinPath(language, checkoutPath(language)));
  }

  const label = t(language);

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label={label('checkout')}>
      {/* The scrim is a link, not a click handler: dismissing the drawer means
          going back to the page underneath, which is a navigation. */}
      <Link className="drawer-scrim" href={cartPath(language)} aria-label={label('backHome')} />
      <div className="drawer-panel">
        <CheckoutPanel
          language={language}
          cart={basket.cart}
          quote={basket.quote}
          error={typeof sp.error === 'string' ? sp.error : undefined}
          closeHref={cartPath(language)}
        />
      </div>
    </div>
  );
}
