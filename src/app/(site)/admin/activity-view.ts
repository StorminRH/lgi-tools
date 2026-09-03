import type { DailyChartSeries } from '@/components/ui/chart/daily-chart-geometry';
import { movingAverage, weekOverWeekDelta, zeroFillDaily } from './aggregate';
import type { Delta } from '@/composition/admin-period';
import type { DateRange } from '@/data/telemetry/types';

const MS_PER_DAY = 86_400_000;
const MA_WINDOW = 7;

const MARKER_DENSITY_CAP = 120;

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export interface ActivityChartData extends DailyChartSeries {
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
  endValue: 0,
  endDelta: null,
  hasData: false,
};

function dedupeMarkersByDay(
  markers: { date: string; label: string }[],
): { date: string; label: string }[] {
  const byDay = new Map<string, string[]>();
  for (const m of markers) {
    const list = byDay.get(m.date);
    if (list) list.push(m.label);
    else byDay.set(m.date, [m.label]);
  }
  return [...byDay.entries()].map(([date, labels]) => ({
    date,
    label: labels.length === 1 ? labels[0]! : `${labels.length} deploys`,
  }));
}

export function deriveActivityView(input: {
  range: DateRange;
  dailyCounts: { day: string; totalEvents: number }[];
  prevDailyCounts: { day: string; totalEvents: number }[] | null;
  markers: { date: string; label: string }[];
}): ActivityChartData {
  const { range, dailyCounts, prevDailyCounts, markers } = input;
  if (dailyCounts.length === 0) return EMPTY;

  const rangeStart = isoDay(range.from);
  const firstDay = dailyCounts[0]!.day;
  const start = firstDay > rangeStart ? firstDay : rangeStart;
  const end = isoDay(range.to);
  const series = zeroFillDaily(
    dailyCounts.map((d) => ({ day: d.day, value: d.totalEvents })),
    start,
    end,
  );
  const average = movingAverage(series.values, MA_WINDOW);
  const points = series.values.map((y, x) => ({ x, y }));

  const prevTotal = prevDailyCounts
    ? prevDailyCounts.reduce((sum, d) => sum + d.totalEvents, 0)
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
    endValue: series.values[series.values.length - 1]!,
    endDelta: weekOverWeekDelta(series.values),
    hasData: true,
  };
}

export function rangeDayCount(range: DateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / MS_PER_DAY));
}
