import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Role } from '@amragrir/shared';
import type { JwtPayload } from '../auth/token.service';

/**
 * The one definition of "which orders may this staff-side user touch".
 *
 * Returned as a Prisma filter rather than a boolean check so ownership is part
 * of every query instead of something remembered afterwards — same rule as the
 * customer side (ROLES_AND_PERMISSIONS.md).
 *
 * `staff` is deliberately absent: the schema has no link between a user and a
 * branch, so there is nothing to scope them by. Adding staff means adding that
 * table first; until then they are refused rather than quietly given the
 * owner's reach.
 */
export function orderScopeFor(user: JwtPayload): Prisma.OrderWhereInput {
  if (user.role === Role.Admin) {
    return {};
  }
  if (user.role === Role.Owner) {
    return { branch: { restaurant: { ownerId: user.sub } } };
  }
  throw new ForbiddenException('This account cannot manage orders');
}
