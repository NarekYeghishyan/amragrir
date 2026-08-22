import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, toPublicUser } from '../auth/auth.service';
import { UpdateLanguageDto, UpdateMeDto, UpdateSettingsDto } from './dto';

/** Profile shape for GET /me — adds the counters the profile screen shows. */
export interface MeProfile extends PublicUser {
  rewardPoints: number;
  ordersCount: number;
  couponsCount: number;
  darkMode: boolean;
  notifPush: boolean;
  notifPromo: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const [ordersCount, couponsCount] = await Promise.all([
      this.prisma.order.count({ where: { userId } }),
      this.prisma.coupon.count({ where: { userId, usedAt: null } }),
    ]);

    return {
      ...toPublicUser(user),
      rewardPoints: user.rewardPoints,
      ordersCount,
      couponsCount,
      darkMode: user.darkMode,
      notifPush: user.notifPush,
      notifPromo: user.notifPromo,
    };
  }

  async updateProfile(userId: string, dto: UpdateMeDto): Promise<MeProfile> {
    // The name is trimmed, and whitespace is not a name: an empty result leaves
    // the stored one alone rather than blanking it. Same rule as `verify-code`,
    // and for a stronger reason here — sign-up will not open an account without
    // a name (SCREENS.md §0), so a settings screen that could empty it a minute
    // later would undo that rule with one keystroke.
    const data: UpdateMeDto = { ...dto };
    const name = dto.name?.trim();
    if (name) {
      data.name = name;
    } else {
      delete data.name;
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (err) {
      // email carries a unique constraint; surface it as 409 rather than 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That email is already in use');
      }
      throw err;
    }
    return this.getProfile(userId);
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<MeProfile> {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.getProfile(userId);
  }

  async updateLanguage(userId: string, dto: UpdateLanguageDto): Promise<MeProfile> {
    await this.prisma.user.update({ where: { id: userId }, data: { language: dto.language } });
    return this.getProfile(userId);
  }
}
