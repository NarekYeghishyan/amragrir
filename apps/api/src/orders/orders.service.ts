import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_RESERVATION_STATUSES,
  Language,
  ORDER_MAX_LEAD_DAYS,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  Role,
  ServiceMode,
  TERMINAL_ORDER_STATUSES,
  isOrderCancellable,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { PaymentsService } from '../payments/payments.service';
import { orderScopeFor } from '../owner/branch-access';
import { CouponsService } from '../referrals/coupons.service';
import type { JwtPayload } from '../auth/token.service';
import { OrderEventsService, countdown, toStatusEvent } from './order-events.service';
import { generateOrderCode, pickupCodeFrom } from './order-code';
import { estimatePrepMinutes, priceLine, priceOrder, type PricedLine } from './pricing';
import { BasketDto, CreateOrderDto, ListOrdersDto, OrderListFilter } from './dto';

/**
 * Tolerance when checking a client-supplied `readyAt` against the earliest the
 * kitchen could manage. The client picks a time from the `earliestReadyAt` a
 * quote gave it seconds earlier; without slack, clock skew or the round trip
 * would reject a time the server itself had just offered.
 */
const READY_AT_SLACK_MS = 60_000;

/** Attempts to find a free order code before giving up. Collisions are rare
 *  (1 in 10^8 per attempt), so anything beyond this means something is wrong. */
const CODE_ATTEMPTS = 5;

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
}

export interface QuoteResult {
  branchId: string;
  restaurantName: string;
  serviceMode: ServiceMode;
  items: QuoteLine[];
  /** Requested items that cannot be ordered, with the reason. Reported rather
   *  than thrown so the basket screen can mark the offending line. */
  unavailable: { menuItemId: string; reason: 'not_on_menu' | 'sold_out' }[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  totalAmd: number;
  discountAmd: number;
  /** Null unless a coupon code was supplied; `applied: false` says the code
   *  was rejected, which the basket screen must show rather than silently
   *  charging full price. */
  coupon: { code: string; applied: boolean; discountAmd: number } | null;
  /** Left to pay after a table deposit is credited; equals `totalAmd` for pickup. */
  dueNowAmd: number;
  /** The booked table, for a dine-in basket. */
  tableNo: string | null;
  prepMin: number;
  earliestReadyAt: string;
  branchIsOpen: boolean;
  /** False when the basket cannot become an order as it stands. */
  canOrder: boolean;
}

export interface OrderItemDto {
  id: string;
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
}

export interface OrderDetail {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  restaurantName: string;
  branch: { id: string; name: string | null; address: string | null };
  items: OrderItemDto[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  /** What a coupon took off. The client shows "you saved …", so it has to be
   *  here and not merely folded into `totalAmd`. */
  discountAmd: number;
  totalAmd: number;
  readyAt: string | null;
  secondsLeft: number | null;
  tableNo: string | null;
  reservationId: string | null;
  notes: string | null;
  payment: { method: string; status: PaymentStatus } | null;
  createdAt: string;
}

export interface OrderListItem {
  id: string;
  code: string;
  restaurantName: string;
  coverUrl: string | null;
  date: string;
  itemsCount: number;
  totalAmd: number;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
}

type BranchWithRestaurant = Prisma.RestaurantBranchGetPayload<{ include: { restaurant: true } }>;

type ReservationForOrder = Prisma.ReservationGetPayload<{
  include: { table: true; order: { select: { id: true } } };
}>;

/** What `loadBasket` resolves a client basket into: real prices from the
 *  database, plus whatever the client asked for that cannot be sold. */
interface ResolvedBasket {
  branch: BranchWithRestaurant;
  lines: PricedLine[];
  unavailable: QuoteResult['unavailable'];
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly events: OrderEventsService,
    private readonly coupons: CouponsService,
  ) {}

