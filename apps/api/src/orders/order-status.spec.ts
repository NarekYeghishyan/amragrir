import {
  ACTIVE_ORDER_STATUSES,
  ORDER_STATUS_FLOW,
  OrderStatus,
  TERMINAL_ORDER_STATUSES,
  canTransitionOrder,
  isOrderCancellable,
} from '@amragrir/shared';

// The state machine lives in packages/shared so the API and the owner panel
// cannot drift apart on it (BUSINESS_LOGIC.md §4).

describe('canTransitionOrder', () => {
  it('walks the happy path from creation to completion', () => {
    const path = [
      OrderStatus.Created,
      OrderStatus.Paid,
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.AlmostReady,
      OrderStatus.Ready,
      OrderStatus.Completed,
    ];

    path.slice(0, -1).forEach((from, index) => {
      expect(canTransitionOrder(from, path[index + 1]!)).toBe(true);
    });
  });

  it('refuses to skip a step', () => {
    expect(canTransitionOrder(OrderStatus.Created, OrderStatus.Ready)).toBe(false);
    expect(canTransitionOrder(OrderStatus.Paid, OrderStatus.Preparing)).toBe(false);
  });

  it('lets a kitchen plate straight to ready', () => {
    // The one step in the machine that may be missed out. `almost_ready` warns
    // the counter that something is about to need handing over; a dish plated
    // in one motion never spends a moment there, and making the kitchen press
    // twice would only record a stage the food was never in.
    expect(canTransitionOrder(OrderStatus.Preparing, OrderStatus.Ready)).toBe(true);
    expect(ORDER_STATUS_FLOW[OrderStatus.Preparing]).toEqual([
      // The ordinary step first: the panel fills the first button and offers
      // the rest, so this order is what a kitchen's thumb lands on.
      OrderStatus.AlmostReady,
      OrderStatus.Ready,
    ]);
  });

  it('skips nothing else, and nothing before the food is cooking', () => {
    // Accepting an order, starting to cook it and handing it over are separate
    // moments with separate people behind them. Only the warning stage is
    // optional, and a second shortcut appearing anywhere fails here.
    const forks = Object.values(OrderStatus).filter(
      (status) =>
        ORDER_STATUS_FLOW[status].filter((next) => next !== OrderStatus.Cancelled).length > 1,
    );
    expect(forks).toEqual([OrderStatus.Preparing]);
  });

  it('refuses to move backwards', () => {
    expect(canTransitionOrder(OrderStatus.Ready, OrderStatus.Preparing)).toBe(false);
    expect(canTransitionOrder(OrderStatus.Paid, OrderStatus.Created)).toBe(false);
  });

  it('lets nothing leave a terminal status', () => {
    TERMINAL_ORDER_STATUSES.forEach((status) => {
      expect(ORDER_STATUS_FLOW[status]).toEqual([]);
    });
  });

  it('offers no way out of a paid order but forward', () => {
    // The rule this file exists to pin: once the money is taken the order runs
    // to completion. Nobody — customer or kitchen — can take it out of the
    // queue, so a change that quietly restores the edge fails here.
    expect(canTransitionOrder(OrderStatus.Paid, OrderStatus.Cancelled)).toBe(false);
    expect(canTransitionOrder(OrderStatus.Confirmed, OrderStatus.Cancelled)).toBe(false);
    expect(ORDER_STATUS_FLOW[OrderStatus.Paid]).toEqual([OrderStatus.Confirmed]);
  });
});

describe('isOrderCancellable', () => {
  it('allows cancelling only before the order has been paid for', () => {
    expect(isOrderCancellable(OrderStatus.Created)).toBe(true);
  });

  it('refuses once the money has been taken', () => {
    // An unpaid order is a basket somebody walked away from. A paid one has a
    // charge behind it, and this repo has no path that reverses one.
    expect(isOrderCancellable(OrderStatus.Paid)).toBe(false);
    expect(isOrderCancellable(OrderStatus.Confirmed)).toBe(false);
    expect(isOrderCancellable(OrderStatus.Preparing)).toBe(false);
    expect(isOrderCancellable(OrderStatus.AlmostReady)).toBe(false);
    expect(isOrderCancellable(OrderStatus.Ready)).toBe(false);
    expect(isOrderCancellable(OrderStatus.Completed)).toBe(false);
  });

  it('agrees with the flow table', () => {
    // A status is cancellable exactly when the machine allows the move.
    Object.values(OrderStatus).forEach((status) => {
      expect(isOrderCancellable(status)).toBe(
        canTransitionOrder(status, OrderStatus.Cancelled),
      );
    });
  });
});

describe('status buckets', () => {
  it('partition every status exactly once', () => {
    const all = Object.values(OrderStatus).sort();
    const bucketed = [...ACTIVE_ORDER_STATUSES, ...TERMINAL_ORDER_STATUSES].sort();
    expect(bucketed).toEqual(all);
  });
});
