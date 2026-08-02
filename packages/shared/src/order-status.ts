// The order state machine — see docs/BUSINESS_LOGIC.md §4.
//
// It lives in `shared` rather than in the API because more than one place has
// to agree on it: the API rejects an illegal move, and the owner panel decides
// which buttons to render from the same table. Two copies would drift.

import { OrderStatus } from './enums';

/**
 * Every status an order may move to from a given status.
 *
 * **The first entry is the ordinary next step**, and anything after it is a way
 * past that step. The order is part of the table rather than incidental: the
 * panel renders one button per entry and fills only the first, so a kitchen can
 * press the obvious one without reading the row.
 *
 * **Cancellation stops at the payment.** `created` is the only status with an
 * edge to `cancelled`: an unpaid order is a basket somebody walked away from,
 * and dropping it costs nobody anything. Once the money is taken the order runs
 * forward to `completed` and nowhere else — there is no path back out, for the
 * customer or for the restaurant.
 *
 * **`preparing` has a second way out, straight to `ready`.** `almost_ready` is
 * a warning to whoever works the counter, not a stage of cooking, and plenty of
 * dishes are plated in one motion and never spend a moment in it. Without this
 * edge, marking one of those done means pressing twice and leaving behind a
 * record of a stage the food was never in. The machine admits the move instead,
 * which keeps the timeline true and the panel honest — every button it shows is
 * still exactly a move the API would accept.
 */
export const ORDER_STATUS_FLOW: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.Created]: [OrderStatus.Paid, OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Confirmed],
  [OrderStatus.Confirmed]: [OrderStatus.Preparing],
  [OrderStatus.Preparing]: [OrderStatus.AlmostReady, OrderStatus.Ready],
  [OrderStatus.AlmostReady]: [OrderStatus.Ready],
  [OrderStatus.Ready]: [OrderStatus.Completed],
  [OrderStatus.Completed]: [],
  [OrderStatus.Cancelled]: [],
} as const;

/**
 * Statuses an order may still be cancelled from — only `created`, which is
 * before it has been paid for.
 *
 * Derived from nothing: it is the same rule the flow above states, written once
 * more because the customer's cancel button asks the question directly. The
 * test in `order-status.spec.ts` holds the two to each other, so they cannot
 * come to disagree.
 */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [OrderStatus.Created];

/** Statuses that count as "in progress" for the orders list and tracking. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Created,
  OrderStatus.Paid,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
];

/** Statuses an order can no longer move out of. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Completed,
  OrderStatus.Cancelled,
];

/**
 * The stages of the kitchen queue.
 *
 * **One stage per status now, in the order an order moves through them.** They
 * used to be coarser than the state machine — a single "new" covering
 * everything that had arrived but not been started — on the argument that it
 * was one decision to a kitchen rather than three. It is not: accepting an
 * order, starting to cook it and plating it are three different people's
 * moments, and a tab that mixed them could not tell you how many of each were
 * waiting. The board is the state machine, and every count on it is a number
 * somebody can act on.
 *
 * Two exceptions, both deliberate. `past` folds `completed` and `cancelled`
 * together, because neither is work and nobody sorts finished orders by how
 * they finished. And `active` spans everything still in flight — it is what the
 * API answers with when a caller names no stage, and no tab on the board offers
 * it.
 *
 * `unpaid` is the odd one: it is the only stage that is not a step in the flow
 * at all. It sits beside `paid` because that is the question it answers — the
 * money either arrived or it did not.
 *
 * Here rather than in the panel because the **API** filters by these now. It
 * used to send back an active/past split and let the panel narrow further over
 * whatever rows happened to be on the page, which is only correct while every
 * order fits in one page. Two copies of this table would drift, and the symptom
 * would be a tab whose count disagrees with the list under it.
 */
