import { describe, expect, it } from 'vitest';
import { Language, ORDER_STATUS_FLOW, OrderStatus } from '@amragrir/shared';
import { formatAmd, formatCountdown, formatStatus, formatWaiting, pickLabel } from './format';

describe('formatAmd', () => {
  it('groups thousands with a space, like the design', () => {
    expect(formatAmd(5800)).toBe('5 800 ֏');
    expect(formatAmd(360)).toBe('360 ֏');
  });
});

describe('formatCountdown', () => {
  it('renders mm:ss and never goes negative', () => {
    expect(formatCountdown(480)).toBe('8:00');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('is null when there is nothing to count', () => {
    expect(formatCountdown(null)).toBeNull();
  });
});

describe('formatWaiting', () => {
  it('is what a kitchen actually reads off the card', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatWaiting(tenMinutesAgo)).toBe('10 min ago');
  });

  it('switches to hours past sixty minutes', () => {
    const longAgo = new Date(Date.now() - 95 * 60_000).toISOString();
    expect(formatWaiting(longAgo)).toBe('1 h 35 min ago');
  });

  it('never shows a negative wait for a clock slightly ahead', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    expect(formatWaiting(future)).toBe('0 min ago');
  });
});

describe('pickLabel', () => {
  it('falls back through hy to anything populated', () => {
    // The owner endpoints return every language because they are editable, so
    // the panel picks one to display using the API's own fallback order.
    expect(pickLabel({ hy: 'Բուրգեր', en: 'Burger' }, Language.En)).toBe('Burger');
    expect(pickLabel({ hy: 'Բուրգեր' }, Language.Ru)).toBe('Բուրգեր');
    expect(pickLabel({ en: 'Burger' }, Language.Ru)).toBe('Burger');
    expect(pickLabel(null)).toBe('');
  });
});

describe('status buttons', () => {
  // The board derives its buttons from the shared flow table, so it can never
  // offer a move the API would reject with a 422.
  const buttons = (status: OrderStatus) =>
    ORDER_STATUS_FLOW[status].filter((next) => next !== OrderStatus.Paid);

  it('offers preparing and cancel from confirmed', () => {
    expect(buttons(OrderStatus.Confirmed)).toEqual([OrderStatus.Preparing, OrderStatus.Cancelled]);
  });

  it('drops cancel once the kitchen has started', () => {
    expect(buttons(OrderStatus.Preparing)).toEqual([OrderStatus.AlmostReady]);
  });

  it('never offers paid — only a payment makes an order paid', () => {
    expect(buttons(OrderStatus.Created)).not.toContain(OrderStatus.Paid);
  });

  it('offers nothing on a finished order', () => {
    expect(buttons(OrderStatus.Completed)).toEqual([]);
    expect(buttons(OrderStatus.Cancelled)).toEqual([]);
  });
});

describe('formatStatus', () => {
  it('turns a status value into a label', () => {
    expect(formatStatus('almost_ready')).toBe('Almost ready');
  });
});
