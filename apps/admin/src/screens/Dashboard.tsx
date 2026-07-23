import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Metrics } from '../api';
import { formatAmd, formatStatus } from '../format';

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [mismatches, setMismatches] = useState<{ orderCode: string; issue: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (period: number) => {
    try {
      const from = new Date(Date.now() - period * 86_400_000).toISOString();
      const [data, recon] = await Promise.all([api.metrics(from), api.reconciliation()]);
      setMetrics(data);
      setMismatches(recon.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load metrics');
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  if (error !== null) {
    return <p className="error">{error}</p>;
  }
  if (metrics === null) {
    return <p className="faint">Loading…</p>;
  }

  return (
    <section>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {RANGES.map((range) => (
          <button
            key={range.days}
            className="tab"
            aria-selected={range.days === days}
            onClick={() => setDays(range.days)}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="grid">
        <Stat label="Revenue" value={formatAmd(metrics.revenue.grossAmd)} note="paid orders only" />
        <Stat label="Orders" value={String(metrics.orders.earning)} note={`${metrics.orders.total} placed`} />
        <Stat label="Average order" value={formatAmd(metrics.revenue.averageOrderAmd)} />
        <Stat
          label="Platform fees"
          value={formatAmd(metrics.revenue.serviceFeeAmd)}
          note={`${formatAmd(metrics.revenue.discountAmd)} given as discounts`}
        />
        <Stat
          label="Abandoned"
          value={`${metrics.orders.abandonedPct}%`}
          note={`${metrics.orders.cancelled} cancelled`}
        />
        <Stat
          label="Customers"
          value={String(metrics.users.total)}
          note={`${metrics.users.newInPeriod} new · ${metrics.users.verified} verified`}
        />
        <Stat
          label="Bookings"
          value={String(metrics.reservations.total)}
          note={`${metrics.reservations.seated} seated · ${metrics.reservations.noShow} no-show`}
        />
      </div>

      <h2 style={{ fontSize: 17, marginTop: 28 }}>Top restaurants</h2>
      {metrics.topRestaurants.length === 0 ? (
        <p className="faint">No paid orders in this period.</p>
      ) : (
        metrics.topRestaurants.map((restaurant) => (
          <article key={restaurant.name} className="card">
            <div className="row spread">
              <span className="strong">{restaurant.name}</span>
              <span>
                {formatAmd(restaurant.revenueAmd)}{' '}
                <span className="faint">· {restaurant.orders} orders</span>
              </span>
            </div>
          </article>
        ))
      )}

      <h2 style={{ fontSize: 17, marginTop: 28 }}>Orders by status</h2>
      <div className="row" style={{ gap: 8 }}>
        {metrics.byStatus.map((row) => (
          <span key={row.status} className="badge">
            {formatStatus(row.status)}: {row.count}
          </span>
        ))}
      </div>

      {/* Empty is the expected answer — anything here needs a human, so it is
          shown loudly rather than hidden behind a filter. */}
      <h2 style={{ fontSize: 17, marginTop: 28 }}>Payment reconciliation</h2>
      {mismatches.length === 0 ? (
        <p className="faint">Nothing to reconcile.</p>
      ) : (
        mismatches.map((row) => (
          <article key={row.orderCode} className="card">
            <span className="strong">{row.orderCode}</span> <span className="error">{row.issue}</span>
          </article>
        ))
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="card">
      <div className="faint">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: '4px 0' }}>{value}</div>
      {note !== undefined && <div className="muted">{note}</div>}
    </article>
  );
}
