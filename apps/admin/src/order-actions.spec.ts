import { describe, expect, it } from 'vitest';
import { HANDOVER_CODE_MISMATCH, OrderStatus } from '@amragrir/shared';
import { ApiError, isWrongPickupCode } from './api';
import { handoverCode } from './order-handover';
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

  it('still reaches completed — the handover dialog is what it opens', () => {
    // The card renders this one as `OrderHandoverDialog` rather than a plain
    // button, so it must stay in the list: dropping it would remove the only
    // way to close an order.
    expect(nextStatuses(OrderStatus.Ready)).toEqual([OrderStatus.Completed]);
  });
});

/**
 * The code the counter types.
 *
 * Shape only — whether the digits are *this* order's is the API's answer, and
 * the panel has nothing to check it against on purpose.
 */
describe('the code typed at the counter', () => {
  it('takes six digits', () => {
    expect(handoverCode('730914')).toBe('730914');
  });

  it('keeps a leading zero, which is part of the code and not a number', () => {
    expect(handoverCode('042195')).toBe('042195');
  });

  it('forgives the space a scanner or a thumb leaves behind', () => {
    expect(handoverCode(' 730914 ')).toBe('730914');
  });

  it('refuses anything that is not six digits', () => {
    // Half-typed, over-typed, and the tail of an order code — which is what a
    // pickup code used to be, and is the mistake somebody will make first.
    expect(handoverCode('73091')).toBeNull();
    expect(handoverCode('7309145')).toBeNull();
    expect(handoverCode('4821')).toBeNull();
    expect(handoverCode('AMR-24919119')).toBeNull();
    expect(handoverCode('')).toBeNull();
  });
});

describe('a refused handover', () => {
  const failure = (details: unknown) =>
    new ApiError(422, 'BUSINESS_RULE', 'The pickup code does not match this order', details);

  it('is recognised by its reason, so the panel can word it itself', () => {
    expect(isWrongPickupCode(failure({ reason: HANDOVER_CODE_MISMATCH }))).toBe(true);
  });

  it('is not confused with the other 422 that endpoint can give', () => {
    // "That order is not ready yet" is a different problem with a different
    // thing to do about it, and it is shown as the API worded it.
    expect(isWrongPickupCode(failure(undefined))).toBe(false);
    expect(isWrongPickupCode(failure({ reason: 'something_else' }))).toBe(false);
    expect(isWrongPickupCode(new Error('offline'))).toBe(false);
  });
});
