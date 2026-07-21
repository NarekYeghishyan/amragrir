import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from './api/endpoints';
import { setAccessToken } from './api/client';
import type { AuthUser } from './api/types';

interface SessionValue {
  user: AuthUser | null;
  ready: boolean;
  signIn: (user: AuthUser, accessToken: string) => void;
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

  useEffect(() => {
    let cancelled = false;

    auth
      .guest()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setAccessToken(result.accessToken);
        setUser(result.user);
      })
      .catch(() => {
        // Browsing is public, so a failed guest handshake must not block the
        // app — it only means no bearer is attached until sign-in.
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      signIn: (nextUser, accessToken) => {
        setAccessToken(accessToken);
        setUser(nextUser);
      },
    }),
    [user, ready],
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
