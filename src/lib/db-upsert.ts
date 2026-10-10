import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * The value an `ON CONFLICT DO UPDATE` proposed for `column`: `excluded."column_name"`.
 * Taking the Drizzle column instead of a hand-typed name means renaming the column
 * fails to compile rather than failing when the upsert runs.
 */
export function excluded<TColumn extends AnyPgColumn>(column: TColumn): SQL<TColumn['_']['data']> {
  return sql<TColumn['_']['data']>`excluded.${sql.identifier(column.name)}`;
}

/**
 * An upsert `set` that copies each named column from the proposed row. Keys are
 * explicit, never "every non-key column", so a column the insert does not write
 * keeps its stored value instead of being reset to its default on conflict.
 */
export function excludedSet<TTable extends PgTable, TKey extends keyof TTable['_']['columns'] & string>(
  table: TTable,
  keys: readonly TKey[],
): Record<TKey, SQL> {
  const columns = getTableColumns(table);
  return Object.fromEntries(keys.map((key) => [key, excluded(columns[key]!)])) as Record<TKey, SQL>;
}
