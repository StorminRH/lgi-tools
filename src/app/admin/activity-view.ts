import type { DailyChartSeries } from '@/components/ui/chart/daily-chart-geometry';
import { movingAverage, weekOverWeekDelta, zeroFillDaily } from './aggregate';
import type { Delta } from './period';
import type { DateRange } from '@/data/telemetry/types';

// Server-side derivation for the Activity chart (AnnotatedDailyChart): expand the
// sparse daily counts to a continuous calendar series, add the 7-day moving
// average, the prior-period reference line, weekend flags, deploy markers, and
// the end label. Pure and testable; the client chart component re-derives none
// of it. The moving-average window and the marker-density cap are the two tunable
// constants.

const MS_PER_DAY = 86_400_000;
const MA_WINDOW = 7;
// Beyond this many days a per-deploy marker line reads as noise, so drop markers.
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

// One marker per day: many sub-versions ship on the same date, so collapse them
// (label = the single version, or "N deploys" when several land the same day).
export function dedupeMarkersByDay(
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

  // Fill the continuous span, but clamp the start to the first day with data so a
  // wide range (`all`, whose floor predates launch) never fabricates pre-launch
  // zeros; end at the range's `to` so the axis reaches "today".
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

  // Reference = the prior equal-length window's average daily events; suppressed
  // (null) when that window holds no data — no misleading NaN/zero line.
  const prevTotal = prevDailyCounts
    ? prevDailyCounts.reduce((sum, d) => sum + d.totalEvents, 0)
    : 0;
  const referenceLine =
    prevDailyCounts && prevTotal > 0
      ? { value: prevTotal / series.values.length, label: 'prior avg' }
      : null;

  // Deploy markers → their ordinal index in the filled series (out-of-range days
  // drop out); suppressed entirely on a dense (wide) range.
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

// Number of whole days in a range — for callers that need the window length.
export function rangeDayCount(range: DateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / MS_PER_DAY));
}
