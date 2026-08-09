import hy from './hy.json';
import ru from './ru.json';
import en from './en.json';
import { Language } from '@amragrir/shared';

/**
 * The customer-facing dictionaries.
 *
 * The back office has its own, behind `@amragrir/i18n/admin`, and is
 * deliberately not re-exported here — see that module for why.
 */

/**
 * `hy` is the reference dictionary — it is the product default and the
 * fallback every other language resolves to (docs/AI_CONTEXT.md).
 */
export type TranslationKey = keyof typeof hy;

/**
 * Every language must define exactly the same keys.
 *
 * Typed rather than trusted: adding a string to one file and forgetting the
 * others is the normal way translations rot, and it should be a compile error
 * here rather than an Armenian word appearing in an English page.
 */
type Dictionary = Record<TranslationKey, string>;

export const dictionaries = {
  [Language.Hy]: hy satisfies Dictionary,
  [Language.Ru]: ru satisfies Dictionary,
  [Language.En]: en satisfies Dictionary,
} as const;

/**
 * Keys, not strings — which is why they belong beside the dictionaries rather
 * than in a client. See the module for what it maps and why it is shared.
 */
export { ORDER_STATUS_COPY } from './order-status-copy';
