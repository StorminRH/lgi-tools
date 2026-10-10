import type { DailyChartSeries } from '@/components/ui/chart/daily-chart-geometry';
import { movingAverage, zeroFillDaily } from './aggregate';
import { computeDelta, type Delta } from '@/composition/admin-period';
import type { DateRange } from '@/data/telemetry/types';
import { groupBy } from '@/lib/array';

const MS_PER_DAY = 86_400_000;
const MA_WINDOW = 7;
const MARKER_DENSITY_CAP = 120;

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export interface ActivityChartData extends DailyChartSeries {
  totalValue: number;
  endValue: number;
  endDelta: Delta | null;
  hasData: boolean;
}

const EMPTY: ActivityChartData = {
  points: [],
  average: [],
  labels: [],
  weekend: [],
  referenceLine: null,
  eventMarkers: [],
  totalValue: 0,
  endValue: 0,
  endDelta: null,
  hasData: false,
};

function dedupeMarkersByDay(
  markers: { date: string; label: string }[],
): { date: string; label: string }[] {
  const byDay = groupBy(markers, (m) => m.date, (m) => m.label);
  return [...byDay.entries()].map(([date, labels]) => ({
    date,
    label: labels.length === 1 ? labels[0]! : `${labels.length} releases`,
  }));
}

export function deriveActivityView(input: {
  range: DateRange;
  dailyCounts: { day: string; views: number }[];
  prevDailyCounts: { day: string; views: number }[] | null;
  markers: { date: string; label: string }[];
}): ActivityChartData {
  const { range, dailyCounts, prevDailyCounts, markers } = input;
  if (dailyCounts.length === 0) return EMPTY;

  const rangeStart = isoDay(range.from);
  const firstDay = dailyCounts[0]!.day;
  const start = firstDay > rangeStart ? firstDay : rangeStart;
  // The range is half-open, so its last day is the one holding `to - 1ms`;
  // a range ending at midnight must not add an empty day for tomorrow.
  const end = isoDay(new Date(range.to.getTime() - 1));
  const series = zeroFillDaily(
    dailyCounts.map((d) => ({ day: d.day, value: d.views })),
    start,
    end,
  );
  const average = movingAverage(series.values, MA_WINDOW);
  const points = series.values.map((y, x) => ({ x, y }));

  const prevTotal = prevDailyCounts
    ? prevDailyCounts.reduce((sum, d) => sum + d.views, 0)
    : 0;
  const referenceLine =
    prevDailyCounts && prevTotal > 0
      ? { value: prevTotal / rangeDayCount(range), label: 'prior avg' }
      : null;

  const dayIndex = new Map(series.days.map((day, i) => [day, i]));
  const eventMarkers =
    series.days.length > MARKER_DENSITY_CAP
      ? []
      : dedupeMarkersByDay(markers)
          .map((m) => {
            const x = dayIndex.get(m.date);
            return x === undefined ? null : { x, label: m.label };
          })
          .filter((m): m is { x: number; label: string } => m !== null);

  return {
    points,
    average,
    labels: series.days,
    weekend: series.weekend,
    referenceLine,
    eventMarkers,
    totalValue: dailyCounts.reduce((sum, day) => sum + day.views, 0),
    endValue: series.values[series.values.length - 1]!,
    endDelta: computeDelta(dailyCounts.reduce((sum, day) => sum + day.views, 0), prevDailyCounts === null ? null : prevTotal),
    hasData: true,
  };
}

export function rangeDayCount(range: DateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / MS_PER_DAY));
}
