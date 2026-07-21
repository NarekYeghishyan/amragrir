import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

function prismaStub(queryRaw: jest.Mock): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

function redisStub(ping: jest.Mock): RedisService {
  return { ping } as unknown as RedisService;
}

describe('HealthController', () => {
  it('reports both dependencies up when their probes succeed', async () => {
    const controller = new HealthController(
      prismaStub(jest.fn().mockResolvedValue([{ x: 1 }])),
      redisStub(jest.fn().mockResolvedValue(true)),
    );

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(result.redis).toBe('up');
    expect(() => new Date(result.time).toISOString()).not.toThrow();
  });

  // The endpoint must stay 200 with a 'down' marker so an orchestrator can
  // tell "process up, dependency unreachable" apart from a crashed process.
  it('reports the db as down instead of throwing when its probe fails', async () => {
    const controller = new HealthController(
      prismaStub(jest.fn().mockRejectedValue(new Error('connection refused'))),
      redisStub(jest.fn().mockResolvedValue(true)),
    );

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('down');
    expect(result.redis).toBe('up');
  });

  it('reports redis as down when its ping fails', async () => {
    const controller = new HealthController(
      prismaStub(jest.fn().mockResolvedValue([{ x: 1 }])),
      redisStub(jest.fn().mockResolvedValue(false)),
    );

    expect((await controller.check()).redis).toBe('down');
  });
});
