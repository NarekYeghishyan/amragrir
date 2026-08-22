import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/**
 * `PATCH /me` is where the Settings sheet writes the name (SCREENS.md §12), and
 * the name is required to open an account at all (§0) — so what this endpoint
 * refuses to do with a blank one is the rule, not a detail.
 */
function build() {
  const update = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    user: {
      update,
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Aram',
        phone: '+37499123456',
        email: null,
        avatarUrl: null,
        language: 'hy',
        role: 'customer',
        isGuest: false,
        phoneVerified: true,
        rewardPoints: 0,
        darkMode: false,
        notifPush: true,
        notifPromo: false,
      }),
    },
    order: { count: jest.fn().mockResolvedValue(0) },
    coupon: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;

  return { service: new UsersService(prisma), update };
}

describe('UsersService.updateProfile', () => {
  it('stores the name it was given', async () => {
    const { service, update } = build();

    await service.updateProfile('user-1', { name: 'Ara Petrosyan' });

    expect(update.mock.calls[0]![0].data).toMatchObject({ name: 'Ara Petrosyan' });
  });

  it('trims before storing, as verify-code does', async () => {
    const { service, update } = build();

    await service.updateProfile('user-1', { name: '  Ara  ' });

    expect(update.mock.calls[0]![0].data).toMatchObject({ name: 'Ara' });
  });

  // Sign-up will not open an account without a name; a settings screen that
  // could empty it a minute later would undo that with one keystroke.
  it.each([
    ['an empty string', ''],
    ['only whitespace', '   '],
  ])('does not blank the stored name when sent %s', async (_case, name) => {
    const { service, update } = build();

    await service.updateProfile('user-1', { name });

    expect(update.mock.calls[0]![0].data).not.toHaveProperty('name');
  });

  it('leaves the other fields alone', async () => {
    const { service, update } = build();

    await service.updateProfile('user-1', { email: 'ara@example.test' });

    expect(update.mock.calls[0]![0].data).toEqual({ email: 'ara@example.test' });
  });

  it('reports a taken email as a conflict rather than a 500', async () => {
    const { service, update } = build();
    update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(
      service.updateProfile('user-1', { email: 'taken@example.test' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
