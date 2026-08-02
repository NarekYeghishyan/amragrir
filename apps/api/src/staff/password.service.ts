import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// `scrypt` is overloaded and promisify infers the three-argument form, which
// drops the options we need to raise `maxmem` with.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing for staff accounts.
 *
 * `node:crypto`'s scrypt rather than an argon2 package: it is memory-hard,
 * in the standard library, and needs no native build on a developer's machine
 * or in CI. The repo has no crypto dependencies and this does not add one.
 *
 * Parameters are stored **in the hash** rather than read from config, so
 * raising the cost later does not invalidate existing passwords — an old hash
 * keeps verifying with the parameters it was written with, and is rewritten
 * the next time its owner signs in.
 */
const N = 32_768; // 2^15 — ~32 MB of memory per hash at r=8
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
// scrypt's default maxmem (32 MB) is just under what N=32768, r=8 needs
// (128 * N * r = 32 MB, plus overhead), so it must be raised explicitly or
// every call throws.
const MAX_MEM = 96 * 1024 * 1024;

@Injectable()
export class PasswordService {
  /** `scrypt$N$r$p$salt$key`, both parts base64. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const key = await this.derive(password, salt, N, R, P);
    return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
  }

  /**
   * Constant-time comparison against a stored hash.
   *
   * Returns false rather than throwing on a malformed hash: a corrupted row
   * should fail the login, not 500 the endpoint and tell the caller their
   * email exists.
   */
  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }

    const [, n, r, p, saltB64, keyB64] = parts;
    const cost = Number(n);
    const blockSize = Number(r);
    const parallelism = Number(p);
    if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) {
      return false;
    }

    const expected = Buffer.from(keyB64, 'base64');
    let actual: Buffer;
    try {
      actual = await this.derive(
        password,
        Buffer.from(saltB64, 'base64'),
        cost,
        blockSize,
        parallelism,
        expected.length,
      );
    } catch {
      return false;
    }

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  /**
   * Burns roughly the same time as a real verification, for logins where no
   * account was found.
   *
   * Without it, "unknown email" answers measurably faster than "wrong
   * password", which turns the login endpoint into a way to enumerate who
   * works here.
   */
  async burnTime(): Promise<void> {
    await this.derive('', randomBytes(SALT_LEN), N, R, P);
  }

  private async derive(
    password: string,
    salt: Buffer,
    cost: number,
    blockSize: number,
    parallelism: number,
    keyLen: number = KEY_LEN,
  ): Promise<Buffer> {
    return scryptAsync(password.normalize('NFKC'), salt, keyLen, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAX_MEM,
    });
  }
}
