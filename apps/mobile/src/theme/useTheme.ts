import { useColorScheme } from 'react-native';
import { palette, type ThemeColors } from './tokens';

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

/**
 * Follows the OS setting. The in-app dark-mode toggle (SETTINGS screen) will
 * layer a stored preference on top of this later; components only ever read
 * the resolved value.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? palette.dark : palette.light, isDark };
}
