import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OrderEventType,
  OrderStatus,
  Permission,
  QUEUE_FILTER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  canTransitionOrder,
  isTimeScopedQueueFilter,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_DETAIL_INCLUDE, OrdersService, type OrderDetail } from '../orders/orders.service';
import { countdown } from '../orders/order-events.service';
import { orderEventData, staffActor } from '../orders/order-history';
import { OrderHistoryService } from '../orders/order-history.service';
import type { OrderHistoryEntry } from '../orders/order-history';
import { pickupCodeFrom } from '../orders/order-code';
import { reminderFor } from '../orders/scheduling';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { orderScope } from '../staff/scope';
import { ListQueueDto, QueueFilter, SetOrderReminderDto, SetOrderStatusDto } from './dto';

export interface QueueItem {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: string;
  branch: { id: string; name: string | null };
  customerName: string | null;
  itemsCount: number;
  totalAmd: number;
  paymentStatus: string | null;
  readyAt: string | null;
  secondsLeft: number | null;
  /**
   * A pre-order the customer placed for later, rather than one wanted now.
   *
   * The card reads differently for these: a date and a start time instead of a
   * countdown, and no late warning until the kitchen was actually meant to have
   * begun. A countdown on an order due next Tuesday would read "ready in 8,640
   * min", which is a number nobody can act on.
   */
  scheduled: boolean;
  /** When the kitchen has to start, so the board can say "start 12:40". */
  prepStartAt: string | null;
  /** The estimate this order was promised against, in minutes. Null on orders
   *  placed before pre-ordering existed. */
  prepMin: number | null;
  /** When the branch is warned this one is coming up, and how long before the
   *  food is due that is. Null on an order placed for as soon as possible, which
   *  has no warning to give and nothing on the card to edit. */
  reminderAt: string | null;
  reminderLeadMin: number | null;
  createdAt: string;
  /**
   * The lines of the order, as the card on the board reads them.
   *
   * `name` is the snapshot taken when the order was placed — what the diner
   * bought, whatever the dish has been renamed to since — while `menuItemId`
   * points at the dish itself, which is what makes a line on the board a link
   * to the menu row. Both are needed: the id cannot say what was ordered, and
   * the name cannot say what to open.
   *
   * `lineTotalAmd` is the line, not the dish: two of something is twice the
   * price, and a board showing the unit price beside a quantity would be
   * inviting the kitchen to do the multiplication itself.
   */
  items: { menuItemId: string; name: string; qty: number; lineTotalAmd: number }[];
  notes: string | null;
}

/**
 * How many orders each stage holds under everything *except* the stage filter.
 *
 * The point is that a search tells you where the order is. Type a pickup code
 * while looking at the live board and the counts say "Active 0 · Past 1" — one
 * click away, instead of an empty board and no reason given.
 */
export type QueueCounts = Record<QueueFilter, number>;

/**
 * Folds a `group by status` into a count per stage.
 *
 * One grouped query rather than five counts: the stages overlap (`new` and
 * `ready` are both inside `active`), so counting them separately would be five
 * scans of the same rows to answer what one pass already knows.
 *
 * **The grouped rows must be the orders that are *due*** — the pre-orders whose
 * hour has not come are counted separately and passed in, because "how many are
 * waiting to be confirmed" and "how many are booked for next week" are two
 * numbers and a kitchen acts on only one of them. Grouping by status alone
 * cannot separate them: a pre-order is `paid` exactly like an order at the
 * counter, and the difference is a timestamp.
 */
export function countPerStage(
  grouped: readonly { status: string; _count: { _all: number } }[],
  scheduled: number,
): QueueCounts {
  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));

  const counts = {} as QueueCounts;
  for (const filter of Object.values(QueueFilter)) {
    counts[filter] = isTimeScopedQueueFilter(filter)
      ? scheduled
      : QUEUE_FILTER_STATUSES[filter].reduce(
          (sum, status) => sum + (byStatus.get(status) ?? 0),
          0,
        );
  }
  return counts;
}

