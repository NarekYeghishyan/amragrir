import {
  AMD_PER_REWARD_POINT,
  REFERRAL_DISCOUNT_PCT,
  REFERRAL_MAX_STACK_PCT,
  discountFor,
  pointsFor,
  stackReferralPct,
} from '@amragrir/shared';

describe('discountFor', () => {
  it('takes the percentage off the subtotal', () => {
    expect(discountFor(10_000, 2)).toBe(200);
  });

  it('never exceeds the 25% stacking cap, however big the coupon claims to be', () => {
    // The cap is the last line of defence: a coupon row with a bad percentage
    // must not be able to give the food away.
    expect(discountFor(10_000, 90)).toBe(discountFor(10_000, REFERRAL_MAX_STACK_PCT));
    expect(discountFor(10_000, 90)).toBe(2_500);
  });

  it('ignores a negative percentage rather than charging extra', () => {
    expect(discountFor(10_000, -5)).toBe(0);
  });

  it('rounds down, so rounding never costs the customer', () => {
    // 2% of 5 850 is 117.0; 2% of 5 855 is 117.1 — both floor to 117.
    expect(discountFor(5_855, 2)).toBe(117);
  });

  it('is zero on an empty basket', () => {
    expect(discountFor(0, 25)).toBe(0);
  });
});

describe('stackReferralPct', () => {
  it('accumulates one invite at a time', () => {
    expect(stackReferralPct(0, REFERRAL_DISCOUNT_PCT)).toBe(2);
    expect(stackReferralPct(4, REFERRAL_DISCOUNT_PCT)).toBe(6);
  });

  it('stops at the cap however many friends join', () => {
    let pct = 0;
    for (let i = 0; i < 100; i += 1) {
      pct = stackReferralPct(pct, REFERRAL_DISCOUNT_PCT);
    }
    expect(pct).toBe(REFERRAL_MAX_STACK_PCT);
  });

  it('does not overshoot the cap on the last step', () => {
    // 24 + 2 would be 26; the cap has to clamp, not skip.
    expect(stackReferralPct(24, REFERRAL_DISCOUNT_PCT)).toBe(REFERRAL_MAX_STACK_PCT);
  });
});

describe('pointsFor', () => {
  it('awards one point per 100 dram of subtotal', () => {
    expect(pointsFor(5_800)).toBe(58);
    expect(pointsFor(AMD_PER_REWARD_POINT)).toBe(1);
  });

  it('floors a partial point', () => {
    expect(pointsFor(199)).toBe(1);
    expect(pointsFor(99)).toBe(0);
  });
});