export const QueueFilter = {
  /** The live board: everything the kitchen still has to do. The API's default,
   *  and the only stage that still admits an unpaid `created` order. */
  Active: 'active',
  /**
   * Paid for, and waiting for the restaurant to accept it.
   *
   * The first stage on the board and the one it opens on, because it is the
   * only one whose next move is nobody's but the restaurant's — the money is
   * already taken, and until somebody confirms, a diner is watching a timer
   * that has not started.
   */
  Paid: 'paid',
  /**
   * Placed, and never paid for — the `created` status.
   *
   * `POST /orders` writes the row and `POST /payments` is what moves it to
   * `paid`, so an abandoned basket and a declined card both leave one of these
   * behind, and **nothing expires them**: the API has no scheduled job of any
   * kind. Since every order is paid for online (BUSINESS_LOGIC.md §5) this is
   * not work a kitchen does, which is why it hangs off `paid` rather than
   * taking a place in the flow — the two together are "did the money arrive".
   *
   * Named for what it means rather than for the status behind it. A kitchen
   * asks "which of these were never paid for", not "which are in `created`".
   */
  Unpaid: 'unpaid',
  /** Accepted by the restaurant, not yet being cooked. */
  Confirmed: 'confirmed',
  /** In the kitchen. */
  Preparing: 'preparing',
  /**
   * Nearly plated — the warning a counter needs before it has to hand
   * something over, which is why it is worth its own stage rather than the
   * tail end of `preparing`.
   *
   * The one stage an order can miss out: a dish plated in one motion goes from
   * `preparing` straight to `ready` (see `ORDER_STATUS_FLOW`), so this tab
   * holds the orders somebody deliberately flagged rather than everything on
   * its way to the pass.
   */
  AlmostReady: 'almost_ready',
  /** Waiting to be collected. */
  Ready: 'ready',
  /** Finished or cancelled — the only way to reach an order that is over. */
  Past: 'past',
} as const;
export type QueueFilter = (typeof QueueFilter)[keyof typeof QueueFilter];

export const QUEUE_FILTER_STATUSES: Readonly<Record<QueueFilter, readonly OrderStatus[]>> = {
  [QueueFilter.Active]: ACTIVE_ORDER_STATUSES,
  [QueueFilter.Paid]: [OrderStatus.Paid],
  [QueueFilter.Unpaid]: [OrderStatus.Created],
  [QueueFilter.Confirmed]: [OrderStatus.Confirmed],
  [QueueFilter.Preparing]: [OrderStatus.Preparing],
  [QueueFilter.AlmostReady]: [OrderStatus.AlmostReady],
  [QueueFilter.Ready]: [OrderStatus.Ready],
  [QueueFilter.Past]: TERMINAL_ORDER_STATUSES,
} as const;

export function isInQueueFilter(status: OrderStatus, filter: QueueFilter): boolean {
  return QUEUE_FILTER_STATUSES[filter].includes(status);
}

/**
 * How one diner's own order history is narrowed, in the back office.
 *
 * Deliberately **not** `QueueFilter`. That is a kitchen's vocabulary: "new",
 * "preparing" and "ready" are stages of work still to be done, and they answer
 * "what do I cook next". A customer's history is a record of what already
 * happened, read by somebody on a support call, and three of those five stages
 * would be filters that match nothing for all but the last hour of a diner's
 * life.
 *
 * And not the customer app's `active`/`past` split either, because that folds
 * cancellations in with completions. Cancelled is the single most looked-for
 * row here — it is what sits behind "I was charged and never got it" — so it
 * gets a filter of its own rather than being one twelfth of "past".
 *
 * Here rather than in the panel for the same reason `QueueFilter` is: the
 * **API** filters by these, and the panel renders a segment per value with the
 * API's own count on it. Two copies would drift, and the symptom would be a tab
 * whose count disagrees with the list under it.
 */
export const CustomerOrderFilter = {
  /** Everything they have ever ordered. */
  All: 'all',
  /** Still in progress — placed, paid, cooking, or waiting to be collected. */
  Active: 'active',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type CustomerOrderFilter =
  (typeof CustomerOrderFilter)[keyof typeof CustomerOrderFilter];

/** Every filter but `all`, which is what "narrow by status" cannot mean. */
export type NarrowedCustomerOrderFilter = Exclude<
  CustomerOrderFilter,
  typeof CustomerOrderFilter.All
>;

/**
 * Which statuses each filter admits.
 *
 * `all` is absent on purpose, and the type says so: it narrows to nothing, so
 * the service leaves the status column out of the query entirely rather than
 * writing an `IN` over all eight values that can never exclude a row.
 */
export const CUSTOMER_ORDER_FILTER_STATUSES: Readonly<
  Record<NarrowedCustomerOrderFilter, readonly OrderStatus[]>
> = {
  [CustomerOrderFilter.Active]: ACTIVE_ORDER_STATUSES,
  [CustomerOrderFilter.Completed]: [OrderStatus.Completed],
  [CustomerOrderFilter.Cancelled]: [OrderStatus.Cancelled],
} as const;

/** True when the filter actually narrows — false for `all`, which is the whole
 *  history and therefore not a filter at all. */
export function narrowsCustomerOrders(
  filter: CustomerOrderFilter,
): filter is NarrowedCustomerOrderFilter {
  return filter !== CustomerOrderFilter.All;
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from].includes(to);
}

export function isOrderCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_ORDER_STATUSES.includes(status);
}
