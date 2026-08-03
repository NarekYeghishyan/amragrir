import { Language } from '@amragrir/shared';
import { dictionaries, type TranslationKey } from '@amragrir/i18n';

export const LANGUAGES = Object.values(Language);

/**
 * Armenian is the product default, and the default language is **unprefixed**:
 * it is served at the bare domain. `lib/site.ts` turns that into URLs and
 * `middleware.ts` maps those URLs back onto the `[lang]` tree.
 */
export const DEFAULT_LANGUAGE = Language.Hy;

/**
 * Language comes from the URL (`/…` is Armenian, `/ru/…`, `/en/…`), not from
 * `Accept-Language`.
 *
 * The API negotiates by header, and this app used to as well — but a crawler
 * sends one header and would therefore only ever index one of the three
 * languages. Since discovery traffic is the entire reason this app is
 * server-rendered, each language needs its own URL that can be indexed and
 * linked with `hreflang`. Nothing in this app reads the header any more: the
 * URL is the single source of truth, and a visitor who has not chosen gets the
 * default at the address they typed.
 */
export function parseLanguage(value: string | undefined): Language | null {
  return LANGUAGES.includes(value as Language) ? (value as Language) : null;
}

/**
 * Labels for a language, falling back to Armenian **per key**.
 *
 * Per key rather than per dictionary: a half-translated file should show the
 * strings it has and fall back only on the ones it lacks, instead of dropping
 * the whole language over one missing entry.
 */
export function t(language: Language): (key: TranslationKey) => string {
  const dictionary = dictionaries[language] as Record<string, string>;
  const fallback = dictionaries[Language.Hy] as Record<string, string>;
  return (key) => dictionary[key] ?? fallback[key] ?? key;
}
