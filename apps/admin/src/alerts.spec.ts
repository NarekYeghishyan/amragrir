import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffNotificationType } from '@amragrir/shared';
import type { StaffNotification } from './api';
import { chimeEnabled, setChimeEnabled } from './alerts';
import { freshNotifications } from './notifications';

/**
 * What a kitchen hears, and when.
 *
 * The rule being pinned down is that a chime marks an *arrival*. The bell
 * re-reads on a timer and on every socket frame, so the same rows come back
 * again and again; sounding on each of those would train a shift to ignore the
 * one that mattered.
 */

const CREATED_AT = '2026-08-22T09:00:00.000Z';

function notification(over: Partial<StaffNotification> = {}): StaffNotification {
  return {
    id: 'notification-1',
    type: StaffNotificationType.PrepDue,
    branchId: 'branch-1',
    orderId: 'order-1',
    payload: null,
    createdAt: CREATED_AT,
    read: false,
    ...over,
  };
}

describe('what earns a chime', () => {
  it('announces a row nobody has seen before', () => {
    const fresh = freshNotifications(new Set(), [notification()]);

    expect(fresh.map((item) => item.id)).toEqual(['notification-1']);
  });

  it('stays quiet on a row it has already announced', () => {
    // The 60-second poll returns the same list. It is not news the second time.
    const seen = new Set(['notification-1']);

    expect(freshNotifications(seen, [notification()])).toEqual([]);
  });

  it('stays quiet on a row that was already read', () => {
    // Somebody opened the bell on another tab, or on their phone. A poll that
    // then returns it must not sound as though it just arrived.
    const fresh = freshNotifications(new Set(), [notification({ read: true })]);

    expect(fresh).toEqual([]);
  });

  it('picks only the new ones out of a list that mixes both', () => {
    const seen = new Set(['old-1', 'old-2']);
    const fresh = freshNotifications(seen, [
      notification({ id: 'new-1' }),
      notification({ id: 'old-1' }),
      notification({ id: 'new-2' }),
      notification({ id: 'old-2', read: true }),
    ]);

    expect(fresh.map((item) => item.id)).toEqual(['new-1', 'new-2']);
  });
});

describe('the sound switch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A `window` with just the storage the module touches. Vitest runs this
   *  suite in node, where there is otherwise no `window` at all. */
  function withStorage(store: Record<string, string>) {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
      },
    });
  }

  it('is on when nothing has been stored', () => {
    // A back office is opened in order to be told things: a kitchen that has to
    // find a setting before it can hear a reminder has already missed one.
    withStorage({});

    expect(chimeEnabled()).toBe(true);
  });

  it('is off once somebody turns it off', () => {
    const store: Record<string, string> = {};
    withStorage(store);

    setChimeEnabled(false);

    expect(store['amragrir.admin.chime']).toBe('off');
    expect(chimeEnabled()).toBe(false);
  });

  it('comes back on', () => {
    const store: Record<string, string> = { 'amragrir.admin.chime': 'off' };
    withStorage(store);

    setChimeEnabled(true);

    expect(chimeEnabled()).toBe(true);
  });

  it('stays on when storage refuses to be read', () => {
    // A browser set to block site data throws outright rather than returning
    // null. Sound on is the safer of the two wrong answers.
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('access denied');
        },
        setItem: () => {
          throw new Error('access denied');
        },
      },
    });

    expect(chimeEnabled()).toBe(true);
    expect(() => setChimeEnabled(false)).not.toThrow();
  });
});
