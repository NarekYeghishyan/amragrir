import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditAction, Permission } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { StaffJwtPayload } from './staff-token.service';
import { StaffTokenService } from './staff-token.service';
import { toProfile, toScopes, type StaffProfile } from './staff-auth.service';
import { reachFor } from './scope';

export interface ImpersonationResult {
  accessToken: string;
  /** Seconds the token is good for. The panel shows it and drops back to the
   *  super admin's own session when it runs out. */
  expiresIn: number;
  /** Who the caller is now acting as, in the same shape `/auth/staff/me`
   *  returns — the back office renders its tabs from this without a second
   *  request or a second type. */
  staff: StaffProfile;
}

/**
 * Signing in as somebody else.
 *
 * Only a `super_admin` may do this, and only because they already hold every
 * permission over every scope: acting as a restaurant admin is a *narrowing* of
 * what they can reach, not a way to acquire something new. That is the whole
 * argument for the feature being safe, and it stops being true the moment
 * `staff:impersonate` is granted to a narrower role — see the comment on
 * `SUPER_ADMIN` in `packages/shared/src/staff-roles.ts`.
 *
 * The token that comes out is deliberately impoverished: an access token with
 * no refresh half, so the session cannot be extended and closes by itself after
 * one TTL (`StaffTokenService.issueImpersonation`).
 *
 * It is also the first thing in the codebase that writes `audit_log`. That is
 * not incidental — the impersonated session carries full write access, so
 * without a row here the only record of who advanced an order would name the
 * person who did not do it.
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: StaffTokenService,
    private readonly audit: AuditService,
  ) {}

  async begin(actor: StaffJwtPayload, targetId: string, ip?: string): Promise<ImpersonationResult> {
    // Impersonation does not chain. Allowing it would make the audit trail a
    // guess — `act` holds one id, so a second hop would either overwrite the
    // real actor or record a person who was themselves being acted as.
    if (actor.act !== undefined) {
      throw new ForbiddenException('You are already signed in as somebody else');
    }

    if (targetId === actor.sub) {
      throw new ForbiddenException('You are already signed in as yourself');
    }

    const target = await this.prisma.staffUser.findFirst({
      where: { id: targetId, assignments: { some: this.reach(actor) } },
      include: { assignments: true },
    });
    // 404 rather than 403 for a target outside reach, as everywhere else in this
    // module: a 403 would confirm the account exists.
    if (!target) {
      throw new NotFoundException('Staff account not found');
    }

    if (!target.isActive) {
      // The same refusal their own password would get. A deactivated account is
      // one nobody may be, including a super admin.
      throw new ForbiddenException('That account is deactivated');
    }

    const scopes = toScopes(target.assignments);
    if (scopes.length === 0) {
      // Mirrors the login path: a token over no roles produces a panel where
      // every screen 403s, which is a worse answer than saying so.
      throw new ForbiddenException('That account holds no roles');
    }

    // Written before the token is handed out, and not inside a transaction with
    // it: there is no transaction to be in — signing is not a database write —
    // and a recorded impersonation that then failed to issue is the harmless
    // direction of the two. `recordStandalone` is that case, and the only one.
    //
    // No scope, so both scope columns stay null: signing in as somebody is not
    // an act over any one restaurant, and it is the platform's business rather
    // than a restaurant admin's. Null in both is exactly what makes this row
    // readable only by an account whose reach is unscoped.
    await this.audit.recordStandalone(actor, {
      action: AuditAction.StaffImpersonate,
      entityId: target.id,
      after: {
        email: target.email,
        roles: scopes.map((scope) => ({
          role: scope.role,
          restaurantId: scope.restaurantId,
          branchId: scope.branchId,
        })),
      },
      ip: ip ?? null,
    });

    const { accessToken, expiresIn } = await this.tokens.issueImpersonation(
      target.id,
      scopes,
      actor.sub,
    );

    this.logger.log(`Staff ${actor.sub} is now acting as ${target.id}`);
    return { accessToken, expiresIn, staff: toProfile(target, scopes) };
  }

  /**
   * Which accounts the caller may act as: the ones holding a role inside their
   * reach for `staff:impersonate`.
   *
   * Only `super_admin` grants that permission, and it is platform-scoped, so
   * today this is always `{}` — every account. It is written as a reach filter
   * anyway rather than short-circuited to "everyone", so that the day the
   * permission moves the query narrows with it instead of silently staying open.
   */
  private reach(actor: StaffJwtPayload): Prisma.StaffAssignmentWhereInput {
    const reach = reachFor(actor.scopes, Permission.StaffImpersonate);
    if (reach.all) {
      return {};
    }
    return {
      OR: [
        { restaurantId: { in: reach.restaurantIds } },
        { branch: { restaurantId: { in: reach.restaurantIds } } },
        { branchId: { in: reach.branchIds } },
      ],
    };
  }
}
