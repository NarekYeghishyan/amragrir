import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@amragrir/shared';
import { dictionaries } from '@amragrir/i18n';
import {
  BELL_POLL_MS,
  ORDER_STATUS_COPY,
  orderCopy,
  sameBell,
  stopWatchingOn,
  toBell,
  toItem,
  withoutItem,
} from './notification-watch';
import { ORDER_POLL_MS } from './order-watch';
import { notificationsApiPath, notificationsStreamPath } from './site';
import type { Bell, NotificationItem } from './notifications';

const orderLine = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'n1',
  type: 'order',
  title: null,
  body: null,
  payload: { orderId: 'order-1', code: 'AMR-12344821', status: OrderStatus.Ready },
  isRead: false,
  createdAt: '2026-08-09T09:00:00.000Z',
  ...over,
});

describe('toBell', () => {
  it('takes an answer from the bell route', () => {
    const bell: Bell = { items: [orderLine()], unread: 1 };
    expect(toBell({ ...bell })).toEqual(bell);
  });

  it('takes an empty bell — nobody has been told anything yet', () => {
    expect(toBell({ items: [], unread: 0 })).toEqual({ items: [], unread: 0 });
  });

  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['a count that is not a number', { items: [], unread: '3' }],
    ['items that are not a list', { items: {}, unread: 0 }],
  ])('refuses %s, so the badge keeps the last number it was sure of', (_case, value) => {
    expect(toBell(value)).toBeNull();
  });

  it('drops a line with no id rather than the whole answer', () => {
    // One malformed row should cost that row, not the bell: the rest of the
    // list is still true and still worth showing.
    const result = toBell({ items: [orderLine(), { nonsense: true }], unread: 1 });
    expect(result?.items).toHaveLength(1);
  });
});

describe('toItem', () => {
  it('takes a pushed notification', () => {
    expect(toItem({ ...orderLine() })).toEqual(orderLine());
  });

  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['no id', { type: 'order' }],
    ['no type', { id: 'n1' }],
  ])('refuses %s', (_case, value) => {
    // A pushed item is *added* to the list rather than replacing it, so a
    // malformed one would sit at the top of the bell until the next reload.
    expect(toItem(value)).toBeNull();
  });
});

describe('orderCopy', () => {
  it('names the keys the tracking screen already uses', () => {
    expect(orderCopy(orderLine())).toEqual({ title: 'statusReady', body: 'statusReadyDesc' });
  });

  it('has a pair for every status, in every language', () => {
    // The whole reason the API stores no sentence: if a key were missing the
    // bell would render its own key at somebody, in one language only.
    for (const [status, keys] of Object.entries(ORDER_STATUS_COPY)) {
      expect(Object.values(OrderStatus)).toContain(status);
      for (const dictionary of Object.values(dictionaries)) {
        expect(dictionary[keys.title]).toBeTruthy();
        expect(dictionary[keys.body]).toBeTruthy();
      }
    }
  });

  it('covers all eight statuses, so a ninth cannot be forgotten', () => {
    expect(Object.keys(ORDER_STATUS_COPY).sort()).toEqual([...Object.values(OrderStatus)].sort());
  });

  it('declines a kind this app cannot draw, so the API copy is used instead', () => {
    // A promo carries prose and no status; insisting on rendering it from a
    // status would mean inventing one.
    expect(orderCopy(orderLine({ type: 'promo', payload: null, title: 'Half price' }))).toBeNull();
  });

  it('declines an order line with no status on it', () => {
    expect(orderCopy(orderLine({ payload: { orderId: 'order-1' } }))).toBeNull();
  });
});

describe('withoutItem', () => {
  const read = orderLine({ id: 'read', isRead: true });
  const unread = orderLine({ id: 'unread', isRead: false });

  it('takes the line out', () => {
    const result = withoutItem({ items: [read, unread], unread: 1 }, 'read');
    expect(result.items.map((item) => item.id)).toEqual(['unread']);
  });

  it('drops the badge when the line that went was unread', () => {
    expect(withoutItem({ items: [read, unread], unread: 1 }, 'unread').unread).toBe(0);
  });

  it('leaves the badge alone when the line was already read', () => {
    // The badge counts unread; deleting something already read changes nothing
    // about it. Decrementing anyway is the obvious bug this guards.
    expect(withoutItem({ items: [read, unread], unread: 1 }, 'read').unread).toBe(1);
  });

  it('never goes below zero', () => {
    // The count comes from the server and covers everything; the list is one
    // capped page of it. The two can disagree, and a badge showing -1 is the
    // way that disagreement would surface.
    expect(withoutItem({ items: [unread], unread: 0 }, 'unread').unread).toBe(0);
  });

  it('leaves an unknown id alone rather than guessing', () => {
    const bell = { items: [read], unread: 4 };
    expect(withoutItem(bell, 'never-heard-of-it')).toBe(bell);
  });
});

describe('sameBell', () => {
  it('is the same when neither the count nor the newest line moved', () => {
    expect(sameBell({ items: [orderLine()], unread: 1 }, { items: [orderLine()], unread: 1 })).toBe(
      true,
    );
  });

  it('differs when something new arrived', () => {
    expect(
      sameBell({ items: [orderLine()], unread: 1 }, { items: [orderLine({ id: 'n2' })], unread: 2 }),
    ).toBe(false);
  });

  it('differs when the count moved on its own — read on another device', () => {
    expect(sameBell({ items: [orderLine()], unread: 1 }, { items: [orderLine()], unread: 0 })).toBe(
      false,
    );
  });
});

describe('stopWatchingOn', () => {
  it('stops on a session that ended', () => {
    expect(stopWatchingOn(401)).toBe(true);
  });

  it.each([404, 500, 502, 503])('keeps trying through %i', (status) => {
    // An API restarting or a laptop that slept is temporary; the next tick
    // catches up.
    expect(stopWatchingOn(status)).toBe(false);
  });
});

describe('how often it asks', () => {
  it('is slower than the tracking page, which is watching the same events', () => {
    // Somebody on the tracking screen is waiting, and a stale step in front of
    // them is the failure that screen exists to prevent. A bell is glanced at.
    // This is the *fallback* rate — the stream is what normally delivers.
    expect(BELL_POLL_MS).toBeGreaterThan(ORDER_POLL_MS);
  });
});

describe('the route it asks', () => {
  it('is language-prefixed like every other path in the tree', () => {
    // Unprefixed, `middleware.ts` would treat it as a page and redirect it.
    expect(notificationsApiPath('ru')).toBe('/ru/notifications');
    // Armenian is the default language and is served unprefixed.
    expect(notificationsApiPath('hy')).toBe('/notifications');
  });

  it('puts the stream under the list, so the two cannot drift apart', () => {
    expect(notificationsStreamPath('ru')).toBe(`${notificationsApiPath('ru')}/stream`);
    expect(notificationsStreamPath('hy')).toBe(`${notificationsApiPath('hy')}/stream`);
  });
});
