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
  AuditAction,
  CUSTOMER_ORDER_FILTER_STATUSES,
  CustomerOrderFilter,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  Role,
  type ServiceMode,
  StaffRole,
  narrowsCustomerOrders,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { maskPhone } from '../auth/phone.util';
import { AuditService } from '../audit/audit.service';
import { pickupCodeFrom } from '../orders/order-code';
import { InvitesService } from '../staff/invites.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import {
  CreateRestaurantDto,
  IssuePromoDto,
  ListCustomerOrdersDto,
  ListUsersDto,
  PROMO_SOURCE,
} from './dto';

export interface AdminUser {
  id: string;
  name: string | null;
  /** Masked: an admin list is not a reason to expose every phone number in
   *  full (DEVELOPMENT_GUIDE.md, "no PII in logs" — the same instinct). The
   *  unmasked one is `revealPhone` below, one account at a time and recorded. */
  phone: string | null;
  email: string | null;
  role: Role;
  isGuest: boolean;
  phoneVerified: boolean;
  ordersCount: number;
  rewardPoints: number;
  createdAt: string;
}

/** One diner's number in full, and whose it is — the id travels back so a
 *  client cannot paste the answer against the wrong row. */
export interface AdminUserPhone {
  id: string;
  phone: string;
}

/** How many of this customer's orders each filter would show, under whatever
 *  search is applied. `all` is the sum, which is also the honest answer to "how
 *  many orders does this person have". */
export type CustomerOrderCounts = Record<CustomerOrderFilter, number>;

/**
 * A group-by over `orders.status`, folded into the four filters.
 *
 * Exported for its own test. Every status has to land in exactly one of the
 * three narrowing filters or the totals stop adding up — and there is no
 * compile error for a status nobody bucketed, only a segment that quietly
 * undercounts.
 */
export function countPerCustomerFilter(
  grouped: readonly { status: string; _count: { _all: number } }[],
): CustomerOrderCounts {
  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));

  const counts = {} as CustomerOrderCounts;
  for (const filter of Object.values(CustomerOrderFilter)) {
    counts[filter] = narrowsCustomerOrders(filter)
      ? CUSTOMER_ORDER_FILTER_STATUSES[filter].reduce(
          (sum, status) => sum + (byStatus.get(status) ?? 0),
          0,
        )
      : // Summed from the group-by rather than from the three above: a status
        // that belongs to none of them — one added to the enum and not
        // bucketed here — still has to be counted in the total, or "All" would
        // show fewer rows than the list under it.
        [...byStatus.values()].reduce((sum, count) => sum + count, 0);
  }
  return counts;
}

/** A line of an order, as it was bought. `name` is the snapshot taken at
 *  purchase, not the dish's name today. */
export interface AdminCustomerOrderItem {
  menuItemId: string;
  name: string;
  qty: number;
  unitPriceAmd: number;
  lineTotalAmd: number;
}

/**
 * One of a customer's orders, whole.
 *
 * Everything the row needs *and* everything opening it needs, in one shape: a
 * page is ten orders, and a second request per row somebody expands would be ten
 * round trips to read what the first query already had joined.
 *
 * `restaurantId` and `branchId` are here to be linked with rather than shown —
 * the order board is addressable by both plus a code, so an order in this list
 * is somewhere the panel can send you.
 */
