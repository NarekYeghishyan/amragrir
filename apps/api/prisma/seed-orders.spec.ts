import {
  Language,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PaymentStatus,
  SERVICE_FEE_AMD,
  ServiceMode,
  canTransitionOrder,
} from '@amragrir/shared';
import {
  planBranchOrders,
  random,
  statusPath,
  type BranchOrderPlan,
  type PlannedOrder,
} from './seed-orders';

/**
 * The half of the order seed that decides things.
 *
 * Testable at all because it is pure: `planBranchOrders` takes ids and returns
 * data, and the writer below it has nothing left to choose. Worth testing
 * because seeded orders are what every screen and every manual check is looked
 * at through — a seed that quietly produces an order whose history contradicts
 * its status would send somebody hunting for a bug in the panel.
 */
const NOW = Date.parse('2026-08-01T12:00:00.000Z');

function plan(over: Partial<BranchOrderPlan> = {}): BranchOrderPlan {
  return {
    key: 'karas/Northern Ave#1',
    avgPrepMin: 12,
    menu: [
      { id: 'm1', nameI18n: { hy: 'Խորոված', en: 'Khorovats' }, priceAmd: 5400, prepMin: 18 },
      { id: 'm2', nameI18n: { hy: 'Լավաշ', en: 'Lavash' }, priceAmd: 700, prepMin: 2 },
      { id: 'm3', nameI18n: { hy: 'Թան', en: 'Tan' }, priceAmd: 900, prepMin: 1 },
    ],
    tables: [
      { id: 't1', seats: 4 },
      { id: 't2', seats: 2 },
    ],
    reservationsEnabled: true,
    customers: [
      { id: 'u1', language: Language.Hy },
      { id: 'u2', language: Language.En },
    ],
    staffIds: ['s1', 's2'],
    supervisorId: 'super',
    now: NOW,
    ...over,
  };
}

/** Every branch key, so a claim about "all seeded orders" is tested against
 *  more than one lucky draw. */
function everyOrder(): PlannedOrder[] {
  return Array.from({ length: 60 }, (_, index) =>
    planBranchOrders(plan({ key: `chain-${index}/branch#1` })),
  ).flat();
}

describe('planning a branch', () => {
  it('produces the same orders for the same key', () => {
    // The whole reason nothing here calls Math.random: a bug found on one
    // developer's seeded database has to be reproducible on another's.
    expect(planBranchOrders(plan())).toEqual(planBranchOrders(plan()));
  });

  it('produces different orders for different branches', () => {
    const one = planBranchOrders(plan({ key: 'a/branch#1' }));
    const two = planBranchOrders(plan({ key: 'b/branch#1' }));

    expect(one.map((order) => order.code)).not.toEqual(two.map((order) => order.code));
  });

  it('always leaves something on the board and something in the kitchen', () => {
    // A branch whose orders are all finished proves nothing about the queue,
    // and that is the screen the seed exists to fill.
    for (let index = 0; index < 40; index += 1) {
      const orders = planBranchOrders(plan({ key: `branch-${index}` }));
      const statuses = orders.map((order) => order.status);

      expect(statuses).toEqual(
        expect.arrayContaining([expect.stringMatching(/created|paid|confirmed/)]),
      );
      expect(statuses).toEqual(
        expect.arrayContaining([expect.stringMatching(/preparing|almost_ready|ready/)]),
      );
    }
  });

  it('seeds nothing for a branch with no menu to order from', () => {
    expect(planBranchOrders(plan({ menu: [] }))).toEqual([]);
  });

  it('seeds nothing when there is nobody to have placed an order', () => {
    expect(planBranchOrders(plan({ customers: [] }))).toEqual([]);
  });
});

describe('the history each order carries', () => {
  it('ends where the order actually is', () => {
    for (const order of everyOrder()) {
      // The last entry that moved anything — a decline is allowed to be the
      // most recent thing that happened, and it moved the order nowhere.
      const moves = order.events.filter((event) => event.toStatus !== null);
      expect(moves[moves.length - 1]?.toStatus).toBe(order.status);
    }
  });

  it('only records moves the state machine allows', () => {
    for (const order of everyOrder()) {
      for (const event of order.events) {
        if (event.type !== OrderEventType.StatusChanged) {
          continue;
        }
        expect(canTransitionOrder(event.fromStatus as OrderStatus, event.toStatus as OrderStatus)).toBe(
          true,
        );
      }
    }
  });

  it('opens with the order being placed', () => {
    for (const order of everyOrder()) {
      expect(order.events[0]?.type).toBe(OrderEventType.Created);
      expect(order.events[0]?.at).toEqual(order.createdAt);
      expect(order.events[0]?.actor).toEqual({
        type: OrderActorType.Customer,
        userId: order.userId,
      });
    }
  });

  it('runs forwards in time and never past the present', () => {
    for (const order of everyOrder()) {
      const times = order.events.map((event) => event.at.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(Math.max(...times)).toBeLessThanOrEqual(NOW);
    }
  });

  it('dates the order by its last entry rather than by now', () => {
    // Otherwise every order in the database would look as though it had just
    // been touched, and `updated_at` is what the reconstruction pass reads.
    for (const order of everyOrder()) {
      expect(order.updatedAt).toEqual(order.events[order.events.length - 1]?.at);
    }
  });

  it('credits paying to the customer and cooking to the branch', () => {
    for (const order of everyOrder()) {
      for (const event of order.events) {
        if (event.toStatus === OrderStatus.Paid) {
          expect(event.actor.type).toBe(OrderActorType.Customer);
        }
        if (event.toStatus === OrderStatus.Preparing) {
          expect(event.actor.type).toBe(OrderActorType.Staff);
        }
      }
    }
  });

  it('names the system rather than a stranger when a branch has no staff', () => {
    const orders = planBranchOrders(plan({ staffIds: [] }));
    const moves = orders
      .flatMap((order) => order.events)
      .filter((event) => event.toStatus === OrderStatus.Preparing);

    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.actor.type).toBe(OrderActorType.System);
    }
  });
});

