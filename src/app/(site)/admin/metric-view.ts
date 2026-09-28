import { computeDelta, type Delta, type RangeKey } from '@/composition/admin-period';

export interface MetricRow {
  label: string;
  value: string;
  avg: string | null;
  delta: Delta | null;
}

function perDay(total: number, rangeDays: number): string | null {
  if (rangeDays <= 0) return null;
  const v = total / rangeDays;
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
}

export function buildMetricRows(args: {
  rangeDays: number;
  gscRangeDays?: number;
  pageViews: { referred: number; direct: number };
  users: { newUsers: number; returning: number };
  gscTotals: { clicks: number; impressions: number } | null;
  prevPageViews: { referred: number; direct: number } | null;
  prevUsers: { newUsers: number; returning: number } | null;
  prevGscTotals: { clicks: number; impressions: number } | null;
}): MetricRow[] {
  const {
    rangeDays,
    gscRangeDays = rangeDays,
    pageViews,
    users,
    gscTotals,
    prevPageViews,
    prevUsers,
    prevGscTotals,
  } = args;

  const viewsTotal = pageViews.referred + pageViews.direct;
  const usersTotal = users.newUsers + users.returning;

  return [
    {
      label: 'Page views',
      value: viewsTotal.toLocaleString(),
      avg: perDay(viewsTotal, rangeDays),
      delta: computeDelta(
        viewsTotal,
        prevPageViews ? prevPageViews.referred + prevPageViews.direct : null,
      ),
    },
    {
      label: 'Active users',
      value: usersTotal.toLocaleString(),
      avg: null,
      delta: computeDelta(usersTotal, prevUsers ? prevUsers.newUsers + prevUsers.returning : null),
    },
    {
      label: 'Search clicks',
      value: gscTotals ? gscTotals.clicks.toLocaleString() : '—',
      avg: gscTotals ? perDay(gscTotals.clicks, gscRangeDays) : null,
      delta: gscTotals ? computeDelta(gscTotals.clicks, prevGscTotals?.clicks ?? null) : null,
    },
    {
      label: 'Search impressions',
      value: gscTotals ? gscTotals.impressions.toLocaleString() : '—',
      avg: gscTotals ? perDay(gscTotals.impressions, gscRangeDays) : null,
      delta: gscTotals
        ? computeDelta(gscTotals.impressions, prevGscTotals?.impressions ?? null)
        : null,
    },
  ];
}

const RANGE_NOUN: Record<Exclude<RangeKey, 'all'>, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

export function metricsHint(rangeKey: RangeKey): string {
  return rangeKey === 'all' ? 'all time' : `Δ vs previous ${RANGE_NOUN[rangeKey]}`;
}
