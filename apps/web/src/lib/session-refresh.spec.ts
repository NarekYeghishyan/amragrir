import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * `api.refresh` is the one thing this module calls, and the whole point is *how
 * often*. Mocked so a test can count the rotations and hold one open.
 */
const refresh = vi.fn();
vi.mock('./api', () => ({
  api: { refresh: (token: string) => refresh(token) },
}));

async function load() {
  return import('./session-refresh');
}

afterEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  refresh.mockReset();
});

describe('refreshTokens', () => {
  it('spends one token once, however many callers ask at the same moment', async () => {
    // The bug this exists for: the tracking poll and a reload each call refresh
    // with the same single-use token, the API rotates on the first and 401s the
    // second, and the loser (`/session`) mints a guest over a signed-in user.
    let release!: (pair: unknown) => void;
    refresh.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const { refreshTokens } = await load();
    const a = refreshTokens('same-token');
    const b = refreshTokens('same-token');
    const c = refreshTokens('same-token');

    release({ accessToken: 'new-a', refreshToken: 'new-r' });
    await Promise.all([a, b, c]);

    // One rotation, one new pair — not three, of which two would have 401'd.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await a).toEqual({ accessToken: 'new-a', refreshToken: 'new-r' });
    expect(await b).toBe(await a);
    expect(await c).toBe(await a);
  });

  it('keeps handing back the result for a moment after it settles', async () => {
    // A reload arriving just after a background poll rotated the token must get
    // the *new* pair, not a fresh call that would try to spend a token already
    // gone. So the settled rotation stays shareable briefly.
    vi.useFakeTimers();
    refresh.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const { refreshTokens } = await load();
    expect(await refreshTokens('tok')).toEqual({ accessToken: 'a', refreshToken: 'r' });

    // A straggler 2s later still shares the one rotation.
    await vi.advanceTimersByTimeAsync(2_000);
    await refreshTokens('tok');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('rotates again once the hold has elapsed', async () => {
    vi.useFakeTimers();
    refresh.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const { refreshTokens } = await load();
    await refreshTokens('tok');
    // Past the hold window, the token is no longer cached — a genuinely later
    // refresh is a real call again (by then the browser holds the new cookie,
    // so this key would not recur in practice, but the map must not leak).
    await vi.advanceTimersByTimeAsync(6_000);
    await refreshTokens('tok');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not fuse two different tokens', async () => {
    refresh.mockImplementation((token: string) =>
      Promise.resolve({ accessToken: `a-${token}`, refreshToken: `r-${token}` }),
    );
    const { refreshTokens } = await load();
    const [one, two] = await Promise.all([refreshTokens('t1'), refreshTokens('t2')]);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(one).not.toEqual(two);
  });

  it('lets a rejection reach every sharer', async () => {
    // A genuinely revoked token fails for all of them, and each caller runs its
    // own fallback (mint a guest, or send to sign in). The race fix must not
    // swallow a real failure.
    refresh.mockRejectedValue(new Error('revoked'));
    const { refreshTokens } = await load();
    const a = refreshTokens('dead');
    const b = refreshTokens('dead');
    await expect(a).rejects.toThrow('revoked');
    await expect(b).rejects.toThrow('revoked');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

/**
 * Source guards: every refresher must go through the shared rotation, or the
 * one that skips it reintroduces the race on its own.
 */
describe('the refreshers', () => {
  const files = ['app/[lang]/session/route.ts', 'lib/order-live.ts', 'lib/basket-panel.ts'];

  it('all rotate through session-refresh, none call api.refresh directly', () => {
    for (const rel of files) {
      const src = readFileSync(join(here, '..', rel), 'utf8');
      expect(src).toContain('refreshTokens(');
      expect(src).not.toContain('api.refresh(');
    }
  });
});
