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
  OrderEventType,
  OrderStatus,
  type PaymentMethod,
  PaymentStatus,
  Permission,
  PickupOption,
  ReservationStatus,
  ServiceMode,
  TERMINAL_ORDER_STATUSES,
  acceptsPickupOption,
  eatInRequiresBooking,
  isOrderCancellable,
  pickupOptionsFor,
  resolveBranchOffering,
  takesBookings,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';
import { LIVE_MENU_ITEM } from '../common/menu-visibility';
import { PaymentsService } from '../payments/payments.service';
import { orderScope } from '../staff/scope';
import { CouponsService } from '../referrals/coupons.service';
import type { JwtPayload } from '../auth/token.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { OrderEventsService, countdown, toStatusEvent } from './order-events.service';
import { customerActor, orderEventData, type OrderActor } from './order-history';
import { generateOrderCode, generatePickupCode } from './order-code';
import { estimatePrepMinutes, priceLine, priceOrder, type PricedLine } from './pricing';
import { resolveSchedule, type Schedule, type ScheduleRefusal } from './scheduling';
import { BasketDto, CreateOrderDto, ListOrdersDto, OrderListFilter } from './dto';

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
  /**
   * Where this pickup basket would end up, resolved — take-away when the client
   * said nothing. Null for a dine-in basket, which has a table instead.
   */
  pickupOption: PickupOption | null;
  /**
   * The endings this restaurant offers, for the client to draw the choice from.
   *
   * Sent with the quote rather than left to the client to derive from
   * `services`, because it is the same question the order will be validated
   * against and deriving it twice is how the two stop agreeing. **Fewer than two
   * entries is not a choice** — a guest shown one button is being asked to
   * confirm something that was never in doubt — so the clients render it only
   * when it has both, or when the field below says to draw the other one dead.
   */
  pickupOptions: PickupOption[];
  /**
   * True where eating in exists but is reached by booking a table.
   *
   * A restaurant's pickup is take-away and nothing else, so `pickupOptions`
   * above holds one entry — but hiding the other half would leave the guest to
   * discover the rule by not finding it. The clients draw "eat at the
   * restaurant" beside it, visibly dead, and pressing it switches the basket to
   * dine-in and opens the calendar.
   *
   * Sent rather than derived for the same reason as `pickupOptions`: it is the
   * rule the order is validated against, and a client working it out from
   * `services` is a second copy to disagree with.
   */
  eatInRequiresBooking: boolean;
  /**
   * Whether a table can be booked here right now — `reserve` declared **and**
   * bookings not paused. False makes the dine-in mode a dead end, so a client
   * draws no booking control at all rather than one that leads to "this
   * restaurant does not take bookings".
   *
   * Distinct from `eatInRequiresBooking`, which is only ever true where there is
   * a pickup for the dead "eat in" half to sit under: a place that declares
   * `reserve` alone takes bookings and has no such pair.
   */
  reservationsEnabled: boolean;
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
  /** How this pickup order ends — null on a dine-in order, which has a table. */
  pickupOption: PickupOption | null;
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
  /** True when the customer chose a time rather than taking the earliest —
   *  the tracking screen counts down to a promise instead of showing a timer
   *  that has not started. */
  scheduled: boolean;
  /** When the kitchen starts. Shown to staff, not to the diner. */
  prepStartAt: string | null;
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
  /** So the list can read "for Tue 13:00" instead of a countdown that would
   *  otherwise say "ready in 4,320 minutes". */
  scheduled: boolean;
}

type BranchWithRestaurant = Prisma.RestaurantBranchGetPayload<{ include: { restaurant: true } }>;

/**
 * What this branch offers, resolved against its restaurant's defaults.
 *
 * A one-liner because it is used at three points in one file and every one of
 * them is a decision about what a guest may order — pricing a basket, placing
 * the order, and telling the client which endings to draw. Reading
 * `branch.restaurant.services` at any of them would be the business answering a
 * question about one address.
 */
