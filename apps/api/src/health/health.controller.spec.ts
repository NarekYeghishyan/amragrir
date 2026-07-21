import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

/** Minimal stub — the controller only ever calls $queryRaw. */
function prismaStub(queryRaw: jest.Mock): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

describe('HealthController', () => {
  it('reports the db as up when the probe query succeeds', async () => {
    const controller = new HealthController(prismaStub(jest.fn().mockResolvedValue([{ x: 1 }])));

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(() => new Date(result.time).toISOString()).not.toThrow();
  });

  // The endpoint must stay 200 with db:'down' so an orchestrator can tell
  // "process up, DB unreachable" apart from a crashed process.
  it('reports the db as down instead of throwing when the probe fails', async () => {
    const controller = new HealthController(
      prismaStub(jest.fn().mockRejectedValue(new Error('connection refused'))),
    );

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('down');
  });
});
