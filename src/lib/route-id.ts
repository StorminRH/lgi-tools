/**
 * Parse a dynamic route's `[id]` segment as a non-negative integer, or `null`
 * when it isn't a bare digit string. `Number.parseInt` alone would accept
 * "12abc" as 12 and resolve the wrong entity instead of 404-ing, so callers
 * gate the raw segment through this before looking anything up.
 */
export function parseNumericRouteId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}
