import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { StaffRole } from '@amragrir/shared';
import { StaffAuthService } from './staff-auth.service';
import { PasswordService } from './password.service';

const passwords = new PasswordService();
const PASSWORD = 'a long enough password';

interface Overrides {
  staff?: Record<string, unknown> | null;
  resetToken?: string | null;
}

const staffRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'staff-1',
  email: 'ann@example.am',
  name: 'Ann',
  passwordHash: null,
  isActive: true,
  assignments: [{ role: StaffRole.RestaurantAdmin, restaurantId: 'rest-1', branchId: null }],
  ...over,
});

function build({ staff = staffRow(), resetToken = null }: Overrides = {}) {
  const prisma = {
    staffUser: {
      findUnique: jest.fn().mockResolvedValue(staff),
      findUniqueOrThrow: jest.fn().mockResolvedValue(staff),
      update: jest.fn().mockResolvedValue(staff),
    },
  };
  const redis = {
    get: jest.fn().mockResolvedValue(resetToken),
    del: jest.fn().mockResolvedValue(undefined),
    setEx: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => (key === 'STAFF_RESET_TTL' ? 1800 : 'http://localhost')),
  };
  const tokens = {
    issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    consumeRefresh: jest.fn().mockResolvedValue('staff-1'),
    revokeRefresh: jest.fn().mockResolvedValue(undefined),
    revokeAllFor: jest.fn().mockResolvedValue(2),
  };
  const invites = { findOpen: jest.fn().mockResolvedValue(null) };
  const email = { send: jest.fn().mockResolvedValue(undefined) };

  const service = new StaffAuthService(
    prisma as never,
    redis as never,
    config as never,
    passwords,
    tokens as never,
    invites as never,
    email as never,
  );

  return { service, prisma, redis, tokens, email, invites };
}

describe('staff login', () => {
  it('signs in with the right password', async () => {
    const hash = await passwords.hash(PASSWORD);
    const { service, tokens } = build({ staff: staffRow({ passwordHash: hash }) });

    const result = await service.login({ email: 'ann@example.am', password: PASSWORD });

    expect(result.accessToken).toBe('a');
    expect(result.staff.scopes).toEqual([
      { role: StaffRole.RestaurantAdmin, restaurantId: 'rest-1', branchId: null },
    ]);
    // The panel renders from the same map the API enforces.
    expect(result.staff.permissions).toContain('menu:write');
    expect(result.staff.permissions).not.toContain('platform:staff');
    expect(tokens.issue).toHaveBeenCalledWith('staff-1', result.staff.scopes);
  });

  it('normalises the email, so case is not a second account', async () => {
    const hash = await passwords.hash(PASSWORD);
    const { service, prisma } = build({ staff: staffRow({ passwordHash: hash }) });

    await service.login({ email: '  Ann@Example.AM ', password: PASSWORD });

    expect(prisma.staffUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ann@example.am' } }),
    );
  });

  it('answers the same way for a wrong password and an unknown address', async () => {
    // Anything else turns this endpoint into a way to find out who works here.
    const hash = await passwords.hash(PASSWORD);
    const wrong = build({ staff: staffRow({ passwordHash: hash }) });
    const missing = build({ staff: null });

    const a = await wrong.service
      .login({ email: 'ann@example.am', password: 'not the password' })
      .catch((err: Error) => err);
    const b = await missing.service
      .login({ email: 'nobody@example.am', password: PASSWORD })
      .catch((err: Error) => err);

    expect(a).toBeInstanceOf(UnauthorizedException);
    expect(b).toBeInstanceOf(UnauthorizedException);
    expect((a as Error).message).toBe((b as Error).message);
  });

  it('refuses an account whose invite was never accepted', async () => {
    // `passwordHash` is null until acceptance; there is nothing to check.
    const { service } = build({ staff: staffRow({ passwordHash: null }) });
    await expect(
      service.login({ email: 'ann@example.am', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a deactivated account', async () => {
    const hash = await passwords.hash(PASSWORD);
    const { service } = build({ staff: staffRow({ passwordHash: hash, isActive: false }) });
    await expect(
      service.login({ email: 'ann@example.am', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('says so plainly when the credentials are right but there are no roles', async () => {
    // A real dead end, not an attack surface: issuing a token here produces a
    // panel where every screen 403s.
    const hash = await passwords.hash(PASSWORD);
    const { service, tokens } = build({ staff: staffRow({ passwordHash: hash, assignments: [] }) });

    await expect(service.login({ email: 'ann@example.am', password: PASSWORD })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});

describe('staff refresh', () => {
  it('re-reads assignments, so a revoked role takes effect now', async () => {
    const { service, tokens } = build({
      staff: staffRow({
        passwordHash: 'x',
        assignments: [{ role: StaffRole.BranchStaff, restaurantId: null, branchId: 'branch-9' }],
      }),
    });

    const result = await service.refresh('refresh-token');

    expect(result.staff.scopes).toEqual([
      { role: StaffRole.BranchStaff, restaurantId: null, branchId: 'branch-9' },
    ]);
    expect(tokens.issue).toHaveBeenCalledWith('staff-1', result.staff.scopes);
  });

  it('refuses once every role is gone', async () => {
    const { service } = build({ staff: staffRow({ assignments: [] }) });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a deactivated account', async () => {
    const { service } = build({ staff: staffRow({ isActive: false }) });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('forgotPassword', () => {
  it('sends a link when the account exists', async () => {
    const { service, email, redis } = build({ staff: staffRow({ passwordHash: 'x' }) });
    await service.forgotPassword('ann@example.am');
    expect(email.send).toHaveBeenCalled();
    expect(redis.setEx).toHaveBeenCalled();
  });

  it('stays silent for an unknown address, and does not fail', async () => {
    // Same response either way — the endpoint must not confirm who works here.
    const { service, email } = build({ staff: null });
    await expect(service.forgotPassword('nobody@example.am')).resolves.toBeUndefined();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('stays silent for a deactivated account', async () => {
    const { service, email } = build({ staff: staffRow({ isActive: false }) });
    await service.forgotPassword('ann@example.am');
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  it('sets the password and signs every session out', async () => {
    // Whoever reset it may have done so because someone else knows the old
    // one; leaving that session alive would defeat the point.
    const { service, prisma, tokens, redis } = build({ resetToken: 'staff-1' });

    await service.resetPassword({ token: 'raw-token', password: PASSWORD });

    expect(prisma.staffUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'staff-1' } }),
    );
    expect(tokens.revokeAllFor).toHaveBeenCalledWith('staff-1');
    // Single use.
    expect(redis.del).toHaveBeenCalled();
  });

  it('refuses a spent or expired link', async () => {
    const { service } = build({ resetToken: null });
    await expect(
      service.resetPassword({ token: 'raw-token', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stores a hash, never the password', async () => {
    const { service, prisma } = build({ resetToken: 'staff-1' });

    await service.resetPassword({ token: 'raw-token', password: PASSWORD });

    const data = (prisma.staffUser.update.mock.calls[0][0] as { data: { passwordHash: string } })
      .data;
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(data.passwordHash).not.toContain(PASSWORD);
  });
});
