/**
 * Extracts the token from an `Authorization: Bearer <token>` header.
 *
 * Single implementation on purpose: both the global guard and the endpoints
 * that accept an optional bearer parse this header, and two copies would drift
 * the moment one of them is hardened.
 */
export function bearerFrom(header?: string | null): string | null {
  if (!header) {
    return null;
  }

  const parts = header.split(' ');
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, value] = parts;
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
