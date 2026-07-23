// Referral and reward arithmetic — see docs/BUSINESS_LOGIC.md §7 and §8.
//
// Pure functions in `shared` because the API computes these and the clients
// display them; a second copy of "how much is my discount" would eventually
// show a number the server does not agree with.

import { AMD_PER_REWARD_POINT, REFERRAL_MAX_STACK_PCT } from './constants';

/**
 * The discount a percentage coupon takes off an order.
 *
 * Applied to the **subtotal**, not the total: the service fee is the
 * platform's, and a referral discount is a discount on food. Rounded down to
 * whole dram — the currency has no minor unit, and rounding down means a
 * rounding error never charges the customer more than the rule says.
 */
export function discountFor(subtotalAmd: number, percent: number): number {
  const capped = Math.min(Math.max(percent, 0), REFERRAL_MAX_STACK_PCT);
  return Math.floor((subtotalAmd * capped) / 100);
}

/**
 * A referral discount after another friend joins.
 *
 * Stacking is accumulation into one percentage rather than a pile of separate
 * coupons: the design shows a single "discount earned" figure, and the 25% cap
 * is meaningless unless something adds up to be capped.
 */
export function stackReferralPct(currentPct: number, addPct: number): number {
  return Math.min(currentPct + addPct, REFERRAL_MAX_STACK_PCT);
}

/**
 * Points earned by paying for an order.
 *
 * On the subtotal, so the platform's own fee does not mint points. Floored:
 * partial points would need a fractional column for no visible benefit.
 */
export function pointsFor(subtotalAmd: number): number {
  return Math.floor(subtotalAmd / AMD_PER_REWARD_POINT);
}
