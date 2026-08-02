import { inOrder, momentFor, seededId, stableHash } from './seed-activity';

/**
 * The half of the activity seed that decides things.
 *
 * `seedActivity` itself needs a database. These do not: they are the two pure
 * functions the seed's two guarantees rest on — that a re-run writes the same
 * rows rather than a second set of them, and that the timeline it builds is one
 * somebody can actually look at.
 *
 * The timestamp spread is here because it was wrong twice while this was being
 * written, in two different ways, and both produced a feed that technically
 * contained the right data and demonstrated nothing.
 */

const WINDOW_MINUTES = 21 * 24 * 60;

describe('seededId', () => {
  it('is stable for a key', () => {
    // The whole idempotency strategy: the same entry computes the same id on
    // every run, so a re-run replaces its own rows instead of adding more.
    expect(seededId('delete:item-1')).toBe(seededId('delete:item-1'));
  });

  it('separates keys that differ', () => {
    expect(seededId('delete:item-1')).not.toBe(seededId('delete:item-2'));
    // Same entity, different action — these must not collide, or one entry
    // would silently replace the other.
    expect(seededId('delete:item-1')).not.toBe(seededId('create:item-1'));
  });

  it('is shaped like a uuid, since it goes in a uuid column', () => {
    expect(seededId('anything')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('stableHash', () => {
  it('is deterministic and non-negative', () => {
    // Every choice in the seed is taken modulo this. A negative value would
    // index backwards off an array and a drifting one would make a bug found
    // this morning unreproducible this afternoon.
    expect(stableHash('branch-1')).toBe(stableHash('branch-1'));
    expect(stableHash('branch-1')).toBeGreaterThanOrEqual(0);
  });
});

describe('momentFor', () => {
  const keys = Array.from({ length: 400 }, (_, index) => `entry:${index}`);

  it('is deterministic for a key and phase', () => {
    // Against a stopped clock. What the seed needs is the *offset* to be a
    // function of the key — the instant is that offset from now, so two calls a
    // millisecond apart legitimately differ, and this assertion failed about one
    // run in three until it said which of the two it meant.
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_785_000_000_000);
    try {
      expect(momentFor('a', 4).getTime()).toBe(momentFor('a', 4).getTime());
      // And a different phase of the window is a different instant, or the
      // assertion above would pass on a function that ignored its arguments.
      expect(momentFor('a', 4).getTime()).not.toBe(momentFor('a', 5).getTime());
    } finally {
      clock.mockRestore();
    }
  });

  it('never lands in the future', () => {
    // An audit entry dated after now reads as a clock problem and sorts above
    // everything real.
    const now = Date.now();
    for (const key of keys) {
      expect(momentFor(key, 1).getTime()).toBeLessThan(now);
    }
  });

  it('stays inside the three-week window', () => {
    const now = Date.now();
    for (const key of keys) {
      const minutesAgo = (now - momentFor(key, 19).getTime()) / 60_000;
      expect(minutesAgo).toBeGreaterThan(0);
      expect(minutesAgo).toBeLessThanOrEqual(WINDOW_MINUTES + 30);
    }
  });

  it('does not pile entries up on the boundary', () => {
    // The second way this was wrong: jittering around `daysBack` and clamping at
    // "now" sent every entry whose jitter went negative to the same instant, so
    // a third of the feed shared one timestamp.
    const counts = new Map<number, number>();
    for (const key of keys) {
      const minute = Math.floor(momentFor(key, 2).getTime() / 60_000);
      counts.set(minute, (counts.get(minute) ?? 0) + 1);
    }
    const busiest = Math.max(...counts.values());
    expect(busiest).toBeLessThan(10);
  });

  it('spreads across the whole window rather than one slice', () => {
    // The first way this was wrong: an hours-wide jitter put every entry of a
    // kind in the same slice, so the newest page was twenty-five deletions in a
    // row and the panel looked like it could only say one thing.
    const days = new Set(
      keys.map((key) => Math.floor((Date.now() - momentFor(key, 4).getTime()) / 86_400_000)),
    );
    expect(days.size).toBeGreaterThan(14);
  });

  it('puts two phases in different places for the same key', () => {
    // `daysBack` is what rotates each kind of action to its own part of the
    // window, so the kinds interleave instead of stacking.
    expect(momentFor('same-key', 2).getTime()).not.toBe(momentFor('same-key', 11).getTime());
  });
});

describe('inOrder', () => {
  /**
   * The wrapping that gives `momentFor` its even spread also makes the order of
   * two moments arbitrary. That is fine between entries about different things
   * and wrong for a chain about one dish — added, marked sold out, put back on
   * sale — which `GET /restaurant/menu-items/{id}/history` now shows side by
   * side.
   */
  it('hands the same instants back oldest first', () => {
    const a = new Date('2026-07-20T10:00:00.000Z');
    const b = new Date('2026-07-10T10:00:00.000Z');
    const c = new Date('2026-07-15T10:00:00.000Z');

    expect(inOrder([a, b, c])).toEqual([b, c, a]);
  });

  it('adds and removes nothing', () => {
    // The spread of the feed as a whole has to be exactly what it was: this
    // reuses the moments rather than computing new ones, so only their
    // assignment changes.
    const moments = ['create:x', 'soldout:x', 'backon:x'].map((key) => momentFor(key, 4));

    const ordered = inOrder(moments);

    expect(ordered).toHaveLength(3);
    expect([...ordered].sort()).toEqual([...moments].sort());
  });

  it('leaves the caller’s array alone', () => {
    // The seed reads `momentFor` results into this and nothing else; sorting in
    // place would still be correct today and a trap the first time it is not.
    const moments = [new Date('2026-07-20T10:00:00.000Z'), new Date('2026-07-10T10:00:00.000Z')];
    const before = [...moments];

    inOrder(moments);

    expect(moments).toEqual(before);
  });

  it('actually fixes the case that made the dish timeline read backwards', () => {
    // The real one: for a seeded dish the creation is phase 19 and the two
    // availability flips are phases 2 and 1, so the digest decided which came
    // first and the dialog opened on "marked sold out → added to the menu".
    const id = 'fdf00e18-0000-4000-8000-00000000abcd';
    const [added, soldOut, backOn] = inOrder([
      momentFor(`create:${id}`, 19),
      momentFor(`soldout:${id}`, 2),
      momentFor(`backon:${id}`, 1),
    ]);

    expect(added.getTime()).toBeLessThanOrEqual(soldOut.getTime());
    expect(soldOut.getTime()).toBeLessThanOrEqual(backOn.getTime());
  });
});
