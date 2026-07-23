import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@amragrir/shared';
import { ROLES_KEY, VERIFIED_PHONE_KEY } from '../decorators';
import type { JwtPayload } from '../token.service';

/**
 * Enforces @Roles() and @RequiresVerifiedPhone(). Runs after JwtAuthGuard, so
 * `request.user` is already populated.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Same reasoning as JwtAuthGuard: WebSocket handlers carry no
    // request.user, and authorize themselves per subscription instead.
    if (context.getType() !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const needsVerifiedPhone = this.reflector.getAllAndOverride<boolean>(
      VERIFIED_PHONE_KEY,
      targets,
    );

    if (!roles && !needsVerifiedPhone) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (needsVerifiedPhone && !user.phoneVerified) {
      throw new ForbiddenException('Phone verification required');
    }

    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
