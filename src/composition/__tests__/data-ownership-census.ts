import { is, SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core';

const AUTH_SCHEMA_PATH = 'src/db/auth-schema.ts';
const AUTH_SLICE = 'platform/auth';
const ZONED_ROOTS = ['data', 'features', 'platform', 'composition'] as const;

export function sliceOfPath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.endsWith(AUTH_SCHEMA_PATH) || normalized === 'db/auth-schema.ts') {
    return AUTH_SLICE;
  }
  const segments = normalized.replace(/^src\//, '').split('/');
  const [root, second] = segments;
  if (root === undefined) return '';
  const zoned = (ZONED_ROOTS as readonly string[]).includes(root);
  return zoned && second !== undefined && segments.length > 1 ? `${root}/${second}` : root;
}

const dialect = new PgDialect();

function renderPredicate(predicate: SQL): string {
  return dialect.sqlToQuery(predicate, 'indexes').sql.replaceAll(/\s+/g, ' ').trim();
}

function indexColumnName(column: unknown): string {
  if (is(column, SQL)) return renderPredicate(column);
  return (column as { name?: string }).name ?? '?';
}

function joinNames(columns: readonly { name: string }[]): string {
  return columns.map((column) => column.name).join(',');
}

function uniqueIndexInvariant(index: ReturnType<typeof getTableConfig>['indexes'][number]): string {
  const columns = index.config.columns.map(indexColumnName).join(',');
  const predicate = index.config.where;
  if (predicate === undefined) return `unique(${columns})`;
  return `partial-unique(${columns}) where(${renderPredicate(predicate)})`;
}

function foreignKeyInvariant(
  foreignKey: ReturnType<typeof getTableConfig>['foreignKeys'][number],
): string {
  const reference = foreignKey.reference();
  const target = getTableConfig(reference.foreignTable).name;
  return `fk(${joinNames(reference.columns)}→${target}.${joinNames(reference.foreignColumns)})`;
}

export function describeDbInvariants(table: PgTable): string[] {
  const config = getTableConfig(table);
  const columnLevelPrimaries = config.columns.filter((column) => column.primary);
  const columnLevelUniques = config.columns.filter((column) => column.isUnique);
  const invariants = [
    ...columnLevelPrimaries.map((column) => `pk(${column.name})`),
    ...config.primaryKeys.map((key) => `pk(${joinNames(key.columns)})`),
    ...columnLevelUniques.map((column) => `unique(${column.name})`),
    ...config.uniqueConstraints.map((constraint) => `unique(${joinNames(constraint.columns)})`),
    ...config.indexes.filter((index) => index.config.unique).map(uniqueIndexInvariant),
    ...config.foreignKeys.map(foreignKeyInvariant),
    ...config.checks.map((check) => `check(${check.name})`),
  ];
  return [...invariants].sort();
}