describe('the money', () => {
  it('is the subtotal plus one service fee', () => {
    for (const order of everyOrder()) {
      expect(order.serviceFeeAmd).toBe(SERVICE_FEE_AMD);
      expect(order.totalAmd).toBe(order.subtotalAmd + SERVICE_FEE_AMD);
    }
  });

  it('never adds a table deposit to the bill', () => {
    // A deposit is credited against the total, not charged on top of it
    // (BUSINESS_LOGIC.md §3) — the seed must not imply otherwise.
    const seated = everyOrder().filter((order) => order.reservation !== null);

    expect(seated.length).toBeGreaterThan(0);
    for (const order of seated) {
      expect(order.depositAmd).toBeGreaterThan(0);
      expect(order.totalAmd).toBe(order.subtotalAmd + SERVICE_FEE_AMD);
    }
  });

  it('leaves an unpaid order without a captured payment', () => {
    for (const order of everyOrder()) {
      if (order.status !== OrderStatus.Created) {
        continue;
      }
      expect(order.payment?.status ?? PaymentStatus.Failed).not.toBe(PaymentStatus.Captured);
    }
  });

  it('never cancels an order that was paid for', () => {
    // The seed's histories have to be ones the API could produce. Paying
    // commits an order (BUSINESS_LOGIC.md §4), so a cancelled order in this
    // data must never have reached `paid` — and must carry no money either.
    const cancelled = everyOrder().filter((order) => order.status === OrderStatus.Cancelled);

    expect(cancelled.length).toBeGreaterThan(0);
    for (const order of cancelled) {
      expect(order.events.some((event) => event.toStatus === OrderStatus.Paid)).toBe(false);
      expect(order.payment?.status ?? PaymentStatus.Failed).not.toBe(PaymentStatus.Captured);
    }
  });

  it('records a decline as an attempt that moved nothing', () => {
    const declines = everyOrder()
      .flatMap((order) => order.events)
      .filter((event) => event.type === OrderEventType.Payment);

    expect(declines.length).toBeGreaterThan(0);
    for (const decline of declines) {
      expect(decline.fromStatus).toBeNull();
      expect(decline.toStatus).toBeNull();
      expect(decline.detail?.paymentStatus).toBe(PaymentStatus.Failed);
    }
  });
});

describe('dine-in', () => {
  it('never books a table at a restaurant that does not take bookings', () => {
    const orders = Array.from({ length: 20 }, (_, index) =>
      planBranchOrders(plan({ key: `pickup-${index}`, reservationsEnabled: false })),
    ).flat();

    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(order.reservation).toBeNull();
      expect(order.serviceMode).toBe(ServiceMode.Pickup);
    }
  });

  it('holds the table only while the booking is live', () => {
    // `active_slot` mirrors `reserved_for` while a booking holds its table and
    // is NULL once it does not — that is what makes cancelling free the slot
    // instead of blocking it forever.
    for (const order of everyOrder()) {
      const booking = order.reservation;
      if (booking === null) {
        continue;
      }
      if (order.status === OrderStatus.Completed || order.status === OrderStatus.Cancelled) {
        expect(booking.activeSlot).toBeNull();
      } else {
        expect(booking.activeSlot).toEqual(booking.reservedFor);
      }
    }
  });

  it('does not double-book one table for one slot', () => {
    for (let index = 0; index < 40; index += 1) {
      const held = planBranchOrders(plan({ key: `busy-${index}`, tables: [{ id: 't1', seats: 4 }] }))
        .map((order) => order.reservation)
        .filter((booking) => booking?.activeSlot != null)
        .map((booking) => `${booking?.tableId}|${booking?.activeSlot?.toISOString()}`);

      expect(new Set(held).size).toBe(held.length);
    }
  });
});

describe('order codes', () => {
  it('are the format the column and the counter both expect', () => {
    for (const order of everyOrder()) {
      expect(order.code).toMatch(/^AMR-\d{8}$/);
    }
  });

  it('do not repeat a pickup code across the orders a branch is working on', () => {
    // Only the last four digits are called out at the counter, and two live
    // orders answering to "4821" is a queue nobody can run.
    for (let index = 0; index < 40; index += 1) {
      const live = planBranchOrders(plan({ key: `counter-${index}` }))
        .filter(
          (order) =>
            order.status !== OrderStatus.Completed && order.status !== OrderStatus.Cancelled,
        )
        .map((order) => order.code.slice(-4));

      expect(new Set(live).size).toBe(live.length);
    }
  });
});

describe('the path to a status', () => {
  it('walks the whole ladder to a completed order', () => {
    expect(statusPath(OrderStatus.Completed)).toEqual([
      OrderStatus.Created,
      OrderStatus.Paid,
      OrderStatus.Confirmed,
      OrderStatus.Preparing,
      OrderStatus.AlmostReady,
      OrderStatus.Ready,
      OrderStatus.Completed,
    ]);
  });

  it('leaves the ladder before the money when an order is cancelled', () => {
    // Cancellation is only legal while an order is unpaid
    // (BUSINESS_LOGIC.md §4), so no seeded order may claim to have been called
    // off after it was charged for — the demo would then be showing a history
    // the API can no longer produce.
    expect(statusPath(OrderStatus.Cancelled)).toEqual([
      OrderStatus.Created,
      OrderStatus.Cancelled,
    ]);
  });
});
