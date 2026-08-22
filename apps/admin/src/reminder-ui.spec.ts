import { describe, expect, it } from 'vitest';
import {
  Language,
  OrderStatus,
  REMINDER_LEAD_MAX_MINUTES,
  REMINDER_LEAD_MIN_MINUTES,
  StaffNotificationType,
  defaultReminderLeadMin,
} from '@amragrir/shared';
import { createTranslator } from './language';
import {
  reminderFiresAt,
  reminderLabel,
  reminderLead,
  scheduleLine,
} from './order-reminder';
import {
  notificationDetail,
  notificationHeadline,
  notificationHref,
  unreadIds,
} from './notifications';
import { startsAt } from './screens/Orders';
import type { StaffNotification, StaffOrder } from './api';

/**
 * Pre-orders as the panel presents them.
 *
 * Pure functions only — the components around them are covered by the render
 * smoke test, which cannot run an effect and so cannot press anything. What is
 * worth pinning here is the arithmetic and the wording, both of which somebody
 * at a pass acts on: a preview that showed the wrong minute would be worse than
 * no preview at all.
 */

const t = createTranslator(Language.En);

/** Tomorrow at 13:00 Yerevan, prepped for thirty minutes and warned about at the
 *  default lead — the case the whole feature is written around. */
const READY_AT = '2026-08-06T09:00:00.000Z';

const order = (over: Partial<StaffOrder> = {}): StaffOrder => ({
  id: 'o1',
  code: 'AMR-48219031',
  status: OrderStatus.Confirmed,
  serviceMode: 'pickup',
  pickupOption: 'take_away',
  // A pickup order has no booking, which is what the API sends for one.
  booking: null,
  branch: { id: 'b1', name: 'Northern Ave' },
  customerName: 'Aram',
  itemsCount: 2,
  totalAmd: 8600,
  paymentStatus: null,
  readyAt: READY_AT,
  secondsLeft: null,
  scheduled: true,
  prepStartAt: '2026-08-06T08:30:00.000Z',
  prepMin: 30,
  reminderAt: '2026-08-06T08:20:00.000Z',
  reminderLeadMin: 40,
  createdAt: '2026-08-03T09:30:00.000Z',
  items: [{ menuItemId: 'd1', name: 'Khorovats', qty: 1, lineTotalAmd: 5800 }],
  notes: null,
  ...over,
});

describe('the notice a branch may type', () => {
  it('takes a whole number of minutes inside the bounds', () => {
    expect(reminderLead('45')).toBe(45);
    expect(reminderLead(' 45 ')).toBe(45);
    expect(reminderLead(String(REMINDER_LEAD_MIN_MINUTES))).toBe(REMINDER_LEAD_MIN_MINUTES);
    expect(reminderLead(String(REMINDER_LEAD_MAX_MINUTES))).toBe(REMINDER_LEAD_MAX_MINUTES);
  });

  it('refuses what the API would refuse, rather than letting it 422 at the pass', () => {
    expect(reminderLead(String(REMINDER_LEAD_MIN_MINUTES - 1))).toBeNull();
    expect(reminderLead(String(REMINDER_LEAD_MAX_MINUTES + 1))).toBeNull();
  });

  it('refuses what is not a number yet', () => {
    // A half-typed value is not a different number. `parseInt` would read "45
    // min" as 45 and "4.5" as 4, which is how a form comes to save something
    // nobody typed.
    for (const raw of ['', ' ', '4.5', '45 min', '-45', 'soon', '4e2']) {
      expect(reminderLead(raw)).toBeNull();
    }
  });
});

describe('when that notice would land', () => {
  it('counts back from when the food is due, not from when cooking starts', () => {
    // The whole contract. "Warn me 45 minutes before it is due" has to mean
    // 12:15 for a 13:00 order, whatever the kitchen's own estimate says.
    expect(reminderFiresAt(READY_AT, 45)).toBe('2026-08-06T08:15:00.000Z');
  });

  it('reproduces the default the order arrived with', () => {
    // The lead an order is created with is the prep estimate plus the buffer, so
    // an order nobody touches is warned about at exactly the moment it always
    // was — this is that arithmetic, from the other end.
    expect(reminderFiresAt(READY_AT, defaultReminderLeadMin(30))).toBe(
      order().reminderAt,
    );
  });
});

describe('what the card says about a pre-order', () => {
  it('names both the hour it is due and the hour it starts', () => {
    // Two different questions, and a card showing one of them invites the other
    // to be worked out wrong.
    const line = scheduleLine(t, order(), Language.En);

    expect(line).toContain('for ');
    expect(line).toContain('start ');
  });

  it('says nothing at all on an order wanted as soon as possible', () => {
    // It has a countdown instead, and the two together would be the same fact
    // stated twice.
    expect(scheduleLine(t, order({ scheduled: false }), Language.En)).toBeNull();
  });

  it('drops the start time rather than inventing one', () => {
    // Null on orders written before the column existed.
    const line = scheduleLine(t, order({ prepStartAt: null }), Language.En);

    expect(line).not.toBeNull();
    expect(line).not.toContain('start ');
  });

  it('puts the current notice on the button, so it reads without being pressed', () => {
    expect(reminderLabel(t, order())).toContain('40');
    expect(reminderLabel(t, order({ reminderLeadMin: null }))).toBe('Set a warning');
  });
});

