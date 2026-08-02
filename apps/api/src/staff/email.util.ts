/**
 * Lowercases and trims an email for storage and lookup.
 *
 * The unique index on `staff_users.email` is case-sensitive, so without this
 * `Ann@x.am` and `ann@x.am` would be two accounts that both believe they are
 * the same person. A CHECK constraint in the migration keeps the column honest
 * if some future writer forgets to call this.
 *
 * Only the case is normalised — the local part of an address is technically
 * case-sensitive and dot-insensitivity is a Gmail convention, not a rule, so
 * stripping dots here would merge addresses that other providers keep apart.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** For log lines that must not put a full address in a shipped log. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) {
    return '***';
  }
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
