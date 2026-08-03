import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { parseLanguage } from '@/lib/language';
import { loadBasket } from '@/lib/basket';
import { CheckoutPanel } from '@/components/CheckoutPanel';
import { ORDER_ROBOTS, cartPath, checkoutPath, signinPath } from '@/lib/site';

export const metadata: Metadata = { title: 'Checkout', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Checkout as a full page.
 *
 * The drawer in `@modal/(.)checkout` renders the same component; this is what
 * a direct visit, a reload, or a browser without JavaScript gets.
 */
export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }

  const basket = await loadBasket(language, checkoutPath(language));
  if (!basket) {
    redirect(cartPath(language));
  }

  // Paying needs a verified phone, and finding that out *after* someone has
  // chosen a card is worse than asking first.
  if (!basket.session.verified) {
    redirect(signinPath(language, checkoutPath(language)));
  }

  return (
    <CheckoutPanel
      language={language}
      cart={basket.cart}
      quote={basket.quote}
      error={typeof sp.error === 'string' ? sp.error : undefined}
      closeHref={cartPath(language)}
    />
  );
}