describe('the queue’s order', () => {
  it('sorts by when the kitchen has to start', () => {
    const early = order({ prepStartAt: '2026-08-06T08:00:00.000Z' });
    const late = order({ prepStartAt: '2026-08-06T08:30:00.000Z' });

    expect(startsAt(early)).toBeLessThan(startsAt(late));
  });

  it('puts the rows that never recorded one last, not first', () => {
    // All of them are finished orders from before pre-ordering existed, and a
    // finished order has no claim on the front of a queue. The API sorts nulls
    // last for the same reason; this keeps the panel agreeing with it.
    expect(startsAt(order({ prepStartAt: null }))).toBe(Number.POSITIVE_INFINITY);
  });
});

const notification = (over: Partial<StaffNotification> = {}): StaffNotification => ({
  id: 'n1',
  type: StaffNotificationType.PrepDue,
  branchId: 'b1',
  orderId: 'o1',
  payload: {
    code: 'AMR-48219031',
    readyAt: READY_AT,
    prepStartAt: '2026-08-06T08:30:00.000Z',
    prepMin: 30,
    reminderLeadMin: 40,
    itemsCount: 2,
    needsConfirming: false,
  },
  createdAt: '2026-08-06T08:20:00.000Z',
  read: false,
  ...over,
});

describe('the bell', () => {
  it('names the order it is about', () => {
    // By its order code. It used to be the collection code, which is the one
    // thing a bell left open on a counter must not print.
    expect(notificationHeadline(t, notification())).toContain('AMR-48219031');
  });

  it('still says something when the row recorded no code', () => {
    // A blank line would read as a rendering bug. The payload is shaped per
    // kind and read only for display, so a field that is not there is a real
    // possibility rather than an impossible one.
    const bare = notification({ payload: null });

    expect(notificationHeadline(t, bare)).toBe('A booked order needs starting');
    expect(notificationDetail(t, bare, Language.En)).toBeNull();
  });

  it('lays out the numbers it does have, and skips the ones it does not', () => {
    const full = notificationDetail(t, notification(), Language.En);
    expect(full).toContain('for ');
    expect(full).toContain('start ');
    expect(full).toContain('2 dishes');

    const partial = notificationDetail(
      t,
      notification({ payload: { itemsCount: 1 } }),
      Language.En,
    );
    expect(partial).toBe('1 dish');
  });

  it('links to the order on the board by its code', () => {
    // By code rather than by id, because that is what the board's address takes:
    // it searches, then lands on whichever stage holds the order.
    const href = notificationHref(notification());

    expect(href).toContain('AMR-48219031');
    expect(href).toContain('b1');
  });

  it('links nowhere when the row names no order', () => {
    expect(notificationHref(notification({ payload: null }))).toBeNull();
  });

  it('marks read exactly what this reader has not seen', () => {
    // A branch's bell is read by people, one at a time — the first colleague to
    // open it must not clear it for the shift.
    const items = [notification(), notification({ id: 'n2', read: true })];

    expect(unreadIds(items)).toEqual(['n1']);
  });
});

describe('a table waiting to be accepted', () => {
  /**
   * The booking half of the same rule the placed-order row states: a branch is
   * interrupted for work with a person waiting on an answer.
   */

  const booking = (over: Partial<StaffNotification> = {}): StaffNotification => ({
    id: 'n9',
    type: StaffNotificationType.BookingPlaced,
    branchId: 'b1',
    orderId: null,
    payload: {
      reservationId: 'res-1',
      reservedFor: '2026-08-23T19:00:00.000Z',
      guests: 4,
      serviceDate: '2026-08-23',
    },
    createdAt: '2026-08-22T11:00:00.000Z',
    read: false,
    ...over,
  });

  it('names the party rather than a reference', () => {
    // A shift deciding whether to take a table is deciding about four people at
    // eight, not about an id it would have to look up.
    const headline = notificationHeadline(t, booking());

    expect(headline).toContain('4');
  });

  it('falls back to the nameless line when the row records no party', () => {
    const bare = booking({ payload: { reservationId: 'res-1' } });

    expect(notificationHeadline(t, bare)).toBe('A table is waiting to be accepted');
  });

  it('links to the book on the evening the table belongs to', () => {
    // The service date, not the calendar date of `reservedFor`: a table at 00:30
    // belongs to the night still going on, and the calendar date would open
    // tomorrow's empty page.
    const href = notificationHref(booking());

    expect(href).toContain('2026-08-23');
    expect(href).toContain('b1');
  });

  it('links nowhere when the row records no evening', () => {
    expect(notificationHref(booking({ payload: { reservationId: 'res-1' } }))).toBeNull();
  });

  it('says when the table is for', () => {
    const detail = notificationDetail(t, booking(), Language.En);

    expect(detail).not.toBeNull();
  });
});