function servicesAt(branch: BranchWithRestaurant): readonly string[] {
  return resolveBranchOffering(branch, branch.restaurant).services;
}

/**
 * Whether a table can actually be booked here **right now**.
 *
 * Both halves, and they answer different questions (see `takesBookings`):
 * `reserve` says this is a place that seats people through a calendar, and
 * `reservations_enabled` says it is taking bookings this week. A client
 * offering the booking mode needs both to be true, because either one being
 * false makes `POST /reservations` refuse — it gates on this exact pair, and so
 * does `GET /restaurants/{id}/availability`.
 *
 * Sent on the quote for the same reason as `pickupOptions`: it decides what a
 * client draws, and a client working it out from `services` would be a second
 * copy of the rule, missing the switch entirely.
 */
function bookableAt(branch: BranchWithRestaurant): boolean {
  const offering = resolveBranchOffering(branch, branch.restaurant);
  return offering.reservationsEnabled && takesBookings(offering.services);
}

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
    const reservation = await this.resolveReservation(userId, dto, { required: false });

    const { branch, lines, unavailable } = await this.loadBasket(dto, language);
    // Checked while pricing, not only while creating: a basket whose chosen
    // ending the restaurant has withdrawn should say so on the screen the guest
    // is looking at, rather than at the payment.
    // The *branch's* services, not the business's: a guest orders from one
    // address, and it is that address which decides whether the food can be
    // eaten in. A chain whose other branch has a dining room is not an answer
    // to what happens at this counter.
    const pickupOption = resolvePickupOption(dto, servicesAt(branch));

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
      pickupOption,
      pickupOptions: pickupOptionsFor(servicesAt(branch)),
      eatInRequiresBooking: eatInRequiresBooking(servicesAt(branch)),
      reservationsEnabled: bookableAt(branch),
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
    const reservation = await this.resolveReservation(userId, dto, { required: true });

    const { branch, lines, unavailable } = await this.loadBasket(dto, language);
    // The *branch's* services, not the business's: a guest orders from one
    // address, and it is that address which decides whether the food can be
    // eaten in. A chain whose other branch has a dining room is not an answer
    // to what happens at this counter.
    const pickupOption = resolvePickupOption(dto, servicesAt(branch));

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
    const schedule = this.resolveSchedule(dto.readyAt, prepMin, branch.openHours);

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotalAmd, 0);
    // Claimed now, so two orders submitted at once cannot both spend it. If
    // the order then fails to insert, it is handed back below.
    const applied = dto.couponCode
      ? await this.coupons.claim(userId, dto.couponCode, subtotal)
      : null;

    const totals = priceOrder(lines, reservation?.depositAmd ?? 0, applied?.discountAmd ?? 0);

    let order;
    try {
      order = await this.createWithUniqueCode((code, pickupCode) => ({
        code,
        // Drawn beside the order number and unrelated to it. See
        // `order-code.ts`: the counter's proof must not be readable off the
        // order's name.
        pickupCode,
        userId,
        branchId: branch.id,
        serviceMode: dto.serviceMode,
        // Null on a dine-in order, which is what the column's CHECK constraint
        // requires — see `resolvePickupOption`.
        pickupOption,
        status: OrderStatus.Created,
        subtotalAmd: totals.subtotalAmd,
        serviceFeeAmd: totals.serviceFeeAmd,
        // Recorded so the bill shows what was already held, but never added to
        // the total — `priceOrder` is what guarantees that.
        depositAmd: totals.depositAmd,
        discountAmd: totals.discountAmd,
        couponId: applied?.coupon.id ?? null,
        totalAmd: totals.totalAmd,
        readyAt: schedule.readyAt,
        // The estimate this order was scheduled against, kept because the dish's
        // own `prep_min` may change and the board still has to say how long this
        // order was promised.
        prepMin,
        prepStartAt: schedule.prepStartAt,
        // Null for an order wanted as soon as possible — which is what makes
        // this column the flag for having been pre-ordered at all.
        reminderAt: schedule.reminderAt,
        // The notice the branch starts with. Defaulted from the prep estimate
        // and movable afterwards by whoever works the pass — see
        // `RestaurantOrdersService.setReminderLead`.
        reminderLeadMin: schedule.reminderLeadMin,
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
        // The first entry in the order's history, written by the same INSERT
        // that creates the order. Nested rather than a second call so there is
        // no window — and no failure mode — in which an order exists with no
        // record of having been placed.
        events: {
          create: orderEventData({
            type: OrderEventType.Created,
            actor: customerActor(userId),
            toStatus: OrderStatus.Created,
            detail: {
              serviceMode: dto.serviceMode,
              // What the kitchen has to know before it plates anything, on the
              // entry that says the order was placed — so the timeline still
              // answers "was this ever a take-away" after somebody asks.
              pickupOption,
              itemsCount: lines.reduce((sum, line) => sum + line.qty, 0),
              totalAmd: totals.totalAmd,
              readyAt: schedule.readyAt.toISOString(),
              // So the timeline says an order was placed for later, rather than
              // leaving somebody to work it out from two timestamps.
              scheduled: schedule.reminderAt !== null,
            },
          }),
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
        // The branch the order was placed at, so the thumbnail beside it is
        // the place the guest actually went to.
        coverUrl: row.branch.coverUrl ?? row.branch.restaurant.coverUrl,
        date: row.createdAt.toISOString(),
        // Dishes, not lines: "3 items" means three things to eat.
        itemsCount: row.items.reduce((sum, item) => sum + item.qty, 0),
        totalAmd: row.totalAmd,
        status: row.status as OrderStatus,
        readyAt: row.readyAt?.toISOString() ?? null,
        secondsLeft: countdown(row.readyAt, row.status as OrderStatus),
        scheduled: row.reminderAt != null,
      })),
      total,
      page: query.page,
    };
  }

  async findOne(userId: string, orderId: string): Promise<OrderDetail> {
    return this.toDetail(await this.loadOwnOrder(userId, orderId));
  }

  /**
   * Customer-side cancellation. Allowed only while the order is unpaid
   * (BUSINESS_LOGIC.md §4) — paying commits it, and there is no way back out
   * from either side afterwards.
   */
  async cancel(userId: string, orderId: string): Promise<OrderDetail> {
    const order = await this.loadOwnOrder(userId, orderId);

    if (!isOrderCancellable(order.status as OrderStatus)) {
      throw new UnprocessableEntityException(
        `An order that is already ${order.status} can no longer be cancelled`,
      );
    }

    return this.transition(order, OrderStatus.Cancelled, customerActor(userId));
  }

  /**
   * Moves an order to a new status, reversing the payment if it is being
   * cancelled, and announces the result.
   *
   * Shared by the customer's cancel and the owner panel's status changes, so
   * the refund rule and the event cannot be implemented twice and drift. The
   * caller decides *whether* the move is allowed — this method performs it.
   *
   * `actor` is required rather than optional: an optional one would default to
   * "system" at exactly the call sites that have a person to name, and an audit
   * trail that quietly says nobody did it is worse than none.
   */
  async transition(order: OrderRow, next: OrderStatus, actor: OrderActor): Promise<OrderDetail> {
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
        const moved = await tx.order.update({
          // Matching on the status this decision was made against, so a change
          // that landed in between loses instead of being overwritten.
          where: { id: order.id, status: order.status },
          data: { status: next },
          include: ORDER_DETAIL_INCLUDE,
        });

        // After the update and inside the same transaction, which is what makes
        // the entry honest in both directions: a `where` that matched nothing
        // throws before this line, and anything failing after it rolls the
        // entry back along with the change it describes.
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            ...orderEventData({
              type: OrderEventType.StatusChanged,
              actor,
              fromStatus: order.status as OrderStatus,
              toStatus: next,
              // What became of the money, on the one transition that touches
              // it. "Cancelled" and "cancelled, and the card was refunded" are
              // different answers to the question this timeline gets opened for.
              detail:
                paymentStatus === null
                  ? undefined
                  : {
                      paymentStatus,
                      paymentMethod: order.payment?.method as PaymentMethod | undefined,
                      amountAmd: order.payment?.amountAmd,
                    },
            }),
          },
        });

        return moved;
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
   * Loads an order for a live subscriber who placed it.
   *
   * Same filter-in-the-query rule as everywhere else, so an unauthorised
   * watcher gets 404 rather than a stream.
   */
  async findVisibleTo(user: JwtPayload, orderId: string): Promise<OrderDetail> {
    return this.loadVisible({ id: orderId, userId: user.sub });
  }

  /**
   * The same, for the kitchen side.
   *
   * A separate method rather than a branch inside the one above: the two
   * identities carry different tokens and are scoped by different rules, and
   * the old single method decided between them by reading a role off the
   * customer token — which is exactly the coupling the staff split removed.
   */
  async findVisibleToStaff(staff: StaffJwtPayload, orderId: string): Promise<OrderDetail> {
    return this.loadVisible({
      id: orderId,
      ...orderScope(staff.scopes, Permission.OrdersRead),
    });
  }

  private async loadVisible(where: Prisma.OrderWhereInput): Promise<OrderDetail> {
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
      //
      // And to the live menu. A withdrawn dish simply is not found here, so it
      // falls through to `not_on_menu` below with every other id that does not
      // resolve — which is exactly what it is. A soft delete that still let a
      // customer buy the dish would not be a delete at all.
      where: { id: { in: ids }, branchId: branch.id, ...LIVE_MENU_ITEM },
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
   *
   * `required` splits pricing from committing, the same way coupons split
   * `preview` from `claim`. Choosing "dine in" and booking the table are two
   * steps, so between them there is a real basket, on a real screen, that is
   * dine-in and has no reservation yet — and the customer is looking at it.
   * Refusing to *price* that basket takes down every screen in the flow, and
   * the basket cookie outlives the page, so the customer cannot even get back
   * to the basket to empty it. Creating the order still requires the booking.
   *
   * What must not relax is the checking of an id that *is* supplied: ownership,
   * branch, status and single-use are all still enforced below, for a quote
   * exactly as for an order. Otherwise a quote could price against somebody
   * else's table.
   */
  private async resolveReservation(
    userId: string,
    dto: BasketDto,
    { required }: { required: boolean },
  ): Promise<ReservationForOrder | null> {
    if (dto.serviceMode !== ServiceMode.DineIn) {
      return null;
    }
    if (!dto.reservationId) {
      if (!required) {
        // No table yet, so no deposit yet: the quote prices the food alone.
        return null;
      }
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

  /**
   * The order's timings, or the reason it cannot have them.
   *
   * The rules themselves live in `scheduling.ts` and are shared with the quote;
   * what happens here is only the translation from a refusal into a status code.
   */
  private resolveSchedule(
    requestedReadyAt: string | undefined,
    prepMin: number,
    openHours: unknown,
  ): Schedule {
    const result = resolveSchedule({ requestedReadyAt, prepMin, openHours });
    if (result.ok) {
      return result.schedule;
    }
    throw scheduleException(result.refusal);
  }

  /**
   * Creates the order, retrying on the (rare) chance that one of its two codes
   * is already taken.
   *
   * Both `orders.code` and `orders.pickup_code` carry unique constraints, and
   * those constraints are what actually guarantee uniqueness — the retry only
   * turns a 500 into a success. A pre-flight SELECT would be neither: it cannot
   * see an order being inserted in another transaction right now, so it would
   * be a query per order that still leaves the insert to the constraint.
   *
   * This is why the pickup code is no longer checked against the branch's live
   * board before use, which is what the old `freshCode` did — it had to, because
   * the four digits it produced were not unique in the database at all. They are
   * now, and a database constraint is a better answer than a best-effort SELECT.
   *
   * Five attempts is generous at any realistic table size and is not a strategy
   * for a full code space: once a million orders exist every attempt collides,
   * and the honest outcome is this throwing rather than an order quietly sharing
   * somebody's collection code. See DATABASE.md §5.
   */
  private async createWithUniqueCode(
    build: (code: string, pickupCode: string) => Prisma.OrderUncheckedCreateInput,
  ): Promise<OrderRow> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.order.create({
          data: build(generateOrderCode(), generatePickupCode()),
          include: ORDER_DETAIL_INCLUDE,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Could not allocate an order code after ${CODE_ATTEMPTS} attempts`);
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
      // The customer's copy of it. This is the one audience that is meant to
      // have it: the staff endpoints do not send it at all, because a code the
      // counter can read off its own screen is not something a guest has to be
      // asked for.
      pickupCode: order.pickupCode,
      status: order.status as OrderStatus,
      serviceMode: order.serviceMode as ServiceMode,
      pickupOption: (order.pickupOption as PickupOption | null) ?? null,
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
      scheduled: order.reminderAt != null,
      prepStartAt: order.prepStartAt?.toISOString() ?? null,
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

/**
 * Where this basket's food ends up, or the reason it cannot end up there.
 *
 * Three rules, and each of them is a sentence rather than a shape, which is why
 * none is in the DTO:
 *
 * - **Only a pickup order chooses.** A dine-in order is food brought to a table
 *   it is already sitting at; the database says the same thing with a CHECK
 *   constraint, and a body carrying both would otherwise reach it as a 500.
 * - **Nothing chosen means take-away.** Every pickup restaurant hands food over,
 *   so a client that has never heard of this field still places the order it
 *   always placed — and the column stays non-null for every pickup row.
 * - **Eating in belongs to counters — and this branch must be one.** A branch
 *   that takes bookings seats people by holding a table, so its pickup is
 *   take-away and nothing else (BUSINESS_LOGIC.md §2). Checked here rather than
 *   trusted from the basket, because a basket outlives the page it was built
 *   on: a branch can start taking bookings between the choice and the payment —
 *   and since services moved down to the branch, the branch *next door* taking
 *   them is no longer the same event.
 *
 * Take-away is *not* checked against `pickup` being declared — see
 * `acceptsPickupOption`, which explains why that is a different question.
 */
function resolvePickupOption(dto: BasketDto, services: readonly string[]): PickupOption | null {
  if (dto.serviceMode !== ServiceMode.Pickup) {
    if (dto.pickupOption !== undefined) {
      throw new UnprocessableEntityException(
        'Only a pickup order chooses between taking it away and eating in',
      );
    }
    return null;
  }

  const option = dto.pickupOption ?? PickupOption.TakeAway;
  if (!acceptsPickupOption(services, option)) {
    throw new UnprocessableEntityException(
      'Eating in at this restaurant means booking a table, not a pickup order',
    );
  }
  return option;
}

/**
 * Turns a scheduling refusal into the answer the client gets.
 *
 * `too_soon` carries the earliest time back rather than only saying no: the
 * basket screen redraws its picker from it, so a customer who asked for an
 * impossible time is shown the possible ones instead of a dead end.
 */
function scheduleException(refusal: ScheduleRefusal): Error {
  switch (refusal.kind) {
    case 'invalid_date':
      return new BadRequestException('readyAt is not a valid date');
    case 'too_soon':
      return new UnprocessableEntityException({
        message: `The kitchen needs about ${refusal.prepMin} minutes for this order`,
        earliestReadyAt: refusal.earliestReadyAt.toISOString(),
      });
    case 'too_far':
      return new UnprocessableEntityException(
        `Orders can be scheduled at most ${refusal.maxLeadDays} days ahead`,
      );
    case 'closed':
      return new UnprocessableEntityException({
        message: 'This restaurant is closed at that time',
        readyAt: refusal.readyAt.toISOString(),
      });
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
