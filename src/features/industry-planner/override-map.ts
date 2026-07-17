/** Returns a new override map with one type ID set, leaving the caller's map unchanged. */
export function setOverride(
  current: Map<number, number>,
  blueprintTypeId: number,
  value: number,
  clamp: (value: number) => number,
): Map<number, number> {
  return new Map(current).set(blueprintTypeId, clamp(value));
}

/** Returns a new override map without the selected type ID, leaving the caller's map unchanged. */
export function resetOverride(
  current: Map<number, number>,
  blueprintTypeId: number,
): Map<number, number> {
  if (!current.has(blueprintTypeId)) return current;
  const next = new Map(current);
  next.delete(blueprintTypeId);
  return next;
}
