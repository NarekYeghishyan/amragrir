import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { Language } from '@amragrir/shared';
import { dictionaries, type TranslationKey } from '@amragrir/i18n';

/**
 * The app's language: hy, ru or en, with hy the product default
 * (docs/AI_CONTEXT.md).
 *
 * Chosen and stored, not derived from a route. `apps/web` puts the language in
 * the path because a crawler sends one `Accept-Language` and would otherwise
 * index a single language; an app has no URLs to index and one person who keeps
 * their phone in one language. So this is the same shape as the panel's
 * `apps/admin/src/language.ts` — a preference, remembered — and differs from it
 * only where the platform forces it to: storage is asynchronous here, and the
 * device's languages replace the browser's.
 */
export const LANGUAGE_KEY = 'amragrir.language';

export const LANGUAGES = Object.values(Language);

/** Endonyms — a language is named in itself, in every language. The design
 *  draws these as the three buttons on Profile and Settings. */
export const LANGUAGE_LABELS = {
  [Language.Hy]: 'ՀՅ',
  [Language.Ru]: 'RU',
  [Language.En]: 'EN',
} as const satisfies Record<Language, string>;

function parse(value: string | null | undefined): Language | null {
  return LANGUAGES.includes(value as Language) ? (value as Language) : null;
}

/** The device's preferred languages, best first, reduced to the three this app
 *  speaks. `getLocales()` is guaranteed non-empty but its tags carry a region
 *  (`ru-RU`), so match on the primary subtag. */
function fromDevice(): Language | null {
  for (const locale of getLocales()) {
    const match = parse(locale.languageCode?.toLowerCase());
    if (match !== null) {
      return match;
    }
  }
  return null;
}

/**
 * The last resolved language, for the things that are not React.
 *
 * `api/client.ts` needs it on every request to set `Accept-Language` — the API
 * localises its error messages and `*_i18n` columns from that header, and those
 * strings are rendered verbatim. Reading storage per request would work; this
 * cannot disagree with what the provider is rendering, which matters more.
 */
let current: Language = Language.Hy;

export function currentLanguage(): Language {
  return current;
}

// ── translation ─────────────────────────────────────────────────────────────

export type Translate = (key: TranslationKey) => string;

/**
 * Labels for a language, falling back to Armenian **per key**.
 *
 * Per key rather than per dictionary, matching `apps/web/src/lib/language.ts`
 * and the panel: a half-translated file should show the strings it has and fall
 * back only on the ones it lacks, instead of dropping a whole language over one
 * missing entry.
 */
export function createTranslator(language: Language): Translate {
  const dictionary = dictionaries[language] as Record<string, string>;
  const fallback = dictionaries[Language.Hy] as Record<string, string>;
  return (key) => dictionary[key] ?? fallback[key] ?? key;
}

interface LanguageValue {
  language: Language;
  /** False until storage has been read. Screens render Armenian for that first
   *  frame rather than blocking — see the provider. */
  ready: boolean;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageValue | null>(null);

/**
 * Resolves the language once on mount: the stored choice, else the device's,
 * else Armenian.
 *
 * Rendering is **not** blocked on that read. Storage here is asynchronous, so
 * gating the tree behind it would show an empty frame on every cold start; the
 * default is the product default, so the only visible cost is that a user who
 * chose Russian sees one Armenian frame. Holding the whole app back to avoid
 * that would be the worse trade.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(Language.Hy);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((stored) => {
        if (cancelled) {
          return;
        }
        const resolved = parse(stored) ?? fromDevice() ?? Language.Hy;
        current = resolved;
        setLanguageState(resolved);
      })
      .catch(() => {
        // Storage unavailable: the app still runs, in the device's language or
        // the default. Nothing here is worth failing to start over.
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    current = next;
    setLanguageState(next);
    // Fire and forget: the switch has already happened on screen, and a failed
    // write only means it does not outlive the session.
    void AsyncStorage.setItem(LANGUAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<LanguageValue>(
    () => ({ language, ready, setLanguage, t: createTranslator(language) }),
    [language, ready, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return value;
}

/** The common case — a screen that only needs to read strings. */
export function useTranslate(): Translate {
  return useLanguage().t;
}
