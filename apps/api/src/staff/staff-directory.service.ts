import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AuditAction,
  Permission,
  ROLE_PERMISSIONS,
  ROLE_SCOPE,
  StaffRole,
  scopesGranting,
  type StaffScope,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { StaffJwtPayload } from './staff-token.service';
import { StaffTokenService } from './staff-token.service';
import { InvitesService } from './invites.service';
import { reachFor } from './scope';
import { CreateInviteDto, ListStaffDto, ListTeamDto } from './dto';

export interface StaffListEntry {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  /** Only the assignments the caller may see — a person who also works
   *  somewhere out of reach does not reveal that here. */
  assignments: Array<{
    id: string;
    role: StaffRole;
    /**
     * The restaurant the role **reaches** — the one it names, or, for a
     * branch-scoped role, the one that branch belongs to.
     *
     * Not a copy of the `restaurant_id` column, which is null for every branch
     * role because an assignment names a restaurant or a branch and never both.
     * Reading it out raw left a shift's row saying only "Northern Ave", and
     * three restaurants have a branch by that name. Null now means what it
     * sounds like: a platform role, which is over no restaurant at all.
     *
     * Which of the two columns the assignment actually names is still legible —
     * `branchId` says so.
     */
    restaurantId: string | null;
    restaurantName: string | null;
    branchId: string | null;
    branchName: string | null;
  }>;
}

/** One role held over a restaurant or one of its branches, with whoever holds
 *  it. Two of these are the same person when they manage two branches. */
export interface RestaurantPerson {
  /** The **assignment's** id — this row is a role, and the person may hold
   *  several. */
  id: string;
  role: StaffRole;
  branchId: string | null;
  /** The branch's name, falling back to its city, or null for a role held over
   *  the restaurant as a whole. */
  branchName: string | null;
  person: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    lastLoginAt: string | null;
  };
}

/**
 * The staff directory: who works here, and what they may do.
 *
 * Two rules run through all of it, and they are the reason this is a service
 * rather than four thin queries:
 *
 * 1. **You only see your own reach.** A restaurant admin sees the people
 *    assigned to their restaurant, not the platform's staff list.
 * 2. **You cannot grant what you do not hold.** Otherwise a restaurant admin
 *    could invite a `super_admin` and take over the platform through a role
 *    they were never given.
 */
@Injectable()
export class StaffDirectoryService {
  private readonly logger = new Logger(StaffDirectoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
    private readonly tokens: StaffTokenService,
    private readonly audit: AuditService,
  ) {}

