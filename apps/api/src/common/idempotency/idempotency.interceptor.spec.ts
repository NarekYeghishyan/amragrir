import { BadRequestException, ConflictException, type CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor, fingerprintOf } from './idempotency.interceptor';
import type { RedisService } from '../../redis/redis.service';

const SCOPE = 'orders.create';
const KEY = 'idem-key-0001';

/** Minimal in-memory stand-in for Redis with the atomic claim the design needs. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    setIfAbsent: jest.fn((key: string, value: string) => {
      if (store.has(key)) {
        return Promise.resolve(false);
      }
      store.set(key, value);
      return Promise.resolve(true);
    }),
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setEx: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
}

function context(options: { body?: unknown; key?: string | undefined; scope?: string | null } = {}) {
  const request = {
    headers: options.key === undefined ? {} : { 'idempotency-key': options.key },
    body: options.body ?? { branchId: 'b1' },
    user: { sub: 'user-1' },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

function build(scope: string | null = SCOPE) {
  const redis = fakeRedis();
  const reflector = { get: jest.fn().mockReturnValue(scope ?? undefined) } as unknown as Reflector;
  return {
    interceptor: new IdempotencyInterceptor(reflector, redis as unknown as RedisService),
    redis,
  };
}

const handlerReturning = (value: unknown): { handler: CallHandler; calls: jest.Mock } => {
  const calls = jest.fn().mockReturnValue(of(value));
  return { handler: { handle: calls } as CallHandler, calls };
};

describe('handlers without @Idempotent', () => {
  it('are passed straight through, key or no key', async () => {
    const { interceptor } = build(null);
    const { handler, calls } = handlerReturning({ ok: true });

    await firstValueFrom(interceptor.intercept(context({ key: undefined }), handler));
    expect(calls).toHaveBeenCalled();
  });
});

describe('@Idempotent handlers', () => {
  // The key is validated before the handler is subscribed to, so these reject
  // synchronously rather than through the observable.
  it('require the header — without it a retry would create a second order', () => {
    const { interceptor } = build();
    const { handler, calls } = handlerReturning({ id: 'order-1' });

    expect(() => interceptor.intercept(context({ key: undefined }), handler)).toThrow(
      BadRequestException,
    );
    expect(calls).not.toHaveBeenCalled();
  });

  it('rejects an implausibly short key', () => {
    const { interceptor } = build();
    const { handler } = handlerReturning({ id: 'order-1' });

    expect(() => interceptor.intercept(context({ key: 'abc' }), handler)).toThrow(
      BadRequestException,
    );
  });

  it('runs the handler on the first call and stores the response', async () => {
    const { interceptor, redis } = build();
    const { handler, calls } = handlerReturning({ id: 'order-1' });

    const result = await firstValueFrom(interceptor.intercept(context({ key: KEY }), handler));

    expect(result).toEqual({ id: 'order-1' });
    expect(calls).toHaveBeenCalledTimes(1);
    expect(redis.setEx).toHaveBeenCalled();
  });

  it('replays the first response instead of ordering twice', async () => {
    const { interceptor } = build();
    const first = handlerReturning({ id: 'order-1' });
    const second = handlerReturning({ id: 'order-2' });

    await firstValueFrom(interceptor.intercept(context({ key: KEY }), first.handler));
    const replay = await firstValueFrom(interceptor.intercept(context({ key: KEY }), second.handler));

    // The whole point: the second attempt must not reach the service.
    expect(second.calls).not.toHaveBeenCalled();
    expect(replay).toEqual({ id: 'order-1' });
  });

  it('rejects the same key used for a different basket', async () => {
    const { interceptor } = build();
    const first = handlerReturning({ id: 'order-1' });
    const second = handlerReturning({ id: 'order-2' });

    await firstValueFrom(
      interceptor.intercept(context({ key: KEY, body: { branchId: 'b1' } }), first.handler),
    );

    await expect(
      firstValueFrom(
        interceptor.intercept(context({ key: KEY, body: { branchId: 'b2' } }), second.handler),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a second request while the first is still running', async () => {
    const { interceptor, redis } = build();
    const { handler } = handlerReturning({ id: 'order-1' });

    // Simulate the in-flight record the first request wrote.
    redis.store.set(
      `idem:${SCOPE}:user-1:${KEY}`,
      JSON.stringify({ state: 'in_flight', fingerprint: fingerprintOf({ branchId: 'b1' }) }),
    );

    await expect(
      firstValueFrom(interceptor.intercept(context({ key: KEY }), handler)),
    ).rejects.toThrow(ConflictException);
  });

  it('releases the key when the handler fails, so the client can retry', async () => {
    const { interceptor, redis } = build();
    const failing = { handle: () => throwError(() => new Error('boom')) } as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(context({ key: KEY }), failing)),
    ).rejects.toThrow('boom');

    expect(redis.del).toHaveBeenCalledWith(`idem:${SCOPE}:user-1:${KEY}`);
    expect(redis.store.has(`idem:${SCOPE}:user-1:${KEY}`)).toBe(false);
  });

  it('namespaces the record by user, so a guessed key reveals nothing', async () => {
    const { interceptor, redis } = build();
    const { handler } = handlerReturning({ id: 'order-1' });

    await firstValueFrom(interceptor.intercept(context({ key: KEY }), handler));

    expect([...redis.store.keys()]).toEqual([`idem:${SCOPE}:user-1:${KEY}`]);
  });
});

describe('fingerprintOf', () => {
  it('matches for an identical body and differs otherwise', () => {
    expect(fingerprintOf({ a: 1 })).toBe(fingerprintOf({ a: 1 }));
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
  });
});
