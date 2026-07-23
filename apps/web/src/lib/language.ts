import { Language } from '@amragrir/shared';
import { dictionaries, type TranslationKey } from '@amragrir/i18n';

export const LANGUAGES = Object.values(Language);

/**
 * Language comes from the URL (`/hy/…`, `/ru/…`, `/en/…`), not from
 * `Accept-Language`.
 *
 * The API negotiates by header, and this app used to as well — but a crawler
 * sends one header and would therefore only ever index one of the three
 * languages. Since discovery traffic is the entire reason this app is
 * server-rendered, each language needs its own URL that can be indexed and
 * linked with `hreflang`. Header negotiation is still used, once, to redirect a
 * visitor arriving at `/` (see middleware.ts).
 */
export function parseLanguage(value: string | undefined): Language | null {
  return LANGUAGES.includes(value as Language) ? (value as Language) : null;
}

/** Best match for an `Accept-Language` header; `hy` is the product default. */
export function negotiate(header: string | null): Language {
  if (!header) {
    return Language.Hy;
  }
  for (const part of header.split(',')) {
    const primary = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    const match = parseLanguage(primary);
    if (match) {
      return match;
    }
  }
  return Language.Hy;
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
