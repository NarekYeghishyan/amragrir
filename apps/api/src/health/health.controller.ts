import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../auth/decorators';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness + dependency reachability. Returns 200 with a 'down' marker
   *  rather than throwing, so an orchestrator can distinguish "process up,
   *  dependency unreachable" from a crash. */
  @Get()
  async check(): Promise<{
    status: string;
    db: 'up' | 'down';
    redis: 'up' | 'down';
    time: string;
  }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    const redis = (await this.redis.ping()) ? 'up' : 'down';

    return { status: 'ok', db, redis, time: new Date().toISOString() };
  }
}
