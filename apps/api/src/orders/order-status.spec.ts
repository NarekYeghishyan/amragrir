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

  it('refuses to move backwards', () => {
    expect(canTransitionOrder(OrderStatus.Ready, OrderStatus.Preparing)).toBe(false);
    expect(canTransitionOrder(OrderStatus.Paid, OrderStatus.Created)).toBe(false);
  });

  it('lets nothing leave a terminal status', () => {
    TERMINAL_ORDER_STATUSES.forEach((status) => {
      expect(ORDER_STATUS_FLOW[status]).toEqual([]);
    });
  });
});

describe('isOrderCancellable', () => {
  it('allows cancelling until the kitchen starts', () => {
    expect(isOrderCancellable(OrderStatus.Created)).toBe(true);
    expect(isOrderCancellable(OrderStatus.Paid)).toBe(true);
    expect(isOrderCancellable(OrderStatus.Confirmed)).toBe(true);
  });

  it('refuses once cooking has begun — the food is already spent', () => {
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
