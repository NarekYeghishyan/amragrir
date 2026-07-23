import { REFERRAL_DISCOUNT_PCT, REFERRAL_MAX_STACK_PCT } from '@amragrir/shared';
import { ReferralsService, generateCode } from './referrals.service';
import type { PrismaService } from '../prisma/prisma.service';

const INVITEE = 'invitee-1';
const REFERRER = 'referrer-1';

function build(
  options: {
    referral?: unknown;
    user?: unknown;
    coupon?: unknown;
    referrerReferral?: unknown;
  } = {},
) {
  const userUpdate = jest.fn().mockResolvedValue({});
  const referralUpdate = jest.fn().mockResolvedValue({});
  const couponUpsert = jest.fn().mockResolvedValue({});

  const prisma = {
    referral: {
      // `=== undefined` rather than `??`: a test that passes `referral: null`
      // means "no such code", which `??` would quietly replace with the
      // default and make the assertion pass for the wrong reason.
      findUnique: jest.fn().mockImplementation(({ where }: { where: { code?: string } }) =>
        Promise.resolve(
          where.code !== undefined
            ? options.referral === undefined
              ? { userId: REFERRER, code: 'ABC123' }
              : options.referral
            : options.referrerReferral === undefined
              ? { userId: REFERRER, code: 'ABC123', invitedCount: 0, discountEarnedPct: 0 }
              : options.referrerReferral,
        ),
      ),
      create: jest.fn().mockResolvedValue({ userId: REFERRER, code: 'NEW123' }),
      update: referralUpdate,
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.user === undefined ? { referredById: REFERRER } : options.user),
      update: userUpdate,
    },
    coupon: {
      findUnique: jest.fn().mockResolvedValue(options.coupon ?? null),
      findFirst: jest.fn().mockResolvedValue(options.coupon ?? null),
      upsert: couponUpsert,
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  return { service: new ReferralsService(prisma), prisma, userUpdate, referralUpdate, couponUpsert };
}

describe('generateCode', () => {
  it('avoids characters that get misread when a code is spoken or retyped', () => {
    const codes = Array.from({ length: 200 }, generateCode).join('');
    expect(codes).not.toMatch(/[01OIL]/);
  });

  it('is the configured length and reasonably unique', () => {
    const codes = new Set(Array.from({ length: 200 }, generateCode));
    expect(generateCode()).toHaveLength(6);
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('attribute', () => {
  it('links the newcomer and gives them a welcome coupon', async () => {
    const { service, userUpdate, couponUpsert } = build();
    await service.attribute(INVITEE, 'ABC123');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: INVITEE },
      data: { referredById: REFERRER },
    });
    expect(couponUpsert.mock.calls[0][0].create.discountPct).toBe(REFERRAL_DISCOUNT_PCT);
  });

  it('ignores an unknown code rather than failing the signup', async () => {
    const { service, userUpdate } = build({ referral: null });
    await service.attribute(INVITEE, 'NOPE');

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('ignores a self-referral', async () => {
    // Otherwise signing up with your own code would mint a discount.
    const { service, userUpdate } = build({ referral: { userId: INVITEE, code: 'SELF12' } });
    await service.attribute(INVITEE, 'SELF12');

    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe('creditReferrerFor', () => {
  it('pays the inviter and clears the link so it pays only once', async () => {
    const { service, userUpdate, referralUpdate } = build();
    await service.creditReferrerFor(INVITEE);

    expect(referralUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { invitedCount: { increment: 1 }, discountEarnedPct: REFERRAL_DISCOUNT_PCT },
      }),
    );
    // Clearing referredById is what makes this once-per-invitee — without it
    // the inviter would earn on every order that friend ever places.
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: INVITEE },
      data: { referredById: null },
    });
  });

  it('does nothing for someone nobody invited', async () => {
    const { service, referralUpdate } = build({ user: { referredById: null } });
    await service.creditReferrerFor(INVITEE);

    expect(referralUpdate).not.toHaveBeenCalled();
  });

  it('accumulates into the existing coupon rather than piling up 2% rows', async () => {
    const { service, couponUpsert } = build({
      coupon: { id: 'c1', discountPct: 8, usedAt: null },
      referrerReferral: { userId: REFERRER, code: 'ABC123', invitedCount: 4, discountEarnedPct: 8 },
    });
    await service.creditReferrerFor(INVITEE);

    expect(couponUpsert.mock.calls[0][0].update.discountPct).toBe(10);
  });

  it('starts a fresh coupon after the previous one was spent', async () => {
    const { service, couponUpsert } = build({
      coupon: { id: 'c1', discountPct: 8, usedAt: new Date() },
      referrerReferral: { userId: REFERRER, code: 'ABC123', invitedCount: 4, discountEarnedPct: 8 },
    });
    await service.creditReferrerFor(INVITEE);

    // Not 10: the spent 8% was already enjoyed, so the new coupon is worth 2%.
    expect(couponUpsert.mock.calls[0][0].update.discountPct).toBe(REFERRAL_DISCOUNT_PCT);
    expect(couponUpsert.mock.calls[0][0].update.usedAt).toBeNull();
  });

  it('stops the lifetime figure at the cap', async () => {
    const { service, referralUpdate } = build({
      referrerReferral: {
        userId: REFERRER,
        code: 'ABC123',
        invitedCount: 20,
        discountEarnedPct: REFERRAL_MAX_STACK_PCT,
      },
    });
    await service.creditReferrerFor(INVITEE);

    expect(referralUpdate.mock.calls[0][0].data.discountEarnedPct).toBe(REFERRAL_MAX_STACK_PCT);
  });
});
