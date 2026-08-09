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
  BOOKING_POLICY_FIELDS,
  BOOKING_POLICY_LIMITS,
  Permission,
  RestaurantService,
  UNSET_BOOKING_POLICY,
  bookingPolicySources,
  resolveBookingPolicy,
  resolveBranchOffering,
  type BookingPolicyFields,
  type PolicySource,
  type ResolvedBookingPolicy,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { changedFields } from '../audit/audit';
import { branchScope, restaurantScope } from '../staff/scope';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import {
  bookingWindowFor,
  depositFor,
  instantOf,
  localDateOf,
  localTimeLabel,
  slotsFor,
  type DatedClosure,
} from '../reservations/slots';
import {
  bookingConflicts,
  type BookingSetup,
  type BookingUnderReview,
} from './booking-conflicts';
import {
  ClosureKindValue,
  invalidHours,
  type CreateClosureDto,
  type BookingPreviewDto,
  type TableDto,
  type UpdateBookingPolicyDto,
  type UpdateTableDto,
  type WeeklyHours,
} from './booking-settings.dto';

/**
 * Everything the back office may change about how a branch takes bookings.
 *
 * Its tables, the hours it holds them, the days it does not, and the numbers
 * behind the offer. Stage one put those settings in the database and taught the
 * booking path to read them; this is what finally lets somebody write them.
 *
 * **Two rules run through all of it.**
 *
 * The first is that a narrowing change is checked against the bookings that
 * already exist (`booking-conflicts.ts`), answered with `409` and the list, and
 * only then forced. Nothing here cancels a booking: behind each is a guest and
 * a deposit already taken, and a panel that quietly undoes those is not one
 * worth writing.
 *
 * The second is that reading a level's settings answers with **three** things —
 * what this level decided, what it would inherit if it decided nothing, and
 * what is therefore in force. A form given only the resolved number cannot show
 * the difference between a deliberate 90 and an inherited one, so a manager
 * sets it again to be sure, and the branch acquires an override nobody wanted
 * and stops following the chain forever.
 */

const NOON = 12 * 60;

export interface StaffTable {
  id: string;
  tableNo: string;
  seats: number;
  zone: string | null;
  isActive: boolean;
  /** Live bookings still to come on this table. What makes "switch it off" a
   *  decision rather than a click. */
  upcomingBookings: number;
}

export interface StaffClosure {
  id: string;
  date: string;
  kind: ClosureKindValue;
  open: string | null;
  close: string | null;
  reason: string | null;
}

export interface BookingPolicyView {
  /** What this level stores. Nulls are inheritance, not zeroes. */
  own: BookingPolicyFields;
  /** What it would resolve to if `own` were empty — the greyed-out number. */
  inherited: ResolvedBookingPolicy;
  effective: ResolvedBookingPolicy;
  sources: Record<keyof BookingPolicyFields, PolicySource>;
  /** The bounds a field may be set to, so the form and the API cannot disagree. */
  limits: typeof BOOKING_POLICY_LIMITS;
}

export interface BookingPreview {
  date: string;
  guests: number;
  reservationsEnabled: boolean;
  /** Null when the branch is shut that day — by its week or by a dated closure. */
  opens: string | null;
  closes: string | null;
  closureReason: string | null;
  slotCount: number;
  firstSlot: string | null;
  lastSlot: string | null;
  depositAmd: number;
  maxSeats: number;
  maxGuests: number;
}

type BranchRow = Prisma.RestaurantBranchGetPayload<{
  include: {
    restaurant: { include: { bookingPolicy: true } };
    bookingPolicy: true;
    tables: true;
  };
}>;

const BRANCH_INCLUDE = {
  restaurant: { include: { bookingPolicy: true } },
  bookingPolicy: true,
  tables: true,
} satisfies Prisma.RestaurantBranchInclude;