  /**
   * Prices a basket without creating anything.
   *
   * The basket itself stays on the client — it is per-device, throwaway state
   * that the server gains nothing by storing. What the server must own is the
   * arithmetic, so this endpoint exists to make sure no client ever computes a
   * total (DEVELOPMENT_GUIDE.md "never trust the client").
   */
  // `userId` is required, not optional: an optional caller would let a dine-in
  // quote skip the reservation check entirely by omitting it.
  async quote(dto: BasketDto, language: Language, userId: string): Promise<QuoteResult> {
    const reservation = await this.resolveReservation(userId, dto);

    const { branch, lines, unavailable } = await this.loadBasket(dto, language);

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotalAmd, 0);
    // Priced, not claimed: a quote must not spend a coupon the guest is only
    // looking at.
    const applied = dto.couponCode
      ? await this.coupons.preview(userId, dto.couponCode, subtotal)
      : null;

    const totals = priceOrder(lines, reservation?.depositAmd ?? 0, applied?.discountAmd ?? 0);
    const prepMin = estimatePrepMinutes(lines, branch.avgPrepMin);

    return {
      branchId: branch.id,
      restaurantName: branch.restaurant.name,
      serviceMode: dto.serviceMode,
      items: lines.map(({ prepMin: _prepMin, ...line }) => line),
      unavailable,
      ...totals,
      coupon:
        dto.couponCode === undefined
          ? null
          : {
              code: dto.couponCode.toUpperCase(),
              applied: applied !== null,
              discountAmd: applied?.discountAmd ?? 0,
            },
      // What is actually left to pay at the table: the deposit was taken at
      // booking and is credited, not charged again (BUSINESS_LOGIC.md §3).
      dueNowAmd: Math.max(0, totals.totalAmd - (reservation?.depositAmd ?? 0)),
      tableNo: reservation?.table?.tableNo ?? null,
      prepMin,
      earliestReadyAt: new Date(Date.now() + prepMin * 60_000).toISOString(),
      branchIsOpen: branch.isOpen,
      canOrder: unavailable.length === 0 && lines.length > 0 && branch.isOpen,
    };
  }

