import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotency:scope';

/**
 * Marks a handler as requiring an `Idempotency-Key` header.
 *
 * `scope` namespaces the stored replay so the same key used against two
 * different endpoints cannot return the wrong endpoint's response.
 */
export const Idempotent = (scope: string): MethodDecorator =>
  SetMetadata(IDEMPOTENT_KEY, scope);