@Injectable()
export class BookingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── tables ────────────────────────────────────────────────────────────────

  async listTables(staff: StaffJwtPayload, branchId: string): Promise<{ items: StaffTable[] }> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchRead);
    const upcoming = await this.upcomingByTable(branch.id);

    return {
      // Inactive tables are listed too, and deliberately: they are the room's
      // history, and a panel that hides them makes "why can nobody book table
      // 7" an unanswerable question.
      items: sortTables(branch.tables).map((table) => ({
        id: table.id,
        tableNo: table.tableNo,
        seats: table.seats,
        zone: table.zone,
        isActive: table.isActive,
        upcomingBookings: upcoming.get(table.id) ?? 0,
      })),
    };
  }

  async createTable(
    staff: StaffJwtPayload,
    branchId: string,
    dto: TableDto,
  ): Promise<StaffTable> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchWrite);
    const tableNo = dto.tableNo.trim();

    const table = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.table.create({
          data: { branchId: branch.id, tableNo, seats: dto.seats, zone: dto.zone ?? null },
        });
        await this.audit.record(tx, staff, {
          action: AuditAction.TableCreate,
          entityId: created.id,
          scope: { restaurantId: branch.restaurantId, branchId: branch.id },
          after: { tableNo, seats: dto.seats, zone: dto.zone ?? null },
        });
        return created;
      })
      .catch((err: unknown) => {
        throw duplicateTable(err, tableNo);
      });

    return { ...table, upcomingBookings: 0 };
  }

  async updateTable(
    staff: StaffJwtPayload,
    id: string,
    dto: UpdateTableDto,
    forced = false,
  ): Promise<StaffTable> {
    const current = await this.loadTable(staff, id, Permission.BranchWrite);
    const tableNo = dto.tableNo?.trim();

    // Shrinking a table or switching it off can strand a booking; renaming or
    // re-zoning cannot. Only ask the expensive question when the answer could
    // be yes.
    const narrows =
      (dto.seats !== undefined && dto.seats < current.seats) || dto.isActive === false;
    if (narrows) {
      const proposed = current.branch.tables.map((table) =>
        table.id === id
          ? {
              ...table,
              seats: dto.seats ?? table.seats,
              isActive: dto.isActive ?? table.isActive,
            }
          : table,
      );
      await this.assertNoConflicts(current.branch, { tables: proposed }, forced);
    }

    const changed = changedFields(
      {
        tableNo: current.tableNo,
        seats: current.seats,
        zone: current.zone,
        isActive: current.isActive,
      },
      {
        ...(tableNo !== undefined ? { tableNo } : {}),
        ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    );

    const table = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.table.update({
          where: { id },
          data: {
            ...(tableNo !== undefined ? { tableNo } : {}),
            ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
            ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });

        if (changed) {
          await this.audit.record(tx, staff, {
            // Switching a table off is `table.delete`, because that is what it
            // is to everybody except the database — the row survives so the
            // bookings that name it still resolve, but the table is out of use.
            action:
              dto.isActive === false && current.isActive
                ? AuditAction.TableDelete
                : AuditAction.TableUpdate,
            entityId: id,
            scope: { restaurantId: current.branch.restaurantId, branchId: current.branchId },
            // The number rides along on every entry, changed or not: without it
            // the feed can only say "changed a table" and the reader has to go
            // and look up which.
            before: { ...changed.before, tableNo: current.tableNo },
            after: changed.after,
          });
        }

        return updated;
      })
      .catch((err: unknown) => {
        throw duplicateTable(err, tableNo ?? current.tableNo);
      });

    const upcoming = await this.upcomingByTable(current.branchId);
    return { ...table, upcomingBookings: upcoming.get(id) ?? 0 };
  }

  /**
   * Takes a table out of use.
   *
   * A soft delete, always. A hard one would orphan every booking that names the
   * table — including the ones in the past, which is where "which table did they
   * sit at" is answered from.
   */
  async deleteTable(staff: StaffJwtPayload, id: string, forced = false): Promise<StaffTable> {
    return this.updateTable(staff, id, { isActive: false }, forced);
  }

  // ── hours and closed days ─────────────────────────────────────────────────

  async setBookingHours(
    staff: StaffJwtPayload,
    branchId: string,
    hours: WeeklyHours | null,
    forced = false,
  ): Promise<{ bookingHours: WeeklyHours | null }> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchHours);

    if (hours !== null) {
      const bad = invalidHours(hours);
      if (bad !== null) {
        throw new UnprocessableEntityException({
          message: `"${bad}" is not a day with usable hours on it`,
          day: bad,
        });
      }
    }

    await this.assertNoConflicts(branch, { bookingHours: hours }, forced);

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantBranch.update({
        where: { id: branch.id },
        data: { bookingHours: hours === null ? Prisma.DbNull : (hours as Prisma.InputJsonObject) },
      });
      await this.audit.record(tx, staff, {
        action: AuditAction.BranchBookingHours,
        entityId: branch.id,
        scope: { restaurantId: branch.restaurantId, branchId: branch.id },
        before: { bookingHours: (branch.bookingHours ?? null) as Prisma.InputJsonValue },
        after: { bookingHours: (hours ?? null) as Prisma.InputJsonValue },
      });
    });

    return { bookingHours: hours };
  }

  async listClosures(
    staff: StaffJwtPayload,
    branchId: string,
  ): Promise<{ items: StaffClosure[] }> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchRead);

    const rows = await this.prisma.branchClosure.findMany({
      // From today forward. A closure that has been and gone is history nobody
      // acts on, and a list that accumulates them forever is a list nobody reads.
      where: { branchId: branch.id, date: { gte: startOfLocalToday() } },
      orderBy: { date: 'asc' },
    });

    return { items: rows.map(toStaffClosure) };
  }

  async createClosure(
    staff: StaffJwtPayload,
    branchId: string,
    dto: CreateClosureDto,
    forced = false,
  ): Promise<StaffClosure> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchHours);

    const closure: DatedClosure =
      dto.kind === ClosureKindValue.Closed
        ? { kind: 'closed', opensMinutes: null, closesMinutes: null }
        : {
            kind: 'custom_hours',
            // The DTO requires both for this kind, so reaching here without
            // them is impossible; `?? ''` keeps that fact out of the type system
            // rather than asserting past it.
            opensMinutes: minutesOf(dto.open ?? ''),
            closesMinutes: minutesOf(dto.close ?? ''),
          };

    await this.assertNoConflicts(branch, { extraClosure: { date: dto.date, closure } }, forced);

    const row = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.branchClosure.create({
          data: {
            branchId: branch.id,
            date: dateOnly(dto.date),
            kind: closure.kind,
            opensMinutes: closure.opensMinutes,
            closesMinutes: closure.closesMinutes,
            reason: dto.reason ?? null,
            createdByStaffId: staff.sub,
          },
        });
        await this.audit.record(tx, staff, {
          action: AuditAction.BranchClosureCreate,
          entityId: created.id,
          scope: { restaurantId: branch.restaurantId, branchId: branch.id },
          after: {
            date: dto.date,
            kind: closure.kind,
            open: dto.open ?? null,
            close: dto.close ?? null,
            reason: dto.reason ?? null,
          },
        });
        return created;
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            message: 'That day already has an exception on it',
            date: dto.date,
          });
        }
        throw err;
      });

    return toStaffClosure(row);
  }

  /**
   * Hands a date back to the ordinary week.
   *
   * Never conflicts: widening the days a branch is open cannot strand a booking
   * that was made when it was narrower.
   */
  async deleteClosure(staff: StaffJwtPayload, id: string): Promise<{ id: string }> {
    const closure = await this.prisma.branchClosure.findFirst({
      where: { id, branch: branchScope(staff.scopes, Permission.BranchHours) },
      include: { branch: { select: { id: true, restaurantId: true } } },
    });
    if (!closure) {
      throw new NotFoundException('Closure not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.branchClosure.delete({ where: { id } });
      await this.audit.record(tx, staff, {
        action: AuditAction.BranchClosureDelete,
        entityId: id,
        scope: { restaurantId: closure.branch.restaurantId, branchId: closure.branch.id },
        before: {
          date: localDateOf(closure.date),
          kind: closure.kind,
          reason: closure.reason,
        },
      });
    });

    return { id };
  }

  // ── the numbers ───────────────────────────────────────────────────────────

  async branchPolicy(staff: StaffJwtPayload, branchId: string): Promise<BookingPolicyView> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchRead);
    return policyView(branch.bookingPolicy, branch.restaurant.bookingPolicy);
  }

  async setBranchPolicy(
    staff: StaffJwtPayload,
    branchId: string,
    dto: UpdateBookingPolicyDto,
  ): Promise<BookingPolicyView> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchWrite);

    // No conflict check, and that is a decision rather than an omission. None of
    // these numbers can strand a booking: the seating length, the deposit and
    // the cancellation window are all snapshotted onto the booking when it is
    // made, and the rest — the grid, the horizon, the party cap — describe what
    // the branch will offer *next*. The table is still there and the door is
    // still open at the promised hour, which is the whole of what a conflict is.
    const patch = policyPatch(dto);
    const changed = changedFields(currentFields(branch.bookingPolicy), patch);

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookingPolicy.upsert({
        where: { branchId: branch.id },
        create: { branchId: branch.id, ...patch },
        update: patch,
      });

      if (changed) {
        await this.audit.record(tx, staff, {
          action: AuditAction.BookingPolicy,
          entityId: row.id,
          scope: { restaurantId: branch.restaurantId, branchId: branch.id },
          before: changed.before,
          after: changed.after,
        });
      }

      return row;
    });

    return policyView(saved, branch.restaurant.bookingPolicy);
  }

  async restaurantPolicy(
    staff: StaffJwtPayload,
    restaurantId: string,
  ): Promise<BookingPolicyView> {
    const restaurant = await this.loadRestaurant(staff, restaurantId, Permission.BranchRead);
    // Nothing above a restaurant but the platform, so there is no branch layer
    // to pass — `null` says exactly that.
    return policyView(restaurant.bookingPolicy, null);
  }

  async setRestaurantPolicy(
    staff: StaffJwtPayload,
    restaurantId: string,
    dto: UpdateBookingPolicyDto,
  ): Promise<BookingPolicyView> {
    const restaurant = await this.loadRestaurant(
      staff,
      restaurantId,
      Permission.RestaurantWrite,
    );

    const patch = policyPatch(dto);
    const changed = changedFields(currentFields(restaurant.bookingPolicy), patch);

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookingPolicy.upsert({
        where: { restaurantId: restaurant.id },
        create: { restaurantId: restaurant.id, ...patch },
        update: patch,
      });

      if (changed) {
        await this.audit.record(tx, staff, {
          action: AuditAction.BookingPolicy,
          entityId: row.id,
          // No branch: this is the chain's answer, and the feed should not read
          // as though one address changed.
          scope: { restaurantId: restaurant.id },
          before: changed.before,
          after: changed.after,
        });
      }

      return row;
    });

    return policyView(saved, null);
  }

  // ── what the settings actually produce ────────────────────────────────────

  /**
   * The day a guest would be shown, from the settings as they stand.
   *
   * The point of the whole screen: a form full of numbers is not something a
   * person can check, and the mistakes here — an hours document that closes
   * before it opens, a seating longer than the evening — produce an empty
   * calendar rather than an error. This is where that gets noticed by the
   * person who caused it instead of by a guest.
   */
  async preview(
    staff: StaffJwtPayload,
    branchId: string,
    query: BookingPreviewDto,
  ): Promise<BookingPreview> {
    const branch = await this.loadBranch(staff, branchId, Permission.BranchRead);
    const policy = resolveBookingPolicy(branch.bookingPolicy, branch.restaurant.bookingPolicy);
    const offering = resolveBranchOffering(branch, branch.restaurant);

    const stored = await this.prisma.branchClosure.findUnique({
      where: { branchId_date: { branchId: branch.id, date: dateOnly(query.date) } },
    });
    const closure = stored === null ? null : toDatedClosure(stored);
    const window = bookingWindowFor(branch, instantOf(query.date, NOON), closure);

    const active = branch.tables.filter((table) => table.isActive);
    const maxSeats = active.reduce((max, table) => Math.max(max, table.seats), 0);
    const slots = window === null ? [] : slotsFor(query.date, window, policy);

    return {
      date: query.date,
      guests: query.guests,
      reservationsEnabled:
        offering.reservationsEnabled && offering.services.includes(RestaurantService.Reserve),
      opens: window === null ? null : minutesLabel(window.opensMinutes),
      closes: window === null ? null : minutesLabel(window.closesMinutes),
      closureReason: stored?.reason ?? null,
      slotCount: slots.length,
      firstSlot: slots.length === 0 ? null : localTimeLabel(slots[0]!),
      lastSlot: slots.length === 0 ? null : localTimeLabel(slots[slots.length - 1]!),
      depositAmd: depositFor(query.guests, policy),
      maxSeats,
      maxGuests: policy.maxGuests,
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Runs the proposed change past every booking still to come, and refuses with
   * the list unless the caller has already seen it.
   */
  private async assertNoConflicts(
    branch: BranchRow,
    proposal: {
      tables?: BranchRow['tables'];
      bookingHours?: WeeklyHours | null;
      extraClosure?: { date: string; closure: DatedClosure };
    },
    /** True once the caller has been shown the list and asked again. */
    forced: boolean,
  ): Promise<void> {
    if (forced) {
      return;
    }

    const bookings = await this.futureBookings(branch.id);
    if (bookings.length === 0) {
      return;
    }

    const closures = await this.closureMap(branch.id);
    if (proposal.extraClosure) {
      closures.set(proposal.extraClosure.date, proposal.extraClosure.closure);
    }

    const setup: BookingSetup = {
      openHours: branch.openHours,
      bookingHours:
        proposal.bookingHours === undefined ? branch.bookingHours : proposal.bookingHours,
      policy: resolveBookingPolicy(branch.bookingPolicy, branch.restaurant.bookingPolicy),
      tables: proposal.tables ?? branch.tables,
      closureFor: (date) => closures.get(date) ?? null,
    };

    const conflicts = bookingConflicts(setup, bookings);
    if (conflicts.length > 0) {
      throw new ConflictException({
        message: 'This change leaves bookings the branch could not honour',
        conflicts,
        // Said plainly, because the panel has to offer the second press and the
        // person has to understand that pressing it changes nothing about the
        // bookings themselves — somebody still has to ring these people.
        resolution: 'Repeat the request with ?force=true to save it anyway.',
      });
    }
  }

  private async futureBookings(branchId: string): Promise<BookingUnderReview[]> {
    const rows = await this.prisma.reservation.findMany({
      where: {
        branchId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        reservedFor: { gte: new Date() },
      },
      select: {
        id: true,
        reservedFor: true,
        guests: true,
        tableId: true,
        table: { select: { tableNo: true } },
        user: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      reservedFor: row.reservedFor,
      guests: row.guests,
      tableId: row.tableId,
      tableNo: row.table?.tableNo ?? null,
      customerName: row.user.name,
    }));
  }

  private async closureMap(branchId: string): Promise<Map<string, DatedClosure>> {
    const rows = await this.prisma.branchClosure.findMany({
      // A day before today, so the previous evening of a night that runs past
      // midnight is still in the map when a booking at 01:00 asks about it.
      where: { branchId, date: { gte: addDays(startOfLocalToday(), -1) } },
    });

    return new Map(rows.map((row) => [localDateOf(row.date), toDatedClosure(row)]));
  }

  private async upcomingByTable(branchId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.reservation.groupBy({
      by: ['tableId'],
      where: {
        branchId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        reservedFor: { gte: new Date() },
      },
      _count: { _all: true },
    });

    return new Map(
      grouped
        .filter((row): row is typeof row & { tableId: string } => row.tableId !== null)
        .map((row) => [row.tableId, row._count._all]),
    );
  }

  private async loadBranch(
    staff: StaffJwtPayload,
    branchId: string,
    permission: Permission,
  ): Promise<BranchRow> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      // Reach is part of the query, so no path loads a branch it may not touch
      // and then decides. Outside it the answer is 404, not 403 — a 403 would
      // confirm the branch exists.
      where: { id: branchId, ...branchScope(staff.scopes, permission) },
      include: BRANCH_INCLUDE,
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  private async loadTable(staff: StaffJwtPayload, id: string, permission: Permission) {
    const table = await this.prisma.table.findFirst({
      where: { id, branch: branchScope(staff.scopes, permission) },
      include: { branch: { include: BRANCH_INCLUDE } },
    });
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  private async loadRestaurant(
    staff: StaffJwtPayload,
    id: string,
    permission: Permission,
  ) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id, ...restaurantScope(staff.scopes, permission) },
      include: { bookingPolicy: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }
}

// ── plain helpers ───────────────────────────────────────────────────────────

/** The three answers a settings form needs, from the two stored rows. */
function policyView(
  own: Partial<BookingPolicyFields> | null,
  parent: Partial<BookingPolicyFields> | null,
): BookingPolicyView {
  return {
    own: { ...UNSET_BOOKING_POLICY, ...pickFields(own) },
    inherited: resolveBookingPolicy(null, parent),
    effective: resolveBookingPolicy(own, parent),
    sources: bookingPolicySources(own, parent),
    limits: BOOKING_POLICY_LIMITS,
  };
}

/** Only the policy's own fields, dropping the ids and timestamps a row carries. */
function pickFields(row: Partial<BookingPolicyFields> | null): Partial<BookingPolicyFields> {
  if (row === null) {
    return {};
  }
  return Object.fromEntries(
    BOOKING_POLICY_FIELDS.filter((field) => row[field] !== undefined).map((field) => [
      field,
      row[field],
    ]),
  ) as Partial<BookingPolicyFields>;
}

/**
 * A level's stored answers as something `changedFields` can diff.
 *
 * Widened to a plain record on the way out: `BookingPolicyFields` is a closed
 * shape with no index signature, and the differ works over arbitrary keys
 * because it serves every table in the panel.
 */
function currentFields(row: Partial<BookingPolicyFields> | null): Record<string, unknown> {
  return { ...UNSET_BOOKING_POLICY, ...pickFields(row) };
}

/**
 * The DTO as something Prisma can write.
 *
 * Omitted fields stay omitted so the update leaves them alone; an explicit
 * `null` is carried through, because that is a level handing the question back
 * up the chain and is the only way an override is ever undone.
 */
function policyPatch(dto: UpdateBookingPolicyDto): Partial<BookingPolicyFields> {
  return Object.fromEntries(
    BOOKING_POLICY_FIELDS.filter((field) => dto[field] !== undefined).map((field) => [
      field,
      dto[field],
    ]),
  ) as Partial<BookingPolicyFields>;
}

function toStaffClosure(row: {
  id: string;
  date: Date;
  kind: string;
  opensMinutes: number | null;
  closesMinutes: number | null;
  reason: string | null;
}): StaffClosure {
  return {
    id: row.id,
    date: localDateOf(row.date),
    kind: row.kind as ClosureKindValue,
    open: row.opensMinutes === null ? null : minutesLabel(row.opensMinutes),
    close: row.closesMinutes === null ? null : minutesLabel(row.closesMinutes),
    reason: row.reason,
  };
}

function toDatedClosure(row: {
  kind: string;
  opensMinutes: number | null;
  closesMinutes: number | null;
}): DatedClosure {
  return {
    kind: row.kind as DatedClosure['kind'],
    opensMinutes: row.opensMinutes,
    closesMinutes: row.closesMinutes,
  };
}

/** `HH:MM` for minutes from local midnight, counting past 24:00 for a night
 *  that ends after it — `26:00` reads as the 02:00 everybody means. */
function minutesLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** A `YYYY-MM-DD` as the DATE column stores it — midnight UTC, no zone. */
function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Today in Yerevan, as a DATE value. */
function startOfLocalToday(): Date {
  return dateOnly(localDateOf(new Date()));
}

/** Tables read in the order a room is walked, not the order Postgres returns:
 *  "10" after "2", and "A1" alongside them. */
function sortTables<T extends { tableNo: string }>(tables: readonly T[]): T[] {
  return [...tables].sort((a, b) => {
    const left = Number(a.tableNo);
    const right = Number(b.tableNo);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      return left - right;
    }
    return a.tableNo.localeCompare(b.tableNo);
  });
}

/** The unique index firing means the room already has a table by that name. */
function duplicateTable(err: unknown, tableNo: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictException({
      message: `This branch already has a table numbered ${tableNo}`,
      tableNo,
    });
  }
  return err;
}
