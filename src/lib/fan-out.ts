export async function mapByIdDroppingNulls<T>(
  ids: number[],
  getter: (id: number) => Promise<T | null>,
): Promise<Map<number, T>> {
  const entries = await Promise.all(ids.map(async (id) => [id, await getter(id)] as const));
  const map = new Map<number, T>();
  for (const [id, value] of entries) {
    if (value !== null) map.set(id, value);
  }
  return map;
}
