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
import { previousRange, type RangeKey } from '@/composition/admin-period';
import { SectionUnavailable } from './SectionUnavailable';

const RANGE_NOUN: Record<Exclude<RangeKey, 'all'>, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

function maybe<T>(cond: boolean, thunk: () => Promise<T>): Promise<T | null> {
  return cond ? thunk() : Promise.resolve(null);
}

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
