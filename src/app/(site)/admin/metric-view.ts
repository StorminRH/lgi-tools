import { computeDelta, type Delta } from '@/composition/admin-period';

export interface MetricRow {
  label: string;

  value: string;

  avg: string | null;
  delta: Delta | null;

  series?: number[];
}

function perDay(total: number, rangeDays: number): string | null {
  if (rangeDays <= 0) return null;
  const v = total / rangeDays;
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
}

export function buildMetricRows(args: {
  rangeDays: number;
  pageViews: { referred: number; direct: number };
  users: { newUsers: number; returning: number };
  gscTotals: { clicks: number; impressions: number } | null;
  prevPageViews: { referred: number; direct: number } | null;
  prevUsers: { newUsers: number; returning: number } | null;
  prevGscTotals: { clicks: number; impressions: number } | null;
  clicksSeries?: number[];
  impressionsSeries?: number[];
}): MetricRow[] {
  const {
    rangeDays,
    pageViews,
    users,
    gscTotals,
    prevPageViews,
    prevUsers,
    prevGscTotals,
    clicksSeries,
    impressionsSeries,
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
      label: 'Signed-in users',
      value: usersTotal.toLocaleString(),
      avg: perDay(usersTotal, rangeDays),
      delta: computeDelta(usersTotal, prevUsers ? prevUsers.newUsers + prevUsers.returning : null),
    },
    {
      label: 'Search clicks',
      value: gscTotals ? gscTotals.clicks.toLocaleString() : '—',
      avg: gscTotals ? perDay(gscTotals.clicks, rangeDays) : null,
      delta: gscTotals ? computeDelta(gscTotals.clicks, prevGscTotals?.clicks ?? null) : null,
      series: clicksSeries,
    },
    {
      label: 'Search impressions',
      value: gscTotals ? gscTotals.impressions.toLocaleString() : '—',
      avg: gscTotals ? perDay(gscTotals.impressions, rangeDays) : null,
      delta: gscTotals
        ? computeDelta(gscTotals.impressions, prevGscTotals?.impressions ?? null)
        : null,
      series: impressionsSeries,
    },
  ];
}
