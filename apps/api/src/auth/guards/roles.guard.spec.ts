import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@amragrir/shared';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY, VERIFIED_PHONE_KEY } from '../decorators';
import type { JwtPayload } from '../token.service';

function contextWith(user?: JwtPayload, type: 'http' | 'ws' = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function reflectorWith(meta: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

const customer: JwtPayload = {
  sub: 'u1',
  role: Role.Customer,
  isGuest: false,
  phoneVerified: true,
};

describe('RolesGuard', () => {
  it('allows endpoints that declare no requirements', () => {
    const guard = new RolesGuard(reflectorWith({}));

    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [Role.Customer, Role.Admin] }));

    expect(guard.canActivate(contextWith(customer))).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [Role.Admin] }));

    expect(() => guard.canActivate(contextWith(customer))).toThrow(ForbiddenException);
  });

  // Guests may browse, but ordering and booking require a verified phone
  // (ROLES_AND_PERMISSIONS.md). This is the check that enforces it.
  it('rejects an unverified guest on a phone-gated endpoint', () => {
    const guard = new RolesGuard(reflectorWith({ [VERIFIED_PHONE_KEY]: true }));
    const guest: JwtPayload = {
      sub: 'g1',
      role: Role.Customer,
      isGuest: true,
      phoneVerified: false,
    };

    expect(() => guard.canActivate(contextWith(guest))).toThrow(/phone verification/i);
  });

  it('allows a verified user on a phone-gated endpoint', () => {
    const guard = new RolesGuard(reflectorWith({ [VERIFIED_PHONE_KEY]: true }));

    expect(guard.canActivate(contextWith(customer))).toBe(true);
  });

  it('rejects an unauthenticated request on a guarded endpoint', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [Role.Customer] }));

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });

  // Global guards also run for WebSocket handlers, where there is no
  // request.user to read — sockets authorise themselves per subscription
  // instead. Without this the gateway would throw on every message.
  it('steps aside for a WebSocket context', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [Role.Admin] }));

    expect(guard.canActivate(contextWith(undefined, 'ws'))).toBe(true);
  });
});
