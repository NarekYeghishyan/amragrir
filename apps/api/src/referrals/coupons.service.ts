import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Coupon } from '@prisma/client';
import { discountFor } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface CouponDto {
  id: string;
  code: string;
  discountPct: number | null;
  discountAmd: number | null;
  source: string;
  validUntil: string | null;
}

export interface AppliedCoupon {
  coupon: Coupon;
  discountAmd: number;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<{ items: CouponDto[] }> {
    const rows = await this.prisma.coupon.findMany({
      where: { userId, usedAt: null },
      orderBy: [{ createdAt: 'desc' }],
    });

    const now = Date.now();
    return {
      items: rows
        // Expired coupons are not deleted (history, and a support question
        // needs them) but they are not offered either.
        .filter((row) => !row.validUntil || row.validUntil.getTime() > now)
        .map((row) => ({
          id: row.id,
          code: row.code,
          discountPct: row.discountPct,
          discountAmd: row.discountAmd,
          source: row.source,
          validUntil: row.validUntil?.toISOString() ?? null,
        })),
    };
  }

  /**
   * Prices a coupon against a subtotal without consuming it — what a quote
   * needs. Returns null when the code does not apply, so the basket screen can
   * say so rather than silently showing no discount.
   */
  async preview(userId: string, code: string, subtotalAmd: number): Promise<AppliedCoupon | null> {
    const coupon = await this.find(userId, code);
    return coupon ? { coupon, discountAmd: this.amountFor(coupon, subtotalAmd) } : null;
  }

  /**
   * Claims a coupon for an order.
   *
   * The claim is a conditional update rather than a read followed by a write:
   * two orders submitted at once would both see an unused coupon and both
   * apply it. `updateMany` with `usedAt: null` in the filter means exactly one
   * wins, and the loser is told the coupon is gone.
   */
  async claim(userId: string, code: string, subtotalAmd: number): Promise<AppliedCoupon> {
    const coupon = await this.find(userId, code);
    if (!coupon) {
      throw new UnprocessableEntityException('That coupon cannot be used');
    }

    const claimed = await this.prisma.coupon.updateMany({
      where: { id: coupon.id, userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new UnprocessableEntityException('That coupon has already been used');
    }

    return { coupon, discountAmd: this.amountFor(coupon, subtotalAmd) };
  }

  /** Returns a coupon to the customer when the order that claimed it is
   *  cancelled — the discount was never actually enjoyed. */
  async release(couponId: string): Promise<void> {
    await this.prisma.coupon.updateMany({
      where: { id: couponId },
      data: { usedAt: null },
    });
  }

  private async find(userId: string, code: string): Promise<Coupon | null> {
    const coupon = await this.prisma.coupon.findUnique({
      // Scoped to the user by the composite key: a coupon code is personal,
      // so knowing someone else's is worth nothing.
      where: { userId_code: { userId, code: code.trim().toUpperCase() } },
    });

    if (!coupon || coupon.usedAt !== null) {
      return null;
    }
    if (coupon.validUntil && coupon.validUntil.getTime() <= Date.now()) {
      return null;
    }
    return coupon;
  }

  /** Percentage coupons are capped by `discountFor`; a fixed-amount coupon
   *  never takes more than the subtotal. */
  private amountFor(coupon: Coupon, subtotalAmd: number): number {
    if (coupon.discountPct !== null) {
      return discountFor(subtotalAmd, coupon.discountPct);
    }
    return Math.min(coupon.discountAmd ?? 0, subtotalAmd);
  }
}
