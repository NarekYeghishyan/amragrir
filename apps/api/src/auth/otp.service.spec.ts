import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { RedisService } from '../redis/redis.service';
import type { SmsSender } from '../sms/sms.sender';

const CONFIG: Record<string, unknown> = {
  OTP_TTL: 120,
  OTP_RESEND_COOLDOWN: 60,
  OTP_MAX_ATTEMPTS: 5,
  JWT_SECRET: 'test-secret-value-long-enough',
};

/** In-memory stand-in for Redis with just enough behaviour for these rules. */
class FakeRedis {
  private store = new Map<string, string>();
  private ttls = new Map<string, number>();

  setEx(key: string, value: string, ttl: number): Promise<void> {
    this.store.set(key, value);
    this.ttls.set(key, ttl);
    return Promise.resolve();
  }
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  del(key: string): Promise<void> {
    this.store.delete(key);
    this.ttls.delete(key);
    return Promise.resolve();
  }
  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.store.has(key));
  }
  ttl(key: string): Promise<number> {
    return Promise.resolve(this.ttls.get(key) ?? -2);
  }
  incrWithTtl(key: string, ttl: number): Promise<number> {
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    if (next === 1) this.ttls.set(key, ttl);
    return Promise.resolve(next);
  }
}

function build() {
  const redis = new FakeRedis();
  const sent: Array<{ to: string; message: string }> = [];
  const sms: SmsSender = {
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve();
    },
  };
  const config = { getOrThrow: (k: string) => CONFIG[k] } as unknown as ConfigService;
  const service = new OtpService(redis as unknown as RedisService, config, sms);
  const codeOf = (i = 0): string => sent[i]!.message.replace(/\D/g, '');
  return { service, redis, sent, codeOf };
}

const PHONE = '+37499123456';

describe('OtpService', () => {
  it('sends a 4-digit code and reports its lifetime', async () => {
    const { service, sent } = build();

    const result = await service.send(PHONE);

    expect(result.expiresIn).toBe(120);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(PHONE);
    expect(sent[0]!.message).toMatch(/^Amragrir: \d{4}$/);
  });

  it('accepts the code it just issued', async () => {
    const { service, codeOf } = build();
    await service.send(PHONE);

    await expect(service.verify(PHONE, codeOf())).resolves.toBeUndefined();
  });

  // Never store a usable code: a Redis dump must not hand over live logins.
  it('stores the code hashed rather than in plaintext', async () => {
    const { service, redis, codeOf } = build();
    await service.send(PHONE);

    const stored = await redis.get(`otp:code:${PHONE}`);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain(codeOf());
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a wrong code', async () => {
    const { service, codeOf } = build();
    await service.send(PHONE);
    const wrong = codeOf() === '0000' ? '1111' : '0000';

    await expect(service.verify(PHONE, wrong)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a code that was never requested', async () => {
    const { service } = build();

    await expect(service.verify(PHONE, '1234')).rejects.toThrow(/expired|never requested/i);
  });

  // Single use — a leaked code must not be replayable.
  it('consumes the code so it cannot be redeemed twice', async () => {
    const { service, codeOf } = build();
    await service.send(PHONE);
    const code = codeOf();

    await service.verify(PHONE, code);

    await expect(service.verify(PHONE, code)).rejects.toThrow(UnauthorizedException);
  });

  it('enforces the resend cooldown', async () => {
    const { service } = build();
    await service.send(PHONE);

    await expect(service.send(PHONE)).rejects.toThrow(HttpException);
  });

  // Without this, a 4-digit code is brute-forceable inside its 120s window.
  it('burns the code after too many wrong attempts', async () => {
    const { service, codeOf } = build();
    await service.send(PHONE);
    const wrong = codeOf() === '0000' ? '1111' : '0000';
    const correct = codeOf();

    for (let i = 1; i < 5; i++) {
      await expect(service.verify(PHONE, wrong)).rejects.toThrow('Invalid code');
    }
    await expect(service.verify(PHONE, wrong)).rejects.toThrow(/too many wrong attempts/i);

    // Even the right code is dead now.
    await expect(service.verify(PHONE, correct)).rejects.toThrow(/expired|never requested/i);
  });

  it('scopes codes per phone number', async () => {
    const { service, codeOf } = build();
    const other = '+37499000111';
    await service.send(PHONE);

    await expect(service.verify(other, codeOf())).rejects.toThrow(/expired|never requested/i);
  });
});
