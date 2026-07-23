import { generateOrderCode, pickupCodeFrom } from './order-code';

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

describe('pickupCodeFrom', () => {
  it('is the last four digits of the order code', () => {
    expect(pickupCodeFrom('AMR-12344821')).toBe('4821');
  });

  it('is derived, never stored — the two can never disagree', () => {
    const code = generateOrderCode();
    expect(code.endsWith(pickupCodeFrom(code))).toBe(true);
  });
});
