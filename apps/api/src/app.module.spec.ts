import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from './redis/redis.service';
import { PrismaService } from './prisma/prisma.service';

/**
 * Compiles the whole dependency graph.
 *
 * Every other spec builds its subject by hand — `new OrdersGateway(a, b, c)` —
 * which proves the class works and says nothing about whether Nest can hand it
 * those dependencies at runtime. That gap is not theoretical: adding
 * `StaffTokenService` to `OrdersGateway` left 444 green tests and an API that
 * could not boot, because `OrdersModule` did not import `StaffModule`.
 *
 * This is the cheapest possible guard against that: if a provider is injected
 * somewhere its module cannot reach, `compile()` throws.
 */
describe('AppModule', () => {
  const ENV = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-at-least-16-chars',
    ADMIN_URL: 'http://localhost:5173',
  };

  let saved: Record<string, string | undefined>;

  beforeAll(() => {
    saved = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));
    Object.assign(process.env, ENV);
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('resolves every provider every module injects', async () => {
    // Imported here rather than at the top so the env above is in place before
    // ConfigModule validates it.
    const { AppModule } = (await import('./app.module')) as { AppModule: unknown };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    })
      // The two providers that would open a socket on construction. Everything
      // else is real, which is the point — a stubbed graph proves nothing.
      .overrideProvider(REDIS_CLIENT)
      .useValue({ quit: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 30_000);
});
