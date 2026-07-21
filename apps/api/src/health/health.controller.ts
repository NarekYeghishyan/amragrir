import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + DB reachability. Returns 200 with db:'down' rather than throwing,
   *  so an orchestrator can distinguish "process up, DB unreachable" from a crash. */
  @Get()
  async check(): Promise<{ status: string; db: 'up' | 'down'; time: string }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return { status: 'ok', db, time: new Date().toISOString() };
  }
}
