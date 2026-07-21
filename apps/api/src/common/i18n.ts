import { Language } from '@amragrir/shared';

const SUPPORTED = Object.values(Language) as string[];
const DEFAULT_LANGUAGE = Language.Hy;

/** JSON shape of the `*_i18n` columns. */
export type I18nField = Record<string, string> | null | undefined;

/**
 * Picks a language from an `Accept-Language` header.
 *
 * Deliberately simple: match the first supported tag by prefix, ignoring
 * quality weights. Falls back to `hy`, the product default.
 */
export function resolveLanguage(header?: string): Language {
  if (!header) {
    return DEFAULT_LANGUAGE;
  }

  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (!tag) {
      continue;
    }
    const primary = tag.split('-')[0];
    if (primary && SUPPORTED.includes(primary)) {
      return primary as Language;
    }
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Resolves a localised column to a plain string. Clients never receive the raw
 * JSON blob (see DEVELOPMENT_GUIDE.md "API conventions").
 *
 * Falls back through the requested language → `hy` → any populated value, so a
 * partially translated row still renders something rather than an empty label.
 */
export function localize(field: I18nField, language: Language): string {
  if (!field || typeof field !== 'object') {
    return '';
  }

  const requested = field[language];
  if (requested) {
    return requested;
  }

  const fallback = field[DEFAULT_LANGUAGE];
  if (fallback) {
    return fallback;
  }

  return Object.values(field).find((value) => typeof value === 'string' && value.length > 0) ?? '';
}
