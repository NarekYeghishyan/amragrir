import { UnprocessableEntityException } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import type { PrismaService } from '../prisma/prisma.service';

const USER = 'user-1';

function coupon(over: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    userId: USER,
    code: 'FRIENDS',
    discountPct: 10,
    discountAmd: null,
    source: 'referral',
    validUntil: null,
    usedAt: null,
    createdAt: new Date(),
    ...over,
  };
}

function build(options: { coupon?: unknown; claimed?: number } = {}) {
  const updateMany = jest.fn().mockResolvedValue({ count: options.claimed ?? 1 });
  const prisma = {
    coupon: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.coupon === undefined ? coupon() : options.coupon),
      findMany: jest.fn().mockResolvedValue([coupon()]),
      updateMany,
    },
  } as unknown as PrismaService;

  return { service: new CouponsService(prisma), prisma, updateMany };
}

describe('preview', () => {
  it('prices a coupon without spending it', async () => {
    const { service, updateMany } = build();
    const applied = await service.preview(USER, 'FRIENDS', 10_000);

    expect(applied?.discountAmd).toBe(1_000);
    // A quote must never consume the coupon the guest is only looking at.
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns null for an unknown code instead of throwing', async () => {
    const { service } = build({ coupon: null });
    expect(await service.preview(USER, 'NOPE', 10_000)).toBeNull();
  });

  it('rejects a spent coupon', async () => {
    const { service } = build({ coupon: coupon({ usedAt: new Date() }) });
    expect(await service.preview(USER, 'FRIENDS', 10_000)).toBeNull();
  });

  it('rejects an expired coupon', async () => {
    const { service } = build({ coupon: coupon({ validUntil: new Date(Date.now() - 1000) }) });
    expect(await service.preview(USER, 'FRIENDS', 10_000)).toBeNull();
  });

  it('looks a coupon up by user and code together', async () => {
    // A coupon code is personal, so knowing someone else's is worth nothing.
    const { service, prisma } = build();
    await service.preview(USER, 'friends', 10_000);

    expect(prisma.coupon.findUnique).toHaveBeenCalledWith({
      where: { userId_code: { userId: USER, code: 'FRIENDS' } },
    });
  });

  it('caps a fixed-amount coupon at the subtotal', () => {
    // Otherwise a 5 000֏ coupon on a 1 000֏ basket would pay the service fee
    // and start giving change.
    return build({ coupon: coupon({ discountPct: null, discountAmd: 5_000 }) })
      .service.preview(USER, 'FRIENDS', 1_000)
      .then((applied) => expect(applied?.discountAmd).toBe(1_000));
  });
});

describe('claim', () => {
  it('marks the coupon used', async () => {
    const { service, updateMany } = build();
    const applied = await service.claim(USER, 'FRIENDS', 10_000);

    expect(applied.discountAmd).toBe(1_000);
    expect(updateMany).toHaveBeenCalledWith({
      // `usedAt: null` in the filter is what makes this a claim rather than a
      // write: two concurrent orders cannot both win it.
      where: { id: 'coupon-1', userId: USER, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('loses gracefully when another order claimed it first', async () => {
    const { service } = build({ claimed: 0 });
    await expect(service.claim(USER, 'FRIENDS', 10_000)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses an unusable code', async () => {
    const { service } = build({ coupon: null });
    await expect(service.claim(USER, 'NOPE', 10_000)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('release', () => {
  it('hands the coupon back', async () => {
    const { service, updateMany } = build();
    await service.release('coupon-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'coupon-1' },
      data: { usedAt: null },
    });
  });
});

describe('list', () => {
  it('hides expired coupons without deleting them', async () => {
    const { service, prisma } = build();
    (prisma.coupon.findMany as jest.Mock).mockResolvedValue([
      coupon({ id: 'live' }),
      coupon({ id: 'stale', validUntil: new Date(Date.now() - 1000) }),
    ]);

    const page = await service.list(USER);
    expect(page.items.map((item) => item.id)).toEqual(['live']);
  });
});
