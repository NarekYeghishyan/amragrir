'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  GIVE_UP_MS,
  GRACE_MS,
  SETTLE_MS,
  START_PROGRESS,
  TICK_MS,
  formTarget,
  nextProgress,
  startsNavigation,
} from '@/lib/navigation-progress';

/** Set on `<html>` while a page is on its way in — `globals.css` reads it. */
const NAV_ATTRIBUTE = 'data-navigating';

/** Put on the link or button that was pressed, so it says it heard. */
const PENDING_CLASS = 'is-pending';

/**
 * The thread of accent colour across the top of the window while the next page
 * is being fetched.
 *
 * Every screen on this site is rendered on the server, which is what makes the
 * catalogue indexable — and what means a press is answered by a round trip
 * rather than by a frame. Between the two the browser shows the *old* page,
 * unchanged, and the honest reading of that is "nothing happened": people press
 * again, and the second press is the one that feels broken.
 *
 * So three things happen at once, and none of them is a spinner over the
 * content:
 *
 * - this bar, which starts moving and slows as it goes (`nextProgress`);
 * - the pressed control dims and breathes, so the answer is attached to the
 *   thing that was pressed rather than floating at the top of the screen;
 * - `data-navigating` on `<html>`, which turns the cursor to `progress`.
 *
 * What fills the page itself is each route's own `loading.tsx` — this only
 * covers the gap before that skeleton is on screen.
 *
 * Nothing is drawn for the first `GRACE_MS`. The router caches most of what
 * this site links to, and a bar that flashes on every quick move teaches people
 * to stop looking at it.
 */
export function RouteProgress({ label }: { label: string }) {
  // `useSearchParams` reads something that does not exist until there is a
  // request, so a client component using it outside a Suspense boundary drags
  // the whole page out of static rendering — which for the restaurant pages is
  // exactly the thing that must not happen. The boundary keeps the bail-out to
  // this component, which renders nothing on the server anyway.
  return (
    <Suspense fallback={null}>
      <Bar label={label} />
    </Suspense>
  );
}

function Bar({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The route as the router currently has it. The query string is half of it:
  // a filter chip on the home page and a new search both change nothing but
  // that, and both are slow enough to be the reason this component exists.
  const route = `${pathname}?${searchParams}`;

  const [progress, setProgress] = useState<number | null>(null);

  // Refs rather than state, all of them: the listeners are attached once, and
  // none of this may rebuild them on the frames the bar is advancing.
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether a navigation this component started is still outstanding. */
  const waiting = useRef(false);
  /** Whether the bar made it past the grace period and onto the screen. */
  const shown = useRef(false);
  /** What was pressed, so the class can come back off the same element. */
  const pressed = useRef<Element | null>(null);

  /** Everything this component owns outside React, put back as it was found. */
  const reset = useCallback((): void => {
    for (const timer of [grace, settle, giveUp]) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
    if (trickle.current !== null) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
    waiting.current = false;
    pressed.current?.classList.remove(PENDING_CLASS);
    pressed.current = null;
    document.documentElement.removeAttribute(NAV_ATTRIBUTE);
  }, []);

  const start = useCallback(
    (element: Element | null): void => {
      // A second press while the last bar is still fading: clear it outright
      // rather than run the new one down from wherever the old one stopped.
      reset();
      shown.current = false;
      setProgress(null);

      waiting.current = true;
      pressed.current = element;

      grace.current = setTimeout(() => {
        shown.current = true;
        pressed.current?.classList.add(PENDING_CLASS);
        document.documentElement.setAttribute(NAV_ATTRIBUTE, '');
        setProgress(START_PROGRESS);
        trickle.current = setInterval(() => {
          setProgress((current) => (current === null ? null : nextProgress(current)));
        }, TICK_MS);
      }, GRACE_MS);

      // A navigation can be abandoned in ways nothing here is told about. The
      // bar is not allowed to run for ever on the strength of one press.
      giveUp.current = setTimeout(() => {
        reset();
        shown.current = false;
        setProgress(null);
      }, GIVE_UP_MS);
    },
    [reset],
  );

  // The new route is on screen. This effect also runs on mount, where
  // `waiting` is false and there is nothing to finish.
  useEffect(() => {
    if (!waiting.current) {
      return;
    }
    const wasShown = shown.current;
    reset();
    if (!wasShown) {
      // It arrived inside the grace period, which is the common case. Nothing
      // was ever drawn, and nothing should be.
      return;
    }
    // Run it to the end and let it fade out, rather than snapping away — the
    // last thing seen should be the bar completing.
    setProgress(1);
    settle.current = setTimeout(() => {
      shown.current = false;
      setProgress(null);
    }, SETTLE_MS);
  }, [route, reset]);

  useEffect(() => {
    // Capture, so this still sees the press when the handler on the control
    // itself calls `stopPropagation` — and it runs before any `preventDefault`
    // decides what the press means.
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a') : null;
      if (!anchor) {
        return;
      }
      const intent = {
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        modified:
          event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
      };
      if (startsNavigation(intent, window.location.href)) {
        start(anchor);
      }
    };

    const onSubmit = (event: SubmitEvent): void => {
      const form = event.target as HTMLFormElement | null;
      if (!form || event.defaultPrevented) {
        return;
      }
      // `form.method` is the resolved one and reads `get` even with no
      // attribute; `action` has to come off the attribute, because the property
      // fills an absent one in with the current address and would hide it.
      const target = formTarget(
        form.method,
        form.getAttribute('action'),
        textFields(form),
        window.location.href,
      );
      if (target === null) {
        return;
      }
      const intent = {
        href: target,
        target: form.getAttribute('target'),
        download: false,
        modified: false,
      };
      if (startsNavigation(intent, window.location.href)) {
        start(event.submitter ?? form);
      }
    };

    // Back and forward are navigations nobody pressed a link for, and on this
    // site they refetch exactly as a link does.
    const onPopState = (): void => start(null);

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('popstate', onPopState);
      reset();
    };
  }, [start, reset]);

  return (
    <div className="route-progress" data-done={progress === 1 ? '' : undefined}>
      {progress !== null && (
        // Mounted only while it is running, which is what stops the bar
        // animating backwards to zero when the next navigation starts.
        <span className="bar" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
      )}
      {/* The same news for a screen reader, which cannot see a 3px line. The
          region is always in the document — a live region added at the moment
          its text appears is one most readers never announce. */}
      <span role="status" className="visually-hidden">
        {progress === null ? '' : label}
      </span>
    </div>
  );
}

/**
 * The form's fields as name/value pairs, files left out — a GET form encodes
 * only the filename for those anyway, and this site has none to submit.
 */
function* textFields(form: HTMLFormElement): Generator<readonly [string, string]> {
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string') {
      yield [name, value];
    }
  }
}
