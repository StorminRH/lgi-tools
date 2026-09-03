export function parseNumericRouteId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

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
