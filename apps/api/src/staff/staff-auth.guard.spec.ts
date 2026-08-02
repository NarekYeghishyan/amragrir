import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, StaffRole } from '@amragrir/shared';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { PERMISSION_KEY, STAFF_ROUTE_KEY } from './decorators';
import { StaffAuthGuard } from './staff-auth.guard';
import type { StaffJwtPayload } from './staff-token.service';

const claims: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantManager, restaurantId: null, branchId: 'branch-1' }],
};

interface Meta {
  [PERMISSION_KEY]?: Permission;
  [STAFF_ROUTE_KEY]?: boolean;
  [IS_PUBLIC_KEY]?: boolean;
}

function build(meta: Meta, authorization?: string, verify = jest.fn().mockResolvedValue(claims)) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => meta[key as keyof Meta]),
  } as unknown as Reflector;

  const request: { headers: Record<string, string>; staff?: StaffJwtPayload } = {
    headers: authorization ? { authorization } : {},
  };

  const context = {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  const guard = new StaffAuthGuard(reflector, { verifyAccess: verify } as never);
  return { guard, context, request, verify };
}

describe('StaffAuthGuard', () => {
  it('is inert on a route that is not a staff route', async () => {
    // Customer endpoints must not start demanding a staff token.
    const { guard, context, verify } = build({}, 'Bearer anything');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('authenticates a staff route', async () => {
    const { guard, context, request } = build({ [STAFF_ROUTE_KEY]: true }, 'Bearer token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.staff).toEqual(claims);
  });

  it('refuses a staff route with no token', async () => {
    const { guard, context } = build({ [STAFF_ROUTE_KEY]: true });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets @Public() through — sign-in cannot require a token to reach', async () => {
    const { guard, context, verify } = build({ [STAFF_ROUTE_KEY]: true, [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('treats @RequiresPermission as implying a staff route', async () => {
    // Otherwise forgetting @StaffRoute() next to it would leave the endpoint
    // authenticated by the customer guard instead.
    const { guard, context, request } = build(
      { [PERMISSION_KEY]: Permission.OrdersRead },
      'Bearer token',
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.staff).toEqual(claims);
  });

  it('refuses a permission none of the held roles grant', async () => {
    // A manager may not write the menu, in their branch or anywhere else.
    const { guard, context } = build({ [PERMISSION_KEY]: Permission.MenuWrite }, 'Bearer token');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propagates a rejected token as 401, not 403', async () => {
    const verify = jest.fn().mockRejectedValue(new UnauthorizedException('Not a staff token'));
    const { guard, context } = build({ [STAFF_ROUTE_KEY]: true }, 'Bearer customer-token', verify);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('leaves WebSocket contexts alone', async () => {
    const { guard, context } = build({ [STAFF_ROUTE_KEY]: true });
    (context as { getType: () => string }).getType = () => 'ws';
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
