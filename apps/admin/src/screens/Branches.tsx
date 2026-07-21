import { useState } from 'react';
import { ApiError, api, type OwnerBranch } from '../api';

/**
 * The open/closed switch, which is the control a shift actually uses: a closed
 * branch refuses new orders (422 from `POST /orders`), so this is the button
 * that stops the queue filling up when the kitchen has to stop.
 */
export function Branches({
  branches,
  onChanged,
}: {
  branches: OwnerBranch[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (branch: OwnerBranch): Promise<void> => {
    setBusyId(branch.id);
    setError(null);
    try {
      await api.updateBranch(branch.id, { isOpen: !branch.isOpen });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the branch');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      {error !== null && <p className="error">{error}</p>}

      {branches.map((branch) => (
        <article key={branch.id} className="card">
          <div className="row spread">
            <div>
              <div className="strong">
                {branch.restaurantName} — {branch.name ?? branch.city}
              </div>
              <div className="faint">
                {branch.address ?? branch.city}
                {branch.avgPrepMin !== null && ` · about ${branch.avgPrepMin} min prep`} ·{' '}
                {branch.menuItemCount} dishes
              </div>
            </div>

            <div className="row">
              <span className={branch.isOpen ? 'live' : 'offline'}>
                {branch.isOpen ? '● Accepting orders' : '○ Closed'}
              </span>
              <button
                className={branch.isOpen ? '' : 'primary'}
                disabled={busyId === branch.id}
                onClick={() => void toggle(branch)}
              >
                {branch.isOpen ? 'Stop taking orders' : 'Open'}
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
