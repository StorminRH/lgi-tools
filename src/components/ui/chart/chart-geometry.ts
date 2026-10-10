/** The charts' default value format: the number as written. */
export const formatPlainValue = (value: number): string => String(value);

/** The charts' default label format: the label unchanged. */
export const identityLabel = (label: string): string => label;

export function extent(values: readonly number[]): [number, number] {
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

export function paddedDomain(values: readonly number[]): [number, number] {
  const [min, max] = extent(values);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  return [min - pad, max + pad];
}

function nearestIndex(xs: number[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (const [i, xi] of xs.entries()) {
    const dist = Math.abs(xi - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

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
 * Where a date label sits on its point: the first and last points lie on the
 * plot's edges, so their labels grow inward instead of overhanging.
 */
export function tickAnchor(index: number, count: number): 'start' | 'middle' | 'end' {
  if (count < 2) return 'middle';
  if (index === 0) return 'start';
  return index === count - 1 ? 'end' : 'middle';
}

export function continuousHoverTarget<T>(
  xs: number[],
  probeX: number,
  data: T[],
): { datum: T; index: number } | null {
  const index = nearestIndex(xs, probeX);
  if (index < 0) return null;
  return { datum: data[index]!, index };
}
