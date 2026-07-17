/**
 * The shared per-owner cached-read fan-out. The live-tracker slices (industry jobs,
 * corp jobs, skills) each compose a per-id cached getter across a user's owners into an
 * id-keyed Map, dropping the owners that have never synced (the getter returns null).
 * Factored here so the three read shapes share one tested helper instead of re-copying
 * the Promise.all → Map → drop-nulls dance. Pure over the injected getter — unit-tested
 * here; the 'use cache' getters it composes are verified via their consuming routes.
 */
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
