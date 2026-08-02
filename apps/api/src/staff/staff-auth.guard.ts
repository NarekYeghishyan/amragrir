import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPermission, type Permission } from '@amragrir/shared';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { bearerFrom } from '../auth/bearer';
import { PERMISSION_KEY, STAFF_ROUTE_KEY } from './decorators';
import { StaffJwtPayload, StaffTokenService } from './staff-token.service';

/**
 * Authenticates and authorises the back office.
 *
 * Registered globally alongside the customer guards and inert on everything
 * that is not marked @StaffRoute() or @RequiresPermission(). It populates
 * `request.staff` — a different property from `request.user` on purpose, so a
 * handler cannot accidentally read one where it meant the other.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: StaffTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];
    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, targets);
    const isStaffRoute =
      permission !== undefined ||
      this.reflector.getAllAndOverride<boolean>(STAFF_ROUTE_KEY, targets) === true;

    if (!isStaffRoute) {
      return true;
    }

    // @Public() still wins — the sign-in and invite-acceptance routes live on a
    // staff controller and cannot require a token to reach.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { staff?: StaffJwtPayload }>();
    const token = bearerFrom(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const staff = await this.tokens.verifyAccess(token);

    if (permission !== undefined && !hasPermission(staff.scopes, permission)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    request.staff = staff;
    return true;
  }
}
