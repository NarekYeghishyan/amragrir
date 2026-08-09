import { useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';

interface Props {
  /** What the API gave us. Null is ordinary, not an error — a restaurant may
   *  have no cover, and only a dish is guaranteed a picture. */
  uri: string | null;
  /** Box styles only — size, radius, position. `ImageStyle` and `ViewStyle`
   *  agree on all of those and differ only on `overflow`, which nothing here
   *  sets, so one prop can feed both branches. */
  style?: StyleProp<ImageStyle & ViewStyle>;
}

/**
 * Who we say we are when fetching a picture.
 *
 * React Native sends `okhttp/4.x` by default — a bare library name, which hosts
 * are entitled to refuse and some do. Wikimedia refuses it flatly (403, by
 * policy rather than by rate limit), and while it hosted half the demo imagery
 * the site showed every picture and this app showed none. The app was not wrong
 * to think there was nothing to draw: it had been told so, 403 by 403.
 *
 * The seed has since moved off that host entirely (`apps/api/prisma/menu-photos.ts`),
 * so nothing currently rendered depends on this header. It stays anyway:
 * identifying the client is what every such policy asks for, and the next host
 * that enforces one should not cost another day of looking at a component that
 * was working. Sent to every host, not only the awkward ones — a header that
 * appears for some URLs is a header nobody remembers exists.
 */
const IMAGE_HEADERS = { 'User-Agent': 'AmragrirApp/1.0 (+https://amragrir.am)' };

/**
 * An image from the API, or the placeholder surface in its place.
 *
 * The design artifact draws hatched blocks everywhere a photograph goes,
 * because a mockup has none. This app does: `menu_items.photo_url` is populated
 * for every seeded dish (apps/api/prisma/menu-photos.ts) and `cover_url` for
 * every seeded restaurant (apps/api/prisma/restaurant-covers.ts). Rendering the
 * hatch where a real photograph exists would be transcribing the *absence* of
 * data from the design, which is the one thing the design cannot tell us about.
 *
 * Falls back on load failure too, because those pictures are hotlinked and
 * somebody else's server can refuse, rate-limit or lose one at any moment. A
 * broken-image glyph would be worse than the surface the design already
 * specifies for "no picture" — with the cost, learned the hard way above, that
 * a photograph failing everywhere looks exactly like data that was never there.
 */
export function Photo({ uri, style }: Props) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);

  if (uri === null || failed) {
    return <View style={[{ backgroundColor: colors.placeholder }, style]} />;
  }

  return (
    <Image
      source={{ uri, headers: IMAGE_HEADERS }}
      onError={() => setFailed(true)}
      resizeMode="cover"
      style={[{ backgroundColor: colors.placeholder }, style]}
    />
  );
}
