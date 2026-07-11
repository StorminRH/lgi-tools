import { trendSeries } from './period';

// A ranked list rendered as label + count bars: the rows (label doubles as the
// React key here — paths/hosts/queries are unique) and the max count for the
// proportional fill.
export type BarListData = { rows: { key: string; label: string; count: number }[]; max: number };

function barList<T extends { count: number }>(items: T[], keyOf: (t: T) => string): BarListData {
  const rows = items.map((it) => ({ key: keyOf(it), label: keyOf(it), count: it.count }));
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return { rows, max };
}

// The app-owned telemetry half of the traffic section: the daily-events trend
// plus the four ranked lists, each pre-reduced to its fill max.
export function deriveTrafficView(input: {
  dailyCounts: { day: string; totalEvents: number }[];
  topPages: { path: string; count: number }[];
  topReferrers: { host: string; count: number }[];
  topEntryPages: { path: string; count: number }[];
  topSearches: { query: string; count: number }[];
}) {
  return {
    dailyTrend: trendSeries(
      input.dailyCounts.map((d) => d.day),
      input.dailyCounts.map((d) => d.totalEvents),
    ),
    topPages: barList(input.topPages, (r) => r.path),
    topReferrers: barList(input.topReferrers, (r) => r.host),
    topEntryPages: barList(input.topEntryPages, (r) => r.path),
    topSearches: barList(input.topSearches, (r) => r.query),
  };
}

// The last-sync stamp for the GSC card: "YYYY-MM-DD HH:MM UTC" or "never".
export function formatSyncedAt(lastSyncedAt: Date | null): string {
  return lastSyncedAt
    ? `${lastSyncedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
    : 'never';
}

// The stored Google Search Console half: the three per-day trends, the top-pages
// fill max, the sync stamp, and whether any trend data exists at all.
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
