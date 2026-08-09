import { DEFAULT_PREP_MIN, SERVICE_FEE_AMD } from '@amragrir/shared';
import { estimatePrepMinutes, priceLine, priceOrder } from './pricing';

const line = (unitPriceAmd: number, qty: number, prepMin: number | null = null) =>
  priceLine({ menuItemId: 'm', name: 'Dish', unitPriceAmd, qty, prepMin });

describe('priceLine', () => {
  it('multiplies unit price by quantity', () => {
    expect(line(5800, 3).lineTotalAmd).toBe(17_400);
  });
});

describe('priceOrder', () => {
  it('sums the lines and adds one service fee for the whole order', () => {
    const totals = priceOrder([line(5800, 2), line(1200, 1)]);

    expect(totals.subtotalAmd).toBe(12_800);
    expect(totals.serviceFeeAmd).toBe(SERVICE_FEE_AMD);
    expect(totals.totalAmd).toBe(12_800 + SERVICE_FEE_AMD);
  });

  it('reports a deposit without adding it to the total', () => {
    // BUSINESS_LOGIC.md §3: a deposit is credited against the bill, not a
    // surcharge. Adding it here would charge the guest for it twice.
    const totals = priceOrder([line(5000, 1)], 4000);

    expect(totals.depositAmd).toBe(4000);
    expect(totals.totalAmd).toBe(5000 + SERVICE_FEE_AMD);
  });

  it('charges the service fee even on a single cheap item', () => {
    expect(priceOrder([line(500, 1)]).totalAmd).toBe(500 + SERVICE_FEE_AMD);
  });
});

describe('estimatePrepMinutes', () => {
  it('takes the slowest dish, not the sum — a kitchen cooks in parallel', () => {
    expect(estimatePrepMinutes([line(1, 1, 8), line(1, 1, 20), line(1, 1, 12)], 5)).toBe(20);
  });

  it('falls back to the branch average when no dish declares a prep time', () => {
    expect(estimatePrepMinutes([line(1, 1, null)], 18)).toBe(18);
  });

  it('falls back to a default when nothing declares a prep time', () => {
    // Otherwise an unfilled column would schedule the order for "right now".
    expect(estimatePrepMinutes([line(1, 1, null)], null)).toBe(DEFAULT_PREP_MIN);
    expect(estimatePrepMinutes([line(1, 1, null)], 0)).toBe(DEFAULT_PREP_MIN);
  });

  it('is unmoved by a dish that needs no cooking when there is food beside it', () => {
    // The bottle of water does not make the burger faster.
    expect(estimatePrepMinutes([line(1, 1, 0), line(1, 1, 9)], 30)).toBe(9);
  });

  it('is zero for a basket of nothing but dishes that need no cooking', () => {
    // A declared 0 is a claim, not a blank: falling through to the branch
    // average here would invent a wait for two bottles off the shelf.
    expect(estimatePrepMinutes([line(1, 1, 0), line(1, 2, 0)], 30)).toBe(0);
  });
});
