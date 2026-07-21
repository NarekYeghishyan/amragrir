import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Thin wrapper over ioredis with the few operations the app needs.
 *  Keeps raw client usage in one place so key handling stays consistent. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /** Set a value with a TTL in seconds. */
  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /** Remaining TTL in seconds; -2 if the key is gone, -1 if it has no TTL. */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /** Atomic increment that sets the TTL only on first write, so a counter
   *  cannot be kept alive indefinitely by further increments. */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch (err) {
      this.logger.warn(`Redis ping failed: ${(err as Error).message}`);
      return false;
    }
  }
}
