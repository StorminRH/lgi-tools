export function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Groups items into a Map keyed by `keyOf`, in one ordered pass: keys keep
 * first-seen order and each group keeps input order. Hand-written because
 * Convex type-checks against ES2023 and the browser floor predates the native
 * `Map.groupBy`.
 */
export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]>;
export function groupBy<T, K, V>(
  items: Iterable<T>,
  keyOf: (item: T) => K,
  valueOf: (item: T) => V,
): Map<K, V[]>;
export function groupBy<T, K, V>(
  items: Iterable<T>,
  keyOf: (item: T) => K,
  valueOf?: (item: T) => V,
): Map<K, (T | V)[]> {
  const groups = new Map<K, (T | V)[]>();
  for (const item of items) {
    getOrInsertComputed(groups, keyOf(item), () => []).push(valueOf === undefined ? item : valueOf(item));
  }
  return groups;
}

/**
 * Returns the value stored under `key`, first storing `compute(key)` on a
 * miss. Tests membership with `has`, so a stored falsy or `undefined` value is
 * returned as is. Mirrors the TC39 upsert proposal's
 * `Map.prototype.getOrInsertComputed`, which no supported runtime ships yet.
 */
export function getOrInsertComputed<K, V>(map: Map<K, V>, key: K, compute: (key: K) => V): V {
  if (map.has(key)) return map.get(key) as V;
  const value = compute(key);
  map.set(key, value);
  return value;
}
