import type { ColorValue } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';

/**
 * The five tab glyphs, transcribed path-for-path from the mobile artifact
 * (`docs/design/Amragrir (mob).dc.html`, the BOTTOM NAV block).
 *
 * Drawn rather than taken from an icon font: the artifact draws its own, and a
 * lookalike from `@expo/vector-icons` would be a different shape nobody chose.
 * All five share a 24×24 box, a 2px stroke and `currentColor` — here the
 * `color` prop, which the tab bar sets to accent or `ink3`.
 */
interface IconProps {
  /** `ColorValue`, not `string`: this is fed straight from the navigator's
   *  `tabBarIcon({ color })`, which may hand over a platform colour object. */
  color: ColorValue;
}

const SIZE = 24;
const STROKE = 2;

export function HomeIcon({ color }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11l8-7 8 7v8a1.5 1.5 0 01-1.5 1.5H5.5A1.5 1.5 0 014 19v-8z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchIcon({ color }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={STROKE} />
      <Path d="M20 20l-3.2-3.2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function OrdersIcon({ color }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3h12l-1 18H7L6 3z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
      <Path d="M9 8h6M9 12h6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function FavoritesIcon({ color }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0112 7a4.4 4.4 0 017 3.4c0 5-7 9.6-7 9.6z"
        stroke={color}
        strokeWidth={STROKE}
      />
    </Svg>
  );
}

export function ProfileIcon({ color }: IconProps) {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}
