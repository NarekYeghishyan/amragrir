import { WebView } from 'react-native-webview';

/**
 * The map itself: Yandex's public widget, in whatever this platform has to put
 * a web page in. Here that is a `WebView`; the browser build has its own copy of
 * this file (`MapFrame.web.tsx`) that uses an `<iframe>`, which is what the
 * website does.
 *
 * **It is only ever a picture.** The caller wraps it in a
 * `pointerEvents="none"` view and owns the viewport — see `YandexMap`, which is
 * one file for both platforms because everything above this line is the same
 * arithmetic.
 */
export function MapFrame({
  url,
  title,
  background,
}: {
  url: string;
  /** For assistive technology: the frame is a map, and it cannot say so. */
  title: string;
  background: string;
}) {
  return (
    <WebView
      source={{ uri: url }}
      accessibilityLabel={title}
      style={{ flex: 1, backgroundColor: background }}
      // Nothing in here is ours to scroll: the widget's own controls must never
      // move a map this app is drawing a pin on.
      scrollEnabled={false}
      javaScriptEnabled
      originWhitelist={['https://*']}
      // Android draws a white flash under a loading WebView otherwise, which
      // reads as the map having failed.
      androidLayerType="hardware"
      // No cookies, no logins, no personalisation: this is a picture of a city,
      // and the customer did not ask to be recognised by a map.
      incognito
    />
  );
}
