import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette, type ThemeColors, type ThemeName } from './tokens';

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  /** Null while the app is following the OS. */
  preference: ThemeName | null;
  /** The SETTINGS toggle. Passing null hands control back to the OS. */
  setPreference: (theme: ThemeName | null) => void;
}

export const THEME_KEY = 'amragrir.theme';

const ThemeContext = createContext<Theme | null>(null);

/**
 * The OS setting, with a stored in-app choice layered on top.
 *
 * Same shape as `src/language.tsx`, for the same reason: both are "a preference,
 * remembered", and storage here is asynchronous so neither blocks the first
 * frame. Until the read lands the app follows the OS — which is what it did
 * before this preference existed, so the fallback is the old behaviour rather
 * than an arbitrary default.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemeName | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (!cancelled && (stored === 'light' || stored === 'dark')) {
          setPreferenceState(stored);
        }
      })
      .catch(() => {
        // Storage unavailable: keep following the OS.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemeName | null) => {
    setPreferenceState(next);
    const write = next === null ? AsyncStorage.removeItem(THEME_KEY) : AsyncStorage.setItem(THEME_KEY, next);
    void write.catch(() => {});
  }, []);

  const value = useMemo<Theme>(() => {
    const isDark = preference === null ? scheme === 'dark' : preference === 'dark';
    return { colors: isDark ? palette.dark : palette.light, isDark, preference, setPreference };
  }, [preference, scheme, setPreference]);

  return createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Components only ever read the resolved value.
 *
 * Falls back to the OS scheme when used outside the provider rather than
 * throwing: this is called by the root layout itself, which renders the
 * provider, and a theme is always answerable where a session is not.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const value = useContext(ThemeContext);
  if (value) {
    return value;
  }
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? palette.dark : palette.light,
    isDark,
    preference: null,
    setPreference: () => {},
  };
}
