import { trendSeries } from '@/composition/admin-period';
import { searchTotalsFromTrend, toDateStr } from '@/data/gsc/queries';
import type { GscDailyPoint, GscRange, GscTotals } from '@/data/gsc/types';

/**
 * The one window the search cards read: the previous period ends the day
 * before the current one starts, so a single daily series covers both.
 */
export function searchSpan(range: GscRange, previous: GscRange | null): GscRange {
  return { from: previous?.from ?? range.from, to: range.to };
}

function daysWithin(points: readonly GscDailyPoint[], range: GscRange): GscDailyPoint[] {
  const from = toDateStr(range.from);
  const to = toDateStr(range.to);
  return points.filter((point) => point.day >= from && point.day <= to);
}

/** Splits the spanning series back into each period's days and totals. */
export function splitSearchPeriods(
  points: readonly GscDailyPoint[],
  range: GscRange,
  previous: GscRange | null,
): { trend: GscDailyPoint[]; totals: GscTotals; prevTotals: GscTotals | null } {
  const trend = daysWithin(points, range);
  return {
    trend,
    totals: searchTotalsFromTrend(trend),
    prevTotals: previous ? searchTotalsFromTrend(daysWithin(points, previous)) : null,
  };
}

export function deriveGscPerformanceView(trend: readonly GscDailyPoint[]) {
  return {
    hasTrend: trend.length > 0,
    clicksTrend: trendSeries(
      trend.map((d) => d.day),
      trend.map((d) => d.clicks),
    ),
    impressionsTrend: trendSeries(
      trend.map((d) => d.day),
      trend.map((d) => d.impressions),
    ),
    positionTrend: trendSeries(
      trend.map((d) => d.day),
      trend.map((d) => Math.round(d.position * 10) / 10),
    ),
  };
}
