import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Role } from '@amragrir/shared';
import { AdminService } from './admin.service';
import { CreateRestaurantDto, IssuePromoDto, SetRoleDto } from './dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/token.service';
import type { TokenService } from '../auth/token.service';

const ADMIN: JwtPayload = {
  sub: 'admin-1',
  role: Role.Admin,
  isGuest: false,
  phoneVerified: true,
};

const TARGET = '22222222-2222-4222-8222-222222222222';

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: TARGET,
    name: 'Aram',
    phone: '+37499123456',
    email: null,
    role: Role.Customer,
    isGuest: false,
    phoneVerified: true,
    rewardPoints: 0,
    createdAt: new Date('2026-07-01T10:00:00Z'),
    _count: { orders: 3 },
    ...over,
  };
}

function build(
  options: {
    user?: unknown;
    adminCount?: number;
    ownedCount?: number;
    recipients?: { id: string }[];
    created?: number;
  } = {},
) {
  const update = jest.fn().mockResolvedValue({});
  const couponCreateMany = jest.fn().mockResolvedValue({ count: options.created ?? 2 });

  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.user === undefined ? userRow() : options.user),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(userRow((options.user ?? {}) as Record<string, unknown>)),
      // Two callers share this: `listUsers` includes the order count, while
      // the promo recipient lookup only selects ids.
      findMany: jest.fn().mockImplementation((args: { include?: unknown }) =>
        Promise.resolve(
          args.include ? [userRow()] : (options.recipients ?? [{ id: 'u1' }, { id: 'u2' }]),
        ),
      ),
      count: jest.fn().mockResolvedValue(options.adminCount ?? 3),
      update,
    },
    restaurant: {
      count: jest.fn().mockResolvedValue(options.ownedCount ?? 0),
      create: jest.fn().mockResolvedValue({ id: 'rest-1', slug: 'new-place' }),
    },
    coupon: { createMany: couponCreateMany },
  } as unknown as PrismaService;

  const tokens = { revokeAllFor: jest.fn().mockResolvedValue(2) } as unknown as TokenService;

  return { service: new AdminService(prisma, tokens), prisma, tokens, update, couponCreateMany };
}

const roleDto = (role: Role): SetRoleDto => Object.assign(new SetRoleDto(), { role });

