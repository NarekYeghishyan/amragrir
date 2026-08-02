import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Language } from '@amragrir/shared';
import { applyLanguage, createTranslator, resolveLanguage, type Translate } from './language';

interface LanguageApi {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageApi | null>(null);

/**
 * The chosen language, and the translator built from it.
 *
 * Wraps the whole panel — including the sign-in screen, which is the one place
 * somebody may need to switch languages before they can do anything else.
 *
 * Switching re-renders everything rather than reloading: the panel is a single
 * page with live state (an open order board, a half-filled form), and throwing
 * that away to change a label would be a worse trade than the re-render.
 */
export function LanguageProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Fixes the language instead of resolving it — for tests and stories. */
  initial?: Language;
}) {
  const [language, setLanguage] = useState<Language>(() => initial ?? resolveLanguage());

  const api = useMemo<LanguageApi>(
    () => ({
      language,
      setLanguage: (next) => {
        applyLanguage(next);
        setLanguage(next);
      },
      t: createTranslator(language),
    }),
    [language],
  );

  useEffect(() => {
    // `index.html` sets `lang` before the first paint; this keeps it and the
    // tab's title correct after a switch. Both are outside React's tree, so
    // neither follows from rendering.
    document.documentElement.lang = language;
    document.title = api.t('documentTitle');
  }, [language, api]);

  return <LanguageContext.Provider value={api}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageApi {
  const api = useContext(LanguageContext);
  if (api === null) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return api;
}

/** The common case: a screen wants labels, not the language itself. */
export function useT(): Translate {
  return useLanguage().t;
}
