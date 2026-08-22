import type { SavedAnswer } from '@/app/[lang]/saved/route';

/**
 * What this visitor has saved at the branch on screen, read **once** per page.
 *
 * A restaurant page is pre-rendered HTML (see `saved/route.ts`), so every heart
 * on it — the banner's, and one per dish on the menu — has to ask the server
 * what state it is in after it mounts. Twenty rows asking separately would be
 * twenty identical requests for one answer, so the first caller starts the
 * request and the rest await the same promise.
 *
 * Deliberately module-level rather than React state or context: the hearts are
 * scattered through markup the *server* renders, so there is no client component
 * high enough to hold the state without making the whole menu one.
 *
 * The cache is dropped when a heart is pressed (`forgetSaved`), because the
 * answer it holds is then stale by exactly the change that was just made and
 * this page is one somebody keeps pressing hearts on. Nothing else invalidates
 * it: it lives for the life of the tab's client-side navigation, and the page
 * behind it is static.
 */
const EMPTY: SavedAnswer = { favorited: false, dishes: [] };

const inFlight = new Map<string, Promise<SavedAnswer>>();

export function readSaved(endpoint: string): Promise<SavedAnswer> {
  const started = inFlight.get(endpoint);
  if (started) {
    return started;
  }

  const request = fetch(endpoint, { cache: 'no-store' })
    .then((response) => (response.ok ? (response.json() as Promise<SavedAnswer>) : EMPTY))
    .catch(() => {
      // A heart that could not read its state stays as it was drawn. Nobody
      // reading this page can do anything about it, and pressing it still works
      // — the account is the authority, not this.
      return EMPTY;
    });

  inFlight.set(endpoint, request);
  return request;
}

/** Forgets the cached answer, so the next mount asks again. Called by a heart on
 *  submit: it has just changed the thing this answer describes. */
export function forgetSaved(endpoint: string): void {
  inFlight.delete(endpoint);
}
