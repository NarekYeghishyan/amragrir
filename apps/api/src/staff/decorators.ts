import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@amragrir/shared';
import type { StaffJwtPayload } from './staff-token.service';

export const STAFF_ROUTE_KEY = 'staff:route';
export const PERMISSION_KEY = 'staff:permission';

/**
 * Marks a route as belonging to the back office.
 *
 * The global customer guard skips these, and StaffAuthGuard takes over — so a
 * staff route is never reachable with a customer token and vice versa. Applied
 * to a controller class it covers every route on it.
 */
export const StaffRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(STAFF_ROUTE_KEY, true);

/**
 * The permission a staff route requires (see ROLE_PERMISSIONS in
 * `@amragrir/shared`). Implies @StaffRoute().
 *
 * This answers "may this account call this endpoint at all". *Which rows* it
 * may then touch is a scope filter in the service — the two are separate
 * questions and conflating them is how an endpoint ends up correctly guarded
 * and still returning somebody else's data.
 */
export const RequiresPermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);

/** Injects the authenticated staff account's claims into a handler parameter. */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffJwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ staff: StaffJwtPayload }>();
    return request.staff;
  },
);
