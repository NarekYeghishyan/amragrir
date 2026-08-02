import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditAction, StaffRole } from '@amragrir/shared';
import { StaffDirectoryService } from './staff-directory.service';
import { CreateInviteDto, ListTeamDto, ListStaffDto } from './dto';
import { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { InvitesService } from './invites.service';
import type { StaffJwtPayload, StaffTokenService } from './staff-token.service';

const RESTAURANT = '44444444-4444-4444-8444-444444444444';
const OTHER_RESTAURANT = '55555555-5555-4555-8555-555555555555';
const BRANCH = '11111111-1111-4111-8111-111111111111';

const actor = (...scopes: StaffJwtPayload['scopes']): StaffJwtPayload => ({
  sub: 'staff-1',
  kind: 'staff',
  scopes,
});

const superAdmin = actor({ role: StaffRole.SuperAdmin, restaurantId: null, branchId: null });
const platformAdmin = actor({ role: StaffRole.PlatformAdmin, restaurantId: null, branchId: null });
const restaurantAdmin = actor({
  role: StaffRole.RestaurantAdmin,
  restaurantId: RESTAURANT,
  branchId: null,
});

function build(
  options: {
    assignment?: unknown;
    assignments?: unknown[];
    branch?: unknown;
    superAdmins?: number;
  } = {},
) {
  const auditCreate = jest.fn().mockResolvedValue({});

  const prisma = {
    // Revoking a role and withdrawing an invitation each write their audit entry
    // in the transaction that deletes the row — running the callback against
    // this same mock keeps both halves visible to these tests.
    $transaction: jest.fn((run: (tx: unknown) => unknown) => Promise.resolve(run(prisma))),
    auditLog: { create: auditCreate },
    staffUser: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    staffInvite: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      // Carries what the withdrawal entry records: the row is hard-deleted, so
      // `before` is the only thing that will say who was invited to what.
      findFirst: jest.fn().mockResolvedValue({
        id: 'invite-1',
        email: 'new@example.am',
        role: StaffRole.BranchStaff,
        restaurantId: null,
        branchId: BRANCH,
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    staffAssignment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.assignment === undefined
            ? {
                id: 'assign-1',
                staffUserId: 'staff-2',
                role: StaffRole.BranchStaff,
                restaurantId: null,
                branchId: BRANCH,
                staffUser: { name: 'Ann', email: 'ann@example.am' },
              }
            : options.assignment,
        ),
      findMany: jest.fn().mockResolvedValue(options.assignments ?? []),
      count: jest.fn().mockResolvedValue(options.superAdmins ?? 2),
      delete: jest.fn().mockResolvedValue({}),
    },
    restaurantBranch: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.branch === undefined ? { id: BRANCH } : options.branch),
    },
  } as unknown as PrismaService;

  const invites = { create: jest.fn().mockResolvedValue({ granted: false }) } as unknown as InvitesService;
  const tokens = { revokeAllFor: jest.fn().mockResolvedValue(1) } as unknown as StaffTokenService;

  return {
    service: new StaffDirectoryService(prisma, invites, tokens, new AuditService(prisma)),
    prisma,
    invites,
    tokens,
    auditCreate,
  };
}

const invite = (over: Partial<CreateInviteDto>): CreateInviteDto =>
  Object.assign(new CreateInviteDto(), { email: 'new@example.am', ...over });

/** A list query with the defaults the DTO would have filled in. */
const listing = (over: Partial<ListStaffDto> = {}): ListStaffDto =>
  Object.assign(new ListStaffDto(), { page: 1, limit: 20, ...over });

const people = (over: Partial<ListTeamDto> = {}): ListTeamDto =>
  Object.assign(new ListTeamDto(), { page: 1, limit: 50, ...over });

