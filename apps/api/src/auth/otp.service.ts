import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language } from '@amragrir/shared';
import { createHash, randomInt } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import { SMS_SENDER, SmsSender } from '../sms/sms.sender';
import { maskPhone } from './phone.util';

const OTP_KEY = (phone: string): string => `otp:code:${phone}`;
const COOLDOWN_KEY = (phone: string): string => `otp:cooldown:${phone}`;
const ATTEMPTS_KEY = (phone: string): string => `otp:attempts:${phone}`;

interface SendResult {
  expiresIn: number;
}

/**
 * The resend cooldown is the one OTP failure a client renders verbatim
 * (`apps/mobile/src/api/client.ts`), so it has to arrive already written in
 * the caller's language rather than in English with a number in it.
 *
 * Seconds are abbreviated in `hy`/`ru` for the same reason the dictionaries
 * abbreviate minutes: the count is interpolated, and a spelled-out unit would
 * need Russian plural agreement that a template string cannot do.
 */
const COOLDOWN_MESSAGE: Record<Language, (seconds: number) => string> = {
  [Language.Hy]: (seconds) => `Սպասիր ${seconds} վայրկյան՝ նոր կոդ պահանջելուց առաջ`,
  [Language.Ru]: (seconds) => `Подождите ${seconds} с, прежде чем запросить новый код`,
  [Language.En]: (seconds) => `Please wait ${seconds}s before requesting another code`,
};

/**
 * OTP issue/verify with the abuse controls the flow needs: a resend cooldown
 * and a wrong-attempt cap. Codes are stored hashed — a Redis dump should not
 * hand over live login codes.
 */
@Injectable()
export class OtpService {
  private readonly ttl: number;
  private readonly cooldown: number;
  private readonly maxAttempts: number;
  private readonly pepper: string;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {
    this.ttl = this.config.getOrThrow<number>('OTP_TTL');
    this.cooldown = this.config.getOrThrow<number>('OTP_RESEND_COOLDOWN');
    this.maxAttempts = this.config.getOrThrow<number>('OTP_MAX_ATTEMPTS');
    this.pepper = this.config.getOrThrow<string>('JWT_SECRET');
  }

  /** @param language the caller's `Accept-Language`, for the cooldown message. */
  async send(phone: string, language: Language): Promise<SendResult> {
    const remainingCooldown = await this.redis.ttl(COOLDOWN_KEY(phone));
    if (remainingCooldown > 0) {
      throw new HttpException(
        {
          message: COOLDOWN_MESSAGE[language](remainingCooldown),
          retryAfter: remainingCooldown,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode();

    await this.redis.setEx(OTP_KEY(phone), this.hash(phone, code), this.ttl);
    await this.redis.del(ATTEMPTS_KEY(phone));
    if (this.cooldown > 0) {
      await this.redis.setEx(COOLDOWN_KEY(phone), '1', this.cooldown);
    }

    await this.sms.send(phone, `Amragrir: ${code}`);

    return { expiresIn: this.ttl };
  }

  /**
   * Throws unless the code matches. On success the code is consumed, so a
   * single code can never be redeemed twice.
   */
  async verify(phone: string, code: string): Promise<void> {
    const stored = await this.redis.get(OTP_KEY(phone));
    if (stored === null) {
      throw new UnauthorizedException('Code expired or was never requested');
    }

    if (stored !== this.hash(phone, code)) {
      const attempts = await this.redis.incrWithTtl(ATTEMPTS_KEY(phone), this.ttl);
      if (attempts >= this.maxAttempts) {
        // Burn the code so an attacker cannot keep guessing within the TTL.
        await this.redis.del(OTP_KEY(phone));
        await this.redis.del(ATTEMPTS_KEY(phone));
        throw new UnauthorizedException('Too many wrong attempts — request a new code');
      }
      throw new UnauthorizedException('Invalid code');
    }

    await this.redis.del(OTP_KEY(phone));
    await this.redis.del(ATTEMPTS_KEY(phone));
  }

  /** 4-digit code, matching the design's OTP input. */
  private generateCode(): string {
    return randomInt(0, 10_000).toString().padStart(4, '0');
  }

  /** Phone is part of the digest so a hash cannot be replayed for another number. */
  private hash(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}:${this.pepper}`).digest('hex');
  }

  /** Exposed for log lines that must not leak the full number. */
  static mask(phone: string): string {
    return maskPhone(phone);
  }
}
