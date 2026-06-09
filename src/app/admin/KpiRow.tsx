import { isGscConfigured } from '@/data/gsc/constants';
import { getSearchTotals } from '@/data/gsc/queries';
import { getReturningVsNew, getSearchVsDirect } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { KpiCard } from './KpiCard';
import { computeDelta, previousRange, type RangeKey } from './period';

// The dashboard's headline numbers. Each KPI runs its query twice — current
// window and the equal-length window before it — so the delta needs no new
// SQL. `all` has no previous window, so deltas are simply absent there.

const RANGE_NOUN: Record<Exclude<RangeKey, 'all'>, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

export async function KpiRow({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  const prev = previousRange(rangeKey, range);
  const gsc = isGscConfigured();

  const [pageViews, users, gscTotals, prevPageViews, prevUsers, prevGscTotals] =
    await Promise.all([
      getSearchVsDirect(range),
      getReturningVsNew(range),
      gsc ? getSearchTotals(range) : null,
      prev ? getSearchVsDirect(prev) : null,
      prev ? getReturningVsNew(prev) : null,
      gsc && prev ? getSearchTotals(prev) : null,
    ]);

  const viewsTotal = pageViews.referred + pageViews.direct;
  const referredPct =
    viewsTotal === 0 ? null : Math.round((pageViews.referred / viewsTotal) * 100);
  const usersTotal = users.newUsers + users.returning;

  return (
    <section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard
          label="Page views"
          value={viewsTotal.toLocaleString()}
          sub={
            referredPct === null
              ? 'no page views this period'
              : `${referredPct}% via external referrers`
          }
          delta={computeDelta(
            viewsTotal,
            prevPageViews ? prevPageViews.referred + prevPageViews.direct : null,
          )}
        />
        <KpiCard
          label="Signed-in users"
          value={usersTotal.toLocaleString()}
          sub={`${users.newUsers} new · ${users.returning} returning`}
          delta={computeDelta(
            usersTotal,
            prevUsers ? prevUsers.newUsers + prevUsers.returning : null,
          )}
        />
        <KpiCard
          label="Search clicks"
          value={gscTotals ? gscTotals.clicks.toLocaleString() : '—'}
          sub={gscTotals ? `${(gscTotals.ctr * 100).toFixed(1)}% CTR` : 'GSC not connected'}
          delta={gscTotals ? computeDelta(gscTotals.clicks, prevGscTotals?.clicks ?? null) : null}
        />
        <KpiCard
          label="Search impressions"
          value={gscTotals ? gscTotals.impressions.toLocaleString() : '—'}
          sub={gscTotals ? `avg position ${gscTotals.position.toFixed(1)}` : 'GSC not connected'}
          delta={
            gscTotals
              ? computeDelta(gscTotals.impressions, prevGscTotals?.impressions ?? null)
              : null
          }
        />
      </div>
      {prev && rangeKey !== 'all' && (
        <div className="mt-1.5 font-mono text-[10px] text-muted text-right">
          change vs the previous {RANGE_NOUN[rangeKey]}
        </div>
      )}
    </section>
  );
}
