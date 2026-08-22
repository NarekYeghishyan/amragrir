import { Injectable, Logger } from '@nestjs/common';
import { Language, Role } from '@amragrir/shared';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { OtpService } from './otp.service';
import { JwtPayload, TokenPair, TokenService } from './token.service';
import { maskPhone, normalizePhone } from './phone.util';
import { SendCodeDto, VerifyCodeDto } from './dto';

export interface AuthResult extends TokenPair {
  isNewUser: boolean;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  language: string;
  role: Role;
  isGuest: boolean;
  phoneVerified: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly referrals: ReferralsService,
  ) {}

  /** @param language resolved from `Accept-Language`; the resend-cooldown
   *   refusal is written in it. */
  async sendCode(dto: SendCodeDto, language: Language): Promise<{ sent: true; expiresIn: number }> {
    const phone = normalizePhone(dto.phone);
    const { expiresIn } = await this.otp.send(phone, language);
    this.logger.log(`OTP issued for ${maskPhone(phone)}`);
    return { sent: true, expiresIn };
  }

  /**
   * @param callerToken bearer token of the caller, if any. A guest presenting
   *   their token has this same account upgraded instead of a second one being
   *   created — otherwise everything they collected while browsing is orphaned.
   */
  async verifyCode(dto: VerifyCodeDto, callerToken: string | null = null): Promise<AuthResult> {
    const phone = normalizePhone(dto.phone);
    await this.otp.verify(phone, dto.code);

    /**
     * The name, when the sign-up tab sent one.
     *
     * Trimmed here as well as on the clients, so that whitespace cannot pass
     * for a name — and, below, cannot blank one that is already stored.
     */
    const name = dto.name?.trim();
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    const caller = await this.tokens.tryReadAccess(callerToken);
    const guestId = caller?.isGuest ? caller.sub : null;

    let user: User;
    let isNewUser: boolean;

    if (existing) {
      // The phone already has an account — sign into it. A guest session in
      // flight is simply abandoned; merging two accounts' data is a product
      // decision, not something to do implicitly here.
      user = await this.prisma.user.update({
        where: { id: existing.id },
        // Verifying again also settles a previously unverified record.
        //
        // **A name sent here replaces the stored one** (2026-08-11). It used to
        // fill in only a missing name, which meant somebody signing up again on
        // a number they already had typed a name into a form that silently
        // discarded it — and, since nothing else in the product renames an
        // account, left them stuck with whatever was recorded the first time.
        // This is the one place a customer can correct it, and the correction is
        // as authorised as the sign-in around it: the OTP for this number was
        // accepted a few lines up, so the sender has proved they hold the phone
        // the account is keyed on. An absent name (the log-in tab sends none)
        // changes nothing.
        data: {
          phoneVerified: true,
          isGuest: false,
          ...(name ? { name } : {}),
        },
      });
      isNewUser = false;
    } else if (guestId) {
      user = await this.prisma.user.update({
        where: { id: guestId },
        data: {
          phone,
          phoneVerified: true,
          isGuest: false,
          ...(name ? { name } : {}),
        },
      });
      isNewUser = true;
      this.logger.log(`Guest ${guestId} upgraded to a verified account`);
    } else {
      // The find-then-create above is not atomic: two requests carrying the
      // same valid code race, both see no account, and the loser hits the
      // unique index on `phone`. Fall back to reading the row the winner
      // created rather than surfacing a 500.
      try {
        user = await this.prisma.user.create({
          data: {
            phone,
            phoneVerified: true,
            name: name || null,
            role: 'customer',
          },
        });
        isNewUser = true;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
          throw err;
        }
        user = await this.prisma.user.findUniqueOrThrow({ where: { phone } });
        isNewUser = false;
      }
    }

    // Only a genuinely new account can be attributed: otherwise anyone could
    // re-verify an existing phone with a friend's code and mint a discount.
    if (isNewUser && dto.referralCode) {
      await this.referrals.attribute(user.id, dto.referralCode);
    }

    const tokens = await this.tokens.issue(this.claimsFor(user));
    return { ...tokens, isNewUser, user: toPublicUser(user) };
  }

  /**
   * Anonymous session. The row carries no phone, so the guest can browse and
   * build a basket; ordering stays blocked by @RequiresVerifiedPhone until
   * they verify a number (which upgrades this same account).
   */
  async createGuest(): Promise<TokenPair & { user: PublicUser }> {
    const user = await this.prisma.user.create({
      data: { isGuest: true, phoneVerified: false, role: 'customer' },
    });
    const tokens = await this.tokens.issue(this.claimsFor(user));
    return { ...tokens, user: toPublicUser(user) };
  }

  /** Rotates a refresh token, re-reading the user so claims stay current. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const userId = await this.tokens.consumeRefresh(refreshToken);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.tokens.issue(this.claimsFor(user));
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeRefresh(refreshToken);
  }

  private claimsFor(user: User): JwtPayload {
    return {
      sub: user.id,
      role: user.role as Role,
      isGuest: user.isGuest,
      phoneVerified: user.phoneVerified,
    };
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
    language: user.language,
    role: user.role as Role,
    isGuest: user.isGuest,
    phoneVerified: user.phoneVerified,
  };
}
