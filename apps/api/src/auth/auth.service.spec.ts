import { Prisma, type User } from '@prisma/client';
import { Role } from '@amragrir/shared';
import { AuthService } from './auth.service';
import type { OtpService } from './otp.service';
import type { TokenService, JwtPayload } from './token.service';
import type { PrismaService } from '../prisma/prisma.service';

function userRow(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    phone: '+37499123456',
    phoneVerified: true,
    name: null,
    email: null,
    avatarUrl: null,
    language: 'hy',
    darkMode: false,
    notifPush: true,
    notifPromo: false,
    rewardPoints: 0,
    role: 'customer',
    referredById: null,
    isGuest: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as User;
}

function build(opts: { existing?: User | null; caller?: JwtPayload | null } = {}) {
  const update = jest.fn().mockImplementation(({ where, data }) => {
    const merged = userRow({ id: where.id as string, ...(data as Partial<User>) });
    return Promise.resolve(merged);
  });
  const create = jest.fn().mockImplementation(({ data }) => {
    return Promise.resolve(userRow({ id: 'created-user', ...(data as Partial<User>) }));
  });
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      findUniqueOrThrow: jest.fn(),
      update,
      create,
    },
  } as unknown as PrismaService;

  const otp = { verify: jest.fn().mockResolvedValue(undefined) } as unknown as OtpService;
  const tokens = {
    issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    tryReadAccess: jest.fn().mockResolvedValue(opts.caller ?? null),
  } as unknown as TokenService;

  return { service: new AuthService(prisma, otp, tokens), update, create, otp, tokens };
}

const guestClaims: JwtPayload = {
  sub: 'guest-1',
  role: Role.Customer,
  isGuest: true,
  phoneVerified: false,
};

describe('AuthService.verifyCode', () => {
  it('creates an account when the phone is unknown and there is no caller', async () => {
    const { service, create } = build();

    const result = await service.verifyCode({ phone: '99123456', code: '1234', name: 'Aram' });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ phone: '+37499123456', phoneVerified: true, name: 'Aram' }),
    });
    expect(result.isNewUser).toBe(true);
  });

  // Regression: verifyCode looked the user up by phone only. A guest has no
  // phone, so it never matched and a second account was created — orphaning
  // everything the guest had collected, despite the documented promise.
  it('upgrades the calling guest in place instead of creating a second account', async () => {
    const { service, update, create } = build({ caller: guestClaims });

    const result = await service.verifyCode({ phone: '99123456', code: '1234' });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: expect.objectContaining({
        phone: '+37499123456',
        phoneVerified: true,
        isGuest: false,
      }),
    });
    expect(result.user.id).toBe('guest-1');
    expect(result.user.isGuest).toBe(false);
    expect(result.isNewUser).toBe(true);
  });

  it('signs into the existing account when the phone is already taken', async () => {
    const existing = userRow({ id: 'existing-1', name: 'Existing' });
    const { service, update, create } = build({ existing });

    const result = await service.verifyCode({ phone: '99123456', code: '1234' });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-1' } }),
    );
    expect(result.isNewUser).toBe(false);
  });

  // Merging two populated accounts is a product decision, not an implicit one.
  it('does not touch the guest row when the phone belongs to someone else', async () => {
    const existing = userRow({ id: 'existing-1' });
    const { service, update } = build({ existing, caller: guestClaims });

    const result = await service.verifyCode({ phone: '99123456', code: '1234' });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existing-1' } }));
    expect(result.user.id).toBe('existing-1');
  });

  it('ignores a caller that is a full account rather than a guest', async () => {
    const caller: JwtPayload = { ...guestClaims, sub: 'real-1', isGuest: false };
    const { service, create, update } = build({ caller });

    await service.verifyCode({ phone: '99123456', code: '1234' });

    expect(create).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('normalises the phone before touching the database', async () => {
    const { service, otp } = build();

    await service.verifyCode({ phone: '  099 123 456 ', code: '1234' });

    expect(otp.verify).toHaveBeenCalledWith('+37499123456', '1234');
  });

  // Regression: the find-then-create is not atomic, so a concurrent
  // verification of the same new phone hit the unique index and surfaced a
  // 500 instead of simply signing the loser in.
  it('recovers from a concurrent create of the same phone', async () => {
    const { service } = build();
    const winner = userRow({ id: 'winner', name: 'Winner' });
    const prisma = (service as unknown as { prisma: PrismaService }).prisma;
    (prisma.user.create as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    (prisma.user.findUniqueOrThrow as jest.Mock) = jest.fn().mockResolvedValue(winner);

    const result = await service.verifyCode({ phone: '99123456', code: '1234' });

    expect(result.user.id).toBe('winner');
    expect(result.isNewUser).toBe(false);
  });

  it('does not overwrite an existing name', async () => {
    const existing = userRow({ id: 'existing-1', name: 'Original' });
    const { service, update } = build({ existing });

    await service.verifyCode({ phone: '99123456', code: '1234', name: 'Replacement' });

    expect(update.mock.calls[0]![0].data).not.toHaveProperty('name');
  });
});
