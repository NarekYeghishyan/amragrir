import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Observable, from, of, switchMap } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RedisService } from '../../redis/redis.service';
import type { JwtPayload } from '../../auth/token.service';
import { IDEMPOTENT_KEY } from './idempotency.decorator';

/** How long a completed response stays replayable. A day covers any realistic
 *  client retry (offline queue, app restart) without hoarding responses. */
const RECORD_TTL_SECONDS = 24 * 60 * 60;

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 128;

interface IdempotencyRecord {
  state: 'in_flight' | 'done';
  /** Hash of the request body, so one key cannot be reused for a different order. */
  fingerprint: string;
  body?: unknown;
}

/**
 * Makes a mutating endpoint safe to retry.
 *
 * A phone loses signal after the server has already created the order; the app
 * retries; without this the customer is charged twice. The client sends the
 * same `Idempotency-Key` on every attempt and gets the first response back.
 *
 * Registered globally but inert unless a handler carries `@Idempotent(scope)`.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.get<string | undefined>(IDEMPOTENT_KEY, context.getHandler());
    if (!scope) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const key = this.readKey(request);

    // Scoped by user as well as by endpoint: a key is a client-chosen string,
    // and without the user id one caller could guess another's key and be
    // handed their order back.
    const userId = request.user?.sub ?? 'anonymous';
    const redisKey = `idem:${scope}:${userId}:${key}`;
    const fingerprint = fingerprintOf(request.body);

    return from(this.claim(redisKey, fingerprint)).pipe(
      switchMap((replay) => (replay ? of(replay.body) : this.run(redisKey, fingerprint, next))),
    );
  }

  /**
   * Tries to reserve the key. Returns the stored record when this request has
   * already been handled, or throws when the key is in use for something else.
   */
  private async claim(
    redisKey: string,
    fingerprint: string,
  ): Promise<IdempotencyRecord | null> {
    const pending: IdempotencyRecord = { state: 'in_flight', fingerprint };
    const claimed = await this.redis.setIfAbsent(
      redisKey,
      JSON.stringify(pending),
      RECORD_TTL_SECONDS,
    );
    if (claimed) {
      return null;
    }

    const raw = await this.redis.get(redisKey);
    if (!raw) {
      // The record expired between the failed claim and this read. Rare enough
      // to just run the request rather than fail a legitimate call.
      return null;
    }

    const record = JSON.parse(raw) as IdempotencyRecord;

    if (record.fingerprint !== fingerprint) {
      throw new ConflictException(
        'This Idempotency-Key was already used with a different request body',
      );
    }
    if (record.state === 'in_flight') {
      throw new ConflictException('A request with this Idempotency-Key is still in progress');
    }
    return record;
  }

  private run(redisKey: string, fingerprint: string, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap((body: unknown) => {
        const done: IdempotencyRecord = { state: 'done', fingerprint, body };
        void this.redis.setEx(redisKey, JSON.stringify(done), RECORD_TTL_SECONDS);
      }),
      catchError((err: unknown) => {
        // Release the key so the client can retry. Holding it would turn a
        // transient failure into a permanently unusable key.
        void this.redis.del(redisKey);
        throw err;
      }),
    );
  }

  private readKey(request: Request): string {
    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;

    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be ${MIN_KEY_LENGTH}-${MAX_KEY_LENGTH} characters`,
      );
    }
    return key;
  }
}

/** Same body → same hash, so a genuine retry replays and a different order
 *  reusing the key is caught instead of silently returning the wrong response. */
export function fingerprintOf(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}
