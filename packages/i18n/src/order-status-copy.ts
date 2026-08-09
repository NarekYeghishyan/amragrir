import { OrderStatus } from '@amragrir/shared';
import type { TranslationKey } from './index';

/**
 * Which dictionary keys draw a given order status.
 *
 * The exact keys the tracking screens already use, so the bell cannot describe
 * an order differently from the screen it links to — the alternative is two
 * sets of words for one fact, drifting apart one translation at a time.
 *
 * It lives here rather than in either client because **both** need it: the
 * customer bell is on the web header and in the mobile app, and an
 * `order` notification carries a status and no prose (see DATABASE.md §12 for
 * why the API stores no sentence). A copy per client is a copy to forget when a
 * ninth status arrives.
 *
 * A total record rather than munging `almost_ready` into `statusAlmostReady`:
 * adding that ninth status should be a compile error here, not a bell that
 * silently renders a raw enum value at somebody.
 */
export const ORDER_STATUS_COPY: Readonly<
  Record<OrderStatus, { title: TranslationKey; body: TranslationKey }>
> = {
  [OrderStatus.Created]: { title: 'statusCreated', body: 'statusCreatedDesc' },
  [OrderStatus.Paid]: { title: 'statusPaid', body: 'statusPaidDesc' },
  [OrderStatus.Confirmed]: { title: 'statusConfirmed', body: 'statusConfirmedDesc' },
  [OrderStatus.Preparing]: { title: 'statusPreparing', body: 'statusPreparingDesc' },
  [OrderStatus.AlmostReady]: { title: 'statusAlmostReady', body: 'statusAlmostReadyDesc' },
  [OrderStatus.Ready]: { title: 'statusReady', body: 'statusReadyDesc' },
  [OrderStatus.Completed]: { title: 'statusCompleted', body: 'statusCompletedDesc' },
  [OrderStatus.Cancelled]: { title: 'statusCancelled', body: 'statusCancelledDesc' },
} as const;