/**
 * The two halves of the board, as query fragments.
 *
 * An order is a pre-order still waiting when its `reminder_at` is in the
 * future; everything else — including every order placed for as soon as
 * possible, whose `reminder_at` is null — is work this shift can act on.
 *
 * Split on the clock rather than on `reminder_sent_at`, so an order reaches the
 * board at its proper hour even in a deployment where the reminder job is not
 * running. The job announces; it does not gatekeep.
 */
export function dueBy(now: Date): Prisma.OrderWhereInput {
  return { OR: [{ reminderAt: null }, { reminderAt: { lte: now } }] };
}

export function scheduledAfter(now: Date): Prisma.OrderWhereInput {
  return { reminderAt: { gt: now } };
}

/**
 * A pre-order's warning, after somebody has moved it.
 *
 * Its own shape rather than the whole order, because that is what changed: the
 * board patches the card it already has, and re-sending forty fields to say one
 * number moved would invite the panel to overwrite a status it heard about on
 * the socket half a second ago.
 */
export interface OrderReminder {
  id: string;
  /** When the branch will now be told. */
  reminderAt: string;
  /** How long before the food is due that is, in minutes — the number somebody
   *  set, echoed back rather than left for the panel to subtract. */
  reminderLeadMin: number;
  /** Whether that moment is still ahead, which is what decides the Scheduled
   *  tab. False when the new lead put the warning in the past. */
  scheduled: boolean;
}

