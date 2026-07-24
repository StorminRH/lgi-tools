import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

const schemaLoaders = import.meta.glob(['../../**/schema.ts', '../auth-schema.ts']) as Record<
  string,
  () => Promise<unknown>
>;

/**
 * Reflects every Drizzle pgTable across all slice schema files, deduplicated by SQL table name, so
 * registry gates share one schema census. This test-only helper relies on Vite's import.meta.glob
 * and never ships at runtime.
 */
export async function reflectedSchemaTables(): Promise<PgTable[]> {
  const schemaModules = await Promise.all(
    Object.values(schemaLoaders).map((load) => load()),
  );
  const byName = new Map<string, PgTable>();
  for (const schemaModule of schemaModules) {
    for (const value of Object.values(schemaModule as Record<string, unknown>)) {
      if (is(value, PgTable)) byName.set(getTableConfig(value).name, value);
    }
  }
  return [...byName.values()];
}
