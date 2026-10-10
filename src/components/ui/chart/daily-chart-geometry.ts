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
  values: number[];
  yMax: number;
  barW: number;
  /** Pixels the first and last day map to: inset half a bar so no bar crosses the plot's edges. */
  xRange: [number, number];
  /** Where the end label starts: just past the last day's bar, which a short series leaves far from the plot's right edge. */
  endX: number;
  refValue: number | null;
  lastAvg: number;
  hover: DailyHoverPoint[];
}

const END_GAP = 5;

export function dailyChartModel(input: {
  points: { x: number; y: number }[];
  average: number[];
  labels: string[];
  referenceLine: { value: number; label: string } | null;
  plotLeft: number;
  plotRight: number;
}): DailyChartModel {
  const { points, average, labels, referenceLine, plotLeft, plotRight } = input;
  const n = points.length;
  const refValue = referenceLine ? referenceLine.value : null;
  if (n === 0) {
    const xRange: [number, number] = [plotLeft, plotRight];
    return { values: [], yMax: 1, barW: 1, xRange, endX: plotRight + END_GAP, refValue, lastAvg: 0, hover: [] };
  }
  const plotWidth = plotRight - plotLeft;

  const values = points.map((p) => p.y);
  const yMax = Math.max(...values, ...average, refValue ?? 0, 1);
  const slot = n > 1 ? plotWidth / (n - 1) : plotWidth;
  const barW = Math.max(1, Math.min(slot * 0.7, 26));
  // A single day maps to the start of the range (the scale's domain is [0, 1]),
  // so its bar sits just inside the value axis rather than across its labels.
  const xRange: [number, number] = [plotLeft + barW / 2, plotRight - barW / 2];
  const lastX = n > 1 ? xRange[1] : xRange[0];
  const endX = lastX + barW / 2 + END_GAP;
  const lastAvg = average[n - 1] ?? points[n - 1]!.y;
  const hover = points.map((p, i) => ({
    x: p.x,
    y: p.y,
    label: labels[i] ?? String(p.x),
    avg: average[i] ?? 0,
  }));

  return { values, yMax, barW, xRange, endX, refValue, lastAvg, hover };
}
