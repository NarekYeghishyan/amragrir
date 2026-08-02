import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@amragrir/shared';
import { nextStatuses } from './screens/Orders';

/**
 * The buttons on an order card.
 *
 * Derived from the shared flow table rather than written out on the card, so
 * the board can never offer a move the API answers with a 422. These tests hold
 * the derivation to what a kitchen should actually be shown — the two are not
 * the same statement, and this is where they meet.
 */
describe('the moves a card offers', () => {
  it('offers only the next step from confirmed', () => {
    expect(nextStatuses(OrderStatus.Confirmed)).toEqual([OrderStatus.Preparing]);
  });

  it('offers cancel only while the order is unpaid', () => {
    // The board can call off an order nobody has paid for; once the money is
    // taken there is no way out of the queue, so no card offers one.
    expect(nextStatuses(OrderStatus.Created)).toEqual([OrderStatus.Cancelled]);
    expect(nextStatuses(OrderStatus.Paid)).toEqual([OrderStatus.Confirmed]);
  });

  it('never offers paid — only a payment makes an order paid', () => {
    expect(nextStatuses(OrderStatus.Created)).not.toContain(OrderStatus.Paid);
  });

  it('offers nothing on a finished order', () => {
    expect(nextStatuses(OrderStatus.Completed)).toEqual([]);
    expect(nextStatuses(OrderStatus.Cancelled)).toEqual([]);
  });

  it('lets a cooking order go to the pass in one press', () => {
    // Two buttons, and the order of them is the point: *Almost ready* is the
    // ordinary step and gets the filled button, *Ready* is the way past it for
    // a dish plated in one motion. Reversed, the card would put the shortcut
    // under the thumb that reaches for the obvious move.
    expect(nextStatuses(OrderStatus.Preparing)).toEqual([
      OrderStatus.AlmostReady,
      OrderStatus.Ready,
    ]);
  });

  it('offers no shortcut anywhere else', () => {
    // The skip exists because `almost_ready` is a warning rather than work.
    // Every other stage is a thing that has to happen, so exactly one card in
    // the flow may show a second move — a table that grew another one is a
    // decision, not a detail, and it fails here first.
    const skips = Object.values(OrderStatus).filter(
      (status) => nextStatuses(status).length > 1,
    );
    expect(skips).toEqual([OrderStatus.Preparing]);
  });
});
