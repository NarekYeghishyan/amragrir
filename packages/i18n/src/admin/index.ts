import hy from './hy.json';
import ru from './ru.json';
import en from './en.json';
import { Language } from '@amragrir/shared';

/**
 * The back office's dictionaries — imported as `@amragrir/i18n/admin`.
 *
 * A separate entry point rather than more entries in the customer one: the two
 * vocabularies barely overlap ("Withdraw the invitation", "Payment
 * reconciliation" mean nothing to a diner), they would collide on short keys
 * like `menu` and `search`, and the customer site is server-rendered for
 * discovery traffic — it should not ship several hundred staff strings to every
 * visitor to say "Ռեստորաններ Երևանում". Its own module is what makes that last
 * part true rather than a hope about tree-shaking.
 *
 * The mechanics are identical to the customer dictionaries, so the guarantee is
 * too: `hy` is the reference, and a key missing from `ru` or `en` is a compile
 * error.
 */
export type AdminTranslationKey = keyof typeof hy;

/**
 * Russian defines more keys than the reference, not fewer.
 *
 * Its plural categories are `one`/`few`/`many` where Armenian and English have
 * only `one`/`other` (see the `_one`/`_other` suffixed keys). Those extras are
 * resolved at runtime through `Intl.PluralRules` and are deliberately outside
 * this type — requiring them everywhere would mean a `branchCount_few` in
 * English, duplicating `_other` in a category English never selects.
 */
type AdminDictionary = Record<AdminTranslationKey, string>;

export const adminDictionaries = {
  [Language.Hy]: hy satisfies AdminDictionary,
  [Language.Ru]: ru satisfies AdminDictionary,
  [Language.En]: en satisfies AdminDictionary,
} as const;

/**
 * A key that comes in plural forms, named without its category suffix.
 *
 * Derived from the `_other` entries the reference dictionary declares, so
 * `t.plural('branchCount', n)` is checked against the dictionary the same way a
 * plain key is. Written through a type parameter because a conditional type
 * only distributes over a union when the checked type is a naked one.
 */
type WithoutOther<K extends string> = K extends `${infer Base}_other` ? Base : never;
export type AdminPluralKey = WithoutOther<AdminTranslationKey>;
