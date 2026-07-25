// PRODUCTION WRITE-SITE SCAN (3.10.2.3). Attributes every Drizzle write in the
// production source tree to the slice that makes it, so the dataset-declaration
// census can reject a cross-owner write nobody declared.
//
// A source scan rather than a runtime trace because the invariant is structural:
// "which slice may write this table" is a property of the code, not of one
// request. Detection is deliberately receiver-agnostic — it keys off the table
// SYMBOL, which must resolve to a real reflected Drizzle export, rather than off
// a `db`/`tx` receiver name that a refactor could rename.
//
// Four documented blind spots, all failing quiet rather than loud, so they are
// named here and in the affected tables' boundary notes rather than implied:
//   1. Raw string-literal SQL that never mentions a schema symbol
//      (src/scripts/backfill-users-if-empty.ts writes `user` and `account` this way).
//   2. Adapter-internal writes — Better Auth reaches its own tables through its
//      Drizzle adapter, which no source line in this repository expresses.
//   3. Variable-table helper calls, e.g. `insertChunked(tx, eveRegions, rows)`
//      in src/data/eve-data/universe.ts, where the table is an argument to a
//      generic helper rather than the write call's own operand.
//   4. A table symbol aliased through a value that is not an import binding.
// The census pins a positive found-set against these, so a scanner that silently
// stops finding writes fails the suite instead of passing it.
import { readdirSync, readFileSync } from 'node:fs';
import type { DataOwnershipEntry } from '@/composition/data-ownership-registry';
import { sliceOfPath } from '@/composition/data-ownership-registry';
import { normalizeModulePath } from '@/lib/module-path';
import { getTableConfig } from 'drizzle-orm/pg-core';

/** One production write: the file that makes it, that file's slice, and the SQL table it targets. */
export interface WriteSite {
  readonly file: string;
  readonly slice: string;
  readonly table: string;
}

const SKIPPED_DIRECTORIES = new Set(['test-support', 'node_modules', '__fixtures__']);
const SKIPPED_SUFFIXES = ['.test.ts', '.db.test.ts', '.d.ts'];

function isProductionSource(fileName: string): boolean {
  if (!fileName.endsWith('.ts')) return false;
  return !SKIPPED_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

/** Every production TypeScript file under `rootDir`, excluding tests, fixtures, and test support. */
function collectProductionSources(rootDir: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (isProductionSource(entry.name)) {
        found.push(path);
      }
    }
  };
  walk(rootDir);
  return found.sort();
}

/**
 * Resolves an import specifier to the repository-relative module path it names, covering the `@/`
 * source alias and relative specifiers. Returns the path with a `.ts` extension so it can be looked
 * up directly against reflected schema module keys.
 */
export function resolveImportPath(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return `${normalizeModulePath(`src/${specifier.slice(2)}`)}.ts`;
  if (!specifier.startsWith('.')) return null;
  const directory = fromFile.slice(0, fromFile.lastIndexOf('/'));
  return `${normalizeModulePath(`${directory}/${specifier}`)}.ts`;
}

// The clause excludes quotes and semicolons so a side-effect import
// (`import './globals.css';`) cannot be swallowed by the lazy match and joined to
// the next statement's `from`. A real import clause never contains either
// character, so multi-line named imports still match.
const IMPORT_PATTERN = /import\s+([^;'"]*?)\s+from\s*['"]([^'"]+)['"]/g;
const NAMESPACE_PATTERN = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/;

function addNamedBindings(
  clause: string,
  moduleExports: Map<string, string>,
  symbols: Map<string, string>,
): void {
  const braced = /\{([\s\S]*)\}/.exec(clause)?.[1];
  if (braced === undefined) return;
  for (const rawBinding of braced.split(',')) {
    const binding = rawBinding.trim();
    if (binding === '' || binding.startsWith('type ')) continue;
    const parts = binding.split(/\s+as\s+/).map((part) => part.trim());
    const exported = parts[0];
    if (exported === undefined) continue;
    const table = moduleExports.get(exported);
    if (table !== undefined) symbols.set(parts[1] ?? exported, table);
  }
}

/**
 * Maps the table symbols one source file has in scope to the SQL tables they name, resolving both
 * named imports (including aliases) and namespace imports, whose members resolve as `namespace.table`.
 */
export function buildSymbolTable(
  file: string,
  source: string,
  exportsByModule: ReadonlyMap<string, Map<string, string>>,
): Map<string, string> {
  const symbols = new Map<string, string>();
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const clause = match[1]?.trim();
    const specifier = match[2];
    if (clause === undefined || specifier === undefined || clause.startsWith('type ')) continue;
    const modulePath = resolveImportPath(file, specifier);
    const moduleExports = modulePath === null ? undefined : exportsByModule.get(modulePath);
    if (moduleExports === undefined) continue;
    const namespace = NAMESPACE_PATTERN.exec(clause)?.[1];
    if (namespace === undefined) {
      addNamedBindings(clause, moduleExports, symbols);
      continue;
    }
    for (const [exported, table] of moduleExports) symbols.set(`${namespace}.${exported}`, table);
  }
  return symbols;
}

