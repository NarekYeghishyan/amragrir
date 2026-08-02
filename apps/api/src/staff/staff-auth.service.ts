import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Permission, ROLE_PERMISSIONS, type StaffRole, type StaffScope } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EMAIL_SENDER, EmailSender } from '../email/email.sender';
import { PasswordService } from './password.service';
import { StaffTokenPair, StaffTokenService } from './staff-token.service';
import { InvitesService, hashToken } from './invites.service';
import { maskEmail, normalizeEmail } from './email.util';
import { AcceptInviteDto, ResetPasswordDto, StaffLoginDto } from './dto';

export interface StaffProfile {
  id: string;
  email: string;
  name: string;
  scopes: StaffScope[];
  /** Flattened from the roles held, so the panel can render from the same map
   *  the API enforces instead of re-deriving it. */
  permissions: Permission[];
}

export interface StaffAuthResult extends StaffTokenPair {
  staff: StaffProfile;
}

const RESET_KEY = (tokenHash: string): string => `staff_reset:${tokenHash}`;

@Injectable()
export class StaffAuthService {
  private readonly logger = new Logger(StaffAuthService.name);
  private readonly resetTtl: number;
  private readonly adminUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly tokens: StaffTokenService,
    private readonly invites: InvitesService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {
    this.resetTtl = this.config.getOrThrow<number>('STAFF_RESET_TTL');
    this.adminUrl = this.config.getOrThrow<string>('ADMIN_URL');
  }

