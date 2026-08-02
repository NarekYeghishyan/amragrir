import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

/** Validated shape of process.env. ConfigModule runs `validateEnv` at boot and
 *  fails fast if anything required is missing or malformed. */
export class EnvVars {
  // env values are always strings — @Type coerces before @IsInt runs.
  // (implicit conversion alone is unreliable here, so convert explicitly.)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(1)
  REDIS_URL!: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  /** Access token lifetime (seconds). Short — refresh rotates it. */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL = 900;

  /** Refresh token lifetime (seconds). */
  @Type(() => Number)
  @IsInt()
  @Min(600)
  JWT_REFRESH_TTL = 2_592_000;

  /** OTP validity window (seconds) — DEVELOPMENT_GUIDE.md specifies 120. */
  @Type(() => Number)
  @IsInt()
  @Min(30)
  OTP_TTL = 120;

  /** Minimum gap between OTP sends to one phone (seconds). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  OTP_RESEND_COOLDOWN = 60;

  /** Wrong-code attempts allowed before the OTP is burned. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  OTP_MAX_ATTEMPTS = 5;

  /**
   * Where the back office is served. Invite and password-reset links are built
   * from it, so a wrong value produces emails nobody can act on.
   */
  @IsString()
  @MinLength(1)
  ADMIN_URL = 'http://localhost:5173';

  /**
   * How long a staff invitation stays open (seconds). A week: long enough to
   * survive a holiday, short enough that a forwarded invite goes stale.
   */
  @Type(() => Number)
  @IsInt()
  @Min(3600)
  STAFF_INVITE_TTL = 604_800;

  /** How long a staff password-reset link lives (seconds). */
  @Type(() => Number)
  @IsInt()
  @Min(300)
  STAFF_RESET_TTL = 1_800;

  /**
   * Where this API is reachable from a browser.
   *
   * Uploaded photos are stored as absolute URLs built from it — a dish carries
   * the address its picture can be fetched from, so every client resolves it
   * the same way and none of them has to know where the API lives. Changing
   * this after photos exist leaves the old ones pointing at the old host.
   */
  @IsString()
  @MinLength(1)
  API_PUBLIC_URL = 'http://localhost:3000';

  /**
   * Where uploaded images are written. Relative paths resolve against the
   * process's working directory (`apps/api` in development).
   *
   * A plain directory, because that is what this deployment is: one instance
   * with a volume. Two instances would need shared storage or an object store —
   * the URL is built in one place (`UploadsService`) so that stays one change.
   */
  @IsString()
  @MinLength(1)
  UPLOAD_DIR = './uploads';

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  /**
   * Number of reverse proxies in front of the app (nginx/ALB = 1). Required for
   * per-IP rate limiting to see the real client: without it Express reports the
   * proxy's address and every user shares one bucket. Leave 0 when the app is
   * exposed directly — trusting a forwarded header nobody sets lets a caller
   * spoof their IP and bypass the limit.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS = 0;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