describe('inviting: you cannot grant what you do not hold', () => {
  it('lets a restaurant admin hire a manager for their own branch', async () => {
    const { service, invites } = build();
    await service.invite(restaurantAdmin, invite({ role: StaffRole.RestaurantManager, branchId: BRANCH }));
    expect(invites.create).toHaveBeenCalled();
  });

  it('refuses a restaurant admin appointing a super admin', async () => {
    // The whole point: otherwise a restaurant admin takes over the platform
    // through a role nobody gave them.
    const { service, invites } = build();
    await expect(
      service.invite(restaurantAdmin, invite({ role: StaffRole.SuperAdmin })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invites.create).not.toHaveBeenCalled();
  });

  it('refuses a restaurant admin appointing a platform admin', async () => {
    const { service } = build();
    await expect(
      service.invite(restaurantAdmin, invite({ role: StaffRole.PlatformAdmin })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a platform admin appointing platform staff', async () => {
    // platform_admin holds every restaurant permission but not platform:staff,
    // so it may hire for a restaurant and not for the platform.
    const { service } = build();
    await expect(
      service.invite(platformAdmin, invite({ role: StaffRole.PlatformAdmin })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a super admin appoint anyone', async () => {
    const { service, invites } = build();
    await service.invite(superAdmin, invite({ role: StaffRole.PlatformAdmin }));
    expect(invites.create).toHaveBeenCalled();
  });

  it('refuses hiring for a restaurant that is not theirs', async () => {
    const { service } = build();
    await expect(
      service.invite(
        restaurantAdmin,
        invite({ role: StaffRole.RestaurantAdmin, restaurantId: OTHER_RESTAURANT }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses hiring for a branch outside their restaurant', async () => {
    // Checked against the database: the token names the restaurant, not each
    // of its branches.
    const { service } = build({ branch: null });
    await expect(
      service.invite(restaurantAdmin, invite({ role: StaffRole.BranchStaff, branchId: BRANCH })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('revoking a role', () => {
  it('deletes the assignment and ends that account sessions', async () => {
    // The scopes travel in the access token, so without ending the sessions
    // the revoked role keeps working until it expires.
    const { service, prisma, tokens } = build();
    await service.revokeAssignment(superAdmin, 'assign-1');

    expect(prisma.staffAssignment.delete).toHaveBeenCalledWith({ where: { id: 'assign-1' } });
    expect(tokens.revokeAllFor).toHaveBeenCalledWith('staff-2');
  });

  it('404s on an assignment outside the caller reach', async () => {
    const { service } = build({ assignment: null });
    await expect(service.revokeAssignment(restaurantAdmin, 'assign-9')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to remove your own role', async () => {
    const { service } = build({
      assignment: { id: 'assign-1', staffUserId: 'staff-1', role: StaffRole.RestaurantAdmin },
    });
    await expect(service.revokeAssignment(restaurantAdmin, 'assign-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses to remove the last super admin', async () => {
    // No route exists to appoint another one afterwards.
    const { service, prisma } = build({
      assignment: { id: 'assign-1', staffUserId: 'staff-2', role: StaffRole.SuperAdmin },
      superAdmins: 1,
    });
    await expect(service.revokeAssignment(superAdmin, 'assign-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.staffAssignment.delete).not.toHaveBeenCalled();
  });

  it('allows removing a super admin while others remain', async () => {
    const { service, prisma } = build({
      assignment: {
        id: 'assign-1',
        staffUserId: 'staff-2',
        role: StaffRole.SuperAdmin,
        restaurantId: null,
        branchId: null,
        staffUser: { name: 'Ann', email: 'ann@example.am' },
      },
      superAdmins: 2,
    });
    await service.revokeAssignment(superAdmin, 'assign-1');
    expect(prisma.staffAssignment.delete).toHaveBeenCalled();
  });

  it('records what the role was, since the row does not survive', async () => {
    // A revoked assignment is hard-deleted on purpose — it has to be gone from
    // the permission path rather than filtered out of it — so `before` is the
    // only thing that will ever say which role over which scope.
    const { service, auditCreate } = build();
    await service.revokeAssignment(superAdmin, 'assign-1');

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.StaffAssignmentRevoke,
        entityId: 'assign-1',
        branchId: BRANCH,
        before: expect.objectContaining({
          role: StaffRole.BranchStaff,
          name: 'Ann',
          email: 'ann@example.am',
        }),
      }),
    });
  });
});

describe('the directory only shows your own reach', () => {
  it('filters a restaurant admin to their restaurant and its branches', async () => {
    const { service, prisma } = build();
    await service.list(restaurantAdmin, listing());

    const where = (prisma.staffUser.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.assignments.some.OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('filters the listed assignments too, not just the accounts', async () => {
    // Seeing that someone works here does not mean seeing everywhere else
    // they work.
    const { service, prisma } = build();
    await service.list(restaurantAdmin, listing());

    const include = (prisma.staffUser.findMany as jest.Mock).mock.calls[0][0].include;
    expect(include.assignments.where.OR).toBeDefined();
  });

  it('gives a platform role an unfiltered list', async () => {
    const { service, prisma } = build();
    await service.list(superAdmin, listing());

    const where = (prisma.staffUser.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.assignments.some).toEqual({});
  });
});

describe('narrowing the directory', () => {
  const findManyArgs = (prisma: PrismaService) =>
    (prisma.staffUser.findMany as jest.Mock).mock.calls[0][0];

  it('pages, and counts the whole match rather than the page', async () => {
    // The count is what lets the pager say "1–20 of 84". Taken with the same
    // `where`, or it would describe a different list from the one on screen.
    const { service, prisma } = build();
    await service.list(superAdmin, listing({ page: 3, limit: 20 }));

    expect(findManyArgs(prisma)).toMatchObject({ skip: 40, take: 20 });
    expect((prisma.staffUser.count as jest.Mock).mock.calls[0][0].where).toEqual(
      findManyArgs(prisma).where,
    );
  });

  it('searches names, emails and where somebody works', async () => {
    const { service, prisma } = build();
    await service.list(superAdmin, listing({ q: 'karas' }));

    const or = findManyArgs(prisma).where.AND[0].OR;
    expect(or).toHaveLength(3);
    expect(or[0]).toEqual({ name: { contains: 'karas', mode: 'insensitive' } });
    expect(or[1]).toEqual({ email: { contains: 'karas', mode: 'insensitive' } });
    expect(or[2].assignments.some.AND[1].OR).toEqual([
      { restaurant: { name: { contains: 'karas', mode: 'insensitive' } } },
      { branch: { name: { contains: 'karas', mode: 'insensitive' } } },
    ]);
  });

  it('never lets the search escape the caller reach', async () => {
    // The order board had this exact shape and one assignment there turned a
    // search into a way to read every restaurant's orders. Two things hold
    // here: the term goes in `AND` rather than over the top of anything, and
    // the assignment arm of it carries the reach filter with it.
    const { service, prisma } = build();
    await service.list(restaurantAdmin, listing({ q: 'karas' }));

    const where = findManyArgs(prisma).where;
    expect(where.assignments.some.OR).toBeDefined();
    expect(where.OR).toBeUndefined();

    const throughAssignments = where.AND[0].OR[2].assignments.some;
    expect(throughAssignments.AND[0].OR).toEqual(where.assignments.some.OR);
  });

  it('asks for the role and the reach on the same assignment', async () => {
    // Not on the person: otherwise "managers" would list somebody who manages
    // somewhere out of reach and washes dishes here, on two different rows.
    const { service, prisma } = build();
    await service.list(restaurantAdmin, listing({ role: StaffRole.RestaurantManager }));

    const qualifying = findManyArgs(prisma).where.assignments.some;
    expect(qualifying.AND[0].OR).toBeDefined();
    expect(qualifying.AND[1]).toEqual({ role: StaffRole.RestaurantManager });
  });

  it('still shows every role a listed person holds', async () => {
    // Filtering by role picks which *people* to show. Hiding the rest of
    // somebody's roles on the screen you revoke roles from is how one gets
    // taken away in the belief it was the last.
    const { service, prisma } = build();
    await service.list(restaurantAdmin, listing({ role: StaffRole.RestaurantManager }));

    const shown = findManyArgs(prisma).include.assignments.where;
    expect(shown.role).toBeUndefined();
    expect(shown.OR).toBeDefined();
  });

  it('leaves the query out entirely when nothing is asked for', async () => {
    const { service, prisma } = build();
    await service.list(superAdmin, listing());

    expect(findManyArgs(prisma).where.AND).toBeUndefined();
    expect(findManyArgs(prisma).where.assignments.some).toEqual({});
  });

  it('narrows to one person exactly when given an id', async () => {
    // What a link naming somebody — in an order's history, say — asks for. `q`
    // cannot answer it: a `contains` over names and emails matches everyone
    // who shares a name.
    const { service, prisma } = build();
    await service.list(superAdmin, listing({ id: 'staff-9' }));

    expect(findManyArgs(prisma).where.id).toBe('staff-9');
  });

  it('keeps the reach filter alongside the id, never instead of it', async () => {
    // Holding somebody's id is not permission to see them. An id from outside
    // the caller's reach has to answer with nothing, exactly as that person's
    // name does.
    const { service, prisma } = build();
    await service.list(restaurantAdmin, listing({ id: 'staff-9' }));

    const where = findManyArgs(prisma).where;
    expect(where.id).toBe('staff-9');
    expect(where.assignments.some.OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
  });
});

describe('where a listed role is held', () => {
  /** A person as `findMany` returns them, with one assignment on them. */
  const listed = (assignment: Record<string, unknown>) => [
    {
      id: 'staff-9',
      email: 'ani@karas.am',
      name: 'Ani Vardanyan',
      isActive: true,
      lastLoginAt: null,
      assignments: [assignment],
    },
  ];

  it('names the restaurant a branch role is held at', async () => {
    // The assignment names only the branch, so reading the column out raw left
    // a shift's row saying "Northern Ave" — which is a branch of three
    // different restaurants — under a label meaning the whole platform.
    const { service, prisma } = build();
    (prisma.staffUser.findMany as jest.Mock).mockResolvedValue(
      listed({
        id: 'assign-9',
        role: StaffRole.BranchStaff,
        restaurantId: null,
        restaurant: null,
        branchId: BRANCH,
        branch: {
          name: 'Northern Ave',
          city: 'Yerevan',
          restaurantId: RESTAURANT,
          restaurant: { name: 'Karas' },
        },
      }),
    );

    expect((await service.list(superAdmin, listing())).items[0]?.assignments[0]).toEqual({
      id: 'assign-9',
      role: StaffRole.BranchStaff,
      restaurantId: RESTAURANT,
      restaurantName: 'Karas',
      branchId: BRANCH,
      branchName: 'Northern Ave',
    });
  });

  it('leaves a restaurant role naming its restaurant and no branch', async () => {
    const { service, prisma } = build();
    (prisma.staffUser.findMany as jest.Mock).mockResolvedValue(
      listed({
        id: 'assign-8',
        role: StaffRole.RestaurantAdmin,
        restaurantId: RESTAURANT,
        restaurant: { name: 'Karas' },
        branchId: null,
        branch: null,
      }),
    );

    expect((await service.list(superAdmin, listing())).items[0]?.assignments[0]).toMatchObject({
      restaurantId: RESTAURANT,
      restaurantName: 'Karas',
      branchId: null,
      branchName: null,
    });
  });

  it('leaves a platform role over nothing at all', async () => {
    // The one case where null is the answer rather than a column not read.
    const { service, prisma } = build();
    (prisma.staffUser.findMany as jest.Mock).mockResolvedValue(
      listed({
        id: 'assign-7',
        role: StaffRole.PlatformAdmin,
        restaurantId: null,
        restaurant: null,
        branchId: null,
        branch: null,
      }),
    );

    expect((await service.list(superAdmin, listing())).items[0]?.assignments[0]).toMatchObject({
      restaurantId: null,
      restaurantName: null,
      branchId: null,
    });
  });

  it('falls back to the city for a branch with no name', async () => {
    const { service, prisma } = build();
    (prisma.staffUser.findMany as jest.Mock).mockResolvedValue(
      listed({
        id: 'assign-6',
        role: StaffRole.RestaurantManager,
        restaurantId: null,
        restaurant: null,
        branchId: BRANCH,
        branch: {
          name: null,
          city: 'Gyumri',
          restaurantId: RESTAURANT,
          restaurant: { name: 'Karas' },
        },
      }),
    );

    expect((await service.list(superAdmin, listing())).items[0]?.assignments[0]).toMatchObject({
      branchName: 'Gyumri',
    });
  });

  it('asks the database for the branch restaurant, not just the branch', async () => {
    // The mapping above is only as true as the query behind it: without these
    // columns selected every branch role comes back over no restaurant again,
    // and the rows built by hand here would not notice.
    const { service, prisma } = build();
    await service.list(superAdmin, listing());

    const include = (prisma.staffUser.findMany as jest.Mock).mock.calls[0][0].include;
    expect(include.assignments.include.branch.select).toMatchObject({
      name: true,
      city: true,
      restaurantId: true,
      restaurant: { select: { name: true } },
    });
  });
});

describe('a team, restaurant or branch', () => {
  const findManyArgs = (prisma: PrismaService) =>
    (prisma.staffAssignment.findMany as jest.Mock).mock.calls[0][0];

  it('asks for the reach and the restaurant as separate terms', async () => {
    // The restaurant narrows what the caller may already see. If it could
    // stand in for the reach filter, opening any restaurant by id would list
    // its staff to anybody holding `staff:read` anywhere.
    const { service, prisma } = build();
    await service.listRestaurantPeople(restaurantAdmin, OTHER_RESTAURANT, people());

    const and = findManyArgs(prisma).where.AND;
    expect(and[0].OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
    expect(and[1]).toEqual({ restaurantId: OTHER_RESTAURANT });
  });

  it("leaves the branches' people to the branches", async () => {
    // An assignment names a restaurant or a branch, never both, so this filter
    // is the restaurant's own roles — its admins — and nothing from its
    // kitchens. Reaching through `branch` here would put every shift in the
    // chain under the restaurant's facts, which is the section this half feeds.
    const { service, prisma } = build();
    await service.listRestaurantPeople(superAdmin, RESTAURANT, people());

    expect(findManyArgs(prisma).where.AND[1]).toEqual({ restaurantId: RESTAURANT });
  });

  it("scopes a branch's team to the branch, under the same reach", async () => {
    const { service, prisma } = build();
    await service.listBranchPeople(restaurantAdmin, BRANCH, people());

    const and = findManyArgs(prisma).where.AND;
    expect(and[0].OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
    expect(and[1]).toEqual({ branchId: BRANCH });
  });

  it('orders by role first, which is seniority', async () => {
    // `role asc` sorts by the Postgres enum's declaration order, and
    // schema.prisma declares it super_admin → platform_admin →
    // restaurant_admin → restaurant_manager → branch_staff. Pinned here
    // because reordering that enum would quietly reorder this page.
    const { service, prisma } = build();
    await service.listRestaurantPeople(superAdmin, RESTAURANT, people());

    expect(findManyArgs(prisma).orderBy[0]).toEqual({ role: 'asc' });
    expect(Object.values(StaffRole)).toEqual([
      StaffRole.SuperAdmin,
      StaffRole.PlatformAdmin,
      StaffRole.RestaurantAdmin,
      StaffRole.RestaurantManager,
      StaffRole.BranchStaff,
    ]);
  });

  it('pages, and counts with the same filter', async () => {
    const { service, prisma } = build();
    await service.listRestaurantPeople(superAdmin, RESTAURANT, people({ page: 2, limit: 50 }));

    expect(findManyArgs(prisma)).toMatchObject({ skip: 50, take: 50 });
    expect((prisma.staffAssignment.count as jest.Mock).mock.calls[0][0].where).toEqual(
      findManyArgs(prisma).where,
    );
  });

  it('returns a row per assignment, naming the branch or falling back to its city', async () => {
    const { service } = build({
      assignments: [
        {
          id: 'a1',
          role: StaffRole.RestaurantAdmin,
          branchId: null,
          branch: null,
          staffUser: {
            id: 'u1',
            name: 'Ani',
            email: 'ani@example.am',
            isActive: true,
            lastLoginAt: null,
          },
        },
        {
          id: 'a2',
          role: StaffRole.BranchStaff,
          branchId: 'b1',
          branch: { id: 'b1', name: null, city: 'Yerevan' },
          staffUser: {
            id: 'u1',
            name: 'Ani',
            email: 'ani@example.am',
            isActive: true,
            lastLoginAt: null,
          },
        },
      ],
    });

    const result = await service.listRestaurantPeople(superAdmin, RESTAURANT, people());

    // The same person twice — which is the point of a row per assignment.
    expect(result.items.map((row) => row.person.id)).toEqual(['u1', 'u1']);
    expect(result.items[0]?.branchName).toBeNull();
    expect(result.items[1]?.branchName).toBe('Yerevan');
    expect(result.items.map((row) => row.id)).toEqual(['a1', 'a2']);
  });
});

describe('the invitations list', () => {
  const findManyArgs = (prisma: PrismaService) =>
    (prisma.staffInvite.findMany as jest.Mock).mock.calls[0][0];

  it('pages, and only ever shows the open ones', async () => {
    const { service, prisma } = build();
    await service.listInvites(superAdmin, listing({ page: 2, limit: 10 }));

    expect(findManyArgs(prisma)).toMatchObject({ skip: 10, take: 10 });
    expect(findManyArgs(prisma).where.acceptedAt).toBeNull();
  });

  it('keeps the reach filter when a search is added', async () => {
    // `inviteReach` spreads its own `OR` into this object, so a search
    // assigned to `where.OR` would drop it and hand back every open
    // invitation on the platform. It goes in `AND`.
    const { service, prisma } = build();
    await service.listInvites(restaurantAdmin, listing({ q: 'karas' }));

    const where = findManyArgs(prisma).where;
    expect(where.OR).toEqual([
      { restaurantId: { in: [RESTAURANT] } },
      { branch: { restaurantId: { in: [RESTAURANT] } } },
      { branchId: { in: [] } },
    ]);
    expect(where.AND[0].OR[0]).toEqual({ email: { contains: 'karas', mode: 'insensitive' } });
  });

  it('filters by role', async () => {
    const { service, prisma } = build();
    await service.listInvites(superAdmin, listing({ role: StaffRole.BranchStaff }));
    expect(findManyArgs(prisma).where.role).toBe(StaffRole.BranchStaff);
  });
});
