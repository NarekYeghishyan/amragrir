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
  RestaurantService,
  ReservationStatus,
  TERMINAL_RESERVATION_STATUSES,
  type ResolvedBookingPolicy,
  depositOutcomeFor,
  isReservationCancellable,
  resolveBookingPolicy,
  resolveBranchOffering,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DepositsService } from '../payments/deposits.service';
import {
  addLocalDays,
  bookingWindowFor,
  dateOnly,
  depositFor,
  instantOf,
  isSlotBoundary,
  localDateOf,
  localTimeLabel,
  seatingRange,
  seatingsOverlap,
  serviceDateOf,
  slotsFor,
  type DatedClosure,
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

/**
 * Midday, used only to name a calendar date to the weekday lookup.
 *
 * Any hour inside the day would do; noon is the one furthest from either edge,
 * so no amount of arithmetic around it can slip into a neighbouring date.
 */
const NOON_MINUTES = 12 * 60;

/**
 * Everything a booking decision needs about a branch, in one include.
 *
 * Both policy levels travel with it, because resolving them is not optional:
 * a branch loaded without its restaurant's policy would resolve to the
 * platform's defaults and quietly ignore what the chain decided.
 */
const BRANCH_FOR_BOOKING = {
  restaurant: { include: { bookingPolicy: true } },
  bookingPolicy: true,
  tables: { where: { isActive: true } },
} satisfies Prisma.RestaurantBranchInclude;

type BranchForBooking = Prisma.RestaurantBranchGetPayload<{ include: typeof BRANCH_FOR_BOOKING }>;

/** The rules in force at one branch — the chain resolved in one place. */
function policyOf(branch: {
  bookingPolicy: Prisma.BookingPolicyGetPayload<object> | null;
  restaurant: { bookingPolicy: Prisma.BookingPolicyGetPayload<object> | null };
}): ResolvedBookingPolicy {
  return resolveBookingPolicy(branch.bookingPolicy, branch.restaurant.bookingPolicy);
}

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
  /**
   * Largest party this branch accepts, from its policy.
   *
   * Separate from `maxSeats`, which is what the furniture allows. A branch may
   * cap parties below what it could physically seat, and the two answers want
   * different words in front of a guest: "no table here seats nine" is about
   * the room, "we take parties up to eight" is about the house.
   */
  maxGuests: number;
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
    // Slug, restaurant id or branch id — whichever the previous screen was
    // holding, exactly as `/restaurants/{id}` and its menu accept. Passing the
    // slug those two take used to reach Prisma as a UUID and fail there, so a
    // perfectly ordinary URL answered 500 instead of a booking calendar.
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: identityWhere(idOrBranchId),
      // A restaurant id or slug matches several branches, and `findFirst`
      // without an order returns whichever row the database yields — the same
      // URL could otherwise offer a different branch's tables each request.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: BRANCH_FOR_BOOKING,
    });
    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }

    const policy = policyOf(branch);
    const fitting = branch.tables.filter((table) => table.seats >= query.guests);
    const maxSeats = branch.tables.reduce((max, table) => Math.max(max, table.seats), 0);

    const window = bookingWindowFor(
      branch,
      instantOf(query.date, NOON_MINUTES),
      await this.closureFor(branch.id, query.date),
    );
    // Both halves resolved for this branch: a chain can take bookings at the
    // restaurant with a dining room and not at the counter in the mall, and
    // the two settings have to agree per address or a guest is offered times
    // that `assertBookable` then refuses.
    const offering = resolveBranchOffering(branch, branch.restaurant);
    const reservationsEnabled =
      offering.reservationsEnabled && offering.services.includes(RestaurantService.Reserve);

    const empty = (): AvailabilityResult => ({
      branchId: branch.id,
      date: query.date,
      guests: query.guests,
      slots: [],
      depositAmd: depositFor(query.guests, policy),
      maxSeats,
      maxGuests: policy.maxGuests,
      reservationsEnabled,
    });

    // A closed day, a restaurant that does not take bookings, a party over the
    // branch's cap, or no table big enough — all mean "no times", and each is a
    // real answer rather than an empty list that looks like a bug.
    if (
      !window ||
      !reservationsEnabled ||
      query.guests > policy.maxGuests ||
      fitting.length === 0
    ) {
      return empty();
    }

    const slots = slotsFor(query.date, window, policy);
    if (slots.length === 0) {
      return empty();
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
      select: { tableId: true, reservedFor: true, seatingMinutes: true },
    });

    // The earliest a booking may still be made — the branch's notice period,
    // which is at least "not in the past" and usually rather more.
    const earliest = Date.now() + policy.minLeadMinutes * 60_000;
    return {
      branchId: branch.id,
      date: query.date,
      guests: query.guests,
      slots: slots.map((slot) => ({
        time: localTimeLabel(slot),
        at: slot.toISOString(),
        // A slot too soon to give the kitchen notice is not bookable however
        // free the table is.
        available:
          slot.getTime() > earliest &&
          fitting.some((table) => this.isTableFree(table.id, slot, taken, policy)),
      })),
      depositAmd: depositFor(query.guests, policy),
      maxSeats,
      maxGuests: policy.maxGuests,
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
      include: BRANCH_FOR_BOOKING,
    });
    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }

    const policy = policyOf(branch);
    const serviceDate = await this.assertBookable(branch, policy, reservedFor, dto.guests);

    const depositAmd = depositFor(dto.guests, policy);

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
        policy,
        reservedFor,
        serviceDate,
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

    const inFreeWindow =
      freeCancellationUntil(reservation, policyForReservation(reservation)).getTime() > Date.now();
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
    /**
     * Run inside the same transaction as the status change, after it.
     *
     * Here so the staff path can write its `audit_log` entry atomically with the
     * move it describes, without this service having to know what an audit entry
     * is — a guest cancelling their own booking has no staff actor to record and
     * simply passes nothing.
     */
    alsoInTransaction?: (tx: Prisma.TransactionClient) => Promise<void>,
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
        const moved = await tx.reservation.update({
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

        // After the update, so a `where` that matched nothing has already thrown
        // and no entry is written for a move that did not happen.
        await alsoInTransaction?.(tx);

        return moved;
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
    const freeUntil = freeCancellationUntil(row, policyForReservation(row));

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

  private async assertBookable(
    branch: BranchForBooking,
    policy: ResolvedBookingPolicy,
    reservedFor: Date,
    guests: number,
  ): Promise<string> {
    // The same resolution the slot list above uses, so what is offered and what
    // is accepted cannot disagree for a branch that answers for itself.
    const offering = resolveBranchOffering(branch, branch.restaurant);
    if (!offering.reservationsEnabled || !offering.services.includes(RestaurantService.Reserve)) {
      throw new UnprocessableEntityException('This restaurant does not take table bookings');
    }
    if (reservedFor.getTime() <= Date.now() + policy.minLeadMinutes * 60_000) {
      // One refusal for "already gone" and "too soon to be any use", because to
      // the guest they are the same disappointment and the branch decides where
      // the line is. A branch that takes walk-up bookings sets the notice to
      // zero, and this reads as "that time has passed" again.
      throw new UnprocessableEntityException({
        message:
          policy.minLeadMinutes > 0
            ? `Tables must be booked at least ${policy.minLeadMinutes} minutes ahead`
            : 'That time has already passed',
        minLeadMinutes: policy.minLeadMinutes,
      });
    }
    if (reservedFor.getTime() > Date.now() + policy.maxLeadDays * 86_400_000) {
      throw new UnprocessableEntityException(
        `Tables can be booked at most ${policy.maxLeadDays} days ahead`,
      );
    }
    if (guests > policy.maxGuests) {
      throw new UnprocessableEntityException({
        message: 'That is a larger party than this restaurant takes',
        maxGuests: policy.maxGuests,
      });
    }

    // Which day's booking sheet this instant belongs to. Only ever different
    // from its own calendar date at a branch whose night runs past midnight —
    // where 01:00 is the tail of yesterday's service and must be gated against
    // yesterday's hours, not against a Tuesday the kitchen may be shut for.
    const serviceDate = serviceDateOf(
      branch,
      reservedFor,
      await this.closureFor(branch.id, addLocalDays(localDateOf(reservedFor), -1)),
    );
    const window = bookingWindowFor(
      branch,
      instantOf(serviceDate, NOON_MINUTES),
      await this.closureFor(branch.id, serviceDate),
    );
    if (!window || !isSlotBoundary(reservedFor, window, policy, serviceDate)) {
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

    // Handed back rather than recomputed by the caller: this is the day the
    // booking was gated against, and it is the day it must be filed under.
    // Working it out twice is how the two could ever disagree.
    return serviceDate;
  }

  /**
   * The dated exception for one branch and one local date, if there is one.
   *
   * Returned in the shape `open-hours.ts` reads rather than Prisma's, so that
   * module stays free of database types and testable without one.
   */
  private async closureFor(branchId: string, date: string): Promise<DatedClosure | null> {
    const row = await this.prisma.branchClosure.findUnique({
      where: { branchId_date: { branchId, date: new Date(`${date}T00:00:00.000Z`) } },
      select: { kind: true, opensMinutes: true, closesMinutes: true },
    });
    return row === null
      ? null
      : {
          kind: row.kind as DatedClosure['kind'],
          opensMinutes: row.opensMinutes,
          closesMinutes: row.closesMinutes,
        };
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
    branch: BranchForBooking;
    policy: ResolvedBookingPolicy;
    reservedFor: Date;
    /** The service day `assertBookable` gated this instant against, `YYYY-MM-DD`. */
    serviceDate: string;
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
              select: { tableId: true, reservedFor: true, seatingMinutes: true },
            });

            const free = candidates.find((table) =>
              this.isTableFree(table.id, input.reservedFor, taken, input.policy),
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
                // Which evening this is, decided by the hours it was accepted
                // under. A 00:30 table belongs to the night that is still going
                // on, not to the morning it technically starts in.
                serviceDate: dateOnly(input.serviceDate),
                guests: input.guests,
                // Snapshotted, so a branch that later lengthens its seating has
                // not retrospectively changed what this guest was promised.
                seatingMinutes: input.policy.seatingMinutes,
                depositAmd: input.depositAmd,
                // The other half of the same promise: this much money, and
                // returnable until this long before. Both frozen together, so a
                // branch that later moves its cancellation window moves it for
                // whoever books next and for nobody who has already paid.
                freeCancelHours: input.policy.freeCancelHours,
                // A booking whose deposit is held and whose table is chosen has
                // nothing left to decide, so it confirms itself unless the
                // branch has asked to read every one first.
                status: input.policy.autoConfirm
                  ? ReservationStatus.Confirmed
                  : ReservationStatus.Pending,
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
    taken: { tableId: string | null; reservedFor: Date; seatingMinutes: number | null }[],
    policy: ResolvedBookingPolicy,
  ): boolean {
    return !taken.some(
      (booking) =>
        booking.tableId === tableId &&
        seatingsOverlap(
          booking.reservedFor,
          slot,
          // Each existing booking holds its table for the seating it was made
          // under; only the one being considered uses today's policy. Null is a
          // row from before the column existed, and the resolved policy is
          // exactly what it was measured by at the time.
          booking.seatingMinutes ?? policy.seatingMinutes,
          policy.seatingMinutes,
        ),
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
  // Both policy levels come along, because every read that shows a booking also
  // has to say when its deposit stops being refundable — and that number is now
  // the branch's rather than the platform's.
  branch: {
    include: { restaurant: { include: { bookingPolicy: true } }, bookingPolicy: true },
  },
  table: true,
  payment: true,
  order: { select: { id: true } },
} satisfies Prisma.ReservationInclude;

/**
 * The moment after which cancelling stops returning the deposit.
 *
 * Read off **the booking**, not off the branch's current policy. The window is
 * part of what the guest agreed to when they paid, alongside the amount — and
 * `deposit_amd` was already frozen while this was still being looked up live,
 * so a branch moving its cancellation window from two hours to twenty-four
 * moved it for people who had already handed over money.
 *
 * The policy is still passed, for rows written before the column existed:
 * nothing recorded their terms, and the resolved policy is what decided them.
 */
export function freeCancellationUntil(
  reservation: { reservedFor: Date; freeCancelHours: number | null },
  policy: ResolvedBookingPolicy,
): Date {
  const hours = reservation.freeCancelHours ?? policy.freeCancelHours;
  return new Date(reservation.reservedFor.getTime() - hours * 3_600_000);
}

/** The rules a stored booking's branch runs under — what the read paths need in
 *  order to say anything about its deposit. */
export function policyForReservation(row: ReservationRow): ResolvedBookingPolicy {
  return resolveBookingPolicy(row.branch.bookingPolicy, row.branch.restaurant.bookingPolicy);
}

/** Serialization failures and deadlocks are contention, not bugs — retry them. */
function isRetryableBookingError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2034' || err.code === 'P2002')
  );
}

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepts a branch id, a restaurant id, or a restaurant slug — clients hold
 * whichever of the three the previous screen gave them.
 *
 * The same rule as `RestaurantsService.identityWhere`. Kept as a small local
 * copy rather than shared: the catalog's version is private to a service this
 * module does not depend on, and a booking calendar answering a different
 * branch's tables than the menu did would be worse than five duplicated lines.
 */
function identityWhere(idOrSlug: string): Prisma.RestaurantBranchWhereInput {
  return UUID.test(idOrSlug)
    ? { OR: [{ id: idOrSlug }, { restaurantId: idOrSlug }] }
    : { restaurant: { slug: idOrSlug } };
}
