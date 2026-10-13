import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { normalizeModulePath } from '@/lib/__tests__/module-path';

const schemaLoaders = import.meta.glob([
  '../../../**/schema.ts',
  '../../auth-schema.ts',
  '../../../composition/drizzle-schema.ts',
]) as Record<string, () => Promise<unknown>>;

const REFLECTION_DIR = 'src/db/__tests__/support';

function normalizeGlobKey(key: string): string {
  return normalizeModulePath(`${REFLECTION_DIR}/${key}`);
}

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

export function registryCoverageDiff(
  expected: Iterable<string>,
  declared: readonly string[],
): { missing: string[]; stale: string[]; duplicate: string[] } {
  const expectedNames = new Set(expected);
  const declaredNames = new Set<string>();
  const repeated = new Set<string>();
  for (const name of declared) {
    if (declaredNames.has(name)) repeated.add(name);
    declaredNames.add(name);
  }
  return {
    missing: [...expectedNames].filter((name) => !declaredNames.has(name)).sort(),
    stale: [...declaredNames].filter((name) => !expectedNames.has(name)).sort(),
    duplicate: [...repeated].sort(),
  };
}

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
