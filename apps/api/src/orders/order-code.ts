import { randomInt } from 'node:crypto';

/**
 * Order codes.
 *
 * `orders.code` is `AMR-` + 8 digits — exactly the 12 characters the column
 * allows — and carries the database's unique constraint. The **pickup code**
 * the counter calls out is its last 4 digits, matching the design (`AMR-4821`
 * → `4821`); it is a display convenience derived from the code, not a second
 * stored identifier that could disagree with it.
 */

const PREFIX = 'AMR-';
const DIGITS = 8;
const PICKUP_DIGITS = 4;

export function generateOrderCode(): string {
  let digits = '';
  for (let i = 0; i < DIGITS; i += 1) {
    digits += String(randomInt(10));
  }
  return `${PREFIX}${digits}`;
}

export function pickupCodeFrom(orderCode: string): string {
  return orderCode.slice(-PICKUP_DIGITS);
}
