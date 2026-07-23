import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Role } from '@amragrir/shared';
import { RedisService } from '../redis/redis.service';

/**
 * Both token kinds are signed with the same secret, so the payload must say
 * which one it is. Without this a refresh token verifies fine as a bearer
 * credential — and since it carries no `role`, guards would read `undefined`
 * and wave through anything that does not name an explicit role.
 */
export const TokenType = {
  Access: 'access',
  Refresh: 'refresh',
} as const;
export type TokenType = (typeof TokenType)[keyof typeof TokenType];

/** Claims carried by the access token. Guards read these — never the DB — on
 *  the hot path, so anything a guard needs must live here. */
export interface JwtPayload {
  sub: string;
  role: Role;
  isGuest: boolean;
  phoneVerified: boolean;
  typ?: TokenType;
}

interface RefreshPayload {
  sub: string;
  jti: string;
  typ?: TokenType;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_KEY = (userId: string, jti: string): string => `refresh:${userId}:${jti}`;

/**
 * Issues and rotates JWTs. Refresh tokens are registered in Redis by id so
 * they can actually be revoked — a signed-but-forgotten token would otherwise
 * stay valid for its full 30 days after logout.
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.accessTtl = this.config.getOrThrow<number>('JWT_ACCESS_TTL');
    this.refreshTtl = this.config.getOrThrow<number>('JWT_REFRESH_TTL');
  }

  async issue(payload: JwtPayload): Promise<TokenPair> {
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { ...payload, typ: TokenType.Access },
      { expiresIn: this.accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, jti, typ: TokenType.Refresh } satisfies RefreshPayload,
      { expiresIn: this.refreshTtl },
    );

    await this.redis.setEx(REFRESH_KEY(payload.sub, jti), '1', this.refreshTtl);

    return { accessToken, refreshToken };
  }

  async verifyAccess(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.typ !== TokenType.Access) {
      throw new UnauthorizedException('Not an access token');
    }

    return payload;
  }

  /**
   * Validates a refresh token and consumes it. Returns the user id so the
   * caller can re-read the user and mint a pair with fresh claims (role or
   * phoneVerified may have changed since the token was issued).
   */
  async consumeRefresh(token: string): Promise<string> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== TokenType.Refresh || !payload.jti) {
      throw new UnauthorizedException('Not a refresh token');
    }

    const key = REFRESH_KEY(payload.sub, payload.jti);
    if (!(await this.redis.exists(key))) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Rotation: a refresh token is single-use.
    await this.redis.del(key);
    return payload.sub;
  }

  async revokeRefresh(token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token);
      if (payload.typ === TokenType.Refresh && payload.jti) {
        await this.redis.del(REFRESH_KEY(payload.sub, payload.jti));
      }
    } catch {
      // Logging out with an already-invalid token is not an error.
    }
  }

  /**
   * Revokes every refresh token a user holds.
   *
   * Used when their role changes. Access tokens carry `role` and cannot be
   * recalled, so a demoted account keeps its old powers until the current one
   * expires — up to 15 minutes. Killing the refresh tokens is what stops that
   * window being extended indefinitely, and it is the reason the access TTL is
   * short in the first place.
   */
  async revokeAllFor(userId: string): Promise<number> {
    return this.redis.deleteByPattern(REFRESH_KEY(userId, '*'));
  }

  /** Best-effort read for endpoints that accept an optional bearer (e.g.
   *  verify-code, which upgrades the caller's guest account when present). */
  async tryReadAccess(token: string | null): Promise<JwtPayload | null> {
    if (!token) {
      return null;
    }
    try {
      return await this.verifyAccess(token);
    } catch {
      return null;
    }
  }
}
