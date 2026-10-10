export function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Consecutive slices of at most `size` items, in input order; only the last
 * may be shorter. Throws a RangeError unless `size` is a positive integer:
 * zero or a negative size never advances, and a fractional one slices unevenly.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Ordered element-wise equality: same length, and `eq` holds at every index.
 * The default `eq` is `===`, not `Object.is`, so -0 matches +0 and NaN never
 * matches itself.
 */
export function sameItems<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean = (x, y) => x === y,
): boolean {
  return a.length === b.length && a.every((item, index) => eq(item, b[index] as T));
}

/** The distinct ids in ascending numeric order (never the default lexical sort). */
export function sortedUniqueIds(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/**
 * A stable string identity for an id set, for memo, effect and refresh keys:
 * the same ids in any order or multiplicity give the same key, and none give ''.
 */
export function idsKey(ids: Iterable<number>): string {
  return sortedUniqueIds(ids).join(',');
}

/** Reads a comma-joined id key back into numbers; '' is no ids, not [0]. */
export function parseIdsKey(key: string): number[] {
  return key === '' ? [] : key.split(',').map(Number);
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