describe('setRole', () => {
  it('promotes a verified customer and revokes their sessions', async () => {
    const { service, update, tokens } = build();
    await service.setRole(ADMIN, TARGET, roleDto(Role.Owner));

    expect(update).toHaveBeenCalledWith({ where: { id: TARGET }, data: { role: Role.Owner } });
    // The old access token still carries `owner` until it expires; killing the
    // refresh tokens is what stops that window being extended.
    expect(tokens.revokeAllFor).toHaveBeenCalledWith(TARGET);
  });

  it('refuses to change your own role', async () => {
    // An admin who demotes themselves loses the panel with no way back.
    const { service, update } = build();
    await expect(service.setRole(ADMIN, ADMIN.sub, roleDto(Role.Customer))).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to give a guest a role', async () => {
    const { service } = build({ user: userRow({ isGuest: true, phoneVerified: false }) });
    await expect(service.setRole(ADMIN, TARGET, roleDto(Role.Staff))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses an unverified account', async () => {
    const { service } = build({ user: userRow({ phoneVerified: false }) });
    await expect(service.setRole(ADMIN, TARGET, roleDto(Role.Owner))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses to demote the last administrator', async () => {
    // Nobody could restore one afterwards.
    const { service } = build({ user: userRow({ role: Role.Admin }), adminCount: 1 });
    await expect(service.setRole(ADMIN, TARGET, roleDto(Role.Customer))).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows demoting an admin while others remain', async () => {
    const { service, update } = build({ user: userRow({ role: Role.Admin }), adminCount: 2 });
    await service.setRole(ADMIN, TARGET, roleDto(Role.Customer));

    expect(update).toHaveBeenCalled();
  });

  it('refuses to demote an owner who still has restaurants', async () => {
    // They would be left unmanageable.
    const { service } = build({ user: userRow({ role: Role.Owner }), ownedCount: 2 });
    await expect(service.setRole(ADMIN, TARGET, roleDto(Role.Customer))).rejects.toThrow(
      ConflictException,
    );
  });

  it('lets an owner with restaurants be promoted to admin', async () => {
    // Admin outranks owner, so nothing is orphaned.
    const { service, update } = build({ user: userRow({ role: Role.Owner }), ownedCount: 2 });
    await service.setRole(ADMIN, TARGET, roleDto(Role.Admin));

    expect(update).toHaveBeenCalled();
  });

  it('is a no-op when the role is unchanged', async () => {
    const { service, update, tokens } = build({ user: userRow({ role: Role.Customer }) });
    await service.setRole(ADMIN, TARGET, roleDto(Role.Customer));

    // No pointless session revocation for a change that did not happen.
    expect(update).not.toHaveBeenCalled();
    expect(tokens.revokeAllFor).not.toHaveBeenCalled();
  });

  it('404s for an unknown user', async () => {
    const { service } = build({ user: null });
    await expect(service.setRole(ADMIN, TARGET, roleDto(Role.Owner))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('listUsers', () => {
  it('masks phone numbers', async () => {
    // An admin list is not a reason to hand out every phone number in full.
    const { service } = build();
    const page = await service.listUsers(
      Object.assign(Object.create(null), { page: 1, limit: 20 }),
    );

    expect(page.items[0]?.phone).not.toContain('123456');
    expect(page.items[0]?.phone).toMatch(/\*/);
  });
});

describe('createRestaurant', () => {
  const dto = Object.assign(new CreateRestaurantDto(), {
    slug: 'new-place',
    name: 'New Place',
    ownerId: TARGET,
  });

  it('refuses an owner id that belongs to a customer', async () => {
    // It would create a restaurant its "owner" cannot open in the panel.
    const { service } = build({ user: userRow({ role: Role.Customer }) });
    await expect(service.createRestaurant(dto)).rejects.toThrow(UnprocessableEntityException);
  });

  it('creates it for a real owner', async () => {
    const { service, prisma } = build({ user: userRow({ role: Role.Owner }) });
    await service.createRestaurant(dto);

    expect(prisma.restaurant.create).toHaveBeenCalled();
  });

  it('404s for an unknown owner', async () => {
    const { service } = build({ user: null });
    await expect(service.createRestaurant(dto)).rejects.toThrow(NotFoundException);
  });
});

describe('issuePromo', () => {
  const promo = (over: Partial<IssuePromoDto> = {}) =>
    Object.assign(new IssuePromoDto(), { code: 'SUMMER', discountPct: 10, ...over });

  it('issues to every verified account and reports what was created', async () => {
    const { service, couponCreateMany } = build({ created: 2 });
    const result = await service.issuePromo(promo());

    expect(result).toEqual({ code: 'SUMMER', issued: 2 });
    // skipDuplicates, so re-running tops up new accounts instead of failing.
    expect(couponCreateMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('demands exactly one kind of discount', async () => {
    const { service } = build();
    await expect(service.issuePromo(promo({ discountAmd: 500 }))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.issuePromo(promo({ discountPct: undefined })),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an expiry already in the past', async () => {
    const { service } = build();
    await expect(
      service.issuePromo(promo({ validUntil: new Date(Date.now() - 1000).toISOString() })),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses when nobody matches', async () => {
    const { service } = build({ recipients: [] });
    await expect(service.issuePromo(promo())).rejects.toThrow(UnprocessableEntityException);
  });

  it('only ever targets verified, non-guest accounts', async () => {
    const { service, prisma } = build();
    await service.issuePromo(promo());

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phoneVerified: true, isGuest: false }),
      }),
    );
  });
});
