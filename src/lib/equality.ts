/**
 * Shallow record equality over every own enumerable key: the same key count,
 * every key of `a` present on `b`, and `===` on each value. A new field joins
 * the comparison without a hand-kept list. `===`, not `Object.is`, so -0
 * matches +0 and NaN never matches itself; `{ k: undefined }` differs from a
 * record without `k`.
 */
export function sameFields<T extends object>(a: T, b: T): boolean {
  const left = a as Record<PropertyKey, unknown>;
  const right = b as Record<PropertyKey, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && left[key] === right[key]);
}
