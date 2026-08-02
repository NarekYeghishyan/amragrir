import { useCallback, useEffect, useState } from 'react';
import { api, errorText, type Metrics } from '../api';
import { useT } from '../i18n';
import { formatAmd } from '../format';
import {
  Badge,
  Banner,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  SegmentedTabs,
  Skeleton,
} from '../ui';

const RANGES = [
  { value: '7', label: 'dashboardRange7' },
  { value: '30', label: 'dashboardRange30' },
  { value: '90', label: 'dashboardRange90' },
] as const;

type Range = (typeof RANGES)[number]['value'];

export function Dashboard() {
  const t = useT();
  const [range, setRange] = useState<Range>('30');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [mismatches, setMismatches] = useState<{ orderCode: string; issue: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (period: number) => {
      try {
        const from = new Date(Date.now() - period * 86_400_000).toISOString();
        const [data, recon] = await Promise.all([api.metrics(from), api.reconciliation()]);
        setMetrics(data);
        setMismatches(recon.items);
        setError(null);
      } catch (err) {
        setError(errorText(t, err, 'errorLoadMetrics'));
      }
    },
    [t],
  );

  useEffect(() => {
    void load(Number(range));
  }, [range, load]);

  return (
    <section>
      <PageHeader title={t('dashboardTitle')} description={t('dashboardDesc')} />

      {error !== null && <Banner>{error}</Banner>}

      <SegmentedTabs
        value={range}
        onValueChange={setRange}
        segments={RANGES.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
        label={t('dashboardPeriod')}
      >
        {metrics === null ? (
          <Skeleton count={4} height={96} />
        ) : (
          <>
            <div className="stats">
              <Stat
                label={t('statRevenue')}
                value={formatAmd(metrics.revenue.grossAmd)}
                note={t('statRevenueNote')}
              />
              <Stat
                label={t('statOrders')}
                value={String(metrics.orders.earning)}
                note={t('statOrdersNote', { count: metrics.orders.total })}
              />
              <Stat
                label={t('statAverageOrder')}
                value={formatAmd(metrics.revenue.averageOrderAmd)}
              />
              <Stat
                label={t('statPlatformFees')}
                value={formatAmd(metrics.revenue.serviceFeeAmd)}
                note={t('statPlatformFeesNote', {
                  amount: formatAmd(metrics.revenue.discountAmd),
                })}
              />
              <Stat
                label={t('statAbandoned')}
                value={`${metrics.orders.abandonedPct}%`}
                note={t('statAbandonedNote', { count: metrics.orders.cancelled })}
              />
              <Stat
                label={t('statCustomers')}
                value={String(metrics.users.total)}
                note={t('statCustomersNote', {
                  new: metrics.users.newInPeriod,
                  verified: metrics.users.verified,
                })}
              />
              <Stat
                label={t('statBookings')}
                value={String(metrics.reservations.total)}
                note={t('statBookingsNote', {
                  seated: metrics.reservations.seated,
                  noShow: metrics.reservations.noShow,
                })}
              />
            </div>

            <SectionTitle>{t('dashboardTopRestaurants')}</SectionTitle>
            {metrics.topRestaurants.length === 0 ? (
              <EmptyState icon="restaurants" title={t('dashboardNoPaidOrders')} />
            ) : (
              <Card>
                {metrics.topRestaurants.map((restaurant) => (
                  <RevenueBar
                    key={restaurant.name}
                    name={restaurant.name}
                    orders={t.plural('orderCount', restaurant.orders)}
                    revenueAmd={restaurant.revenueAmd}
                    // Share of the leader, not of the total: it is the ranking
                    // that is being read here, not each one's slice of revenue.
                    share={restaurant.revenueAmd / (metrics.topRestaurants[0]?.revenueAmd || 1)}
                  />
                ))}
              </Card>
            )}

            <SectionTitle>{t('dashboardByStatus')}</SectionTitle>
            <div className="row row--tight">
              {metrics.byStatus.map((row) => (
                <Badge key={row.status}>
                  {t(`orderStatus_${row.status}`)} · <span className="num">{row.count}</span>
                </Badge>
              ))}
            </div>

            {/* Empty is the expected answer — anything here needs a human, so it
                is shown loudly rather than hidden behind a filter. */}
            <SectionTitle>{t('dashboardReconciliation')}</SectionTitle>
            {mismatches.length === 0 ? (
              <Banner tone="good">{t('dashboardReconciled')}</Banner>
            ) : (
              <>
                <Banner tone="warn">
                  {t.plural('mismatchCount', mismatches.length)} {t('dashboardMismatchAction')}
                </Banner>
                <Card className="card--flush table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('dashboardColOrder')}</th>
                        <th>{t('dashboardColIssue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mismatches.map((row) => (
                        <tr key={row.orderCode}>
                          <td className="strong">{row.orderCode}</td>
                          <td>{row.issue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </>
            )}
          </>
        )}
      </SegmentedTabs>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {note !== undefined && <div className="stat__note">{note}</div>}
    </Card>
  );
}

function RevenueBar({
  name,
  orders,
  revenueAmd,
  share,
}: {
  name: string;
  /** Already counted and phrased — the plural rule is the caller's business. */
  orders: string;
  revenueAmd: number;
  share: number;
}) {
  return (
    <div className="bar-row">
      <div className="row spread">
        <span className="strong">{name}</span>
        <span className="num">
          {formatAmd(revenueAmd)} <span className="faint">· {orders}</span>
        </span>
      </div>
      <div className="bar">
        <div className="bar__fill" style={{ width: `${Math.max(2, share * 100)}%` }} />
      </div>
    </div>
  );
}
