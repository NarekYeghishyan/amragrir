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
 */

const STEP_MINUTES = 15;
const DEFAULT_COUNT = 8;

export interface ReadyTime {
  /** ISO instant, the value `POST /orders` takes. */
  at: string;
  /** True for the first entry — taking it is an ordinary order, not a pre-order. */
  earliest: boolean;
}

export function readyTimeOptions(
  earliestIso: string,
  count: number = DEFAULT_COUNT,
): ReadyTime[] {
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
