import { useCallback, useEffect, useState } from 'react';
import { Role } from '@amragrir/shared';
import { ApiError, api, tokens, type OwnerBranch } from './api';
import { SignIn } from './screens/SignIn';
import { Orders } from './screens/Orders';
import { Menu } from './screens/Menu';
import { Branches } from './screens/Branches';
import { Dashboard } from './screens/Dashboard';
import { Users } from './screens/Users';
import { Platform } from './screens/Platform';

const OWNER_TABS = ['Orders', 'Menu', 'Branches'] as const;
const ADMIN_TABS = ['Dashboard', 'Users', 'Platform'] as const;
type Tab = (typeof OWNER_TABS)[number] | (typeof ADMIN_TABS)[number];

/**
 * No router.
 *
 * A handful of tabs and no deep links to share — a router would be a
 * dependency and a build step for something local state already does. Add one
 * when a screen needs to be linkable.
 */
export function App() {
  const [signedIn, setSignedIn] = useState(tokens.access !== null);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [tab, setTab] = useState<Tab>('Orders');
  const [branches, setBranches] = useState<OwnerBranch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    tokens.clear();
    setMe(null);
    setSignedIn(false);
  }, []);

  const load = useCallback(async () => {
    try {
      // Who the caller is decides which tabs render. The API enforces the
      // same thing independently; this only avoids offering dead ends.
      const profile = await api.me();
      setMe({ id: profile.id, role: profile.role });

      const page = await api.branches();
      setBranches(page.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // The stored token is gone, expired past refresh, or belongs to an
        // account that is not staff — including one just demoted, whose
        // sessions the API revokes. Either way this is a sign-in, not an error.
        signOut();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load your restaurants');
    }
  }, [signOut]);

  useEffect(() => {
    if (signedIn) {
      void load();
    }
  }, [signedIn, load]);

  if (!signedIn) {
    return <SignIn onSignedIn={() => setSignedIn(true)} />;
  }

  const isAdmin = me?.role === Role.Admin;
  const tabs: Tab[] = [...OWNER_TABS, ...(isAdmin ? ADMIN_TABS : [])];

  return (
    <div className="app">
      <header className="topbar">
        <h1>{isAdmin ? 'Platform admin' : 'Back office'}</h1>
        <nav className="tabs">
          {tabs.map((value) => (
            <button
              key={value}
              className="tab"
              role="tab"
              aria-selected={value === tab}
              onClick={() => setTab(value)}
            >
              {value}
            </button>
          ))}
        </nav>
        <button onClick={signOut}>Sign out</button>
      </header>

      {error !== null && <p className="error">{error}</p>}

      {tab === 'Orders' && <Orders />}
      {tab === 'Menu' &&
        (branches === null ? <p className="faint">Loading…</p> : <Menu branches={branches} />)}
      {tab === 'Branches' &&
        (branches === null ? (
          <p className="faint">Loading…</p>
        ) : (
          <Branches branches={branches} onChanged={() => void load()} />
        ))}

      {/* Guarded on `isAdmin` as well as on the tab, so a stale `tab` value
          from a demoted session cannot render an admin screen. */}
      {isAdmin && tab === 'Dashboard' && <Dashboard />}
      {isAdmin && tab === 'Users' && <Users currentUserId={me?.id ?? null} />}
      {isAdmin && tab === 'Platform' && <Platform />}
    </div>
  );
}
