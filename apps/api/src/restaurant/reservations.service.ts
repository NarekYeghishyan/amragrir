import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_RESERVATION_STATUSES,
  AuditAction,
  Permission,
  ReservationStatus,
  TERMINAL_RESERVATION_STATUSES,
  canTransitionReservation,
  depositOutcomeFor,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReservationNotificationsService } from '../notifications/reservation-notifications.service';
import {
  RESERVATION_INCLUDE,
  ReservationsService,
  freeCancellationUntil,
  policyForReservation,
  type ReservationDetail,
} from '../reservations/reservations.service';
import { dateOnly, seatingRange, seatingsOverlap } from '../reservations/slots';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { branchScope } from '../staff/scope';
import { ListStaffReservationsDto, SetReservationStatusDto } from '../reservations/dto';
import type { SetReservationTableDto } from './booking-settings.dto';

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
    private readonly guestNotifications: ReservationNotificationsService,
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
      // The *service* day, which is the day the booking was taken for, and not
      // the calendar day its instant falls on. The two are the same everywhere
      // except a branch whose night runs past midnight — and there this is the
      // whole difference between a host seeing the 00:30 party while the shift
      // is still on and finding them at the top of tomorrow's page, hours after
      // they gave up waiting.
      //
      // Filtered on a stored column rather than a computed range because a list
      // may span branches whose nights end at different times, and because the
      // answer belongs to the hours the booking was accepted under rather than
      // to whatever the branch's hours say today.
      where.serviceDate = dateOnly(query.date);
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
   * Puts a booking at a different table.
   *
   * The one place a person overrides the server's choice. Assignment is
   * automatic and picks the smallest table that fits, which is right for
   * filling a room and wrong roughly once an evening — the party with a
   * pushchair, the couple who asked for the window, the four who turned up as
   * six and can be squeezed onto the big table nobody booked.
   *
   * Everything else about the booking is left exactly as it is: the guest, the
   * time, the deposit and its terms. This is furniture, not a renegotiation.
   *
   * The new table has to be free for this booking's own seating, and the check
   * runs in the same **serializable** transaction as the move — otherwise two
   * people reseating two parties onto one table at once would both succeed. The
   * unique index on `(table_id, active_slot)` is the second line, and catches
   * the exact-same-start case even if that isolation level is ever relaxed.
   */
  async setTable(
    staff: StaffJwtPayload,
    id: string,
    dto: SetReservationTableDto,
  ): Promise<ReservationDetail> {
    const reservation = await this.reservations.loadForStaff({
      id,
      branch: branchScope(staff.scopes, Permission.ReservationsAdvance),
    });

    if (TERMINAL_RESERVATION_STATUSES.includes(reservation.status as ReservationStatus)) {
      throw new UnprocessableEntityException(
        `A booking that is ${reservation.status} is not sitting anywhere to be moved`,
      );
    }
    if (reservation.tableId === dto.tableId) {
      // Not an error, and not a write either: re-saving the table somebody is
      // already at would put a line in the audit feed saying nothing happened.
      return this.reservations.toDetail(reservation);
    }

    const table = await this.prisma.table.findFirst({
      where: { id: dto.tableId, branchId: reservation.branchId, isActive: true },
    });
    if (!table) {
      // Scoped to this booking's own branch, so a table id from another
      // restaurant reads as "no such table" rather than as a permission error.
      throw new NotFoundException('Table not found at this branch');
    }
    if (table.seats < reservation.guests) {
      throw new UnprocessableEntityException({
        message: 'That table does not seat this party',
        seats: table.seats,
        guests: reservation.guests,
      });
    }

    const policy = policyForReservation(reservation);
    const seating = reservation.seatingMinutes ?? policy.seatingMinutes;
    const range = seatingRange(reservation.reservedFor);
    const from = reservation.table?.tableNo ?? null;

    const moved = await this.prisma
      .$transaction(
        async (tx) => {
          const taken = await tx.reservation.findMany({
            where: {
              tableId: table.id,
              id: { not: reservation.id },
              status: { in: [...ACTIVE_RESERVATION_STATUSES] },
              reservedFor: { gte: range.from, lte: range.to },
            },
            select: { reservedFor: true, seatingMinutes: true },
          });

          const clash = taken.some((booking) =>
            seatingsOverlap(
              booking.reservedFor,
              reservation.reservedFor,
              booking.seatingMinutes ?? policy.seatingMinutes,
              seating,
            ),
          );
          if (clash) {
            throw new ConflictException('That table is taken at this time');
          }

          const updated = await tx.reservation.update({
            where: { id: reservation.id },
            data: { tableId: table.id },
            include: RESERVATION_INCLUDE,
          });

          await this.audit.record(tx, staff, {
            action: AuditAction.ReservationTable,
            entityId: id,
            scope: {
              restaurantId: reservation.branch.restaurantId,
              branchId: reservation.branchId,
            },
            // Numbers rather than ids: a year later "moved from 4 to 11" is
            // readable and a pair of UUIDs is not.
            before: { tableNo: from },
            after: { tableNo: table.tableNo },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // The unique index fired: somebody took this table for this exact
          // start while the check above was running.
          throw new ConflictException('That table is taken at this time');
        }
        throw err;
      });

    return this.reservations.toDetail(moved);
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
            freeCancellationUntil(reservation, policyForReservation(reservation)).getTime() >
              Date.now(),
          );

    const move = {
      reservationId: id,
      userId: reservation.userId,
      status: dto.status,
      reservedFor: reservation.reservedFor,
    };

    /**
     * The guest's notification, written with the move and announced after it.
     *
     * Captured out of the transaction rather than returned from `settle`,
     * because `settle` answers with the booking and its shape is the customer
     * API's. `null` here means the move was not news — see
     * `reservation-notifications.ts` for which three are.
     */
    let written: Awaited<ReturnType<ReservationNotificationsService['record']>> = null;

    const detail = await this.reservations.settle(
      reservation,
      dto.status,
      outcome,
      async (tx) => {
        await this.audit.record(tx, staff, {
          action: AuditAction.ReservationStatus,
          entityId: id,
          scope: { restaurantId: reservation.branch.restaurantId, branchId: reservation.branchId },
          before: { status: from },
          // The deposit outcome, because "no-show" and "no-show, and the deposit
          // was kept" are different things to have done to a guest, and the second
          // is the one that gets queried later.
          after: { status: dto.status, ...(outcome ? { depositOutcome: outcome } : {}) },
        });

        // In the same transaction as the move it describes: a notification that
        // outlived a rolled-back update would tell somebody their table was
        // confirmed when it was not.
        written = await this.guestNotifications.record(tx, move);
      },
    );

    if (written !== null) {
      // Read only when there is something to announce, which is three statuses
      // in six — not on every booking a shift touches.
      const guest = await this.prisma.user.findUnique({
        where: { id: reservation.userId },
        select: { notifPush: true },
      });
      this.guestNotifications.publish(written, move, guest?.notifPush ?? true);
    }

    return detail;
  }
}
