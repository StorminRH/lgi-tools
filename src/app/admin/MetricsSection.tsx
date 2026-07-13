import { isGscConfigured } from '@/data/gsc/constants';
import { getSearchTotals, getSearchTrend } from '@/data/gsc/queries';
import type { GscDailyPoint } from '@/data/gsc/types';
import { getReturningVsNew, getSearchVsDirect } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { rangeDayCount } from './activity-view';
import { zeroFillDaily } from './aggregate';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { MetricTable } from './MetricTable';
import { buildMetricRows } from './metric-view';
import { previousRange, type RangeKey } from './period';
import { SectionUnavailable } from './SectionUnavailable';

// The dashboard's headline metrics section. Each metric queries its current
// window and the equal-length window before it, so the period-over-period delta
// needs no new SQL; `all` has no previous window, so deltas are simply absent
// there. The two GSC metrics also carry a zero-filled daily series for their
// inline sparkline (search clicks/impressions are the only headline metrics with
// a per-day series; page views and users are scalar totals only).

const RANGE_NOUN: Record<Exclude<RangeKey, 'all'>, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

// Run a query only when its gate is on, else resolve to null — keeps the fan-out
// a flat list instead of a wall of inline ternaries.
function maybe<T>(cond: boolean, thunk: () => Promise<T>): Promise<T | null> {
  return cond ? thunk() : Promise.resolve(null);
}

// A GSC metric's recent-trend sparkline: zero-fill internal gaps across the
// covered span (first→last synced day, never out to today — GSC lags a day or
// two and trailing zeros would misread), then keep the last 28 days.
function gscSparkline(trend: GscDailyPoint[], pick: (p: GscDailyPoint) => number): number[] {
  if (trend.length === 0) return [];
  const start = trend[0]!.day;
  const end = trend[trend.length - 1]!.day;
  const filled = zeroFillDaily(
    trend.map((p) => ({ day: p.day, value: pick(p) })),
    start,
    end,
  );
  return filled.values.slice(-28);
}

// The clicks + impressions sparkline series together, or undefineds when there's
// no GSC data — so a row's series is either absent or non-empty, and the table
// cell needs a single truthiness check.
function gscSparklines(trend: GscDailyPoint[] | null): {
  clicks: number[] | undefined;
  impressions: number[] | undefined;
} {
  if (!trend || trend.length === 0) return { clicks: undefined, impressions: undefined };
  return {
    clicks: gscSparkline(trend, (p) => p.clicks),
    impressions: gscSparkline(trend, (p) => p.impressions),
  };
}

function metricsHint(rangeKey: RangeKey): string {
  return rangeKey === 'all' ? 'all time' : `Δ vs previous ${RANGE_NOUN[rangeKey]}`;
}

export async function MetricsSection({
  rangeKey,
  range,
}: {
  rangeKey: RangeKey;
  range: DateRange;
}) {
  const prev = previousRange(rangeKey, range);
  const gsc = isGscConfigured();
  const hasPrev = prev != null;

  const fetched = await loadSection('headline-metrics', () =>
    Promise.all([
      getSearchVsDirect(range),
      getReturningVsNew(range),
      maybe(gsc, () => getSearchTotals(range)),
      maybe(gsc, () => getSearchTrend(range)),
      maybe(hasPrev, () => getSearchVsDirect(prev!)),
      maybe(hasPrev, () => getReturningVsNew(prev!)),
      maybe(gsc && hasPrev, () => getSearchTotals(prev!)),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Headline metrics" />;

  const [pageViews, users, gscTotals, gscTrend, prevPageViews, prevUsers, prevGscTotals] = fetched;
  const sparklines = gscSparklines(gscTrend);

  const rows = buildMetricRows({
    rangeDays: rangeDayCount(range),
    pageViews,
    users,
    gscTotals,
    prevPageViews,
    prevUsers,
    prevGscTotals,
    clicksSeries: sparklines.clicks,
    impressionsSeries: sparklines.impressions,
  });

  return <MetricTable rows={rows} hint={metricsHint(rangeKey)} />;
}