  /**
   * Email and password.
   *
   * Every failure answers the same way — wrong password, unknown address,
   * deactivated account, invite never accepted — because a login endpoint that
   * distinguishes them is a way to find out who works here. The one exception
   * is an account with no roles, which is a real dead end the person needs
   * told about rather than left guessing at.
   */
  async login(dto: StaffLoginDto): Promise<StaffAuthResult> {
    const email = normalizeEmail(dto.email);
    const staff = await this.prisma.staffUser.findUnique({
      where: { email },
      include: { assignments: true },
    });

    if (!staff?.passwordHash || !staff.isActive) {
      // Spend the same time a real verification would, so "no such account"
      // cannot be told from "wrong password" by a stopwatch.
      await this.passwords.burnTime();
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!(await this.passwords.verify(dto.password, staff.passwordHash))) {
      this.logger.warn(`Failed staff login for ${maskEmail(email)}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const scopes = toScopes(staff.assignments);
    if (scopes.length === 0) {
      // A real dead end: the credentials are right and there is nothing behind
      // them. Issuing a token here would produce a panel where everything 403s.
      throw new ForbiddenException('This account has no access; ask an administrator for a role');
    }

    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    const pair = await this.tokens.issue(staff.id, scopes);
    this.logger.log(`Staff ${staff.id} signed in`);
    return { ...pair, staff: toProfile(staff, scopes) };
  }

  /**
   * Rotates a refresh token, re-reading assignments so a role granted or
   * revoked since the last refresh takes effect now rather than at next
   * sign-in.
   */
  async refresh(refreshToken: string): Promise<StaffAuthResult> {
    const staffId = await this.tokens.consumeRefresh(refreshToken);
    const staff = await this.prisma.staffUser.findUnique({
      where: { id: staffId },
      include: { assignments: true },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('This account can no longer sign in');
    }

    const scopes = toScopes(staff.assignments);
    if (scopes.length === 0) {
      throw new ForbiddenException('This account has no access; ask an administrator for a role');
    }

    const pair = await this.tokens.issue(staff.id, scopes);
    return { ...pair, staff: toProfile(staff, scopes) };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeRefresh(refreshToken);
  }

  async me(staffId: string): Promise<StaffProfile> {
    const staff = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: staffId },
      include: { assignments: true },
    });
    // Read from the database, not from the token: a role granted a minute ago
    // is not in the current access token, and this is the screen that has to
    // show it.
    return toProfile(staff, toScopes(staff.assignments));
  }

  /**
   * Turns an invitation into an account.
   *
   * Creating the account, setting its password and granting the role are one
   * transaction: a half-accepted invite would leave an account nobody can sign
   * into and a token already spent.
   */
  async acceptInvite(dto: AcceptInviteDto): Promise<StaffAuthResult> {
    const invite = await this.invites.findOpen(dto.token);
    if (!invite) {
      throw new UnauthorizedException('This invitation has expired or has already been used');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const now = new Date();

    const staff = await this.prisma.$transaction(async (tx) => {
      const account = await tx.staffUser.upsert({
        where: { email: invite.email },
        // An account may already exist without a password — the migration
        // created one for every former owner. Accepting fills it in rather
        // than failing on the unique index.
        update: {
          passwordHash,
          emailVerifiedAt: now,
          isActive: true,
          ...(dto.name ? { name: dto.name } : {}),
        },
        create: {
          email: invite.email,
          passwordHash,
          emailVerifiedAt: now,
          name: dto.name ?? invite.email.split('@')[0],
        },
      });

      // An account migrated from the old `users.role` may already hold this
      // exact assignment; the partial unique indexes would make a second one a
      // constraint violation rather than a duplicate row.
      const held = await tx.staffAssignment.findFirst({
        where: {
          staffUserId: account.id,
          role: invite.role,
          restaurantId: invite.restaurantId,
          branchId: invite.branchId,
        },
        select: { id: true },
      });
      if (!held) {
        await tx.staffAssignment.create({
          data: {
            staffUserId: account.id,
            role: invite.role,
            restaurantId: invite.restaurantId,
            branchId: invite.branchId,
            createdById: invite.invitedById,
          },
        });
      }

      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });

      return tx.staffUser.findUniqueOrThrow({
        where: { id: account.id },
        include: { assignments: true },
      });
    });

    const scopes = toScopes(staff.assignments);
    const pair = await this.tokens.issue(staff.id, scopes);
    this.logger.log(`Invite accepted by staff ${staff.id}`);
    return { ...pair, staff: toProfile(staff, scopes) };
  }

  /**
   * Starts a password reset.
   *
   * Answers the same way whether or not the address belongs to anyone: the
   * response to this endpoint must not be a way to test who works here.
   */
  async forgotPassword(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const staff = await this.prisma.staffUser.findUnique({ where: { email } });

    if (!staff || !staff.isActive) {
      this.logger.log(`Password reset requested for unknown ${maskEmail(email)}`);
      return;
    }

    const token = randomBytes(32).toString('base64url');
    // Redis rather than a table: a reset token is short-lived and single-use,
    // and expiring it is the whole of its lifecycle management.
    await this.redis.setEx(RESET_KEY(hashToken(token)), staff.id, this.resetTtl);

    await this.email.send({
      to: email,
      subject: 'Reset your Amragrir password',
      body: [
        'Open this link to choose a new password:',
        `${this.adminUrl}/reset-password?token=${token}`,
        '',
        `The link stops working in ${Math.round(this.resetTtl / 60)} minutes.`,
        'If you did not ask for this, ignore this email — nothing has changed.',
      ].join('\n'),
    });
  }

  /**
   * Finishes a reset and signs every other session out.
   *
   * Whoever asked for the reset may have done so because someone else has the
   * old password; leaving that session alive would defeat the point.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const key = RESET_KEY(hashToken(dto.token));
    const staffId = await this.redis.get(key);
    if (!staffId) {
      throw new UnauthorizedException('This reset link has expired or has already been used');
    }
    await this.redis.del(key);

    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.staffUser.update({
      where: { id: staffId },
      data: { passwordHash, emailVerifiedAt: new Date() },
    });

    const revoked = await this.tokens.revokeAllFor(staffId);
    this.logger.log(`Staff ${staffId} reset their password; revoked ${revoked} session(s)`);
  }
}

interface AssignmentRow {
  role: StaffRole;
  restaurantId: string | null;
  branchId: string | null;
}

export function toScopes(assignments: AssignmentRow[]): StaffScope[] {
  return assignments.map((row) => ({
    role: row.role,
    restaurantId: row.restaurantId,
    branchId: row.branchId,
  }));
}

export function toProfile(
  staff: { id: string; email: string; name: string },
  scopes: StaffScope[],
): StaffProfile {
  const permissions = new Set<Permission>();
  for (const scope of scopes) {
    for (const permission of ROLE_PERMISSIONS[scope.role]) {
      permissions.add(permission);
    }
  }

  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    scopes,
    permissions: [...permissions],
  };
}