  async create(userId: string, dto: CreateOrderDto, language: Language): Promise<OrderDetail> {
    const reservation = await this.resolveReservation(userId, dto);

    const { branch, lines, unavailable } = await this.loadBasket(dto, language);

    if (unavailable.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Some items can no longer be ordered',
        unavailable,
      });
    }
    if (!branch.isOpen) {
      throw new UnprocessableEntityException('This restaurant is not accepting orders right now');
    }

    const prepMin = estimatePrepMinutes(lines, branch.avgPrepMin);
    const readyAt = this.resolveReadyAt(dto.readyAt, prepMin);

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotalAmd, 0);
    // Claimed now, so two orders submitted at once cannot both spend it. If
    // the order then fails to insert, it is handed back below.
    const applied = dto.couponCode
      ? await this.coupons.claim(userId, dto.couponCode, subtotal)
      : null;

    const totals = priceOrder(lines, reservation?.depositAmd ?? 0, applied?.discountAmd ?? 0);

    let order;
    try {
      order = await this.createWithUniqueCode(branch.id, (code) => ({
        code,
        userId,
        branchId: branch.id,
        serviceMode: dto.serviceMode,
        status: OrderStatus.Created,
        subtotalAmd: totals.subtotalAmd,
        serviceFeeAmd: totals.serviceFeeAmd,
        // Recorded so the bill shows what was already held, but never added to
        // the total — `priceOrder` is what guarantees that.
        depositAmd: totals.depositAmd,
        discountAmd: totals.discountAmd,
        couponId: applied?.coupon.id ?? null,
        totalAmd: totals.totalAmd,
        readyAt,
        reservationId: reservation?.id ?? null,
        notes: dto.notes ?? null,
        items: {
          create: lines.map((line) => ({
            menuItemId: line.menuItemId,
            nameSnapshot: line.name,
            unitPriceAmd: line.unitPriceAmd,
            qty: line.qty,
            lineTotalAmd: line.lineTotalAmd,
          })),
        },
      }));
    } catch (err) {
      // The coupon was claimed a moment ago; an order that never existed must
      // not consume it.
      if (applied) {
        await this.coupons.release(applied.coupon.id).catch((releaseErr: unknown) => {
          this.logger.error(
            `Claimed coupon ${applied.coupon.id} for an order that failed, and could not release it`,
            releaseErr as Error,
          );
        });
      }
      throw err;
    }

    return this.toDetail(order);
  }

  async list(
    userId: string,
    query: ListOrdersDto,
  ): Promise<{ items: OrderListItem[]; total: number; page: number }> {
    const where: Prisma.OrderWhereInput = { userId };
    if (query.status === OrderListFilter.Active) {
      where.status = { in: [...ACTIVE_ORDER_STATUSES] };
    } else if (query.status === OrderListFilter.Past) {
      where.status = { in: [...TERMINAL_ORDER_STATUSES] };
    }

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          branch: { include: { restaurant: true } },
          items: { select: { qty: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        restaurantName: row.branch.restaurant.name,
        coverUrl: row.branch.restaurant.coverUrl,
        date: row.createdAt.toISOString(),
        // Dishes, not lines: "3 items" means three things to eat.
        itemsCount: row.items.reduce((sum, item) => sum + item.qty, 0),
        totalAmd: row.totalAmd,
        status: row.status as OrderStatus,
        readyAt: row.readyAt?.toISOString() ?? null,
        secondsLeft: countdown(row.readyAt, row.status as OrderStatus),
      })),
      total,
      page: query.page,
    };
  }

  async findOne(userId: string, orderId: string): Promise<OrderDetail> {
    return this.toDetail(await this.loadOwnOrder(userId, orderId));
  }

  /**
   * Customer-side cancellation. Allowed until the kitchen starts cooking
   * (BUSINESS_LOGIC.md §4) — after that the food is already spent.
   */
  async cancel(userId: string, orderId: string): Promise<OrderDetail> {
    const order = await this.loadOwnOrder(userId, orderId);

    if (!isOrderCancellable(order.status as OrderStatus)) {
      throw new UnprocessableEntityException(
        `An order that is already ${order.status} can no longer be cancelled`,
      );
    }

    return this.transition(order, OrderStatus.Cancelled);
  }

  /**
   * Moves an order to a new status, reversing the payment if it is being
   * cancelled, and announces the result.
   *
   * Shared by the customer's cancel and the owner panel's status changes, so
   * the refund rule and the event cannot be implemented twice and drift. The
   * caller decides *whether* the move is allowed — this method performs it.
   */
  async transition(order: OrderRow, next: OrderStatus): Promise<OrderDetail> {
    // Reverse the money *before* touching the order: if the provider refuses,
    // the customer still has an order rather than neither an order nor a refund.
    const paymentStatus =
      next === OrderStatus.Cancelled && order.payment
        ? await this.payments.reverse(order.payment)
        : null;

    // A cancelled order never enjoyed its discount, so the coupon goes back.
    if (next === OrderStatus.Cancelled && order.couponId) {
      await this.coupons.release(order.couponId);
    }

    const updated = await this.prisma
      .$transaction(async (tx) => {
        if (order.payment && paymentStatus) {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: { status: paymentStatus },
          });
        }
        return tx.order.update({
          // Matching on the status this decision was made against, so a change
          // that landed in between loses instead of being overwritten.
          where: { id: order.id, status: order.status },
          data: { status: next },
          include: ORDER_DETAIL_INCLUDE,
        });
      })
      .catch((err: unknown) => {
        if (paymentStatus === PaymentStatus.Refunded) {
          // Money is back with the customer but the order still reads active.
          // Loud, because only a human can reconcile it.
          this.logger.error(
            `Refunded order ${order.id} but failed to cancel it — needs manual reconciliation`,
            err as Error,
          );
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('The order changed before this could be applied');
        }
        throw err;
      });

    this.events.publish(toStatusEvent(updated));
    return this.toDetail(updated);
  }

  /**
   * Loads an order for a live subscriber: the customer who placed it, or a
   * staff-side user whose scope covers its branch. Same filter-in-the-query
   * rule as everywhere else, so an unauthorised watcher gets 404, not a stream.
   */
  async findVisibleTo(user: JwtPayload, orderId: string): Promise<OrderDetail> {
    const where: Prisma.OrderWhereInput =
      user.role === Role.Owner || user.role === Role.Admin
        ? { id: orderId, OR: [{ userId: user.sub }, orderScopeFor(user)] }
        : { id: orderId, userId: user.sub };

    const order = await this.prisma.order.findFirst({ where, include: ORDER_DETAIL_INCLUDE });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.toDetail(order);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Turns a client basket into priced lines using database prices.
   *
   * The client sends ids and quantities and nothing else — prices, names and
   * prep times are all re-read here, so a tampered basket buys nothing cheaper.
   */
  private async loadBasket(dto: BasketDto, language: Language): Promise<ResolvedBasket> {
    const ids = dto.items.map((item) => item.menuItemId);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      // Merging silently would paper over a broken basket on the client, and
      // could smuggle a quantity past ORDER_MAX_ITEM_QTY.
      throw new BadRequestException('Each menu item may appear only once; combine the quantities');
    }

    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      include: { restaurant: true },
    });
    if (!branch) {
      throw new NotFoundException('Restaurant not found');
    }

    const menuItems = await this.prisma.menuItem.findMany({
      // Scoped to the branch, so ordering another restaurant's dish (at its
      // price) is not possible — a basket belongs to one restaurant.
      where: { id: { in: ids }, branchId: branch.id },
    });
    const byId = new Map(menuItems.map((item) => [item.id, item]));

    const lines: PricedLine[] = [];
    const unavailable: QuoteResult['unavailable'] = [];

    for (const requested of dto.items) {
      const item = byId.get(requested.menuItemId);
      if (!item) {
        unavailable.push({ menuItemId: requested.menuItemId, reason: 'not_on_menu' });
        continue;
      }
      if (!item.isAvailable) {
        unavailable.push({ menuItemId: requested.menuItemId, reason: 'sold_out' });
        continue;
      }
      lines.push(
        priceLine({
          menuItemId: item.id,
          // Snapshot in the caller's language: an order is a record of what was
          // bought, so it keeps the name and price as they were at purchase.
          name: localize(item.nameI18n as I18nField, language),
          unitPriceAmd: item.priceAmd,
          qty: requested.qty,
          prepMin: item.prepMin,
        }),
      );
    }

    return { branch, lines, unavailable };
  }

  /**
   * Resolves the reservation a dine-in order belongs to.
   *
   * A dine-in order is food brought to a table, so it needs a table — which
   * means a booking. Requiring one here is what keeps `orders.reservation_id`
   * meaningful instead of usually-null, and it is why the table number on the
   * order can be trusted.
   */
  private async resolveReservation(
    userId: string,
    dto: BasketDto,
  ): Promise<ReservationForOrder | null> {
    if (dto.serviceMode !== ServiceMode.DineIn) {
      return null;
    }
    if (!dto.reservationId) {
      throw new UnprocessableEntityException(
        'A dine-in order needs the reservation it belongs to',
      );
    }

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: dto.reservationId, userId },
      include: { table: true, order: { select: { id: true } } },
    });
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }
    if (reservation.branchId !== dto.branchId) {
      throw new UnprocessableEntityException('That booking is for a different restaurant');
    }
    if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status as ReservationStatus)) {
      throw new UnprocessableEntityException(
        `A booking that is ${reservation.status} cannot be ordered against`,
      );
    }
    // `orders.reservation_id` is unique, so a second order would fail at the
    // database anyway; catching it here says why.
    if (reservation.order) {
      throw new ConflictException('This booking already has an order');
    }

    return reservation;
  }

  private resolveReadyAt(requested: string | undefined, prepMin: number): Date {
    const now = Date.now();
    const earliest = now + prepMin * 60_000;

    if (!requested) {
      return new Date(earliest);
    }

    const readyAt = new Date(requested);
    if (Number.isNaN(readyAt.getTime())) {
      throw new BadRequestException('readyAt is not a valid date');
    }
    if (readyAt.getTime() < earliest - READY_AT_SLACK_MS) {
      throw new UnprocessableEntityException({
        message: `The kitchen needs about ${prepMin} minutes for this order`,
        earliestReadyAt: new Date(earliest).toISOString(),
      });
    }
    if (readyAt.getTime() > now + ORDER_MAX_LEAD_DAYS * 24 * 60 * 60_000) {
      throw new UnprocessableEntityException(
        `Orders can be scheduled at most ${ORDER_MAX_LEAD_DAYS} days ahead`,
      );
    }
    return readyAt;
  }

  /**
   * Creates the order, retrying on the (rare) chance that the generated code is
   * already taken. `orders.code` carries a unique constraint, which is what
   * actually guarantees uniqueness — the retry just turns a 500 into a success.
   */
  private async createWithUniqueCode(
    branchId: string,
    build: (code: string) => Prisma.OrderUncheckedCreateInput,
  ): Promise<OrderRow> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = await this.freshCode(branchId);
      try {
        return await this.prisma.order.create({ data: build(code), include: ORDER_DETAIL_INCLUDE });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Could not allocate an order code after ${CODE_ATTEMPTS} attempts`);
  }

  /**
   * An order code whose last four digits — the pickup code the counter calls
   * out — are not already in use by an active order at the same branch.
   *
   * Best effort by design: only `orders.code` is unique in the database, and
   * with 10,000 possible pickup codes a busy branch would otherwise hit a
   * collision surprisingly often (about one in eight with 50 active orders).
   * Two orders created in the same instant could still collide; that is a
   * counter asking "which order?", not a correctness failure.
   */
  private async freshCode(branchId: string): Promise<string> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = generateOrderCode();
      const clash = await this.prisma.order.findFirst({
        where: {
          branchId,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
          code: { endsWith: pickupCodeFrom(code) },
        },
        select: { id: true },
      });
      if (!clash) {
        return code;
      }
    }
    return generateOrderCode();
  }

  /** Reads an order the caller owns. Ownership is part of the query, not a
   *  check afterwards, so there is no path that loads someone else's order. */
  private async loadOwnOrder(
    userId: string,
    orderId: string,
  ): Promise<OrderRow> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private toDetail(order: OrderRow): OrderDetail {
    return {
      id: order.id,
      code: order.code,
      pickupCode: pickupCodeFrom(order.code),
      status: order.status as OrderStatus,
      serviceMode: order.serviceMode as ServiceMode,
      restaurantName: order.branch.restaurant.name,
      branch: { id: order.branch.id, name: order.branch.name, address: order.branch.address },
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        unitPriceAmd: item.unitPriceAmd,
        qty: item.qty,
        lineTotalAmd: item.lineTotalAmd,
      })),
      subtotalAmd: order.subtotalAmd,
      serviceFeeAmd: order.serviceFeeAmd,
      depositAmd: order.depositAmd,
      discountAmd: order.discountAmd,
      totalAmd: order.totalAmd,
      readyAt: order.readyAt?.toISOString() ?? null,
      secondsLeft: countdown(order.readyAt, order.status as OrderStatus),
      tableNo: order.reservation?.table?.tableNo ?? null,
      reservationId: order.reservationId,
      notes: order.notes,
      payment: order.payment
        ? { method: order.payment.method, status: order.payment.status as PaymentStatus }
        : null,
      createdAt: order.createdAt.toISOString(),
    };
  }
}

/** Exported so anything that hands an order to `transition` loads the same
 *  relations — a second copy of this list would drift and fail at runtime. */
export const ORDER_DETAIL_INCLUDE = {
  items: true,
  payment: true,
  branch: { include: { restaurant: true } },
  reservation: { include: { table: true } },
} satisfies Prisma.OrderInclude;

/** An order row with everything the detail and event shapes need. */
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;
