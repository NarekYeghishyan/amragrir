import { DEFAULT_PREP_MIN, SERVICE_FEE_AMD } from '@amragrir/shared';

/**
 * Order pricing — see docs/BUSINESS_LOGIC.md §1.
 *
 * Pure functions on purpose: money is the one thing that must be identical
 * between the basket quote and the created order, and the only way to be sure
 * is for both to call the same code with no I/O in it.
 *
 * Every amount is an integer in AMD (dram has no minor unit).
 */

export interface PricedLine {
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
  prepMin: number | null;
}

export interface PriceBreakdown {
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  discountAmd: number;
  totalAmd: number;
}

export function priceLine(input: {
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  prepMin: number | null;
}): PricedLine {
  return { ...input, lineTotalAmd: input.unitPriceAmd * input.qty };
}

/**
 * `depositAmd` is reported but deliberately **not** added to the total: a
 * table deposit is credited against the final bill, it is not a surcharge
 * (BUSINESS_LOGIC.md §3). Adding it here would double-charge the guest.
 */
export function priceOrder(
  lines: PricedLine[],
  depositAmd = 0,
  discountAmd = 0,
): PriceBreakdown {
  const subtotalAmd = lines.reduce((sum, line) => sum + line.lineTotalAmd, 0);
  const serviceFeeAmd = SERVICE_FEE_AMD;

  // A discount never exceeds the food it discounts, so a total cannot go
  // negative and the platform's fee is never given away.
  const discount = Math.min(Math.max(discountAmd, 0), subtotalAmd);

  return {
    subtotalAmd,
    serviceFeeAmd,
    depositAmd,
    discountAmd: discount,
    totalAmd: subtotalAmd - discount + serviceFeeAmd,
  };
}

/**
 * Minutes until the food can be ready.
 *
 * The **maximum** dish prep time, not the sum: a kitchen cooks the burger and
 * the fries at once, so an order of ten dishes is not ten times slower. Falls
 * back to the branch average, then to a fixed default, so an order is never
 * scheduled for "now" just because nobody filled the column in.
 *
 * A declared `0` counts as declared. It changes nothing for a basket that also
 * holds food — the maximum already ignores it — but a basket of nothing but
 * bottled drinks is ready now, and falling through to the branch average there
 * would invent a wait out of a column somebody did fill in. Only `null`, which
 * is the dish declining to say, reaches the fallbacks.
 */
export function estimatePrepMinutes(lines: PricedLine[], branchAvgPrepMin: number | null): number {
  const declared = lines
    .map((line) => line.prepMin)
    .filter((min): min is number => typeof min === 'number' && min >= 0);

  if (declared.length > 0) {
    return Math.max(...declared);
  }
  return branchAvgPrepMin && branchAvgPrepMin > 0 ? branchAvgPrepMin : DEFAULT_PREP_MIN;
}
