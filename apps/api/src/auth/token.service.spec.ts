import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@amragrir/shared';
import { TokenService, type JwtPayload } from './token.service';
import { RedisService } from '../redis/redis.service';

const CONFIG: Record<string, unknown> = {
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 2_592_000,
};

class FakeRedis {
  store = new Map<string, string>();
  setEx(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.store.has(key));
  }
  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

function build() {
  const jwt = new JwtService({ secret: 'test-secret-long-enough-for-jwt' });
  const redis = new FakeRedis();
  const config = { getOrThrow: (k: string) => CONFIG[k] } as unknown as ConfigService;
  const service = new TokenService(jwt, config, redis as unknown as RedisService);
  return { service, redis, jwt };
}

const claims: JwtPayload = {
  sub: 'user-1',
  role: Role.Customer,
  isGuest: false,
  phoneVerified: true,
};

describe('TokenService', () => {
  it('issues a usable access token carrying the claims', async () => {
    const { service } = build();

    const { accessToken } = await service.issue(claims);
    const decoded = await service.verifyAccess(accessToken);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.role).toBe(Role.Customer);
    expect(decoded.phoneVerified).toBe(true);
  });

  // Regression (security): both kinds are signed with the same secret, so
  // without a type claim a refresh token verified fine as a bearer credential.
  // It carries no `role`, so guards read `undefined` and would wave through
  // any endpoint that does not name an explicit role.
  it('refuses a refresh token presented as an access token', async () => {
    const { service } = build();
    const { refreshToken } = await service.issue(claims);

    await expect(service.verifyAccess(refreshToken)).rejects.toThrow(/not an access token/i);
  });

  it('refuses an access token presented for refresh', async () => {
    const { service } = build();
    const { accessToken } = await service.issue(claims);

    await expect(service.consumeRefresh(accessToken)).rejects.toThrow(/not a refresh token/i);
  });

  // A token signed with the right secret but no type claim (e.g. minted by an
  // older build) must not be accepted either.
  it('refuses a correctly signed token that has no type claim', async () => {
    const { service, jwt } = build();
    const legacy = await jwt.signAsync({ sub: 'user-1', role: Role.Guest }, { expiresIn: 900 });

    await expect(service.verifyAccess(legacy)).rejects.toThrow(/not an access token/i);
  });

  it('rejects a token signed with a different secret', async () => {
    const { service } = build();
    const foreign = new JwtService({ secret: 'a-completely-different-secret' });
    const forged = await foreign.signAsync({ ...claims, typ: 'access' }, { expiresIn: 900 });

    await expect(service.verifyAccess(forged)).rejects.toThrow(UnauthorizedException);
  });

  it('rotates refresh tokens — a consumed one cannot be reused', async () => {
    const { service } = build();
    const { refreshToken } = await service.issue(claims);

    await expect(service.consumeRefresh(refreshToken)).resolves.toBe('user-1');
    await expect(service.consumeRefresh(refreshToken)).rejects.toThrow(/revoked/i);
  });

  it('revokes a refresh token on logout', async () => {
    const { service } = build();
    const { refreshToken } = await service.issue(claims);

    await service.revokeRefresh(refreshToken);

    await expect(service.consumeRefresh(refreshToken)).rejects.toThrow(/revoked/i);
  });

  it('treats logout with a junk token as a no-op', async () => {
    const { service } = build();

    await expect(service.revokeRefresh('not.a.token')).resolves.toBeUndefined();
  });

  describe('tryReadAccess', () => {
    it('returns the claims for a valid access token', async () => {
      const { service } = build();
      const { accessToken } = await service.issue(claims);

      expect(await service.tryReadAccess(accessToken)).toMatchObject({ sub: 'user-1' });
    });

    it.each([
      ['no token', null],
      ['a junk token', 'garbage'],
    ])('returns null for %s instead of throwing', async (_label, token) => {
      const { service } = build();

      expect(await service.tryReadAccess(token)).toBeNull();
    });

    it('returns null for a refresh token', async () => {
      const { service } = build();
      const { refreshToken } = await service.issue(claims);

      expect(await service.tryReadAccess(refreshToken)).toBeNull();
    });
  });
});
