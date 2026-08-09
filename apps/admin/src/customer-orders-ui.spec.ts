import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ORDER_FILTER_STATUSES,
  CustomerOrderFilter,
  Language,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceMode,
  narrowsCustomerOrders,
} from '@amragrir/shared';
import { createTranslator } from './language';
import { billLines, orderHref, paymentLine, placeLine, statusTone } from './customer-orders';
import {
  NO_CUSTOMER_ORDER_FILTERS,
  hasCustomerOrderFilters,
  type AdminCustomerOrder,
} from './api';

/**
 * What the dialog behind a customer's order count builds out of one order.
 *
 * The dialog itself is a list and a fetch; these are where it decides what an
 * order *says* — that a deposit is credited rather than charged, that an order
 * with no payment row was never paid for, and where a row leads. Each of those
 * is a number or a link somebody will act on.
 */
const t = createTranslator(Language.En);

function order(over: Partial<AdminCustomerOrder> = {}): AdminCustomerOrder {
  return {
    id: 'order-1',
    code: 'AMR-12344821',
    status: OrderStatus.Completed,
    serviceMode: ServiceMode.Pickup,
    restaurantId: 'rest-1',
    restaurantName: 'Dolmama',
    branchId: 'branch-1',
    branchName: 'Northern Ave',
    itemsCount: 2,
    items: [
      {
        menuItemId: 'dish-1',
        name: 'Khorovats',
        qty: 2,
        unitPriceAmd: 2900,
        lineTotalAmd: 5800,
      },
    ],
    subtotalAmd: 5800,
    serviceFeeAmd: 360,
    depositAmd: 0,
    discountAmd: 0,
    totalAmd: 6160,
    payment: { method: PaymentMethod.Card, status: PaymentStatus.Captured },
    tableNo: null,
    notes: null,
    readyAt: '2026-07-20T18:30:00.000Z',
    createdAt: '2026-07-20T18:00:00.000Z',
    ...over,
  };
}

describe('whether the list is narrowed', () => {
  it('opens on the whole history, which is not a filter', () => {
    // What the dialog shows before anybody touches anything, and what Clear
    // returns to — so it must not read as narrowed, or a Clear button would sit
    // there permanently offering to undo nothing.
    expect(hasCustomerOrderFilters(NO_CUSTOMER_ORDER_FILTERS)).toBe(false);
  });

  it('counts a typed search as narrowing', () => {
    expect(hasCustomerOrderFilters({ ...NO_CUSTOMER_ORDER_FILTERS, q: '4821' })).toBe(true);
  });

  it('counts a chosen segment as narrowing', () => {
    // Including when the search box is empty: a list showing only cancellations
    // has to say so, or "3 orders" reads as the whole history.
    expect(
      hasCustomerOrderFilters({
        ...NO_CUSTOMER_ORDER_FILTERS,
        status: CustomerOrderFilter.Cancelled,
      }),
    ).toBe(true);
  });
});

describe('what each filter admits', () => {
  it('has no status list for the whole history', () => {
    // `all` narrows to nothing, so the service leaves the column out of the
    // query rather than writing an IN that can never exclude a row.
    expect(narrowsCustomerOrders(CustomerOrderFilter.All)).toBe(false);
  });

  it('keeps cancelled apart from completed', () => {
    // The two are one bucket in the customer app's active/past split. Here they
    // are separate because cancelled is the row an admin goes looking for.
    expect(CUSTOMER_ORDER_FILTER_STATUSES[CustomerOrderFilter.Cancelled]).toEqual([
      OrderStatus.Cancelled,
    ]);
    expect(CUSTOMER_ORDER_FILTER_STATUSES[CustomerOrderFilter.Completed]).toEqual([
      OrderStatus.Completed,
    ]);
  });

  it('puts every status in exactly one narrowing filter', () => {
    // Otherwise the three segment counts stop adding up to the fourth, and
    // nothing about that fails loudly — a status in two buckets is double
    // counted, one in none disappears.
    const buckets = Object.values(CustomerOrderFilter)
      .filter(narrowsCustomerOrders)
      .flatMap((filter) => [...CUSTOMER_ORDER_FILTER_STATUSES[filter]]);

    expect([...buckets].sort()).toEqual([...Object.values(OrderStatus)].sort());
  });
});

