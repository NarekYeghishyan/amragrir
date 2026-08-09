'use client';

import type { OrderStatus } from '@amragrir/shared';
import { TRACKER_STEPS, stepIndex } from '@/lib/order-status';
import { useLiveOrder } from './OrderLive';

/**
 * Confirmed → Preparing → Almost ready → Ready, following the kitchen.
 *
 * The four words on this line are the answer to the only question the page is
 * open for, and they are changed by somebody in the back office pressing a
 * button. So they move here, in place, as soon as the watcher above hears about
 * it — no reload, no navigation, nothing else on the screen touched.
 *
 * **The labels come from the server already translated.** The tracker's steps
 * are statuses, and naming a status is `ORDER_STATUS_LABEL`'s job in the
 * language the page was rendered in; shipping a translation table to the
 * browser to re-do that would be a second place for `hy` to go wrong.
 *
 * `status` is the server's own reading, used until the first poll answers — so
 * the first client render is the markup that was sent, and a page with no
 * JavaScript is exactly the page as it always was.
 */
export function OrderSteps({
  labels,
  status,
}: {
  /** One per `TRACKER_STEPS`, in that order. */
  labels: string[];
  status: OrderStatus;
}) {
  const live = useLiveOrder();
  const reached = stepIndex(live?.status ?? status);

  return (
    <>
      <ol className="steps">
        {TRACKER_STEPS.map((step, index) => (
          <li key={step} className={index <= reached ? 'step done' : 'step'}>
            {labels[index]}
          </li>
        ))}
      </ol>
      {/* The step used to change only when the page reloaded, which a screen
          reader announces by starting the page again. Now it changes under a
          reader who may never look at it, so the step it moved to is said —
          the same word the line above shows, and no new string to translate.
          Polite: worth knowing, not worth interrupting. */}
      <p className="visually-hidden" aria-live="polite">
        {reached >= 0 ? (labels[reached] ?? '') : ''}
      </p>
    </>
  );
}
