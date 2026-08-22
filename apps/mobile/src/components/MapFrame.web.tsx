/**
 * The same map, for the browser build — an `<iframe>`, exactly as
 * `apps/web/src/components/YandexMap.tsx` does it.
 *
 * `react-native-webview` has no web implementation (it renders a line of red
 * text saying so), and this app's web target is how it is looked at without a
 * device — so the frame is the DOM element the WebView stands in for
 * everywhere else. Everything around it, including the arithmetic that turns a
 * tap into a coordinate, is the shared `YandexMap`.
 *
 * Raw DOM inside a React Native tree is fine here and only here: on web the
 * whole app *is* React DOM, through `react-native-web`.
 */
export function MapFrame({
  url,
  title,
  background,
}: {
  url: string;
  title: string;
  background: string;
}) {
  return (
    <iframe
      src={url}
      title={title}
      // Out of the tab order: the caller has already taken it out of hit-testing
      // with `pointerEvents="none"`, and a frame the keyboard could enter would
      // be a hole in a dialog nothing else can be reached through.
      tabIndex={-1}
      style={{ width: '100%', height: '100%', border: 'none', background }}
    />
  );
}
