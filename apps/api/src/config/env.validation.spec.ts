import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a-secret-long-enough-for-validation',
  };

  // Regression: every value read from .env is a string. Relying on
  // enableImplicitConversion alone left PORT as "3000" and the app failed to
  // boot on @IsInt — build and typecheck both passed while it was broken.
  it('coerces a string PORT into a number', () => {
    const env = validateEnv({ ...base, PORT: '3000' });
    expect(env.PORT).toBe(3000);
    expect(typeof env.PORT).toBe('number');
  });

  it('coerces the numeric auth and OTP settings too', () => {
    const env = validateEnv({
      ...base,
      JWT_ACCESS_TTL: '900',
      JWT_REFRESH_TTL: '2592000',
      OTP_TTL: '120',
      OTP_MAX_ATTEMPTS: '5',
    });

    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(2_592_000);
    expect(env.OTP_TTL).toBe(120);
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
  });

  it('applies defaults for everything optional', () => {
    const env = validateEnv({ ...base });

    expect(env.PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.OTP_TTL).toBe(120);
    expect(env.OTP_RESEND_COOLDOWN).toBe(60);
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
    expect(env.CORS_ORIGIN).toBeUndefined();
  });

  it('passes through the vars it validates', () => {
    const env = validateEnv({ ...base, CORS_ORIGIN: 'http://localhost:3001' });

    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.REDIS_URL).toBe(base.REDIS_URL);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3001');
  });

  it.each([
    ['DATABASE_URL', { REDIS_URL: base.REDIS_URL, JWT_SECRET: base.JWT_SECRET }],
    ['REDIS_URL', { DATABASE_URL: base.DATABASE_URL, JWT_SECRET: base.JWT_SECRET }],
    ['JWT_SECRET', { DATABASE_URL: base.DATABASE_URL, REDIS_URL: base.REDIS_URL }],
  ])('fails fast when %s is missing', (missing, config) => {
    expect(() => validateEnv(config)).toThrow(new RegExp(missing));
  });

  // A short secret would silently weaken every token the app issues.
  it('rejects a JWT_SECRET that is too short', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a PORT outside the valid range', () => {
    expect(() => validateEnv({ ...base, PORT: '99999' })).toThrow(/PORT/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...base, PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an OTP_TTL below the allowed minimum', () => {
    expect(() => validateEnv({ ...base, OTP_TTL: '5' })).toThrow(/OTP_TTL/);
  });
});
