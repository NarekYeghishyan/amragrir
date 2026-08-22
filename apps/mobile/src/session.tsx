import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { auth } from './api/endpoints';
import { setAccessToken } from './api/client';
import { clearGuestFavorites } from './guest-favorites';
import type { AuthUser } from './api/types';

interface SessionValue {
  user: AuthUser | null;
  ready: boolean;
  signIn: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  /**
   * Records a change the account has already accepted — the name from Settings
   * being the only one so far.
   *
   * The session holds what a token resolved to, which is why nothing here
   * refetches: `AuthUser` is fixed for that token's life, so a field the server
   * has just changed would otherwise stay wrong on every screen reading it (the
   * profile header, the home greeting) until the app is restarted. Not a write:
   * the caller has already made one and is reporting what it returned.
   */
  updateUser: (patch: Partial<AuthUser>) => void;
  /**
   * Ends the session: revokes the refresh token, drops the bearer, and starts
   * the guest session the app browses under. Resolves once there is a session
   * again, so a caller can navigate on a settled state.
   */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds the current session in memory.
 *
 * A guest session is created on first launch so the catalog and basket work
 * before anyone signs in, and verifying a phone later upgrades that same
 * account server-side. Tokens are not persisted yet — that needs secure
 * storage, which lands with the checkout flow.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Kept here rather than in the API client, which only ever sends the access
   * token. `POST /auth/logout` is the one thing that takes this, and it is the
   * whole difference between ending a session and merely forgetting it: a
   * refresh token nobody revoked stays good for thirty days.
   */
  const refreshToken = useRef<string | null>(null);

  /**
   * Which session the app is on.
   *
   * Every handshake below is asynchronous, so a slow one can land after the
   * session it was started for is gone — a guest token installed over a
   * sign-in would silently sign the user back out. Each installer takes a
   * number and only writes if it is still the current one.
   */
  const generation = useRef(0);

  const install = useCallback((next: AuthUser, accessToken: string, nextRefresh: string) => {
    refreshToken.current = nextRefresh;
    setAccessToken(accessToken);
    setUser(next);
  }, []);

  /** A fresh anonymous account, as on first launch. */
  const startGuest = useCallback(async () => {
    const mine = (generation.current += 1);
    try {
      const result = await auth.guest();
      if (generation.current === mine) {
        install(result.user, result.accessToken, result.refreshToken);
      }
    } catch {
      // Browsing is public, so a failed guest handshake must not block the
      // app — it only means no bearer is attached until sign-in.
    }
  }, [install]);

  useEffect(() => {
    let cancelled = false;

    void startGuest().finally(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      // Orphans anything still in flight, so it cannot write to an unmounted
      // provider.
      generation.current += 1;
    };
  }, [startGuest]);

  const signIn = useCallback(
    (nextUser: AuthUser, accessToken: string, nextRefresh: string) => {
      generation.current += 1;
      install(nextUser, accessToken, nextRefresh);
    },
    [install],
  );

  /**
   * Signs out: revokes the refresh token, then drops it and the bearer.
   *
   * The API call is best-effort, exactly as on the web — a token the server has
   * already forgotten still has to disappear from this phone, so a failure
   * there must not leave somebody signed in. The screen is cleared first for
   * the same reason: nothing about ending a session should wait on the network.
   *
   * A new guest session follows, because this app has no signed-out state — the
   * basket and the quote endpoint want a bearer, and leaving none would break
   * browsing for someone who has just logged out.
   */
  const signOut = useCallback(async () => {
    const revoking = refreshToken.current;

    generation.current += 1;
    refreshToken.current = null;
    setAccessToken(null);
    setUser(null);

    // The phone's guest favourites go with the session, as the basket does
    // (settings.tsx). They are normally already empty — sign-in hands them to
    // the account — but a transfer that failed would otherwise leave one
    // person's saved restaurants filling the hearts of whoever browses next.
    void clearGuestFavorites();

    if (revoking !== null) {
      try {
        await auth.logout(revoking);
      } catch {
        // Already expired, revoked, or unreachable. All three end the same way.
      }
    }

    await startGuest();
  }, [startGuest]);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    // Ignored when there is nobody: the caller only reaches this by way of a
    // request the session authorised, so a null here means the session ended
    // while that request was in flight and the patch belongs to an account this
    // phone is no longer on.
    setUser((current) => (current === null ? null : { ...current, ...patch }));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, ready, signIn, signOut, updateUser }),
    [user, ready, signIn, signOut, updateUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}
