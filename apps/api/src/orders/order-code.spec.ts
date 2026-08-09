import { PICKUP_CODE_LENGTH, PICKUP_CODE_PATTERN } from '@amragrir/shared';
import { generateOrderCode, generatePickupCode } from './order-code';

describe('generateOrderCode', () => {
  it('fits the 12-character orders.code column', () => {
    // The column is VARCHAR(12); a longer code would fail at insert time.
    expect(generateOrderCode()).toHaveLength(12);
  });

  it('produces AMR- followed by eight digits', () => {
    expect(generateOrderCode()).toMatch(/^AMR-\d{8}$/);
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, generateOrderCode));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('generatePickupCode', () => {
  it('is six digits, which is what the column and the panel both expect', () => {
    expect(generatePickupCode()).toMatch(PICKUP_CODE_PATTERN);
  });

  it('keeps leading zeros — `042195` is a code, not a number', () => {
    // Over this many draws a code below 100,000 is a near-certainty (a tenth of
    // the space), and the bug this guards against — padding dropped somewhere
    // between the draw and the string — would show up as a short one.
    const codes = Array.from({ length: 500 }, generatePickupCode);
    expect(codes.every((code) => code.length === PICKUP_CODE_LENGTH)).toBe(true);
  });

  it('is unrelated to the order code, which is the entire point', () => {
    // The old pickup code *was* the tail of the order code. Nothing derives one
    // from the other now, so a run of pairs should almost never share a tail —
    // one in ten thousand per pair, and this fails loudly if the derivation
    // ever comes back.
    const shared = Array.from({ length: 200 }, () => {
      const code = generateOrderCode();
      const pickup = generatePickupCode();
      return code.endsWith(pickup.slice(-4));
    }).filter(Boolean);
    expect(shared.length).toBeLessThan(5);
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, generatePickupCode));
    expect(codes.size).toBeGreaterThan(190);
  });
});
