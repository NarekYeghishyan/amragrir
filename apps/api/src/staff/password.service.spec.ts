import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('round-trips a password', async () => {
    const hash = await passwords.hash('correct horse battery staple');
    expect(await passwords.verify('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await passwords.hash('correct horse battery staple');
    expect(await passwords.verify('Correct horse battery staple', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const a = await passwords.hash('same password twice');
    const b = await passwords.hash('same password twice');
    expect(a).not.toBe(b);
    expect(await passwords.verify('same password twice', b)).toBe(true);
  });

  it('stores its parameters in the hash', async () => {
    // This is what lets the cost be raised later without invalidating every
    // existing password.
    const hash = await passwords.hash('whatever');
    const [scheme, n, r, p] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBe(32_768);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('reads the parameters from the hash instead of assuming the current ones', async () => {
    const hash = await passwords.hash('portable');
    const tampered = hash.replace(/^scrypt\$\d+/, 'scrypt$16384');
    // Deriving with N=16384 yields a different key, so this must fail — the
    // property under test is that it fails cleanly rather than throwing,
    // which is what makes a future cost change survivable.
    await expect(passwords.verify('portable', tampered)).resolves.toBe(false);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    // A corrupted row should fail the login, not 500 the endpoint and confirm
    // the account exists.
    expect(await passwords.verify('x', '')).toBe(false);
    expect(await passwords.verify('x', 'not-a-hash')).toBe(false);
    expect(await passwords.verify('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(await passwords.verify('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });

  it('normalises unicode, so the same visible password matches', async () => {
    // Identical on screen, different bytes: e-acute as a single code point,
    // versus a plain e followed by a combining acute. Two keyboards, or a Mac
    // and a Windows machine, can produce either.
    const composed = 'caf\u00e9 password long enough';
    const decomposed = 'cafe\u0301 password long enough';
    expect(composed).not.toBe(decomposed);

    const hash = await passwords.hash(composed);
    expect(await passwords.verify(decomposed, hash)).toBe(true);
  });

  it('burns time without needing an account', async () => {
    await expect(passwords.burnTime()).resolves.toBeUndefined();
  });
});
