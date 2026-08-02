import type { Prisma } from '@prisma/client';
import {
  OrderActorType,
  OrderEventType,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceMode,
} from '@amragrir/shared';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/**
 * An order's history, and who is in it.
 *
 * `orders.status` answers where an order is. It cannot answer when it got there
 * or who moved it, because an UPDATE overwrites the previous answer — so every
 * change writes a row here, in the same transaction as the change itself. A
 * history that is written afterwards is a history with gaps in it exactly when
 * something went wrong, which is when it is read.
 *
 * The actor is a union rather than one nullable id because the three are
 * genuinely different: a customer is a `users` row, a staff member a
 * `staff_users` row, and `system` is neither.
 */
export type OrderActor =
  | { type: typeof OrderActorType.Customer; userId: string }
  | {
      type: typeof OrderActorType.Staff;
      staffId: string;
      /** The real human, when `staffId` is an account being impersonated. */
      actingStaffId?: string;
    }
  | { type: typeof OrderActorType.System };

export function customerActor(userId: string): OrderActor {
  return { type: OrderActorType.Customer, userId };
}

/**
 * The staff member a token stands for — and, if it is an impersonation token,
 * who is really holding it.
 *
 * `sub` is the account being acted as, which is what every scope filter and
 * every guard already uses; recording it alone would put the innocent party's
 * name against the change. `act` is the difference between the two.
 */
export function staffActor(staff: StaffJwtPayload): OrderActor {
  return { type: OrderActorType.Staff, staffId: staff.sub, actingStaffId: staff.act };
}

export const SYSTEM_ACTOR: OrderActor = { type: OrderActorType.System };

/**
 * Whatever an entry needs beyond its statuses.
 *
 * Stored as JSON rather than columns: every field here is read for display
 * only, so adding one is not a migration, and most are set on one kind of entry
 * and meaningless on the rest.
 */
export interface OrderEventDetail {
  serviceMode?: ServiceMode;
  itemsCount?: number;
  totalAmd?: number;
  /** When the kitchen promised it, as of this entry. */
  readyAt?: string | null;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  amountAmd?: number;
  /** Set on the `created` entries the migration wrote for orders that predate
   *  this table — their creation time is real, the rest of their history is
   *  simply not recorded and the panel says so rather than implying it is. */
  backfilled?: boolean;
  /** Set on an entry inferred from the order row rather than recorded when it
   *  happened: the status and the time are the database's, the actor is
   *  genuinely unknown and is left as `system`. Marked so the panel can say
   *  which of its entries were witnessed and which were deduced — an audit
   *  trail that cannot tell the difference is not one. */
  reconstructed?: boolean;
}

export interface RecordedOrderEvent {
  type: OrderEventType;
  actor: OrderActor;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  detail?: OrderEventDetail;
}

/**
 * One event as Prisma write data, without the order it belongs to.
 *
 * Shaped this way so it serves both call styles: nested inside the order's own
 * INSERT (where naming the order would be a type error) and, with an `orderId`
 * spread in, inside the transaction that performs a status change.
 */
export function orderEventData(
  event: RecordedOrderEvent,
): Prisma.OrderEventUncheckedCreateWithoutOrderInput {
  const actor = event.actor;
  return {
    type: event.type,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus ?? null,
    actorType: actor.type,
    actorUserId: actor.type === OrderActorType.Customer ? actor.userId : null,
    actorStaffId: actor.type === OrderActorType.Staff ? actor.staffId : null,
    actingStaffId: actor.type === OrderActorType.Staff ? (actor.actingStaffId ?? null) : null,
    detail: event.detail === undefined ? undefined : (event.detail as Prisma.InputJsonValue),
  };
}

/** Who an entry names, resolved for display. */
export interface OrderHistoryActor {
  type: OrderActorType;
  /** Null for `system`, for a customer who never gave a name, and for an
   *  account that has since been deleted — the entry outlives the actor. */
  name: string | null;
  /** Staff only. A customer's contact details are not the kitchen's business,
   *  and the panel has a customer screen for the times they are. */
  email: string | null;
  /** The person actually at the keyboard, when the account above was being
   *  impersonated. Null in the ordinary case. */
  impersonatedBy: string | null;
  /**
   * Which row this actor is — a `users` id for a customer, a `staff_users` id
   * for staff, following `type`. Null for `system` and for an account since
   * deleted, the same cases `name` is null for.
   *
   * Here so a name in the timeline can be a link to the person rather than a
   * string somebody has to go and search for. It is an id and nothing else: the
   * screens it opens need `platform:users` and `staff:read`, neither of which
   * `orders:read` implies, so this is a destination rather than a disclosure —
   * whoever follows it is answered by those endpoints, on their own permissions.
   */
  id: string | null;
  /** The impersonator's `staff_users` id, paired with `impersonatedBy` the way
   *  `id` is paired with `name`. */
  impersonatedById: string | null;
}

export interface OrderHistoryEntry {
  id: string;
  type: OrderEventType;
  /** Null on `created` (nothing preceded it) and on `payment`, which records an
   *  attempt that moved the order nowhere. */
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actor: OrderHistoryActor;
  detail: OrderEventDetail | null;
  at: string;
}

/** The names an entry needs. Exported so the query and the mapper cannot drift
 *  into disagreeing about which relations are loaded. */
export const ORDER_EVENT_INCLUDE = {
  actorUser: { select: { name: true } },
  actorStaff: { select: { name: true, email: true } },
  actingStaff: { select: { name: true } },
} satisfies Prisma.OrderEventInclude;

export type OrderEventRow = Prisma.OrderEventGetPayload<{ include: typeof ORDER_EVENT_INCLUDE }>;

/**
 * Which row an entry's actor is, in whichever table that actor lives in.
 *
 * Chosen by the entry's own `actorType` rather than by taking whichever column
 * is not null: an entry has one kind of actor, and a `??` across the two would
 * quietly answer with the other table's id if a write ever set both — an id
 * that resolves to a real person who had nothing to do with the order.
 */
function actorId(row: OrderEventRow): string | null {
  switch (row.actorType as OrderActorType) {
    case OrderActorType.Customer:
      return row.actorUserId;
    case OrderActorType.Staff:
      return row.actorStaffId;
    default:
      return null;
  }
}

export function toHistoryEntry(row: OrderEventRow): OrderHistoryEntry {
  return {
    id: row.id,
    type: row.type as OrderEventType,
    fromStatus: row.fromStatus as OrderStatus | null,
    toStatus: row.toStatus as OrderStatus | null,
    actor: {
      type: row.actorType as OrderActorType,
      name: row.actorStaff?.name ?? row.actorUser?.name ?? null,
      email: row.actorStaff?.email ?? null,
      impersonatedBy: row.actingStaff?.name ?? null,
      id: actorId(row),
      impersonatedById: row.actingStaffId,
    },
    detail: (row.detail as OrderEventDetail | null) ?? null,
    at: row.createdAt.toISOString(),
  };
}
