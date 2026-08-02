import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { StaffScope } from '@amragrir/shared';
import { RedisService } from '../redis/redis.service';
import { TokenType } from '../auth/token.service';

/**
 * Claims carried by a staff access token.
 *
 * `kind` is what keeps the two identities apart. Both token families are signed
 * with the same secret, so without it a customer's access token would verify
 * perfectly here — and arrive with no `scopes`, which every permission check
 * would read as "grants nothing" only by luck. The customer guard performs the
 * mirror-image check, so neither token can be used on the other side.
 */
export interface StaffJwtPayload {
  sub: string;
  kind: 'staff';
  /** Every role this account holds, and what each is scoped to. Read on the hot
   *  path by guards, which is why it travels in the token rather than a join. */
  scopes: StaffScope[];
  typ?: TokenType;
  /**
   * Set only on an impersonation token: the id of the super admin actually
   * holding it. `sub` stays the person being acted as, so every scope filter,
   * every query and every guard behaves exactly as it would for them — which is
   * the point of impersonating at all.
   *
   * Its presence is also what stops impersonation chaining: a token that
   * carries it may not begin another one.
   */
  act?: string;
}

interface StaffRefreshPayload {
  sub: string;
  kind: 'staff';
  jti: string;
  typ?: TokenType;
}

export interface StaffTokenPair {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_KEY = (staffUserId: string, jti: string): string =>
  `staff_refresh:${staffUserId}:${jti}`;

/**
 * The staff half of token issuing. Deliberately separate from `TokenService`
 * rather than a flag on it: the two have different claim shapes, different
 * revocation keys, and different reasons to be revoked.
 */
@Injectable()
export class StaffTokenService {
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

  async issue(staffUserId: string, scopes: StaffScope[]): Promise<StaffTokenPair> {
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: staffUserId, kind: 'staff', scopes, typ: TokenType.Access } satisfies StaffJwtPayload,
      { expiresIn: this.accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: staffUserId, kind: 'staff', jti, typ: TokenType.Refresh } satisfies StaffRefreshPayload,
      { expiresIn: this.refreshTtl },
    );

    await this.redis.setEx(REFRESH_KEY(staffUserId, jti), '1', this.refreshTtl);

    return { accessToken, refreshToken };
  }

  /**
   * An access token that acts as somebody else — and **no refresh token**.
   *
   * The missing half is the whole design. `/auth/staff/refresh` re-reads the
   * target's assignments and mints a fresh pair from them, which would drop
   * `act` on the way through: a bounded impersonation would quietly become an
   * unlimited session as that person, indistinguishable from their own. With
   * only an access token the window closes by itself after one TTL, and the
   * back office falls back to the super admin's own session when it does.
   *
   * `expiresIn` is returned rather than left to be decoded, so the panel can
   * say how long is left without parsing a JWT it should not be reading.
   */
  async issueImpersonation(
    targetStaffUserId: string,
    scopes: StaffScope[],
    actorStaffUserId: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: targetStaffUserId,
        kind: 'staff',
        scopes,
        typ: TokenType.Access,
        act: actorStaffUserId,
      } satisfies StaffJwtPayload,
      { expiresIn: this.accessTtl },
    );

    return { accessToken, expiresIn: this.accessTtl };
  }

  async verifyAccess(token: string): Promise<StaffJwtPayload> {
    let payload: StaffJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<StaffJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.typ !== TokenType.Access) {
      throw new UnauthorizedException('Not an access token');
    }
    // A customer token verifies against the same secret. Refusing it here is
    // what makes the back office unreachable with a customer's credentials.
    if (payload.kind !== 'staff') {
      throw new UnauthorizedException('Not a staff token');
    }

    return payload;
  }

  /**
   * Validates and consumes a staff refresh token, returning the account id.
   *
   * The caller re-reads the assignments before minting a new pair, so a role
   * granted or taken away since the last refresh takes effect here rather than
   * at the next sign-in.
   */
  async consumeRefresh(token: string): Promise<string> {
    let payload: StaffRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<StaffRefreshPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== TokenType.Refresh || payload.kind !== 'staff' || !payload.jti) {
      throw new UnauthorizedException('Not a staff refresh token');
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
      const payload = await this.jwt.verifyAsync<StaffRefreshPayload>(token);
      if (payload.typ === TokenType.Refresh && payload.kind === 'staff' && payload.jti) {
        await this.redis.del(REFRESH_KEY(payload.sub, payload.jti));
      }
    } catch {
      // Logging out with an already-invalid token is not an error.
    }
  }

  /**
   * Revokes every session an account holds.
   *
   * Called when assignments change, when a password is reset, and when an
   * account is deactivated. Access tokens carry the scopes and cannot be
   * recalled, so the old one keeps working until it expires — killing the
   * refresh tokens is what bounds that window to the access TTL.
   */
  async revokeAllFor(staffUserId: string): Promise<number> {
    return this.redis.deleteByPattern(REFRESH_KEY(staffUserId, '*'));
  }

  /** Best-effort read, for the WebSocket handshake — where a token that is
   *  simply the other identity's is an expected case, not an error. */
  async tryReadAccess(token: string | null): Promise<StaffJwtPayload | null> {
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
