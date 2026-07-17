// Pure plain-number model for the AnnotatedDailyChart, extracted so the
// component stays a thin renderer (the same split as chart-geometry.ts). No
// React, no visx — just the derived arrays and scalars the chart draws, so it
// unit-tests cleanly and no single render function carries the branchy math.

/**
 * The plain daily-chart series the server computes and the chart draws — the one
 * shape shared by the section's derived data and the client wrapper's props.
 */
export interface DailyChartSeries {
  points: { x: number; y: number }[];
  average: number[];
  labels: string[];
  weekend: boolean[];
  referenceLine: { value: number; label: string } | null;
  eventMarkers: { x: number; label: string }[];
}

/**
 * Display-ready daily hover point consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export interface DailyHoverPoint {
  x: number;
  y: number;
  label: string;
  avg: number;
}

/**
 * Display-ready daily chart model consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export interface DailyChartModel {
  /** Ordinal x indices and raw y values, parallel to the points. */
  xs: number[];
  values: number[];
  /** Axis ceiling covering the bars, the average line, and the reference line. */
  yMax: number;
  /** Per-day bar width, capped so a wide range stays legible. */
  barW: number;
  /** Prior-period reference value, or null when suppressed. */
  refValue: number | null;
  /** The latest moving-average value (falls back to the last raw value). */
  lastAvg: number;
  /** Tooltip data enriched with the day label and moving-average value. */
  hover: DailyHoverPoint[];
}

/**
 * Computes chart scales, paths, bars, markers, and hover points from one daily series and
 * viewport; all geometry is returned in pixels.
 */
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
  // One slot per day; bars fill most of it but stay ≥1px and ≤26px when dense.
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
