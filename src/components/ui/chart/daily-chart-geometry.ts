export interface DailyChartSeries {
  points: { x: number; y: number }[];
  average: number[];
  labels: string[];
  weekend: boolean[];
  referenceLine: { value: number; label: string } | null;
  eventMarkers: { x: number; label: string }[];
}

export interface DailyHoverPoint {
  x: number;
  y: number;
  label: string;
  avg: number;
}

export interface DailyChartModel {
  xs: number[];
  values: number[];
  yMax: number;
  barW: number;
  refValue: number | null;
  lastAvg: number;
  hover: DailyHoverPoint[];
}

export function dailyChartModel(input: {
  points: { x: number; y: number }[];
  average: number[];
  labels: string[];
  referenceLine: { value: number; label: string } | null;
  plotWidth: number;
}): DailyChartModel {
  const { points, average, labels, referenceLine, plotWidth } = input;
  const n = points.length;
  const refValue = referenceLine ? referenceLine.value : null;
  if (n === 0) {
    return { xs: [], values: [], yMax: 1, barW: 1, refValue, lastAvg: 0, hover: [] };
  }

  const xs = points.map((p) => p.x);
  const values = points.map((p) => p.y);
  const yMax = Math.max(...values, ...average, refValue ?? 0, 1);
  const slot = n > 1 ? plotWidth / (n - 1) : plotWidth;
  const barW = Math.max(1, Math.min(slot * 0.7, 26));
  const lastAvg = average[n - 1] ?? points[n - 1]!.y;
  const hover = points.map((p, i) => ({
    x: p.x,
    y: p.y,
    label: labels[i] ?? String(p.x),
    avg: average[i] ?? 0,
  }));

  return { xs, values, yMax, barW, refValue, lastAvg, hover };
}
