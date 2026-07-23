import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Role as PrismaRole } from '@prisma/client';
import { Role } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { maskPhone } from '../auth/phone.util';
import type { JwtPayload } from '../auth/token.service';
import {
  CreateRestaurantDto,
  IssuePromoDto,
  ListUsersDto,
  PROMO_SOURCE,
  SetRoleDto,
} from './dto';

export interface AdminUser {
  id: string;
  name: string | null;
  /** Masked: an admin list is not a reason to expose every phone number in
   *  full (DEVELOPMENT_GUIDE.md, "no PII in logs" — the same instinct). */
  phone: string | null;
  email: string | null;
  role: Role;
  isGuest: boolean;
  phoneVerified: boolean;
  ordersCount: number;
  rewardPoints: number;
  createdAt: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async listUsers(
    query: ListUsersDto,
  ): Promise<{ items: AdminUser[]; total: number; page: number }> {
    const where: Prisma.UserWhereInput = {};

    if (query.q) {
      where.OR = [
        { phone: { contains: query.q } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.role) {
      where.role = query.role as Prisma.EnumRoleFilter['equals'];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toAdminUser), total, page: query.page };
  }

  /**
   * Changes someone's role.
   *
   * The guards here are the point of the method. Each one exists because the
   * platform becomes unmanageable or unsafe without it, not for tidiness.
   */
  async setRole(actor: JwtPayload, userId: string, dto: SetRoleDto): Promise<AdminUser> {
    // 1. Not yourself. An admin who demotes themselves loses the panel with no
    //    way back, and it is never what was meant.
    if (userId === actor.sub) {
      throw new UnprocessableEntityException('You cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Not a guest. A guest has no verified phone, so granting one staff
    //    powers would hand them out to an anonymous device.
    if (user.isGuest || !user.phoneVerified) {
      throw new UnprocessableEntityException(
        'Only an account with a verified phone can be given a role',
      );
    }

    // 3. Never remove the last admin — nobody could restore one afterwards.
    if (user.role === Role.Admin && dto.role !== Role.Admin) {
      const admins = await this.prisma.user.count({ where: { role: Role.Admin } });
      if (admins <= 1) {
        throw new ConflictException('The last administrator cannot be demoted');
      }
    }

    if (user.role === dto.role) {
      return this.findUser(userId);
    }

    // 4. An owner keeps their restaurants when demoted, and they would become
    //    unmanageable. Refuse rather than orphan them.
    if (user.role === Role.Owner && dto.role !== Role.Owner && dto.role !== Role.Admin) {
      const owned = await this.prisma.restaurant.count({ where: { ownerId: userId } });
      if (owned > 0) {
        throw new ConflictException(
          `This owner still has ${owned} restaurant(s); reassign them before changing the role`,
        );
      }
    }

    // `ASSIGNABLE_ROLES` in the DTO already excludes `guest`, which exists in
    // the shared enum but not in the database's; the cast is safe because of
    // that validation, not in spite of it.
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role as PrismaRole },
    });

    // Access tokens carry `role` and cannot be recalled, so the old one keeps
    // working until it expires (15 min). Killing the refresh tokens is what
    // stops that window being extended.
    const revoked = await this.tokens.revokeAllFor(userId);
    this.logger.log(
      `${actor.sub} changed ${userId} from ${user.role} to ${dto.role}; revoked ${revoked} session(s)`,
    );

    return this.findUser(userId);
  }

  async createRestaurant(dto: CreateRestaurantDto) {
    const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
    if (owner.role !== Role.Owner && owner.role !== Role.Admin) {
      // Creating a restaurant for a customer would produce a restaurant its
      // "owner" cannot open in the panel.
      throw new UnprocessableEntityException(
        'That account is not an owner; change their role first',
      );
    }

    try {
      return await this.prisma.restaurant.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          ownerId: dto.ownerId,
          cuisine: dto.cuisine ?? null,
          priceLevel: dto.priceLevel ?? null,
          services: [],
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // The slug is a public URL; a duplicate is a conflict, not a 500.
        throw new ConflictException('That slug is already taken');
      }
      throw err;
    }
  }

  /**
   * Issues a promo coupon.
   *
   * Money, so: exactly one kind of discount, an explicit audience, and a count
   * of what was actually created rather than what was asked for.
   */
  async issuePromo(dto: IssuePromoDto): Promise<{ code: string; issued: number }> {
    if ((dto.discountPct === undefined) === (dto.discountAmd === undefined)) {
      throw new BadRequestException('Give exactly one of discountPct or discountAmd');
    }

    const recipients = dto.userIds
      ? await this.prisma.user.findMany({
          where: { id: { in: dto.userIds }, phoneVerified: true, isGuest: false },
          select: { id: true },
        })
      : await this.prisma.user.findMany({
          where: { phoneVerified: true, isGuest: false },
          select: { id: true },
        });

    if (recipients.length === 0) {
      throw new UnprocessableEntityException('No verified accounts matched');
    }

    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && validUntil.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('validUntil is already in the past');
    }

    // `skipDuplicates` on the (user, code) unique index, so re-running the
    // same promo tops up new accounts instead of failing outright.
    const created = await this.prisma.coupon.createMany({
      data: recipients.map((user) => ({
        userId: user.id,
        code: dto.code,
        discountPct: dto.discountPct ?? null,
        discountAmd: dto.discountAmd ?? null,
        source: PROMO_SOURCE,
        validUntil,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Issued promo ${dto.code} to ${created.count} account(s)`);
    return { code: dto.code, issued: created.count };
  }

  private async findUser(userId: string): Promise<AdminUser> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { _count: { select: { orders: true } } },
    });
    return toAdminUser(row);
  }
}

type UserRow = Prisma.UserGetPayload<{ include: { _count: { select: { orders: true } } } }>;

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ? maskPhone(row.phone) : null,
    email: row.email,
    role: row.role as Role,
    isGuest: row.isGuest,
    phoneVerified: row.phoneVerified,
    ordersCount: row._count.orders,
    rewardPoints: row.rewardPoints,
    createdAt: row.createdAt.toISOString(),
  };
}