  async list(
    staff: StaffJwtPayload,
    query: ListStaffDto,
  ): Promise<{ items: StaffListEntry[]; total: number; page: number }> {
    const reach = this.assignmentReach(staff, Permission.StaffRead);
    const term = query.q?.trim();

    // Which assignment makes a person appear at all: one inside the caller's
    // reach, and — when a role is asked for — one of that role. Both conditions
    // on the *same* assignment, not on the person: otherwise "managers" would
    // list somebody who is a manager somewhere out of reach and a dishwasher
    // here, on the strength of two different rows.
    const qualifying: Prisma.StaffAssignmentWhereInput =
      query.role === undefined ? reach : { AND: [reach, { role: query.role }] };

    const where: Prisma.StaffUserWhereInput = { assignments: { some: qualifying } };

    // Alongside the reach filter, never instead of it. Being handed somebody's
    // id — from a link in an order's history, or typed into the address bar —
    // is not a reason to be shown a person the caller could not otherwise see,
    // so an id outside the reach narrows this list to nothing, which is the
    // same answer the directory gives for anybody else out there.
    if (query.id) {
      where.id = query.id;
    }

    if (term) {
      // `AND`, not `OR`. Nothing puts an `OR` at this level today — the reach
      // filter lives down inside `assignments` — but the order board had
      // exactly this shape and one assignment there turned a search into a way
      // to read every restaurant's orders. Nesting costs nothing and cannot go
      // wrong later.
      where.AND = [
        {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            // Where they work, which is the other thing the card shows. Still
            // through `qualifying`, so searching a restaurant name cannot
            // surface a person by an assignment the caller may not see.
            {
              assignments: {
                some: {
                  AND: [
                    qualifying,
                    {
                      OR: [
                        { restaurant: { name: { contains: term, mode: 'insensitive' } } },
                        { branch: { name: { contains: term, mode: 'insensitive' } } },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.staffUser.findMany({
        where,
        include: {
          assignments: {
            // Filtered to the caller's reach — and to nothing else. Seeing that
            // someone works here does not mean seeing everywhere else they
            // work, but neither does filtering by role mean hiding the roles
            // that did not match: this is the screen somebody revokes a role
            // from, and a card showing one of a person's three is how a role
            // gets taken away in the belief it was the last one.
            where: reach,
            include: {
              restaurant: { select: { name: true } },
              // The branch's restaurant comes with it. A branch role names only
              // the branch, so without this the row could not say whose branch
              // it is — and it is the restaurant that makes the branch a place
              // rather than a name.
              branch: {
                select: {
                  name: true,
                  city: true,
                  restaurantId: true,
                  restaurant: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.staffUser.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        isActive: row.isActive,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        assignments: row.assignments.map((assignment) => ({
          id: assignment.id,
          role: assignment.role,
          // Whichever of the two names it: the restaurant itself for an admin,
          // the branch's restaurant for a manager or a shift. Only a platform
          // role falls through to null.
          restaurantId: assignment.restaurantId ?? assignment.branch?.restaurantId ?? null,
          restaurantName: assignment.restaurant?.name ?? assignment.branch?.restaurant.name ?? null,
          branchId: assignment.branchId,
          // Falling back to the city, the way a branch is named everywhere
          // else — an unnamed branch is otherwise a row with a blank in it.
          branchName:
            assignment.branch === null ? null : (assignment.branch.name ?? assignment.branch.city),
        })),
      })),
      total,
      page: query.page,
    };
  }

  /**
   * Who holds a role over the restaurant **itself** — its admins.
   *
   * Not its branches' people: an assignment names a restaurant or a branch and
   * never both, so this is exactly the roles that reach the whole restaurant,
   * and `listBranchPeople` answers for each branch separately. The two together
   * are the whole team, asked for where each half is read — the restaurant's
   * admins beside the restaurant's own facts, a branch's staff under that
   * branch.
   *
   * Platform roles never appear: their assignment names no restaurant, and a
   * super admin is not staff *of* this restaurant however much of it they can
   * see.
   */
  listRestaurantPeople(
    staff: StaffJwtPayload,
    restaurantId: string,
    query: ListTeamDto,
  ): Promise<{ items: RestaurantPerson[]; total: number; page: number }> {
    return this.listTeam(staff, { restaurantId }, query);
  }

  /**
   * Who works at one branch — its manager and its shifts.
   *
   * Hangs off the branch rather than taking a `branchId` on the restaurant's
   * list, because the assignment is on the branch: the reach filter then guards
   * this the same way it guards everything else, with no second check that the
   * branch belongs to the restaurant somebody named. A branch out of reach
   * comes back empty rather than 403 — it is a collection, and an empty one
   * says nothing about whether the branch exists.
   */
  listBranchPeople(
    staff: StaffJwtPayload,
    branchId: string,
    query: ListTeamDto,
  ): Promise<{ items: RestaurantPerson[]; total: number; page: number }> {
    return this.listTeam(staff, { branchId }, query);
  }

  /**
   * One scope's roles, with whoever holds them.
   *
   * **A row per assignment, not per person.** The question this answers is
   * "who works here and as what", and somebody who manages two of the branches
   * is two answers to it. Grouping them into one row would have to pick a
   * branch to name, and there is no right pick.
   *
   * Ordered by `role` first, which sorts by the Postgres enum's *declaration*
   * order — `super_admin, platform_admin, restaurant_admin,
   * restaurant_manager, branch_staff` in `schema.prisma`, which is seniority.
   * That is a real ordering rather than a coincidence, but it is a dependency
   * on the enum's order, so a test pins it.
   */
  private async listTeam(
    staff: StaffJwtPayload,
    over: Prisma.StaffAssignmentWhereInput,
    query: ListTeamDto,
  ): Promise<{ items: RestaurantPerson[]; total: number; page: number }> {
    const where: Prisma.StaffAssignmentWhereInput = {
      AND: [
        // Reach first, and as its own term: the scope filter narrows what the
        // caller may already see and must never be able to stand in for it.
        this.assignmentReach(staff, Permission.StaffRead),
        over,
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.staffAssignment.findMany({
        where,
        include: {
          staffUser: {
            select: { id: true, email: true, name: true, isActive: true, lastLoginAt: true },
          },
          branch: { select: { id: true, name: true, city: true } },
        },
        orderBy: [
          { role: 'asc' },
          { branch: { name: 'asc' } },
          { staffUser: { name: 'asc' } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.staffAssignment.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        // The assignment's id, not the person's: it is what identifies this
        // role, and two rows here can be the same person.
        id: row.id,
        role: row.role,
        branchId: row.branchId,
        branchName: row.branch === null ? null : (row.branch.name ?? row.branch.city),
        person: {
          id: row.staffUser.id,
          name: row.staffUser.name,
          email: row.staffUser.email,
          isActive: row.staffUser.isActive,
          lastLoginAt: row.staffUser.lastLoginAt?.toISOString() ?? null,
        },
      })),
      total,
      page: query.page,
    };
  }

  async listInvites(staff: StaffJwtPayload, query: ListStaffDto) {
    // An invite carries the same scope columns as the assignment it will
    // become, so it filters the same way — but Prisma types the two
    // separately, so the filter is built for this table rather than cast.
    const where: Prisma.StaffInviteWhereInput = {
      acceptedAt: null,
      ...this.inviteReach(staff, Permission.StaffRead),
    };
    if (query.role !== undefined) {
      where.role = query.role;
    }

    const term = query.q?.trim();
    if (term) {
      // `AND` because `inviteReach` spreads its own `OR` into this object —
      // assigning `where.OR` here would drop the reach filter and hand back
      // every open invitation on the platform.
      where.AND = [
        {
          OR: [
            { email: { contains: term, mode: 'insensitive' } },
            { restaurant: { name: { contains: term, mode: 'insensitive' } } },
            { branch: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.staffInvite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.staffInvite.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        restaurantId: row.restaurantId,
        branchId: row.branchId,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
    };
  }

  async invite(staff: StaffJwtPayload, dto: CreateInviteDto) {
    await this.assertMayGrant(staff, dto);
    return this.invites.create(staff, dto);
  }

  async revokeInvite(staff: StaffJwtPayload, id: string): Promise<void> {
    const invite = await this.prisma.staffInvite.findFirst({
      where: { id, acceptedAt: null, ...this.inviteReach(staff, Permission.StaffInvite) },
      select: { id: true, email: true, role: true, restaurantId: true, branchId: true },
    });
    if (!invite) {
      throw new NotFoundException('Invitation not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffInvite.delete({ where: { id } });

      // The row is hard-deleted, so `before` is the only thing that will ever
      // say who was invited and to what. Without it the feed could report that
      // an invitation was withdrawn and nothing else — an entry that raises the
      // question it exists to answer.
      await this.audit.record(tx, staff, {
        action: AuditAction.StaffInviteRevoke,
        entityId: id,
        scope: { restaurantId: invite.restaurantId, branchId: invite.branchId },
        before: { email: invite.email, role: invite.role },
      });
    });

    this.logger.log(`${staff.sub} withdrew invitation ${id}`);
  }

  /**
   * Takes a role away and ends that account's sessions.
   *
   * The sessions matter: the scopes travel in the access token, so without this
   * the revoked role keeps working until the token expires. Revoking the
   * refresh tokens bounds that to the access TTL, and the next refresh re-reads
   * the assignments.
   */
  async revokeAssignment(staff: StaffJwtPayload, id: string): Promise<void> {
    const assignment = await this.prisma.staffAssignment.findFirst({
      where: { id, ...this.assignmentReach(staff, Permission.StaffRevoke) },
      select: {
        id: true,
        staffUserId: true,
        role: true,
        restaurantId: true,
        branchId: true,
        staffUser: { select: { name: true, email: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Nobody may remove their own last way back in.
    if (assignment.staffUserId === staff.sub) {
      throw new ForbiddenException('You cannot remove your own role');
    }

    // Never the last super admin: no route exists to appoint another one.
    if (assignment.role === StaffRole.SuperAdmin) {
      const remaining = await this.prisma.staffAssignment.count({
        where: { role: StaffRole.SuperAdmin },
      });
      if (remaining <= 1) {
        throw new ForbiddenException('The last super admin cannot be removed');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffAssignment.delete({ where: { id } });

      // A revoked role is hard-deleted rather than flagged, deliberately: it has
      // to be *gone* from the permission path, not filtered out of it, because
      // the one query that forgot the filter would leave somebody holding a role
      // that was taken away. `before` is what keeps the fact readable afterwards.
      await this.audit.record(tx, staff, {
        action: AuditAction.StaffAssignmentRevoke,
        entityId: id,
        scope: { restaurantId: assignment.restaurantId, branchId: assignment.branchId },
        before: {
          role: assignment.role,
          staffUserId: assignment.staffUserId,
          name: assignment.staffUser.name,
          email: assignment.staffUser.email,
        },
      });
    });

    // Outside the transaction: revoking sessions is a Redis write, so it cannot
    // be atomic with the row. This order is the safe one — the role is already
    // gone from the database, and a session that outlives it by an access TTL is
    // the failure the revocation is bounding, not one it could cause.
    const revoked = await this.tokens.revokeAllFor(assignment.staffUserId);
    this.logger.log(
      `${staff.sub} revoked ${assignment.role} from ${assignment.staffUserId}; ` +
        `ended ${revoked} session(s)`,
    );
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Which assignments the caller may see or touch.
   *
   * A platform role reaches all of them. A restaurant admin reaches the ones on
   * their restaurant *and* on its branches — a branch-scoped assignment names
   * only the branch, so the restaurant half of the filter has to reach through
   * it, or hiring a manager would produce someone their own admin cannot see.
   */
  private assignmentReach(
    staff: StaffJwtPayload,
    permission: Permission,
  ): Prisma.StaffAssignmentWhereInput {
    return this.scopeFilter(staff, permission);
  }

  /**
   * The same filter against `staff_invites`.
   *
   * An invite carries the same two scope columns as the assignment it becomes,
   * so the filter is identical — but Prisma brands its filter types per table,
   * so structurally equal is not assignable and the cast says why.
   */
  private inviteReach(staff: StaffJwtPayload, permission: Permission): Prisma.StaffInviteWhereInput {
    return this.scopeFilter(staff, permission) as Prisma.StaffInviteWhereInput;
  }

  private scopeFilter(
    staff: StaffJwtPayload,
    permission: Permission,
  ): Prisma.StaffAssignmentWhereInput {
    const reach = reachFor(staff.scopes, permission);
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

  /**
   * Refuses a grant the caller could not make themselves.
   *
   * Two separate questions: is the role within what they hold, and is the scope
   * within their reach. Passing one and failing the other is how a restaurant
   * admin would end up appointing a platform admin over nothing in particular.
   */
  private async assertMayGrant(staff: StaffJwtPayload, dto: CreateInviteDto): Promise<void> {
    const held = new Set(
      scopesGranting(staff.scopes, Permission.StaffInvite).flatMap((scope) => [
        ...ROLE_PERMISSIONS[scope.role],
      ]),
    );
    const granting = ROLE_PERMISSIONS[dto.role];

    const excess = granting.filter((permission) => !held.has(permission));
    if (excess.length > 0) {
      throw new ForbiddenException(
        `You cannot grant a role with permissions you do not hold: ${excess.join(', ')}`,
      );
    }

    // Platform roles are the exception the reach check cannot express: they are
    // scoped to nothing, so "within your reach" is vacuously true for them.
    if (ROLE_SCOPE[dto.role] === 'platform') {
      const canGrantPlatform = scopesGranting(staff.scopes, Permission.PlatformStaff).length > 0;
      if (!canGrantPlatform) {
        throw new ForbiddenException('Only a super admin may appoint platform staff');
      }
      return;
    }

    const reach = reachFor(staff.scopes, Permission.StaffInvite);
    if (reach.all) {
      return;
    }

    const scope: StaffScope = {
      role: dto.role,
      restaurantId: dto.restaurantId ?? null,
      branchId: dto.branchId ?? null,
    };
    if (scope.restaurantId && !reach.restaurantIds.includes(scope.restaurantId)) {
      throw new ForbiddenException('That restaurant is not yours to hire for');
    }

    if (scope.branchId) {
      // Checked against the database rather than the token: a restaurant admin
      // reaches every branch of their restaurant, and the token names the
      // restaurant, not each of its branches.
      const reachable = await this.prisma.restaurantBranch.findFirst({
        where: {
          id: scope.branchId,
          OR: [
            { restaurantId: { in: reach.restaurantIds } },
            { id: { in: reach.branchIds } },
          ],
        },
        select: { id: true },
      });
      if (!reachable) {
        throw new ForbiddenException('That branch is not yours to hire for');
      }
    }
  }
}
