import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_RESERVATION_STATUSES,
  AuditAction,
  Permission,
  ReservationStatus,
  canTransitionReservation,
  depositOutcomeFor,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  RESERVATION_INCLUDE,
  ReservationsService,
  freeCancellationUntil,
  policyForReservation,
  type ReservationDetail,
} from '../reservations/reservations.service';
import { instantOf } from '../reservations/slots';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { branchScope } from '../staff/scope';
import { ListStaffReservationsDto, SetReservationStatusDto } from '../reservations/dto';

export interface StaffReservationItem extends ReservationDetail {
  customerName: string | null;
  customerPhone: string | null;
}

@Injectable()
export class RestaurantReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly audit: AuditService,
  ) {}

  /** The book for a service: who is coming, when, and to which table. */
  async list(
    staff: StaffJwtPayload,
    query: ListStaffReservationsDto,
  ): Promise<{ items: StaffReservationItem[]; total: number; page: number }> {
    const where: Prisma.ReservationWhereInput = {
      branch: branchScope(staff.scopes, Permission.ReservationsRead),
    };

    if (query.branchId) {
      // Narrows the scope, never widens it.
      where.branchId = query.branchId;
    }
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { in: [...ACTIVE_RESERVATION_STATUSES] };
    }
    if (query.date) {
      // A local calendar day, not a UTC one: a restaurant's "today" ends when
      // it closes, and Yerevan is four hours off UTC.
      where.reservedFor = {
        gte: instantOf(query.date, 0),
        lt: instantOf(query.date, 24 * 60),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: { ...RESERVATION_INCLUDE, user: { select: { name: true, phone: true } } },
        // Chronological: a host reads the book forwards.
        orderBy: [{ reservedFor: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...this.reservations.toDetail(row),
        customerName: row.user.name,
        customerPhone: row.user.phone,
      })),
      total,
      page: query.page,
    };
  }

  /**
   * Moves a booking through its lifecycle, applying the deposit rule.
   *
   * The rule itself lives in `shared` — a no-show keeps the deposit, a
   * completed visit credits it — so the panel and the guest's cancel path
   * cannot end up disagreeing about the money.
   */
  async setStatus(
    staff: StaffJwtPayload,
    id: string,
    dto: SetReservationStatusDto,
  ): Promise<ReservationDetail> {
    const reservation = await this.reservations.loadForStaff({
      id,
      branch: branchScope(staff.scopes, Permission.ReservationsAdvance),
    });

    const from = reservation.status as ReservationStatus;
    if (!canTransitionReservation(from, dto.status)) {
      throw new UnprocessableEntityException(
        `A reservation that is ${from} cannot become ${dto.status}`,
      );
    }

    // `confirmed` and `seated` hold the table and the deposit; only an ending
    // decides the money.
    const outcome =
      dto.status === ReservationStatus.Confirmed || dto.status === ReservationStatus.Seated
        ? null
        : depositOutcomeFor(
            dto.status,
            freeCancellationUntil(
              reservation.reservedFor,
              policyForReservation(reservation),
            ).getTime() > Date.now(),
          );

    return this.reservations.settle(reservation, dto.status, outcome, (tx) =>
      this.audit.record(tx, staff, {
        action: AuditAction.ReservationStatus,
        entityId: id,
        scope: { restaurantId: reservation.branch.restaurantId, branchId: reservation.branchId },
        before: { status: from },
        // The deposit outcome, because "no-show" and "no-show, and the deposit
        // was kept" are different things to have done to a guest, and the second
        // is the one that gets queried later.
        after: { status: dto.status, ...(outcome ? { depositOutcome: outcome } : {}) },
      }),
    );
  }
}
