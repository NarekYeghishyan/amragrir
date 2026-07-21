/**
 * Design tokens transcribed from docs/DESIGN_SYSTEM.md.
 *
 * This is the only place a raw colour value may appear — components read from
 * `useTheme()` so light/dark both work and the palette can change in one edit.
 */

/**
 * Every colour a component may use. Naming both themes against this shape means
 * adding a token to one theme without the other is a compile error rather than
 * an `undefined` colour at runtime.
 */
export interface ThemeColors {
  bg: string;
  card: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  chip: string;
  placeholder: string;
  good: string;
  shadow: string;
}

export const palette: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    bg: '#F6F5F2',
    card: '#FFFFFF',
    ink: '#1A1712',
    ink2: 'rgba(26,23,18,0.56)',
    ink3: 'rgba(26,23,18,0.32)',
    line: 'rgba(26,23,18,0.09)',
    accent: '#EA5B12',
    accent2: '#FF8A3D',
    accentSoft: '#FFF0E6',
    chip: '#F1EFEA',
    placeholder: '#EFE7DD',
    good: '#12A150',
    shadow: 'rgba(60,40,15,0.12)',
  },
  dark: {
    bg: '#100E0B',
    card: '#1B1815',
    ink: '#F6F3EE',
    ink2: 'rgba(246,243,238,0.6)',
    ink3: 'rgba(246,243,238,0.34)',
    line: 'rgba(246,243,238,0.1)',
    accent: '#FF6A1F',
    accent2: '#FF9A52',
    accentSoft: 'rgba(255,106,31,0.15)',
    chip: '#26221D',
    placeholder: '#241F19',
    good: '#2EC76F',
    shadow: 'rgba(0,0,0,0.55)',
  },
};

/** Spot colours that do not change between themes (DESIGN_SYSTEM.md §1). */
export const spot = {
  star: '#F5A623',
  destructive: '#E23755',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '700' },
  heading: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '500' },
} as const;

/** Minimum touch target — DEVELOPMENT_GUIDE.md accessibility rule. */
export const HIT_TARGET = 44;
