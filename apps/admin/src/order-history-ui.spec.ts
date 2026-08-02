import { describe, expect, it } from 'vitest';
import {
  Language,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@amragrir/shared';
import { createTranslator } from './language';
import {
  actorHref,
  actorLine,
  actorSentence,
  detailLine,
  headline,
  impersonatorHref,
  noteLine,
} from './screens/Orders';
import type { OrderHistoryEntry } from './api';

/**
 * The sentences the History dialog builds out of one entry.
 *
 * Worth testing away from the dialog because they are where the panel decides
 * what an entry *means* — that a decline is a payment and not a status change,
 * that an actor with no name still gets named as somebody. The dialog around
 * them is a list and a fetch.
 */
const t = createTranslator(Language.En);

function entry(over: Partial<OrderHistoryEntry> = {}): OrderHistoryEntry {
  return {
    id: 'e1',
    type: OrderEventType.StatusChanged,
    fromStatus: OrderStatus.Paid,
    toStatus: OrderStatus.Confirmed,
    actor: {
      type: OrderActorType.Staff,
      name: 'Ani',
      email: 'ani@sunny.am',
      impersonatedBy: null,
      id: 'staff-1',
      impersonatedById: null,
    },
    detail: null,
    at: '2026-08-01T09:30:00.000Z',
    ...over,
  };
}

/** An account that can open both lists of people — a super admin. */
const ALL = { staff: true, customers: true };

describe('what an entry says happened', () => {
  it('names the status an order was moved to', () => {
    expect(headline(t, entry())).toBe('Moved to Confirmed');
  });

  it('translates the status here rather than showing the raw column value', () => {
    // The API answers in the caller's language, but this string has to match
    // the badge on the card and the tab above it, and those are translated in
    // the panel.
    expect(headline(t, entry({ toStatus: OrderStatus.AlmostReady }))).toBe('Moved to Almost ready');
  });

  it('calls a placement a placement', () => {
    expect(headline(t, entry({ type: OrderEventType.Created, fromStatus: null }))).toBe(
      'Order placed',
    );
  });

  it('reports a payment attempt that moved nothing', () => {
    const declined = entry({
      type: OrderEventType.Payment,
      fromStatus: null,
      toStatus: null,
      detail: { paymentStatus: PaymentStatus.Failed },
    });

    expect(headline(t, declined)).toBe('Payment Failed');
  });
});

describe('who did it', () => {
  it('marks a staff member as staff', () => {
    expect(actorLine(t, entry().actor)).toBe('Ani · staff');
  });

  it('marks a customer as a customer', () => {
    const actor = {
      type: OrderActorType.Customer,
      name: 'Aram',
      email: null,
      impersonatedBy: null,
      id: 'user-1',
      impersonatedById: null,
    };
    expect(actorLine(t, actor)).toBe('Aram · customer');
  });

  it('says so out loud when the account behind an entry is gone', () => {
    // The actor columns are ON DELETE SET NULL. An empty line here would read
    // as a rendering bug rather than as the answer it is.
    expect(actorLine(t, { ...entry().actor, name: null })).toBe('A staff account since removed');
  });

  it('names the system for what nobody did', () => {
    const actor = {
      type: OrderActorType.System,
      name: null,
      email: null,
      impersonatedBy: null,
      id: null,
      impersonatedById: null,
    };
    expect(actorLine(t, actor)).toBe('The system');
  });
});

describe('following a name to the person', () => {
  const customer = (over: Partial<OrderHistoryEntry['actor']> = {}) => ({
    type: OrderActorType.Customer,
    name: 'Aram',
    email: null,
    impersonatedBy: null,
    id: 'user-1',
    impersonatedById: null,
    ...over,
  });

  it('cuts the sentence around the name, so only the name is a link', () => {
    // The words either side describe the entry rather than the person.
    // Underlining them would offer to navigate from half a sentence.
    expect(actorSentence(t, entry().actor)).toEqual({
      before: '',
      name: 'Ani',
      after: ' · staff',
    });
  });

  it('leaves nothing to link when the sentence names nobody', () => {
    const gone = actorSentence(t, { ...entry().actor, name: null });

    expect(gone.name).toBeNull();
    expect(gone.before).toBe('A staff account since removed');
  });

  it('sends a staff name to the People screen, filtered to them', () => {
    expect(actorHref(entry().actor, ALL)).toBe('/people?person=staff-1');
  });

  it('sends a diner to the Customers screen, filtered to them', () => {
    expect(actorHref(customer(), ALL)).toBe('/customers?person=user-1');
  });

  it('offers no link to an account that cannot open that screen', () => {
    // A shift holds `orders:read` and neither of the others, so the dialog
    // reads for them exactly as it did before. A link that 403s on arrival is
    // worse than a name in plain text.
    expect(actorHref(entry().actor, { staff: false, customers: true })).toBeNull();
    expect(actorHref(customer(), { staff: true, customers: false })).toBeNull();
  });

  it('offers no link to somebody the entry could not name', () => {
    // Both halves of the same fact: the account is gone, so there is no name to
    // click and nowhere for it to lead.
    expect(actorHref({ ...entry().actor, name: null, id: null }, ALL)).toBeNull();
  });

  it('never links the system, which is not a person', () => {
    const system = {
      type: OrderActorType.System,
      name: null,
      email: null,
      impersonatedBy: null,
      id: null,
      impersonatedById: null,
    };

    expect(actorHref(system, ALL)).toBeNull();
  });

  it('links the impersonator to People, whoever they were acting as', () => {
    // The real human at the keyboard is always staff, even when the account
    // they were acting as belongs to somebody else entirely.
    const acted = {
      ...entry().actor,
      impersonatedBy: 'Narek',
      impersonatedById: 'super-1',
    };

    expect(impersonatorHref(acted, ALL)).toBe('/people?person=super-1');
  });

  it('has nowhere to send an ordinary session, which impersonates nobody', () => {
    expect(impersonatorHref(entry().actor, ALL)).toBeNull();
  });
});

describe('the second line', () => {
  it('is nothing at all when the entry carries no extras', () => {
    expect(detailLine(t, entry())).toBeNull();
  });

  it('counts the dishes on a placement', () => {
    const placed = entry({
      type: OrderEventType.Created,
      detail: { itemsCount: 3, totalAmd: 6160 },
    });

    expect(detailLine(t, placed)).toBe('3 dishes · 6 160 ֏');
  });

  it('says what the money did on a refund', () => {
    const cancelled = entry({
      toStatus: OrderStatus.Cancelled,
      detail: {
        paymentStatus: PaymentStatus.Refunded,
        paymentMethod: PaymentMethod.Card,
        amountAmd: 6160,
      },
    });

    expect(detailLine(t, cancelled)).toBe('Card · 6 160 ֏');
  });

  it('prefers the amount actually moved over the order total', () => {
    // A partial refund and a total are different numbers; showing both would
    // read as one of them being wrong.
    const both = entry({ detail: { amountAmd: 4000, totalAmd: 6160 } });
    expect(detailLine(t, both)).toBe('4 000 ֏');
  });
});

describe('how much of an entry was actually witnessed', () => {
  it('says nothing about an entry that was written as it happened', () => {
    expect(noteLine(t, entry())).toBeNull();
  });

  it('marks an entry the migration backfilled', () => {
    const placed = entry({ type: OrderEventType.Created, detail: { backfilled: true } });

    expect(noteLine(t, placed)).toBe(
      "Recorded before this order's history was kept — only its creation time is known.",
    );
  });

  it('marks an entry that was worked out from the order rather than recorded', () => {
    // The distinction is the whole point of the note: a reconstructed entry
    // knows the status and the time and does not know who, and a reader who
    // cannot tell it apart from a witnessed one is reading fiction.
    const inferred = entry({
      actor: {
        type: OrderActorType.System,
        name: null,
        email: null,
        impersonatedBy: null,
        id: null,
        impersonatedById: null,
      },
      fromStatus: null,
      detail: { reconstructed: true },
    });

    expect(noteLine(t, inferred)).toBe(
      'Reconstructed from the order itself — the status and the time are known, ' +
        'who made the change is not.',
    );
  });
});
