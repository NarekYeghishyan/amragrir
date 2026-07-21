import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, tokens, type OwnerBranch } from './api';
import { SignIn } from './screens/SignIn';
import { Orders } from './screens/Orders';
import { Menu } from './screens/Menu';
import { Branches } from './screens/Branches';

const TABS = ['Orders', 'Menu', 'Branches'] as const;
type Tab = (typeof TABS)[number];

/**
 * No router.
 *
 * Three tabs and no deep links to share — a router would be a dependency and a
 * build step for something local state already does. Add one when a screen
 * needs to be linkable.
 */
export function App() {
  const [signedIn, setSignedIn] = useState(tokens.access !== null);
  const [tab, setTab] = useState<Tab>('Orders');
  const [branches, setBranches] = useState<OwnerBranch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    try {
      const page = await api.branches();
      setBranches(page.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // The stored token is gone, expired past refresh, or belongs to an
        // account that is not staff. Either way this is a sign-in, not an error.
        tokens.clear();
        setSignedIn(false);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load your restaurants');
    }
  }, []);

  useEffect(() => {
    if (signedIn) {
      void loadBranches();
    }
  }, [signedIn, loadBranches]);

  if (!signedIn) {
    return <SignIn onSignedIn={() => setSignedIn(true)} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Back office</h1>
        <nav className="tabs">
          {TABS.map((value) => (
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
        <button
          onClick={() => {
            tokens.clear();
            setSignedIn(false);
          }}
        >
          Sign out
        </button>
      </header>

      {error !== null && <p className="error">{error}</p>}

      {tab === 'Orders' && <Orders />}
      {tab === 'Menu' &&
        (branches === null ? (
          <p className="faint">Loading…</p>
        ) : (
          <Menu branches={branches} />
        ))}
      {tab === 'Branches' &&
        (branches === null ? (
          <p className="faint">Loading…</p>
        ) : (
          <Branches branches={branches} onChanged={() => void loadBranches()} />
        ))}
    </div>
  );
}
