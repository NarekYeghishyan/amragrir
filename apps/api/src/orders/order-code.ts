import { randomInt } from 'node:crypto';
import { PICKUP_CODE_LENGTH } from '@amragrir/shared';

/**
 * The two codes an order carries, and why they are two.
 *
 * `orders.code` is `AMR-` + 8 digits — exactly the 12 characters the column
 * allows — and it is the order's *name*: printed on the ticket, read out over
 * the phone, retyped into a refund note, scanned off the board. It identifies
 * an order and is not a secret about one.
 *
 * `orders.pickup_code` is 6 digits and is the *proof*: the number a guest shows
 * to collect the food, and the only thing that lets the counter close an order.
 *
 * **They used to be the same fact.** The pickup code was the last four digits
 * of `orders.code` — derived, never stored, on the argument that two stored
 * identifiers could come to disagree. That was true and beside the point: it
 * also meant every place the order number appears is a place the collection
 * code leaks, so anybody who read `AMR-24919119` off a receipt could walk up
 * and claim `9119`. A proof derived from a name proves nothing.
 *
 * So the pickup code is now generated independently and stored under its own
 * unique constraint. The cost is real — two columns can disagree in a way one
 * column could not — and it is paid on purpose: nothing derives one from the
 * other, so there is no arithmetic to get wrong, and the database refuses a
 * duplicate of either.
 */

const PREFIX = 'AMR-';
const DIGITS = 8;

/** One more than the largest pickup code — `10 ** 6`, written from the shared
 *  length so the two cannot drift into disagreeing about how wide the code is. */
const PICKUP_CODE_SPACE = 10 ** PICKUP_CODE_LENGTH;

export function generateOrderCode(): string {
  let digits = '';
  for (let i = 0; i < DIGITS; i += 1) {
    digits += String(randomInt(10));
  }
  return `${PREFIX}${digits}`;
}

/**
 * A pickup code, drawn uniformly from `000000`–`999999`.
 *
 * One draw over the whole space rather than six draws of a digit: the two are
 * equivalent here, and a single `randomInt` says what the range is in the code
 * instead of leaving it implied by a loop count. `randomInt` and not
 * `Math.random` because this one is a credential — a predictable sequence of
 * these is somebody collecting a stranger's order.
 *
 * Leading zeros are kept. `042195` is a code, not the number 42,195, which is
 * also why the column is text.
 */
export function generatePickupCode(): string {
  return String(randomInt(PICKUP_CODE_SPACE)).padStart(PICKUP_CODE_LENGTH, '0');
}
