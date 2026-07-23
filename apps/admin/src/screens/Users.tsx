import { useCallback, useEffect, useState } from 'react';
import { Role } from '@amragrir/shared';
import { ApiError, api, type AdminUser } from '../api';

/** Roles an admin may assign — `guest` is a flag, not a database role. */
const ASSIGNABLE = [Role.Customer, Role.Staff, Role.Owner, Role.Admin] as const;

export function Users({ currentUserId }: { currentUserId: string | null }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const page = await api.users(q || undefined);
      setUsers(page.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load users');
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const changeRole = async (user: AdminUser, role: string): Promise<void> => {
    setBusyId(user.id);
    setError(null);
    try {
      await api.setUserRole(user.id, role);
      await load(query);
    } catch (err) {
      // The API's refusals are the useful text here — "the last administrator
      // cannot be demoted" explains itself better than anything invented.
      setError(err instanceof ApiError ? err.message : 'Could not change the role');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <form
        className="row"
        style={{ marginBottom: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Phone, name or email"
          aria-label="Search users"
        />
        <button className="primary">Search</button>
      </form>

      {error !== null && <p className="error">{error}</p>}

      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        return (
          <article key={user.id} className="card">
            <div className="row spread">
              <div>
                <div className="strong">{user.name ?? 'No name'}</div>
                <div className="faint">
                  {user.phone ?? 'no phone'}
                  {user.email !== null && ` · ${user.email}`} · {user.ordersCount} orders ·{' '}
                  {user.rewardPoints} points
                </div>
              </div>

              <div className="row">
                {user.isGuest && <span className="badge">guest</span>}
                {!user.phoneVerified && <span className="badge">unverified</span>}
                <select
                  value={user.role}
                  // Changing your own role is refused server-side too; the
                  // disabled control just avoids offering a dead end.
                  disabled={busyId === user.id || isSelf || user.isGuest || !user.phoneVerified}
                  onChange={(event) => void changeRole(user, event.target.value)}
                  aria-label={`Role of ${user.name ?? user.id}`}
                >
                  {ASSIGNABLE.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {isSelf && <p className="faint">This is you — change your own role from another account.</p>}
          </article>
        );
      })}

      {users.length === 0 && <p className="faint">Nobody matched.</p>}
    </section>
  );
}