@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly orderHistory: OrderHistoryService,
  ) {}

  /**
   * The kitchen queue: orders for the branches this user is scoped to,
   * narrowed by whatever the panel is filtering on.
   *
   * Every filter is applied **here**, not in the client. The panel used to
   * fetch one page of active orders and sort them into stages itself, which is
   * only correct while every order fits on a page — past that, a tab counting
   * "3 ready" meant "3 ready among the twenty I happen to have".
   */
  async listOrders(
    staff: StaffJwtPayload,
    query: ListQueueDto,
  ): Promise<{ items: QueueItem[]; total: number; page: number; counts: QueueCounts }> {
    // Everything except the stage, so the per-stage counts below can be taken
    // under the same search and scoping the list is under.
    const base: Prisma.OrderWhereInput = { ...orderScope(staff.scopes, Permission.OrdersRead) };

    if (query.restaurantId) {
      // Narrows the scope, never widens it: the ownership filter above stays,
      // and this is ANDed with it.
      base.branch = { restaurantId: query.restaurantId };
    }
    if (query.branchId) {
      base.branchId = query.branchId;
    }

    /**
     * Everything that narrows the answer without being the stage.
     *
     * Collected into one `AND` array rather than assigned onto `base`, because
     * **two of these want an `OR` of their own** — the search, and the due/
     * scheduled split — and `orderScope` has already put an `OR` at the top
     * level for any account that is not platform-wide. Writing either of them to
     * `where.OR` would replace the ownership filter and turn a board into a way
     * to read every restaurant's orders. Nesting them under `AND` is what keeps
     * each one a narrowing.
     */
    const narrow: Prisma.OrderWhereInput[] = [];

    const term = query.q?.trim();
    if (term) {
      narrow.push({
        OR: [
          // Matches the full code and the pickup code both: the latter is the
          // last four digits of the former.
          { code: { contains: term, mode: 'insensitive' } },
          { user: { name: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    const stage = query.status ?? QueueFilter.Active;
    // One instant for the whole request. Taking `new Date()` per query would let
    // the list and its own counts be computed either side of a passing second,
    // and the tab would disagree with the board underneath it.
    const now = new Date();
    const scheduledStage = isTimeScopedQueueFilter(stage);

    const where: Prisma.OrderWhereInput = {
      ...base,
      status: { in: [...QUEUE_FILTER_STATUSES[stage]] },
      // Every stage is one side of the split or the other. A pre-order for next
      // Tuesday is `paid`, and without this it would sit in the Paid tab — as
      // the *oldest* row there, pinned above the work somebody is doing now.
      AND: [...narrow, scheduledStage ? scheduledAfter(now) : dueBy(now)],
    };

    const [rows, total, grouped, scheduled] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          branch: true,
          payment: { select: { status: true } },
          user: { select: { name: true } },
          items: {
            select: { menuItemId: true, nameSnapshot: true, qty: true, lineTotalAmd: true },
          },
        },
        // By when the kitchen has to start, oldest first: a kitchen works a
        // queue, not a stack. For an order placed for as soon as possible this
        // is `created_at` shifted by a constant, so the ordinary board is
        // ordered exactly as it always was — what changes is that a pre-order
        // whose hour has come slots in where it belongs rather than at the top.
        //
        // `prep_start_at` is null on orders placed before this column existed,
        // and those sort last rather than first: an order from before the
        // feature is finished, and a finished order has no claim on the front of
        // a queue.
        orderBy: [{ prepStartAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { ...base, AND: [...narrow, dueBy(now)] },
        _count: { _all: true },
      }),
      // The one number the grouped query cannot answer, because it is a question
      // about a timestamp rather than a status.
      this.prisma.order.count({
        where: {
          ...base,
          status: { in: [...QUEUE_FILTER_STATUSES[QueueFilter.Scheduled]] },
          AND: [...narrow, scheduledAfter(now)],
        },
      }),
    ]);

    return {
      counts: countPerStage(grouped, scheduled),
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        pickupCode: pickupCodeFrom(row.code),
        status: row.status as OrderStatus,
        serviceMode: row.serviceMode,
        branch: { id: row.branch.id, name: row.branch.name },
        customerName: row.user.name,
        itemsCount: row.items.reduce((sum, item) => sum + item.qty, 0),
        totalAmd: row.totalAmd,
        paymentStatus: row.payment?.status ?? null,
        readyAt: row.readyAt?.toISOString() ?? null,
        secondsLeft: countdown(row.readyAt, row.status as OrderStatus),
        // Against the same instant the list was selected under, so a card cannot
        // claim to be scheduled while the query that fetched it disagreed.
        scheduled: (row.reminderAt?.getTime() ?? 0) > now.getTime(),
        prepStartAt: row.prepStartAt?.toISOString() ?? null,
        prepMin: row.prepMin,
        reminderAt: row.reminderAt?.toISOString() ?? null,
        reminderLeadMin: row.reminderLeadMin,
        createdAt: row.createdAt.toISOString(),
        items: row.items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.nameSnapshot,
          qty: item.qty,
          lineTotalAmd: item.lineTotalAmd,
        })),
        notes: row.notes,
      })),
      total,
      page: query.page,
    };
  }

  /**
   * Advances an order through the kitchen.
   *
   * The legality of the move comes from the shared state machine, not from a
   * list written here — the same table the customer app reads, so the two
   * cannot disagree about what "ready" follows.
   */
  async setStatus(
    staff: StaffJwtPayload,
    orderId: string,
    dto: SetOrderStatusDto,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findFirst({
      // Reach is part of the query: there is no path that loads an order
      // outside the caller's scope and then decides. Scoped on `orders:advance`
      // rather than `orders:read`, so a role that may only watch the queue
      // cannot move an order in it.
      where: { id: orderId, ...orderScope(staff.scopes, Permission.OrdersAdvance) },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!canTransitionOrder(order.status as OrderStatus, dto.status)) {
      throw new UnprocessableEntityException(
        `An order that is ${order.status} cannot become ${dto.status}`,
      );
    }

    // The staff member the token stands for — and the super admin behind it, if
    // this is an impersonated session. See `staffActor`.
    return this.orders.transition(order, dto.status, staffActor(staff));
  }

  /**
   * Moves when the branch is warned about one pre-order.
   *
   * The only thing about a placed order a shift may change, and it changes
   * nothing the customer was promised: `ready_at` stands, the price stands, and
   * what moves is how much notice the kitchen gives itself. That is why it is
   * `orders:advance` and not a permission of its own — it is the same person, at
   * the same pass, deciding about the same order.
   *
   * The default was arithmetic over the menu's prep estimate, which is the
   * slowest dish on the ticket and knows nothing about the coals a skewer wants
   * lighting first. This is where somebody who does know says so.
   */
  async setReminderLead(
    staff: StaffJwtPayload,
    orderId: string,
    dto: SetOrderReminderDto,
  ): Promise<OrderReminder> {
    const order = await this.prisma.order.findFirst({
      // Reach in the query, as everywhere else, and on `orders:advance` — a role
      // that may only watch the board cannot retime its warnings.
      where: { id: orderId, ...orderScope(staff.scopes, Permission.OrdersAdvance) },
      select: {
        id: true,
        status: true,
        readyAt: true,
        reminderAt: true,
        reminderLeadMin: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // `reminder_at` is what makes an order a pre-order, and `ready_at` is what a
    // lead is measured back from. Neither is a case to handle gracefully: an
    // order placed for as soon as possible has no warning to move, and a card
    // that offered the control anyway would be offering it on every order.
    if (order.reminderAt === null || order.readyAt === null) {
      throw new UnprocessableEntityException(
        'This order was placed for as soon as possible and has no reminder',
      );
    }
    if (TERMINAL_ORDER_STATUSES.includes(order.status as OrderStatus)) {
      throw new UnprocessableEntityException(
        `An order that is ${order.status} has nothing left to be reminded about`,
      );
    }

    // Pulled out of the row before the closure below, which is where the
    // narrowing above would otherwise be forgotten.
    const readyAt = order.readyAt;
    const now = new Date();
    const reminderAt = reminderFor(readyAt, dto.leadMin);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          reminderLeadMin: dto.leadMin,
          reminderAt,
          // Re-armed only when the new moment is still ahead. A warning already
          // sent for a time somebody has since moved *later* was premature, and
          // leaving this set would mean the time they chose never fires; moving
          // it earlier, into a moment already past, is a request to be told
          // about something they have already been told about.
          reminderSentAt: reminderAt.getTime() > now.getTime() ? null : undefined,
        },
        select: { id: true, reminderAt: true, reminderLeadMin: true },
      });

      // In the same transaction, because the column above is overwritten in
      // place: an entry written afterwards could be missing for exactly the
      // change somebody is trying to account for.
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          ...orderEventData({
            type: OrderEventType.ReminderSet,
            actor: staffActor(staff),
            detail: {
              reminderLeadMin: dto.leadMin,
              previousReminderLeadMin: order.reminderLeadMin,
              reminderAt: reminderAt.toISOString(),
              readyAt: readyAt.toISOString(),
            },
          }),
        },
      });

      return row;
    });

    return {
      id: updated.id,
      reminderAt: updated.reminderAt!.toISOString(),
      reminderLeadMin: updated.reminderLeadMin!,
      // Against the same instant the write was decided under. A lead long enough
      // to land in the past is a legal answer — it means "warn me now" — and the
      // card has to leave the Scheduled tab when it does.
      scheduled: reminderAt.getTime() > now.getTime(),
    };
  }

  /**
   * Everything that has happened to one order, for the card's History button.
   *
   * `orders:read`, not `orders:advance`: reading how an order got here is part
   * of watching the queue, and a shift that may not move an order still has to
   * be able to answer "when did this come in and who confirmed it" at the
   * counter. The reach filter goes into the query, so an order outside it 404s
   * rather than leaking its timeline.
   */
  async history(staff: StaffJwtPayload, orderId: string): Promise<{ items: OrderHistoryEntry[] }> {
    return this.orderHistory.list({
      id: orderId,
      ...orderScope(staff.scopes, Permission.OrdersRead),
    });
  }
}