// Receiver-agnostic and whitespace/newline tolerant: the dominant live form is a
// multi-line chain (`await db\n  .delete(ownedAssets)`), and binding to a `db`/`tx`
// receiver name would miss a renamed handle. The operand must resolve to a real
// reflected table symbol, so a `Set.delete(key)` can never match.
const WRITE_CALL_PATTERN =
  /\.\s*(?:insert|update|delete)\s*\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\)/g;

// A statement-leading write keyword: anchored to the template start, a newline,
// a semicolon, or an opening paren, so a `updated_at` column reference can never
// be read as an UPDATE.
const RAW_WRITE_KEYWORD =
  /(^|[\n;(])\s*(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\b/i;
const INTERPOLATION_PATTERN = /\$\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\}/g;

function rawSqlTemplates(source: string): string[] {
  const templates: string[] = [];
  for (let index = source.indexOf('sql`'); index !== -1; index = source.indexOf('sql`', index + 1)) {
    const end = source.indexOf('`', index + 4);
    if (end === -1) break;
    templates.push(source.slice(index + 4, end));
  }
  return templates;
}

function tablesWrittenByCalls(source: string, symbols: ReadonlyMap<string, string>): string[] {
  return [...source.matchAll(WRITE_CALL_PATTERN)]
    .map((match) => (match[1] === undefined ? undefined : symbols.get(match[1])))
    .filter((table): table is string => table !== undefined);
}

function tablesWrittenByRawSql(source: string, symbols: ReadonlyMap<string, string>): string[] {
  return rawSqlTemplates(source)
    .filter((template) => RAW_WRITE_KEYWORD.test(template))
    .flatMap((template) =>
      [...template.matchAll(INTERPOLATION_PATTERN)]
        .map((match) => (match[1] === undefined ? undefined : symbols.get(match[1])))
        .filter((table): table is string => table !== undefined),
    );
}

/**
 * The SQL tables one source file writes, via Drizzle write-builder calls or raw `sql` templates whose
 * statement-leading keyword writes. Operands resolve through that file's own schema imports, so a
 * symbol the file never imported is never attributed to it.
 */
export function findWrittenTables(
  file: string,
  source: string,
  exportsByModule: ReadonlyMap<string, Map<string, string>>,
): string[] {
  const symbols = buildSymbolTable(file, source, exportsByModule);
  if (symbols.size === 0) return [];
  return [
    ...new Set([
      ...tablesWrittenByCalls(source, symbols),
      ...tablesWrittenByRawSql(source, symbols),
    ]),
  ];
}

/**
 * Every production write site under `rootDir`, deduplicated per file and table, with each file
 * attributed to the slice that owns its path.
 */
export function scanProductionWriteSites(
  rootDir: string,
  exportsByModule: ReadonlyMap<string, Map<string, string>>,
): WriteSite[] {
  return collectProductionSources(rootDir).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const slice = sliceOfPath(file);
    return findWrittenTables(file, source, exportsByModule).map((table) => ({
      file,
      slice,
      table,
    }));
  });
}

/**
 * The write sites no ownership declaration sanctions. A site passes when its slice owns the table or
 * appears in that table's declared cross-owner writers; every other site is reported with the exact
 * declaration that would sanction it.
 */
export function findUndeclaredCrossOwnerWrites(
  sites: readonly WriteSite[],
  registry: readonly DataOwnershipEntry[],
): string[] {
  const byTable = new Map(
    registry.map((entry) => [getTableConfig(entry.table).name, entry] as const),
  );
  return sites.flatMap((site) => {
    const entry = byTable.get(site.table);
    if (entry === undefined) {
      return [`${site.file} writes ${site.table}, which has no data-ownership declaration`];
    }
    const permitted =
      site.slice === entry.owner ||
      (entry.writers ?? []).some((writer) => writer.by === site.slice);
    if (permitted) return [];
    return [
      `${site.file} (slice ${site.slice}) writes ${site.table}, owned by ${entry.owner}. Declare it as a cross-owner writer on that table in src/composition/data-ownership-registry.ts, or move the write into the owning slice.`,
    ];
  });
}
