import { notFound, redirect } from 'next/navigation';
import { parseLanguage } from '@/lib/language';
import { checkoutPath } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * The old "When & how" step, now part of checkout.
 *
 * The refreshed web artifact draws mode, timing and payment as one page, so
 * this screen was merged into `/[lang]/checkout`. The route stays as a redirect
 * rather than being deleted: it is where the basket page pointed for weeks, it
 * is in browser histories and bookmarks, and a 404 at the end of a half-built
 * order is a worse answer than the screen that now does the job.
 */
export default async function PreorderPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  redirect(checkoutPath(language));
}