import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission, StaffRole, type StaffScope } from '@amragrir/shared';
import { ImpersonationService } from './impersonation.service';
import { AuditService } from '../audit/audit.service';
import type { StaffJwtPayload } from './staff-token.service';

const scope = (role: StaffRole, over: Partial<StaffScope> = {}): StaffScope => ({
  role,
  restaurantId: null,
  branchId: null,
  ...over,
});

/** A super admin's claims — the only ones that reach this endpoint at all. */
const superAdmin = (over: Partial<StaffJwtPayload> = {}): StaffJwtPayload => ({
  sub: 'super-1',
  kind: 'staff',
  scopes: [scope(StaffRole.SuperAdmin)],
  ...over,
});

const targetRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'staff-2',
  email: 'ann@example.am',
  name: 'Ann',
  isActive: true,
  assignments: [{ role: StaffRole.RestaurantAdmin, restaurantId: 'rest-1', branchId: null }],
  ...over,
});

function build(target: Record<string, unknown> | null = targetRow()) {
  const prisma = {
    staffUser: { findFirst: jest.fn().mockResolvedValue(target) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const tokens = {
    issueImpersonation: jest
      .fn()
      .mockResolvedValue({ accessToken: 'acting-token', expiresIn: 900 }),
  };

  return {
    // A real AuditService over the mock client, not a stub: the row this writes
    // is the thing under test, and a stubbed writer would let its shape drift
    // without a single test noticing.
    service: new ImpersonationService(
      prisma as never,
      tokens as never,
      new AuditService(prisma as never),
    ),
    prisma,
    tokens,
  };
}

describe('beginning an impersonation', () => {
  it('issues a token carrying the target’s scopes and the real actor', async () => {
    const { service, tokens } = build();

    const result = await service.begin(superAdmin(), 'staff-2', '10.0.0.1');

    expect(result.accessToken).toBe('acting-token');
    expect(result.expiresIn).toBe(900);
    // `sub` is the target and `act` the super admin, so every scope filter
    // downstream behaves exactly as it would for the person being acted as.
    expect(tokens.issueImpersonation).toHaveBeenCalledWith(
      'staff-2',
      [scope(StaffRole.RestaurantAdmin, { restaurantId: 'rest-1' })],
      'super-1',
    );
  });

  it('returns the profile the panel renders its tabs from', async () => {
    const { service } = build();

    const result = await service.begin(superAdmin(), 'staff-2');

    expect(result.staff.id).toBe('staff-2');
    expect(result.staff.email).toBe('ann@example.am');
    // Flattened from the target's roles, not the super admin's — the panel must
    // offer what the impersonated account can actually reach.
    expect(result.staff.permissions).toContain(Permission.MenuWrite);
    expect(result.staff.permissions).not.toContain(Permission.PlatformStaff);
  });

  it('records the impersonation in audit_log before handing out the token', async () => {
    // The session carries full write access, so without this row the only
    // record of who advanced an order names the person who did not do it.
    const { service, prisma } = build();

    await service.begin(superAdmin(), 'staff-2', '10.0.0.1');

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorStaffId: 'super-1',
        action: 'staff.impersonate',
        entity: 'staff_user',
        entityId: 'staff-2',
        ip: '10.0.0.1',
      }),
    });
  });

  it('does not chain', async () => {
    // `act` holds one id, so a second hop would either overwrite the real actor
    // or record somebody who was themselves being acted as.
    const { service, tokens } = build();

    await expect(
      service.begin(superAdmin({ act: 'super-1', sub: 'staff-2' }), 'staff-3'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.issueImpersonation).not.toHaveBeenCalled();
  });

  it('refuses to act as yourself', async () => {
    // Pointless, and it would strand them: the token has no refresh half, so
    // they would land in a shorter-lived version of the session they had.
    const { service } = build();

    await expect(service.begin(superAdmin(), 'super-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('answers 404 for an account out of reach', async () => {
    // Not 403 — that would confirm the id names somebody.
    const { service } = build(null);

    await expect(service.begin(superAdmin(), 'staff-9')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a deactivated account', async () => {
    // The same refusal their own password would get.
    const { service, tokens } = build(targetRow({ isActive: false }));

    await expect(service.begin(superAdmin(), 'staff-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tokens.issueImpersonation).not.toHaveBeenCalled();
  });

  it('refuses an account holding no roles', async () => {
    // Mirrors the login path: a token over no roles is a panel where every
    // screen 403s, which is a worse answer than saying so.
    const { service, tokens } = build(targetRow({ assignments: [] }));

    await expect(service.begin(superAdmin(), 'staff-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tokens.issueImpersonation).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the caller’s reach for the permission', async () => {
    const { service, prisma } = build();

    await service.begin(superAdmin(), 'staff-2');

    // A super admin's reach is platform-wide, so the filter is empty — but it
    // is still a reach filter, so the day the permission moves to a scoped role
    // the query narrows with it.
    expect(prisma.staffUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'staff-2', assignments: { some: {} } } }),
    );
  });

  it('refuses a caller whose roles do not grant it', async () => {
    // The guard refuses this first; reaching the service means an endpoint asked
    // for a filter it never checked the permission for.
    const { service } = build();

    await expect(
      service.begin(
        superAdmin({ sub: 'admin-1', scopes: [scope(StaffRole.PlatformAdmin)] }),
        'staff-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
