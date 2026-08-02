import { Language } from '@amragrir/shared';
import {
  adminDictionaries,
  type AdminPluralKey,
  type AdminTranslationKey,
} from '@amragrir/i18n/admin';

/**
 * The panel's language: hy, ru or en, with hy the product default.
 *
 * Chosen and stored, not taken from the URL. The customer site puts the
 * language in the path because a crawler sends one `Accept-Language` and would
 * otherwise index a single language — none of that applies here. This is an
 * internal tool behind a sign-in with no routes to index, and the people using
 * it work a whole shift in one language, so the choice belongs in storage next
 * to the theme.
 *
 * Same shape as `theme.ts` on purpose, down to the swallowed storage errors:
 * both are "a preference on `<html>`, remembered".
 */
export const LANGUAGE_KEY = 'amragrir.language';

export const LANGUAGES = Object.values(Language);

/** Endonyms — a language is named in itself, in every language. */
export const LANGUAGE_LABEL_KEYS = {
  [Language.Hy]: 'languageHy',
  [Language.Ru]: 'languageRu',
  [Language.En]: 'languageEn',
} as const satisfies Record<Language, AdminTranslationKey>;

function parse(value: string | null | undefined): Language | null {
  return LANGUAGES.includes(value as Language) ? (value as Language) : null;
}

/**
 * What the panel should open in: the stored choice, else the browser's, else
 * Armenian.
 *
 * `index.html` runs the storage half of this before the first paint so `<html
 * lang>` is right from the start; this is what the provider reads back on
 * mount.
 */
export function resolveLanguage(): Language {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANGUAGE_KEY);
  } catch {
    // Storage disabled (private mode, locked-down kiosk): fall through to the
    // browser's languages rather than failing to render.
  }

  const chosen = parse(stored);
  if (chosen !== null) {
    return chosen;
  }

  for (const tag of navigator.languages ?? [navigator.language]) {
    const match = parse(tag.toLowerCase().split('-')[0]);
    if (match !== null) {
      return match;
    }
  }

  return Language.Hy;
}

/**
 * The last resolved language, for the things that are not React.
 *
 * `api.ts` needs it on every request to set `Accept-Language` — the API
 * localises its own error messages and `*_i18n` columns from that header, and
 * those strings land in the panel's banners and toasts verbatim. Reading
 * storage per request would work; this avoids it and, more usefully, cannot
 * disagree with what the provider is rendering.
 */
let current: Language | null = null;

export function currentLanguage(): Language {
  current ??= resolveLanguage();
  return current;
}

export function applyLanguage(language: Language): void {
  current = language;
  document.documentElement.lang = language;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // The choice simply does not persist; the panel still switches.
  }
}

// ── translation ─────────────────────────────────────────────────────────────

export type TranslateParams = Record<string, string | number>;

export interface Translate {
  (key: AdminTranslationKey, params?: TranslateParams): string;
  /**
   * A count and the string that agrees with it.
   *
   * `count` is passed into the template automatically, so `{count}` works
   * without repeating it in `params`.
   */
  plural: (key: AdminPluralKey, count: number, params?: TranslateParams) => string;
}

/** Fills `{name}` placeholders, leaving unknown ones visible rather than blank
 *  — a stray `{code}` in the UI is a bug report; an empty gap is not. */
function interpolate(template: string, params: TranslateParams | undefined): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

/**
 * Labels for a language, falling back to Armenian **per key**.
 *
 * Per key rather than per dictionary, matching `apps/web/src/lib/language.ts`:
 * a half-translated file should show the strings it has and fall back only on
 * the ones it lacks, instead of dropping the whole language over one missing
 * entry.
 */
export function createTranslator(language: Language): Translate {
  const dictionary = adminDictionaries[language] as Record<string, string>;
  const fallback = adminDictionaries[Language.Hy] as Record<string, string>;
  const rules = new Intl.PluralRules(language);

  const lookup = (key: string, params?: TranslateParams): string =>
    interpolate(dictionary[key] ?? fallback[key] ?? key, params);

  const translate = ((key, params) => lookup(key, params)) as Translate;

  translate.plural = (key, count, params) => {
    // Russian selects `few`/`many` where Armenian and English only ever select
    // `one`/`other`, so the categorised key is used when the language defines
    // it and `_other` carries everything else.
    const categorised = `${key}_${rules.select(count)}`;
    const resolved = dictionary[categorised] !== undefined ? categorised : `${key}_other`;
    return lookup(resolved, { count, ...params });
  };

  return translate;
}
