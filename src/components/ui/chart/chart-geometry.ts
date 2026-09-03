export function extent(values: number[]): [number, number] {
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

export function paddedDomain(values: number[]): [number, number] {
  const [min, max] = extent(values);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  return [min - pad, max + pad];
}

export function nearestIndex(xs: number[], x: number): number {
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

export function continuousHoverTarget<T>(
  xs: number[],
  probeX: number,
  data: T[],
): { datum: T; index: number } | null {
  const index = nearestIndex(xs, probeX);
  if (index < 0) return null;
  return { datum: data[index]!, index };
}
