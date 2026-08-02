import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AuditAction, StaffRole, isValidScope, type StaffScope } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EMAIL_SENDER, EmailSender } from '../email/email.sender';
import type { StaffJwtPayload } from './staff-token.service';
import { normalizeEmail } from './email.util';
import { CreateInviteDto } from './dto';

export interface InviteResult {
  /** True when the role was granted straight away because the account already
   *  exists and can sign in — no invitation was sent. */
  granted: boolean;
  email: string;
  expiresAt: Date | null;
}

/**
 * How a staff account comes into existence.
 *
 * There is no sign-up. An account is created only by someone who already holds
 * the right to create it, which is what makes "no customer can become staff"
 * a property of the system rather than a rule somebody has to remember.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);
  private readonly ttl: number;
  private readonly adminUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {
    this.ttl = this.config.getOrThrow<number>('STAFF_INVITE_TTL');
    this.adminUrl = this.config.getOrThrow<string>('ADMIN_URL');
  }

  /**
   * Invites someone, or — if they already work here — simply grants the role.
   *
   * The second path matters: sending a "set your password" email to someone who
   * already has one, because they were given a second branch, trains people to
   * click password links they did not ask for.
   */
  async create(staff: StaffJwtPayload, dto: CreateInviteDto): Promise<InviteResult> {
    const actorStaffId = staff.sub;
    const email = normalizeEmail(dto.email);
    const scope: StaffScope = {
      role: dto.role,
      restaurantId: dto.restaurantId ?? null,
      branchId: dto.branchId ?? null,
    };

    if (!isValidScope(scope)) {
      throw new UnprocessableEntityException(this.scopeMessage(dto.role));
    }
    await this.assertScopeExists(scope);

    const existing = await this.prisma.staffUser.findUnique({
      where: { email },
      include: { assignments: true },
    });

    if (existing && !existing.isActive) {
      throw new ConflictException(
        'That account is deactivated; reactivate it before giving it a role',
      );
    }

    if (existing?.passwordHash) {
      const duplicate = existing.assignments.some(
        (row) =>
          row.role === scope.role &&
          row.restaurantId === scope.restaurantId &&
          row.branchId === scope.branchId,
      );
      if (duplicate) {
        throw new ConflictException('That account already holds this role here');
      }

      await this.prisma.$transaction(async (tx) => {
        const granted = await tx.staffAssignment.create({
          data: {
            staffUserId: existing.id,
            role: scope.role,
            restaurantId: scope.restaurantId,
            branchId: scope.branchId,
            createdById: actorStaffId,
          },
        });

        await this.audit.record(tx, staff, {
          action: AuditAction.StaffInvite,
          entityId: granted.id,
          scope: { restaurantId: scope.restaurantId, branchId: scope.branchId },
          // `granted` is what tells the two paths apart in the feed: "gave X the
          // manager role" and "invited X as manager" are different events, and
          // only one of them sent an email.
          after: { email, role: scope.role, granted: true },
        });
      });

      await this.email.send({
        to: email,
        subject: 'Your access has changed — Amragrir',
        body: `You have been given the ${dto.role} role.\n\nSign in at ${this.adminUrl} to see it.`,
      });

      this.logger.log(`${actorStaffId} granted ${dto.role} to existing staff ${existing.id}`);
      return { granted: true, email, expiresAt: null };
    }

    // A raw token, kept only in the email. The row stores its digest, so a
    // leaked database yields no usable invitations.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttl * 1000);

    await this.prisma.$transaction(async (tx) => {
      // One open invite per address — the partial unique index enforces it, and
      // re-inviting should replace the old link rather than leave two live.
      await tx.staffInvite.deleteMany({ where: { email, acceptedAt: null } });
      const invite = await tx.staffInvite.create({
        data: {
          email,
          role: scope.role,
          restaurantId: scope.restaurantId,
          branchId: scope.branchId,
          tokenHash: hashToken(token),
          expiresAt,
          invitedById: actorStaffId,
        },
      });

      await this.audit.record(tx, staff, {
        action: AuditAction.StaffInvite,
        entityId: invite.id,
        scope: { restaurantId: scope.restaurantId, branchId: scope.branchId },
        // The address and the role, never the token. `after` is shown to whoever
        // may read this person's activity, and the invitation link is the one
        // secret this row is anywhere near.
        after: { email, role: scope.role, granted: false },
      });
    });

    await this.email.send({
      to: email,
      subject: 'You have been invited to Amragrir',
      body: [
        `You have been invited as ${dto.role}.`,
        '',
        'Open this link to set a password and sign in:',
        `${this.adminUrl}/accept-invite?token=${token}`,
        '',
        `The link stops working ${expiresAt.toISOString()}.`,
      ].join('\n'),
    });

    this.logger.log(`${actorStaffId} invited ${email} as ${dto.role}`);
    return { granted: false, email, expiresAt };
  }

  /** The invite behind a token, or null. Used by acceptance; keeps the lookup
   *  and its expiry rule in one place. */
  async findOpen(token: string) {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite || invite.acceptedAt !== null || invite.expiresAt.getTime() < Date.now()) {
      return null;
    }
    return invite;
  }

  /**
   * Refuses a scope that names something that does not exist.
   *
   * Otherwise the foreign key surfaces as a 500, and — worse — an invite could
   * be issued naming a branch id the inviter guessed.
   */
  private async assertScopeExists(scope: StaffScope): Promise<void> {
    if (scope.restaurantId) {
      const found = await this.prisma.restaurant.findUnique({
        where: { id: scope.restaurantId },
        select: { id: true },
      });
      if (!found) {
        throw new NotFoundException('Restaurant not found');
      }
    }
    if (scope.branchId) {
      const found = await this.prisma.restaurantBranch.findUnique({
        where: { id: scope.branchId },
        select: { id: true },
      });
      if (!found) {
        throw new NotFoundException('Branch not found');
      }
    }
  }

  private scopeMessage(role: StaffRole): string {
    switch (role) {
      case StaffRole.SuperAdmin:
      case StaffRole.PlatformAdmin:
        return 'A platform role covers the whole platform; do not give it a restaurant or branch';
      case StaffRole.RestaurantAdmin:
        return 'A restaurant admin needs a restaurantId, and no branchId';
      default:
        return 'A manager or staff role needs a branchId, and no restaurantId';
    }
  }
}

/** Tokens are looked up by digest, so this must stay a plain unsalted hash —
 *  there is nothing to compare against otherwise. The token's 256 bits of
 *  entropy are what make it unguessable, not the hashing. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
