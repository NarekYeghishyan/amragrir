import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_RESERVATION_STATUSES,
  DepositOutcome,
  PaymentStatus,
  RESERVATION_FREE_CANCEL_HOURS,
  RESERVATION_MAX_LEAD_DAYS,
  RESERVATION_SEATING_MINUTES,
  RestaurantService,
  ReservationStatus,
  TERMINAL_RESERVATION_STATUSES,
  depositOutcomeFor,
  isReservationCancellable,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DepositsService } from '../payments/deposits.service';
import {
  depositFor,
  isSlotBoundary,
  localDateOf,
  localTimeLabel,
  openWindowFor,
  seatingRange,
  seatingsOverlap,
  slotsFor,
} from './slots';
import {
  AvailabilityQueryDto,
  CreateReservationDto,
  ListReservationsDto,
  ReservationListFilter,
} from './dto';

/**
 * How many times a booking retries when Postgres aborts it for serialization.
 * Serializable transactions fail *by design* under contention, so a retry is
 * part of using them correctly, not an error path.
 */
const BOOKING_ATTEMPTS = 3;

export interface SlotDto {
  time: string;
  at: string;
  available: boolean;
}

export interface AvailabilityResult {
  branchId: string;
  date: string;
  guests: number;
  slots: SlotDto[];
  depositAmd: number;
  /** Largest party any single table at this branch can seat. */
  maxSeats: number;
  reservationsEnabled: boolean;
}

export interface ReservationDetail {
  id: string;
  status: ReservationStatus;
  branch: { id: string; name: string | null; address: string | null };
  restaurantName: string;
  reservedFor: string;
  localTime: string;
  localDate: string;
  guests: number;
  tableNo: string | null;
  depositAmd: number;
  depositStatus: PaymentStatus | null;
  depositCredited: boolean;
  /** True while cancelling still returns the deposit. */
  freeCancellationUntil: string | null;
  orderId: string | null;
  createdAt: string;
}

