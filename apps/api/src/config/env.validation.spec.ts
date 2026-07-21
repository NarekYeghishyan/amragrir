import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

  // Regression: every value read from .env is a string. Relying on
  // enableImplicitConversion alone left PORT as "3000" and the app failed to
  // boot on @IsInt — build and typecheck both passed while it was broken.
  it('coerces a string PORT into a number', () => {
    const env = validateEnv({ ...base, PORT: '3000' });
    expect(env.PORT).toBe(3000);
    expect(typeof env.PORT).toBe('number');
  });

  it('falls back to the default PORT when unset', () => {
    expect(validateEnv({ ...base }).PORT).toBe(3000);
  });

  it('keeps optional vars optional', () => {
    const env = validateEnv({ ...base });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
  });

  it('passes through the vars it validates', () => {
    const env = validateEnv({
      ...base,
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'secret',
    });
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a PORT outside the valid range', () => {
    expect(() => validateEnv({ ...base, PORT: '99999' })).toThrow(/PORT/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...base, PORT: 'not-a-port' })).toThrow(/PORT/);
  });
});
