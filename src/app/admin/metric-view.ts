import { computeDelta, type Delta } from './period';

// The dashboard's headline metrics as MetricTable row view-models: current
// value, per-day average over the window, a period-over-period delta (each
// metric queries its current + equal-length prior window, so no new SQL), and
// an optional daily series for the inline sparkline. This replaces the KpiCard
// grid's buildKpiCards; the two-way share subs it used to print (referred %,
// new-vs-returning) now render as StackedShareBars, and avg position moves to
// the GSC small-multiples — so the table stays four clean columns.

export interface MetricRow {
  label: string;
  /** Pre-formatted headline value for the current window ('—' when N/A). */
  value: string;
  /** Pre-formatted per-day average, or null when there is no meaningful one. */
  avg: string | null;
  delta: Delta | null;
  /** Daily series for the inline sparkline; absent when no per-day data exists. */
  series?: number[];
}

// Per-day average of a whole-count total over the window's calendar length,
// formatted compactly: one decimal below 10/day, whole numbers above.
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
