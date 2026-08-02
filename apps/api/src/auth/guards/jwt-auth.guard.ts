import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Permission } from '@amragrir/shared';
import { IS_PUBLIC_KEY } from '../decorators';
import { bearerFrom } from '../bearer';
import { JwtPayload, TokenService } from '../token.service';
import { PERMISSION_KEY, STAFF_ROUTE_KEY } from '../../staff/decorators';

/**
 * Registered globally, so every route is authenticated unless explicitly
 * marked @Public(). Secure by default: forgetting a guard on a new endpoint
 * locks it down rather than exposing it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Global guards run for WebSocket handlers too, where there is no HTTP
    // request to read a header from. Sockets authenticate themselves in the
    // `subscribe` message instead (see OrdersGateway) — a browser cannot set
    // an Authorization header on a WebSocket handshake.
    if (context.getType() !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) {
      return true;
    }

    // Back-office routes carry a staff token, which deliberately fails to
    // verify here. StaffAuthGuard authenticates them instead; this guard
    // standing down is what lets the two identities coexist on one API.
    const isStaffRoute =
      this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, targets) !== undefined ||
      this.reflector.getAllAndOverride<boolean>(STAFF_ROUTE_KEY, targets) === true;
    if (isStaffRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const token = bearerFrom(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.user = await this.tokens.verifyAccess(token);
    return true;
  }
}
