import { trendSeries } from '@/composition/admin-period';

/**
 * A ranked list as DistributionBars rows: the label doubles as the React key
 * (paths/hosts/queries are unique). DistributionBars computes the share/fill and
 * the ordering, so the view only reshapes.
 */
export type BarRows = { key: string; label: string; count: number }[];

function barRows<T extends { count: number }>(items: T[], keyOf: (t: T) => string): BarRows {
  return items.map((it) => ({ key: keyOf(it), label: keyOf(it), count: it.count }));
}

/**
 * The app-owned telemetry half of the traffic section: the four ranked lists,
 * each pre-reduced to its fill max. (The daily-events trend moved to
 * activity-view's deriveActivityView, which adds the moving average, reference
 * line, and markers the AnnotatedDailyChart draws.)
 */
export function deriveTrafficView(input: {
  topPages: { path: string; count: number }[];
  topReferrers: { host: string; count: number }[];
  topEntryPages: { path: string; count: number }[];
  topSearches: { query: string; count: number }[];
}) {
  return {
    topPages: barRows(input.topPages, (r) => r.path),
    topReferrers: barRows(input.topReferrers, (r) => r.host),
    topEntryPages: barRows(input.topEntryPages, (r) => r.path),
    topSearches: barRows(input.topSearches, (r) => r.query),
  };
}

/** The last-sync stamp for the GSC card: "YYYY-MM-DD HH:MM UTC" or "never". */
export function formatSyncedAt(lastSyncedAt: Date | null): string {
  return lastSyncedAt
    ? `${lastSyncedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
    : 'never';
}

/**
 * The stored Google Search Console half: the three per-day trends, the top-pages
 * fill max, the sync stamp, and whether any trend data exists at all.
 */
export function deriveGscPerformanceView(input: {
  lastSyncedAt: Date | null;
  trend: { day: string; clicks: number; impressions: number; position: number }[];
  topPages: { clicks: number }[];
}) {
  return {
    asOf: formatSyncedAt(input.lastSyncedAt),
    hasTrend: input.trend.length > 0,
    clicksTrend: trendSeries(
      input.trend.map((d) => d.day),
      input.trend.map((d) => d.clicks),
    ),
    impressionsTrend: trendSeries(
      input.trend.map((d) => d.day),
      input.trend.map((d) => d.impressions),
    ),
    positionTrend: trendSeries(
      input.trend.map((d) => d.day),
      input.trend.map((d) => Math.round(d.position * 10) / 10),
    ),
    topPagesMax: input.topPages.reduce((m, p) => Math.max(m, p.clicks), 0),
  };
}
