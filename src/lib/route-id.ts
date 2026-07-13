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

/** Parse a numeric route id and load its entity for metadata-style lookups. */
export async function loadNumericRouteEntity<T>(
  params: Promise<{ id: string }>,
  load: (id: number) => Promise<T | null>,
): Promise<{ id: number; entity: T } | null> {
  const { id: rawId } = await params;
  const id = parseNumericRouteId(rawId);
  if (id === null) return null;

  const entity = await load(id);
  return entity === null ? null : { id, entity };
}
