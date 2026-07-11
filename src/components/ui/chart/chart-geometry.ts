// Pure geometry helpers shared by the chart primitives (Sparkline, TrendChart,
// BarChart). No React, no visx — just the number crunching, so it unit-tests
// cleanly and the chart shells stay presentation-only. `Sparkline` /
// `TrendChart` re-export the ones their existing tests pin, so those imports
// keep resolving from `./sparkline` / `./trend-chart`.

/** Min/max of a non-empty list, in one pass. */
export function extent(values: number[]): [number, number] {
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/**
 * Domain for the value axis with a little headroom so the line never rides the
 * top/bottom edge, and a flat series still gets a non-degenerate range.
 */
export function paddedDomain(values: number[]): [number, number] {
  const [min, max] = extent(values);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  return [min - pad, max + pad];
}

/** Index of the datum whose x is closest to the probe x (linear scan; series are short). */
export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(xs[0] - x);
  for (let i = 1; i < xs.length; i += 1) {
    const dist = Math.abs(xs[i] - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Up to `max` evenly spaced indices into a series of `count` points, always
 * including the first and last.
 */
export function tickIndices(count: number, max: number): number[] {
  if (count <= 0) return [];
  if (max <= 1 || count === 1) return [0];
  const n = Math.min(count, max);
  const step = (count - 1) / (n - 1);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) indices.push(Math.round(i * step));
  return [...new Set(indices)];
}

/**
 * Resolve a continuous-x hover to the nearest datum. `probeX` is the inverted
 * pointer position in data space; returns the closest datum and its index, or
 * null for an empty series. The chart shells feed the result to the tooltip.
 */
export function continuousHoverTarget<T>(
  xs: number[],
  probeX: number,
  data: T[],
): { datum: T; index: number } | null {
  const index = nearestIndex(xs, probeX);
  if (index < 0) return null;
  return { datum: data[index], index };
}