describe('where an order in the list leads', () => {
  it('opens the board on that branch, narrowed to the one order', () => {
    // The same address a line of somebody's activity links to: an order should
    // open in the same place from wherever the panel names it.
    expect(orderHref(order(), true)).toBe(
      '/orders?restaurant=rest-1&branch=branch-1&order=AMR-12344821',
    );
  });

  it('travels by code rather than by id', () => {
    // The board searches by code, and a code is what somebody reads off this
    // row and recognises on the card it lands on.
    expect(orderHref(order(), true)).toContain('order=AMR-12344821');
    expect(orderHref(order(), true)).not.toContain('order-1');
  });

  it('offers no link to an account that cannot open the board', () => {
    // A link to a tab the sidebar does not show is a dead end. The API refuses
    // it independently; this only avoids offering it.
    expect(orderHref(order(), false)).toBeNull();
  });
});

describe('where an order was bought', () => {
  it('names the restaurant and the branch', () => {
    expect(placeLine(order())).toBe('Dolmama · Northern Ave');
  });

  it('drops the dot for a branch with no name of its own', () => {
    // The common case here is a single-branch restaurant, and "Dolmama · " is
    // not a place.
    expect(placeLine(order({ branchName: null }))).toBe('Dolmama');
  });
});

describe('how an order was paid for', () => {
  it('says the method and what became of it', () => {
    // Either alone answers half: "Card" does not say whether it went through,
    // and "Captured" does not say what was captured.
    expect(paymentLine(t, order())).toBe('Card · Captured');
  });

  it('names a refund as a refund rather than as a payment', () => {
    const refunded = order({
      payment: { method: PaymentMethod.Card, status: PaymentStatus.Refunded },
    });
    expect(paymentLine(t, refunded)).toBe('Card · Refunded');
  });

  it('says an order was never paid for rather than leaving it blank', () => {
    // A basket abandoned at checkout is a real state, and a blank cell reads as
    // a rendering bug instead of as the answer it is.
    expect(paymentLine(t, order({ payment: null }))).toBe('unpaid');
  });
});

describe('the bill', () => {
  it('is the subtotal, the fee and the total when nothing else applies', () => {
    // Which is most orders. Four lines of `0 ֏` would hide the two numbers that
    // matter behind two that never move.
    expect(billLines(t, order()).map((line) => line.label)).toEqual([
      'Subtotal',
      'Service fee',
      'Total',
    ]);
  });

  it('shows a discount as the negative it is', () => {
    // The sign is the whole information in a column of amounts that otherwise
    // all add up.
    const discounted = billLines(t, order({ discountAmd: 500, totalAmd: 5660 }));
    expect(discounted.find((line) => line.label === 'Discount')?.amount).toBe('-500 ֏');
  });

  it('marks a deposit as credited rather than charged', () => {
    // It was taken at booking and is not added to the total. A line that looked
    // like a charge would make every dine-in bill read as wrong.
    const dineIn = billLines(t, order({ depositAmd: 2000, serviceMode: ServiceMode.DineIn }));
    expect(dineIn.some((line) => line.label === 'Deposit (credited)')).toBe(true);
  });

  it('ends on the total, and marks only that one', () => {
    const lines = billLines(t, order());
    const last = lines[lines.length - 1];

    expect(last?.label).toBe('Total');
    expect(last?.amount).toBe('6 160 ֏');
    expect(lines.filter((line) => line.strong === true)).toHaveLength(1);
  });
});

describe('the colour of a status', () => {
  it('reads as a gradient from just-in to done', () => {
    // The same mapping the board uses, so one order is not two colours on two
    // screens.
    expect(statusTone(OrderStatus.Created)).toBe('accent');
    expect(statusTone(OrderStatus.Preparing)).toBe('warn');
    expect(statusTone(OrderStatus.Completed)).toBe('good');
  });

  it('marks a cancelled order as the exception it is', () => {
    expect(statusTone(OrderStatus.Cancelled)).toBe('danger');
  });
});