type ReservationRow = Prisma.ReservationGetPayload<{ include: typeof RESERVATION_INCLUDE }>;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deposits: DepositsService,
  ) {}

  /**
   * Which times can be booked on a date.
   *
   * A slot is available when at least one table big enough for the party is
   * free for the whole seating. Availability is answered per party size, not
   * in the abstract: "19:00 is free" is meaningless without knowing whether it
   * is free for two or for eight.
   */
  async availability(
    idOrBranchId: string,
    query: AvailabilityQueryDto,
  ): Promise<AvailabilityResult> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: { id: idOrBranchId },
      include: { restaurant: true, tables: { where: { isActive: true } } },
    });
    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }

    const fitting = branch.tables.filter((table) => table.seats >= query.guests);
    const maxSeats = branch.tables.reduce((max, table) => Math.max(max, table.seats), 0);

    const window = openWindowFor(branch.openHours, new Date(`${query.date}T12:00:00Z`));
    const reservationsEnabled =
      branch.restaurant.reservationsEnabled &&
      branch.restaurant.services.includes(RestaurantService.Reserve);

    // A closed day, a restaurant that does not take bookings, or no table big
    // enough — all mean "no times", and each is a real answer rather than an
    // empty list that looks like a bug.
    if (!window || !reservationsEnabled || fitting.length === 0) {
      return {
        branchId: branch.id,
        date: query.date,
        guests: query.guests,
        slots: [],
        depositAmd: depositFor(query.guests),
        maxSeats,
        reservationsEnabled,
      };
    }

    const slots = slotsFor(query.date, window);
    if (slots.length === 0) {
      return {
        branchId: branch.id,
        date: query.date,
        guests: query.guests,
        slots: [],
        depositAmd: depositFor(query.guests),
        maxSeats,
        reservationsEnabled,
      };
    }

    // One query for the whole day, widened by a seating on each side so a
    // booking that started before opening time still blocks the first slot.
    const first = seatingRange(slots[0]!);
    const last = seatingRange(slots[slots.length - 1]!);
    const taken = await this.prisma.reservation.findMany({
      where: {
        branchId: branch.id,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        reservedFor: { gte: first.from, lte: last.to },
      },
      select: { tableId: true, reservedFor: true },
    });

    const now = Date.now();
    return {
      branchId: branch.id,
      date: query.date,
      guests: query.guests,
      slots: slots.map((slot) => ({
        time: localTimeLabel(slot),
        at: slot.toISOString(),
        // A slot in the past is not bookable however free the table is.
        available:
          slot.getTime() > now &&
          fitting.some((table) => this.isTableFree(table.id, slot, taken)),
      })),
      depositAmd: depositFor(query.guests),
      maxSeats,
      reservationsEnabled,
    };
  }

  /**
   * Books a table and holds the deposit.
   *
   * The table is picked by the server, not the client: assignment is what
   * makes a booking exclusive, and letting a client name a table would mean
   * trusting it to have read availability correctly.
   */
  async create(userId: string, dto: CreateReservationDto): Promise<ReservationDetail> {
    const reservedFor = new Date(dto.reservedFor);
    if (Number.isNaN(reservedFor.getTime())) {
      throw new UnprocessableEntityException('reservedFor is not a valid date');
    }

    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      include: { restaurant: true, tables: { where: { isActive: true } } },
    });
    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }

    this.assertBookable(branch, reservedFor, dto.guests);

    const depositAmd = depositFor(dto.guests);

    // Hold the money first. A booking that exists without its deposit is a
    // table given away for nothing; a hold with no booking is released below.
    const hold = await this.deposits.authorize({
      amountAmd: depositAmd,
      method: dto.depositMethod,
      reference: `Table at ${branch.restaurant.name}`,
      token: dto.depositToken,
    });

    let reservation: ReservationRow;
    try {
      reservation = await this.claimTable({
        userId,
        branch,
        reservedFor,
        guests: dto.guests,
        depositAmd,
      });
    } catch (err) {
      // Nobody sat at a table, so nobody keeps the money.
      await this.deposits.release(hold.providerRef).catch((releaseErr: unknown) => {
        this.logger.error(
          `Held ${depositAmd} AMD (${hold.providerRef}) for a booking that failed, and could not release it`,
          releaseErr as Error,
        );
      });
      throw err;
    }

    const withPayment = await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        payment: {
          create: {
            method: dto.depositMethod,
            amountAmd: depositAmd,
            status: PaymentStatus.Authorized,
            providerRef: hold.providerRef,
          },
        },
      },
      include: RESERVATION_INCLUDE,
    });

    return this.toDetail(withPayment);
  }

  async list(
    userId: string,
    query: ListReservationsDto,
  ): Promise<{ items: ReservationDetail[]; total: number; page: number }> {
    const where: Prisma.ReservationWhereInput = { userId };
    if (query.status === ReservationListFilter.Upcoming) {
      where.status = { in: [...ACTIVE_RESERVATION_STATUSES] };
    } else if (query.status === ReservationListFilter.Past) {
      where.status = { in: [...TERMINAL_RESERVATION_STATUSES] };
    }

    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: RESERVATION_INCLUDE,
        orderBy: [{ reservedFor: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return { items: rows.map((row) => this.toDetail(row)), total, page: query.page };
  }

  async findOne(userId: string, id: string): Promise<ReservationDetail> {
    return this.toDetail(await this.loadOwn(userId, id));
  }

  /**
   * Guest cancellation.
   *
   * Whether the deposit comes back is decided by `depositOutcomeFor` in
   * `shared`, not by an `if` here — the owner panel's no-show path asks the
   * same function, so the two cannot disagree about who keeps the money.
   */
  async cancel(userId: string, id: string): Promise<ReservationDetail> {
    const reservation = await this.loadOwn(userId, id);

    if (!isReservationCancellable(reservation.status as ReservationStatus)) {
      throw new UnprocessableEntityException(
        `A reservation that is already ${reservation.status} cannot be cancelled`,
      );
    }

    const inFreeWindow = freeCancellationUntil(reservation.reservedFor).getTime() > Date.now();
    const outcome = depositOutcomeFor(ReservationStatus.Cancelled, inFreeWindow);

    return this.settle(reservation, ReservationStatus.Cancelled, outcome);
  }

  /**
   * Applies a terminal status and the matching deposit outcome together.
   *
   * Shared with the owner panel so that "no-show keeps the deposit" is
   * implemented once. The money moves before the status, for the same reason
   * as order cancellation: a guest who is told they were refunded and was not
   * is worse than a status that lags.
   */
  async settle(
    reservation: ReservationRow,
    next: ReservationStatus,
    /** `null` leaves the hold untouched — confirming or seating a guest is not
     *  a moment to take or return money. */
    outcome: DepositOutcome | null,
  ): Promise<ReservationDetail> {
    const paymentStatus =
      outcome && reservation.payment
        ? await this.deposits.settle(reservation.payment, outcome)
        : null;

    const frees = TERMINAL_RESERVATION_STATUSES.includes(next);

    const updated = await this.prisma
      .$transaction(async (tx) => {
        if (reservation.payment && paymentStatus) {
          await tx.payment.update({
            where: { id: reservation.payment.id },
            data: { status: paymentStatus },
          });
        }
        return tx.reservation.update({
          // Matched on the status this decision was made against, so a change
          // that landed in between loses instead of being overwritten.
          where: { id: reservation.id, status: reservation.status },
          data: {
            status: next,
            // Releasing the slot is what lets the table be rebooked.
            ...(frees ? { activeSlot: null } : {}),
            ...(outcome === DepositOutcome.Credit ? { depositCredited: true } : {}),
          },
          include: RESERVATION_INCLUDE,
        });
      })
      .catch((err: unknown) => {
        if (paymentStatus === PaymentStatus.Refunded) {
          this.logger.error(
            `Refunded the deposit for reservation ${reservation.id} but failed to update it — needs manual reconciliation`,
            err as Error,
          );
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('The reservation changed before it could be updated');
        }
        throw err;
      });

    return this.toDetail(updated);
  }

  /** Loads a reservation for the owner/admin path, which has its own scoping. */
  async loadForStaff(where: Prisma.ReservationWhereInput): Promise<ReservationRow> {
    const reservation = await this.prisma.reservation.findFirst({
      where,
      include: RESERVATION_INCLUDE,
    });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    return reservation;
  }

  toDetail(row: ReservationRow): ReservationDetail {
    const freeUntil = freeCancellationUntil(row.reservedFor);

    return {
      id: row.id,
      status: row.status as ReservationStatus,
      branch: { id: row.branch.id, name: row.branch.name, address: row.branch.address },
      restaurantName: row.branch.restaurant.name,
      reservedFor: row.reservedFor.toISOString(),
      localTime: localTimeLabel(row.reservedFor),
      localDate: localDateOf(row.reservedFor),
      guests: row.guests,
      tableNo: row.table?.tableNo ?? null,
      depositAmd: row.depositAmd,
      depositStatus: (row.payment?.status as PaymentStatus | undefined) ?? null,
      depositCredited: row.depositCredited,
      freeCancellationUntil: isReservationCancellable(row.status as ReservationStatus)
        ? freeUntil.toISOString()
        : null,
      orderId: row.order?.id ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private assertBookable(
    branch: Prisma.RestaurantBranchGetPayload<{ include: { restaurant: true; tables: true } }>,
    reservedFor: Date,
    guests: number,
  ): void {
    if (
      !branch.restaurant.reservationsEnabled ||
      !branch.restaurant.services.includes(RestaurantService.Reserve)
    ) {
      throw new UnprocessableEntityException('This restaurant does not take table bookings');
    }
    if (reservedFor.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('That time has already passed');
    }
    if (reservedFor.getTime() > Date.now() + RESERVATION_MAX_LEAD_DAYS * 86_400_000) {
      throw new UnprocessableEntityException(
        `Tables can be booked at most ${RESERVATION_MAX_LEAD_DAYS} days ahead`,
      );
    }

    const window = openWindowFor(branch.openHours, reservedFor);
    if (!window || !isSlotBoundary(reservedFor, window)) {
      // Rejecting an off-grid time keeps availability and booking answering
      // the same question — a client cannot book 19:07 and skip the check.
      throw new UnprocessableEntityException({
        message: 'That is not a bookable time',
        localTime: localTimeLabel(reservedFor),
      });
    }

    if (!branch.tables.some((table) => table.isActive && table.seats >= guests)) {
      throw new UnprocessableEntityException({
        message: 'No table here seats a party that size',
        maxSeats: branch.tables.reduce((max, table) => Math.max(max, table.seats), 0),
      });
    }
  }

  /**
   * Picks a free table and inserts the booking, or fails.
   *
   * Serializable isolation is the point: the check "is this table free" and
   * the insert that makes it not free have to be one indivisible step, or two
   * guests booking the last table simultaneously both succeed. Postgres aborts
   * one of them instead, which is why this retries.
   */
  private async claimTable(input: {
    userId: string;
    branch: Prisma.RestaurantBranchGetPayload<{ include: { restaurant: true; tables: true } }>;
    reservedFor: Date;
    guests: number;
    depositAmd: number;
  }): Promise<ReservationRow> {
    const range = seatingRange(input.reservedFor);

    // Smallest table that fits, so a party of two does not consume the only
    // six-seater and block a party of six.
    const candidates = input.branch.tables
      .filter((table) => table.isActive && table.seats >= input.guests)
      .sort((a, b) => a.seats - b.seats || a.id.localeCompare(b.id));

    for (let attempt = 0; attempt < BOOKING_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const taken = await tx.reservation.findMany({
              where: {
                branchId: input.branch.id,
                status: { in: [...ACTIVE_RESERVATION_STATUSES] },
                reservedFor: { gte: range.from, lte: range.to },
              },
              select: { tableId: true, reservedFor: true },
            });

            const free = candidates.find((table) =>
              this.isTableFree(table.id, input.reservedFor, taken),
            );
            if (!free) {
              throw new ConflictException('No table is free at that time');
            }

            return tx.reservation.create({
              data: {
                userId: input.userId,
                branchId: input.branch.id,
                tableId: free.id,
                reservedFor: input.reservedFor,
                activeSlot: input.reservedFor,
                guests: input.guests,
                depositAmd: input.depositAmd,
                status: ReservationStatus.Pending,
              },
              include: RESERVATION_INCLUDE,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err) {
        if (isRetryableBookingError(err) && attempt < BOOKING_ATTEMPTS - 1) {
          continue;
        }
        // The unique index fired: someone took this exact table and slot.
        // Same answer as finding no free table, just discovered later.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('No table is free at that time');
        }
        throw err;
      }
    }

    throw new ConflictException('That time is busy right now — please try again');
  }

  private isTableFree(
    tableId: string,
    slot: Date,
    taken: { tableId: string | null; reservedFor: Date }[],
  ): boolean {
    return !taken.some(
      (booking) => booking.tableId === tableId && seatingsOverlap(booking.reservedFor, slot),
    );
  }

  private async loadOwn(userId: string, id: string): Promise<ReservationRow> {
    const reservation = await this.prisma.reservation.findFirst({
      // Ownership is part of the query, so no path loads someone else's
      // booking and then decides — and the answer is 404, not 403.
      where: { id, userId },
      include: RESERVATION_INCLUDE,
    });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    return reservation;
  }
}

export const RESERVATION_INCLUDE = {
  branch: { include: { restaurant: true } },
  table: true,
  payment: true,
  order: { select: { id: true } },
} satisfies Prisma.ReservationInclude;

/** The moment after which cancelling stops returning the deposit. */
export function freeCancellationUntil(reservedFor: Date): Date {
  return new Date(reservedFor.getTime() - RESERVATION_FREE_CANCEL_HOURS * 3_600_000);
}

/** Serialization failures and deadlocks are contention, not bugs — retry them. */
function isRetryableBookingError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2034' || err.code === 'P2002')
  );
}

export const SEATING_MINUTES = RESERVATION_SEATING_MINUTES;
