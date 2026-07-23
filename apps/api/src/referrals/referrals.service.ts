import { Injectable, Logger } from '@nestjs/common';
import { CouponSource, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import {
  REFERRAL_CODE_LENGTH,
  REFERRAL_COUPON_VALID_DAYS,
  REFERRAL_DISCOUNT_PCT,
  REFERRAL_MAX_STACK_PCT,
  stackReferralPct,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Code alphabet: no 0/O or 1/I/L, because these get read aloud and retyped. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const CODE_ATTEMPTS = 5;

/** The coupon code a referral reward is always stored under, so a user has one
 *  accumulating referral coupon rather than a pile of 2% ones. */
export const REFERRAL_COUPON_CODE = 'FRIENDS';

export interface ReferralSummary {
  code: string;
  link: string;
  invitedCount: number;
  discountEarnedPct: number;
  maxStackPct: number;
  /** The reward waiting to be used, if any. */
  coupon: { code: string; discountPct: number; validUntil: string | null } | null;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's referral record, created on first read.
   *
   * Lazily rather than at signup: most accounts never open the referral
   * screen, and a code nobody has seen is a row nobody needs.
   */
  async summary(userId: string): Promise<ReferralSummary> {
    const referral = await this.ensureReferral(userId);

    const coupon = await this.prisma.coupon.findFirst({
      where: { userId, code: REFERRAL_COUPON_CODE, usedAt: null },
    });

    return {
      code: referral.code,
      link: `amragrir.am/i/${referral.code}`,
      invitedCount: referral.invitedCount,
      discountEarnedPct: referral.discountEarnedPct,
      maxStackPct: REFERRAL_MAX_STACK_PCT,
      coupon: coupon
        ? {
            code: coupon.code,
            discountPct: coupon.discountPct ?? 0,
            validUntil: coupon.validUntil?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * Attributes a new account to whoever invited it.
   *
   * Records the link and gives the newcomer their welcome discount. The
   * *inviter* is paid later, when the invitee actually orders — otherwise
   * inviting a hundred throwaway phone numbers would mint 25% for free.
   */
  async attribute(userId: string, code: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    // An unknown or self-referring code is not worth failing a signup over —
    // the account is created either way, just without attribution.
    if (!referral || referral.userId === userId) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { referredById: referral.userId } }),
      this.prisma.coupon.upsert({
        where: { userId_code: { userId, code: REFERRAL_COUPON_CODE } },
        update: {},
        create: {
          userId,
          code: REFERRAL_COUPON_CODE,
          discountPct: REFERRAL_DISCOUNT_PCT,
          source: CouponSource.referral,
          validUntil: new Date(Date.now() + REFERRAL_COUPON_VALID_DAYS * 86_400_000),
        },
      }),
    ]);

    this.logger.log(`User ${userId} attributed to referrer ${referral.userId}`);
  }

  /**
   * Pays the inviter for an invitee's first paid order.
   *
   * Called when an order is paid. `referredById` is cleared as part of the
   * same transaction, which is what makes this once-per-invitee: the link has
   * done its job, and leaving it would pay the inviter for every order the
   * friend ever places.
   */
  async creditReferrerFor(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });
    if (!user?.referredById) {
      return;
    }

    const referrerId = user.referredById;
    const referral = await this.ensureReferral(referrerId);
    const nextPct = stackReferralPct(referral.discountEarnedPct, REFERRAL_DISCOUNT_PCT);

    const existing = await this.prisma.coupon.findUnique({
      where: { userId_code: { userId: referrerId, code: REFERRAL_COUPON_CODE } },
    });

    // Accumulate into one coupon rather than pile up 2% rows: the design shows
    // a single "discount earned" figure, and a 25% cap is meaningless unless
    // something adds up to be capped.
    const couponPct = stackReferralPct(
      existing && existing.usedAt === null ? (existing.discountPct ?? 0) : 0,
      REFERRAL_DISCOUNT_PCT,
    );

    await this.prisma.$transaction([
      // Clearing the link is the guard against paying twice; it is inside the
      // transaction so a retry cannot credit again.
      this.prisma.user.update({ where: { id: userId }, data: { referredById: null } }),
      this.prisma.referral.update({
        where: { userId: referrerId },
        data: { invitedCount: { increment: 1 }, discountEarnedPct: nextPct },
      }),
      this.prisma.coupon.upsert({
        where: { userId_code: { userId: referrerId, code: REFERRAL_COUPON_CODE } },
        update: {
          discountPct: couponPct,
          // A spent coupon becomes a fresh one rather than resurrecting the
          // old record's usage.
          usedAt: null,
          validUntil: new Date(Date.now() + REFERRAL_COUPON_VALID_DAYS * 86_400_000),
        },
        create: {
          userId: referrerId,
          code: REFERRAL_COUPON_CODE,
          discountPct: REFERRAL_DISCOUNT_PCT,
          source: CouponSource.referral,
          validUntil: new Date(Date.now() + REFERRAL_COUPON_VALID_DAYS * 86_400_000),
        },
      }),
    ]);

    this.logger.log(`Credited referrer ${referrerId} for ${userId}'s first paid order`);
  }

  private async ensureReferral(userId: string) {
    const existing = await this.prisma.referral.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.referral.create({ data: { userId, code: generateCode() } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Either the code collided (retry with a new one) or another request
          // created this user's row first (return that).
          const raced = await this.prisma.referral.findUnique({ where: { userId } });
          if (raced) {
            return raced;
          }
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Could not allocate a referral code after ${CODE_ATTEMPTS} attempts`);
  }
}

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
