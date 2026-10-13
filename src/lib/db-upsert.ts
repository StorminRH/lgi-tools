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

/**
 * The SELECT an `insert(table).select(...)` takes to propose `rows` only
 * where `condition` holds: a guard on the insert branch as well as the
 * update one, which `onConflictDoUpdate({ setWhere })` alone cannot give.
 * The rows travel as one jsonb parameter that Postgres expands into the
 * table's own row type, so every value keeps its column's type with no
 * casts. Every insertable column comes out, in table order, as Drizzle's
 * insert-select expects; a row must give each one, since column defaults
 * are not applied.
 */
export function proposedRowsWhere<TTable extends PgTable>(
  table: TTable,
  rows: readonly TTable['$inferInsert'][],
  condition: SQL,
): SQL {
  const columns = Object.entries(getTableColumns(table)).filter(
    ([, column]) => column.generated === undefined || column.generated.type === 'byDefault',
  );
  const records = rows.map((row: Record<string, unknown>) =>
    Object.fromEntries(columns.map(([key, column]) => [column.name, row[key] ?? null])),
  );
  const selected = sql.join(
    columns.map(([, column]) => sql`proposed.${sql.identifier(column.name)}`),
    sql`, `,
  );
  return sql`select ${selected} from jsonb_populate_recordset(null::${table}, ${JSON.stringify(records)}::jsonb) as proposed where ${condition}`;
}
