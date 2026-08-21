import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { normalizeModulePath } from '@/lib/__tests__/module-path';

const schemaLoaders = import.meta.glob([
  '../../../**/schema.ts',
  '../../auth-schema.ts',
  '../../../composition/drizzle-schema.ts',
]) as Record<string, () => Promise<unknown>>;

// The glob keys are relative to this file, so they normalize against its own directory.
const REFLECTION_DIR = 'src/db/__tests__/support';

function normalizeGlobKey(key: string): string {
  return normalizeModulePath(`${REFLECTION_DIR}/${key}`);
}

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

/**
 * Maps every schema module path (repository-relative) to its exported table identifiers and their
 * SQL table names, so a source scanner can resolve an imported symbol to the table it writes. The
 * `src/composition/drizzle-schema.ts` barrel appears alongside the source modules with its `export *`
 * re-exports already resolved, so a write made through the barrel resolves like any other.
 */
export async function reflectedSchemaExports(): Promise<Map<string, Map<string, string>>> {
  const modules = await Promise.all(
    Object.entries(schemaLoaders).map(
      async ([key, load]) => [key, await load()] as const,
    ),
  );
  const byModule = new Map<string, Map<string, string>>();
  for (const [key, schemaModule] of modules) {
    const exports = new Map<string, string>();
    for (const [name, value] of Object.entries(schemaModule as Record<string, unknown>)) {
      if (is(value, PgTable)) exports.set(name, getTableConfig(value).name);
    }
    if (exports.size > 0) byModule.set(normalizeGlobKey(key), exports);
  }
  return byModule;
}
