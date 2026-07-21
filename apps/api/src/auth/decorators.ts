import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@amragrir/shared';
import type { JwtPayload } from './token.service';

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const VERIFIED_PHONE_KEY = 'auth:verifiedPhone';

/** Opts an endpoint out of the global JwtAuthGuard. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts an endpoint to the given roles (checked by RolesGuard). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Requires a verified phone. Guests may browse, but ordering and booking are
 * gated on verification (ROLES_AND_PERMISSIONS.md).
 */
export const RequiresVerifiedPhone = (): MethodDecorator & ClassDecorator =>
  SetMetadata(VERIFIED_PHONE_KEY, true);

/** Injects the authenticated user's JWT claims into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