export interface AdminCustomerOrder {
  id: string;
  code: string;
  /** The last four digits — what a counter says out loud. */
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  restaurantId: string;
  restaurantName: string;
  branchId: string;
  branchName: string | null;
  /** Dishes, not lines: two of something counts twice. */
  itemsCount: number;
  items: AdminCustomerOrderItem[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  /** Held at booking and credited to the bill, never added to the total. */
  depositAmd: number;
  discountAmd: number;
  totalAmd: number;
  /** Null for an order nobody ever paid for — a basket abandoned at checkout. */
  payment: { method: PaymentMethod; status: PaymentStatus } | null;
  /** The booked table, on a dine-in order. */
  tableNo: string | null;
  notes: string | null;
  readyAt: string | null;
  createdAt: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(
    query: ListUsersDto,
  ): Promise<{ items: AdminUser[]; total: number; page: number }> {
    const where: Prisma.UserWhereInput = {};

    if (query.id) {
      where.id = query.id;
    }
    if (query.q) {
      where.OR = [
        { phone: { contains: query.q } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.role) {
      where.role = query.role as Prisma.EnumRoleFilter['equals'];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toAdminUser), total, page: query.page };
  }

  /**
   * One customer's number, in full.
   *
   * Its own endpoint rather than a wider `listUsers` — "show me this one" is a
   * different act from "show me the list", and that is the whole reason the list
   * masks: a support call about one diner needs one number, and a table of
   * twenty-five readable ones is a page anybody can photograph.
   *
   * **Every reveal is written to `audit_log`** (`customer.phone_view`), with no
   * scope on either column, which is what keeps the row readable only by a
   * platform role — the same rule `staff.impersonate` follows. It is the one
   * *read* in that table, and it is there because a masked column that anyone
   * holding `platform:users` can unmask silently is not really masked.
   *
   * The entry is written **before** the number is returned. A failure to record
   * is a failure to reveal: the alternative is a number handed out and no row
   * saying who asked, which is the exact gap this exists to close.
   */
  async revealPhone(
    staff: StaffJwtPayload,
    userId: string,
    ip?: string,
  ): Promise<AdminUserPhone> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true },
    });
    // A guest account that never verified a number has none, and so does an id
    // that belongs to nobody. Both are "there is no phone at this address",
    // which is what a 404 on this route says.
    if (!user?.phone) {
      throw new NotFoundException('No phone number on this account');
    }

    // Nothing changed, so there is no before/after to record. What is worth
    // keeping is that it was read at all, and the masked form says which number
    // without putting a readable one in a second place.
    await this.audit.recordStandalone(staff, {
      action: AuditAction.CustomerPhoneView,
      entityId: user.id,
      after: { phone: maskPhone(user.phone) },
      ip: ip ?? null,
    });

    return { id: user.id, phone: user.phone };
  }

  /**
   * What one customer has ordered, newest first.
   *
   * Behind `platform:users` rather than `orders:read`, and the difference is
   * which question is being asked: the board answers "what is this kitchen
   * working on", scoped to the branches a shift can reach, and this answers
   * "what has this person bought", which crosses every restaurant on the
   * platform and belongs to whoever may see the person at all.
   *
   * Rows arrive whole — every line, both codes, the payment and the totals —
   * because the screen that reads this opens them in place. Ten joined rows is
   * one query; ten rows plus a detail request each is eleven.
   *
   * The counts come back with every page, taken under the search but **not**
   * under the status filter, so the segment labels say where the thing being
   * looked for actually is. Searching a code and reading "Active 0 · Completed
   * 0 · Cancelled 1" is the answer to the support call, before anybody has
   * clicked a filter. This is the order board's rule, for the same reason.
   */
  async listCustomerOrders(
    userId: string,
    query: ListCustomerOrdersDto,
  ): Promise<{
    items: AdminCustomerOrder[];
    total: number;
    page: number;
    counts: CustomerOrderCounts;
  }> {
    // The account first, so "this customer has never ordered" and "there is no
    // such customer" are different answers. An empty page cannot tell them
    // apart, and only one of the two is worth showing an empty state for.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    // Everything except the status, so the per-filter counts below can be taken
    // under the same search the list is under.
    const base: Prisma.OrderWhereInput = { userId };

    const term = query.q?.trim();
    if (term) {
      // A plain `OR` at the top level is safe here, unlike on the order board:
      // there the scope filter owns that key and assigning it would turn a
      // search into a way to read every restaurant's orders. The only sibling
      // here is `userId`, a bare equality that Prisma ANDs with this.
      base.OR = [
        // Matches the full code and the pickup code both — the latter is the
        // last four digits of the former, which is what a receipt shows.
        { code: { contains: term, mode: 'insensitive' } },
        // What was in it. The snapshot, not the dish's name today: somebody
        // searching for what they remember eating means what it was called then.
        { items: { some: { nameSnapshot: { contains: term, mode: 'insensitive' } } } },
        { branch: { name: { contains: term, mode: 'insensitive' } } },
        { branch: { restaurant: { name: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const status = query.status ?? CustomerOrderFilter.All;
    const where: Prisma.OrderWhereInput = narrowsCustomerOrders(status)
      ? { ...base, status: { in: [...CUSTOMER_ORDER_FILTER_STATUSES[status]] } }
      : base;

    const [rows, total, grouped] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: CUSTOMER_ORDER_INCLUDE,
        // Newest first: this is a record of what somebody has bought, and the
        // end worth reading is the recent one. The kitchen queue sorts the
        // other way because it is work to be done in the order it arrived.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);

    return {
      items: rows.map(toCustomerOrder),
      total,
      page: query.page,
      counts: countPerCustomerFilter(grouped),
    };
  }

  /**
   * Creates a restaurant, and optionally invites the person who will run it.
   *
   * `ownerId` is gone: there is no customer account to point at any more. Who
   * administers a restaurant is a `restaurant_admin` assignment, and the way to
   * create one is an invitation — so this takes an email address and sends one,
   * rather than demanding that the right account already exist.
   *
   * The invitation is sent **after** the restaurant is committed. A restaurant
   * with nobody invited yet is a normal state that an admin can fix from the
   * staff screen; an invitation naming a restaurant that was never created is
   * not.
   */
  async createRestaurant(staff: StaffJwtPayload, dto: CreateRestaurantDto) {
    let restaurant;
    try {
      restaurant = await this.prisma.restaurant.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          cuisine: dto.cuisine ?? null,
          priceLevel: dto.priceLevel ?? null,
          services: [],
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // The slug is a public URL; a duplicate is a conflict, not a 500.
        throw new ConflictException('That slug is already taken');
      }
      throw err;
    }

    if (dto.adminEmail) {
      await this.invites.create(staff, {
        email: dto.adminEmail,
        role: StaffRole.RestaurantAdmin,
        restaurantId: restaurant.id,
      });
      this.logger.log(`Invited ${dto.adminEmail} to administer ${restaurant.slug}`);
    }

    return restaurant;
  }

  /**
   * Issues a promo coupon.
   *
   * Money, so: exactly one kind of discount, an explicit audience, and a count
   * of what was actually created rather than what was asked for.
   */
  async issuePromo(dto: IssuePromoDto): Promise<{ code: string; issued: number }> {
    if ((dto.discountPct === undefined) === (dto.discountAmd === undefined)) {
      throw new BadRequestException('Give exactly one of discountPct or discountAmd');
    }

    const recipients = dto.userIds
      ? await this.prisma.user.findMany({
          where: { id: { in: dto.userIds }, phoneVerified: true, isGuest: false },
          select: { id: true },
        })
      : await this.prisma.user.findMany({
          where: { phoneVerified: true, isGuest: false },
          select: { id: true },
        });

    if (recipients.length === 0) {
      throw new UnprocessableEntityException('No verified accounts matched');
    }

    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && validUntil.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('validUntil is already in the past');
    }

    // `skipDuplicates` on the (user, code) unique index, so re-running the
    // same promo tops up new accounts instead of failing outright.
    const created = await this.prisma.coupon.createMany({
      data: recipients.map((user) => ({
        userId: user.id,
        code: dto.code,
        discountPct: dto.discountPct ?? null,
        discountAmd: dto.discountAmd ?? null,
        source: PROMO_SOURCE,
        validUntil,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Issued promo ${dto.code} to ${created.count} account(s)`);
    return { code: dto.code, issued: created.count };
  }

  private async findUser(userId: string): Promise<AdminUser> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { _count: { select: { orders: true } } },
    });
    return toAdminUser(row);
  }
}

/**
 * What a customer's order row is loaded with.
 *
 * `items` selects rather than including the dish: the line already carries the
 * name it was bought under, and joining `menu_items` would fetch a row per line
 * only to show a name that may since have changed. `menuItemId` is enough to
 * link with, which is all the dish itself is wanted for here.
 */
const CUSTOMER_ORDER_INCLUDE = {
  branch: { select: { id: true, name: true, restaurantId: true, restaurant: { select: { name: true } } } },
  payment: { select: { method: true, status: true } },
  reservation: { select: { table: { select: { tableNo: true } } } },
  items: {
    select: { menuItemId: true, nameSnapshot: true, qty: true, unitPriceAmd: true, lineTotalAmd: true },
  },
} satisfies Prisma.OrderInclude;

type CustomerOrderRow = Prisma.OrderGetPayload<{ include: typeof CUSTOMER_ORDER_INCLUDE }>;

function toCustomerOrder(row: CustomerOrderRow): AdminCustomerOrder {
  return {
    id: row.id,
    code: row.code,
    pickupCode: pickupCodeFrom(row.code),
    status: row.status as OrderStatus,
    serviceMode: row.serviceMode as ServiceMode,
    restaurantId: row.branch.restaurantId,
    restaurantName: row.branch.restaurant.name,
    branchId: row.branch.id,
    branchName: row.branch.name,
    itemsCount: row.items.reduce((sum, item) => sum + item.qty, 0),
    items: row.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.nameSnapshot,
      qty: item.qty,
      unitPriceAmd: item.unitPriceAmd,
      lineTotalAmd: item.lineTotalAmd,
    })),
    subtotalAmd: row.subtotalAmd,
    serviceFeeAmd: row.serviceFeeAmd,
    depositAmd: row.depositAmd,
    discountAmd: row.discountAmd,
    totalAmd: row.totalAmd,
    payment: row.payment
      ? { method: row.payment.method as PaymentMethod, status: row.payment.status as PaymentStatus }
      : null,
    tableNo: row.reservation?.table?.tableNo ?? null,
    notes: row.notes,
    readyAt: row.readyAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

type UserRow = Prisma.UserGetPayload<{ include: { _count: { select: { orders: true } } } }>;

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ? maskPhone(row.phone) : null,
    email: row.email,
    role: row.role as Role,
    isGuest: row.isGuest,
    phoneVerified: row.phoneVerified,
    ordersCount: row._count.orders,
    rewardPoints: row.rewardPoints,
    createdAt: row.createdAt.toISOString(),
  };
}
