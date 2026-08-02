import {
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react';

/**
 * The address bar, as something React can render from.
 *
 * Hand-written rather than a routing library, because what the panel needs from
 * one is small and the whole of it is here: read the URL, change the URL, and
 * re-render when it changes by any means — a click, the back button, or a
 * bookmark opened cold. Nested layouts, loaders, code splitting and data
 * revalidation are the reasons to take the dependency, and the panel has one
 * layout, fetches in the screens, and ships as a single bundle.
 *
 * What a URL *means* is not here — that is `parseRoute` in `navigation.ts`,
 * which is pure and tested against `routePath`. This module only deals in
 * strings and the History API, so swapping it for a library later is a change
 * to two files and no change at all to the screens.
 */

/**
 * Fired after a `pushState`/`replaceState` of ours.
 *
 * `popstate` covers the back and forward buttons, and nothing else: the History
 * API deliberately does not announce a navigation the page made itself, so a
 * link click would otherwise change the URL and leave the screen where it was.
 */
const NAVIGATED = 'amragrir:navigated';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
}

/** Path and query, which together are every part of the address the panel
 *  routes on. The origin never varies, and a hash would be a second way to say
 *  where you are. Returned as one string so that `useSyncExternalStore` can
 *  compare it by value — an object rebuilt per read would re-render forever. */
function read(): string {
  return window.location.pathname + window.location.search;
}

/** For `renderToStaticMarkup`, which has no `window`. The smoke tests render
 *  screens outside a browser, and a route parsed from `/` is the "no route yet"
 *  the shell already knows how to handle. */
function frozen(): string {
  return '/';
}

/** The current path and query, re-read whenever either changes. */
export function useHref(): string {
  return useSyncExternalStore(subscribe, read, frozen);
}

/** Splits what `useHref` returns into the two halves `parseRoute` takes. */
export function splitHref(href: string): { pathname: string; search: string } {
  const cut = href.indexOf('?');
  return cut === -1
    ? { pathname: href, search: '' }
    : { pathname: href.slice(0, cut), search: href.slice(cut) };
}

/**
 * Go somewhere.
 *
 * `replace` for a move nobody asked for — a redirect off a URL this account
 * cannot open, or off one that means nothing — so that pressing back goes where
 * the person actually came from rather than bouncing off the redirect again.
 */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === read()) {
    return;
  }
  if (options.replace === true) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  window.dispatchEvent(new Event(NAVIGATED));
}

/**
 * Whether a click is the plain left click that a single-page app may take over.
 *
 * Everything else is the browser's: a middle click or ⌘/Ctrl opens a new tab,
 * shift opens a window, alt downloads. Swallowing those is the thing that makes
 * an in-app link feel worse than a real one, and "open this branch in a second
 * tab" is exactly what a panel with real URLs is for.
 */
function plain(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

/**
 * A real anchor that navigates without a reload.
 *
 * An `<a href>` rather than a button with an onClick, so the address is in the
 * status bar on hover, in the context menu as "copy link", and reachable by
 * every keyboard and screen reader that already knows what a link is.
 */
export function Link({
  to,
  replace = false,
  className,
  children,
  ...rest
}: {
  to: string;
  replace?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'a'>, 'href' | 'className' | 'children'>) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (!plain(event)) {
          return;
        }
        event.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
