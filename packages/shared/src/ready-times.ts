/**
 * The times offered on the "food ready at" grid.
 *
 * The earliest is the server's — `earliestReadyAt` from `POST /cart/quote`,
 * which is now plus the kitchen's estimate. Everything after it is a
 * *pre-order*, which is the thing this product is named for.
 *
 * The list stays deliberately short and near. `POST /orders` refuses a time
 * outside the branch's opening hours or beyond `ORDER_MAX_LEAD_DAYS` with a
 * 422, and a picker that offers a time the server will refuse is a bug in the
 * picker — so this offers the next few hours of the current session rather
 * than guessing at a week of opening times the quote does not describe.
 * Choosing nothing sends no `readyAt` at all, which means "as soon as you can".
 *
 * It lives here rather than in one app because web and mobile draw the same
 * grid from the same quote: two copies would eventually offer two different
 * sets of times for one basket.
 */

/**
 * The grain of the ready-time choice, in minutes.
 *
 * **Ten, confirmed by product on 2026-08-08**, matching the booking grid's
 * `RESERVATION_SLOT_MINUTES`. It was 15, and the two screens sat next to each
 * other offering different grains for the same question — when do you want to
 * be here.
 *
 * Exported because the web still draws this as a native clock field where there
 * is no JavaScript — `step` and the field's floor are this number — and a field
 * whose `step` disagreed with the grid above it would offer times the grid does
 * not.
 */
export const READY_STEP_MINUTES = 10;

const STEP_MINUTES = READY_STEP_MINUTES;

/**
 * How many times to offer.
 *
 * **Twelve, raised from eight with the step.** The count is a *span* in
 * disguise: eight quarter-hours reached two hours ahead, and eight ten-minute
 * steps would have reached only eighty minutes. Finer grain was the ask;
 * a shorter horizon was not, and it would have been the silent half of it.
 */
const DEFAULT_COUNT = 12;

export interface ReadyTime {
  /** ISO instant, the value `POST /orders` takes. */
  at: string;
  /** True for the first entry — taking it is an ordinary order, not a pre-order. */
  earliest: boolean;
}

export function readyTimeOptions(earliestIso: string, count: number = DEFAULT_COUNT): ReadyTime[] {
  const earliest = new Date(earliestIso);
  if (Number.isNaN(earliest.getTime())) {
    return [];
  }

  const times: ReadyTime[] = [{ at: earliest.toISOString(), earliest: true }];

  // Later options sit on clean quarter-hours rather than "earliest plus 15",
  // so the grid reads 12:45 / 13:00 / 13:15 instead of 12:47 / 13:02.
  const step = STEP_MINUTES * 60_000;
  let cursor = new Date(Math.ceil((earliest.getTime() + 1) / step) * step);

  while (times.length < count) {
    times.push({ at: cursor.toISOString(), earliest: false });
    cursor = new Date(cursor.getTime() + step);
  }

  return times;
}
