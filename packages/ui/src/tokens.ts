/**
 * Design tokens — the single source, transcribed from docs/DESIGN_SYSTEM.md.
 *
 * Every app reads from here: `apps/mobile` imports the objects directly,
 * `apps/web` and `apps/admin` consume `tokens.css`, which is generated from
 * this file (see scripts/build-css.mjs). Before this existed the palette was
 * hand-copied into three places, so changing an accent colour meant three
 * edits and nothing caught a missed one.
 *
 * **Raw colour values belong only in this file.**
 */

/**
 * Every colour a component may use.
 *
 * Both themes are typed against this shape, so adding a token to one without
 * the other is a compile error rather than an `undefined` colour at runtime.
 */
export interface ThemeColors {
  /** Screen background. */
  bg: string;
  /** Cards and raised surfaces. */
  card: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Tertiary text and icons. */
  ink3: string;
  /** Borders and dividers. */
  line: string;
  /** Brand accent, CTAs. */
  accent: string;
  /** Secondary accent, used in gradients. */
  accent2: string;
  /** Soft accent fill behind badges. */
  accentSoft: string;
  /** Chip and toggle background. */
  chip: string;
  /** Skeleton gradient, first stop (`--ph1` in the design). */
  placeholder: string;
  /** Skeleton gradient, second stop (`--ph2`). The shimmer runs
   *  placeholder → placeholder2 → placeholder, so both are needed. */
  placeholder2: string;
  /** Translucent surface for elements floating over a photo — the status
   *  badge on a restaurant card. Pairs with a backdrop blur. */
  glass: string;
  /** Success, "open", deposit credited. */
  good: string;
  shadow: string;
}

export type ThemeName = 'light' | 'dark';

export const palette: Record<ThemeName, ThemeColors> = {
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
    placeholder2: '#E6DACB',
    glass: 'rgba(246,245,242,0.78)',
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
    placeholder2: '#2F2820',
    glass: 'rgba(16,14,11,0.72)',
    good: '#2EC76F',
    shadow: 'rgba(0,0,0,0.55)',
  },
};

/**
 * `--stage` from the design is deliberately absent.
 *
 * It is the backdrop *around* the phone in the mockup — the design tool's own
 * chrome, not a surface any product screen renders. Shipping it as a token
 * would invite someone to use it as a real background.
 *
 * The two artifacts also disagree on `shadow` and `glass` (the web one is
 * lighter: .1/.5 and .8/.75). The mobile artifact is authoritative — it is the
 * one DESIGN_SYSTEM.md was transcribed from and the one every app already
 * matches.
 */

/** Colours that are the same in both themes (DESIGN_SYSTEM.md §1). */
export const spot = {
  star: '#F5A623',
  destructive: '#E23755',
} as const;

/** Multiples of 4, per the design's spacing grid. */
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

/**
 * Type scale. Numbers, not CSS strings, because React Native needs numbers —
 * the CSS generator adds `px`.
 */
export const typography = {
  title: { fontSize: 26, fontWeight: 700 },
  heading: { fontSize: 19, fontWeight: 700 },
  body: { fontSize: 15, fontWeight: 500 },
  label: { fontSize: 13, fontWeight: 600 },
  caption: { fontSize: 12, fontWeight: 500 },
} as const;

/** Minimum touch target — DEVELOPMENT_GUIDE.md accessibility rule. */
export const HIT_TARGET = 44;
